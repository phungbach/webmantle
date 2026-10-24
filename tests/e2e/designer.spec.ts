import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADMIN } from "./helpers";

test.use({ actionTimeout: 10_000 });
test.describe.configure({ mode: "serial" });

const problems: string[] = [];

test.beforeEach(async ({ context, baseURL, page }) => {
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
  page.on("dialog", (d) => void d.accept());
  page.on("pageerror", (e) =>
    problems.push(`pageerror at ${page.url()}: ${e.message.slice(0, 60)}`)
  );
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
  });
});

test.afterAll(() => {
  expect(problems).toEqual([]);
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}

/** Creates a published page with some theme body text and returns where to find it. */
async function createPage(page: Page, title: string, body: string) {
  await page.goto("/admin/pages/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Status").selectOption("published");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type(body);
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Page saved." })).toBeVisible();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await page.goto("/admin/pages");
  const link = page
    .getByRole("row")
    .filter({ hasText: title })
    .locator('a[href$="/design"]')
    .first();
  const href = (await link.getAttribute("href"))!;
  return { slug, designer: href, id: href.split("/")[3]! };
}

/** The left panel has two tabs; the palette and the structure tree are never shown together. */
async function show(page: Page, tab: "Components" | "Structure") {
  const t = page.getByRole("tab", { name: tab });
  if ((await t.getAttribute("aria-selected")) !== "true") await t.click();
}
async function add(page: Page, name: string) {
  await show(page, "Components");
  await page.getByRole("button", { name: new RegExp(`^${name} [A-Z]`) }).click();
}
const tree = (page: Page) => page.getByRole("tree", { name: "Structure" });
const rows = (page: Page) => tree(page).getByRole("treeitem");
const rowOf = (page: Page, text: string | RegExp) => rows(page).filter({ hasText: text }).first();
const frame = (page: Page) => page.frameLocator('iframe[title="Canvas"]');
const status = (page: Page) =>
  page.getByRole("status").filter({ hasText: /Saved|Saving|Unsaved|Fix errors|Save failed/ });

/** The block names in the tree, top to bottom. */
async function order(page: Page): Promise<string[]> {
  await show(page, "Structure");
  const names = ["Section", "Cards grid", "Heading", "Button", "Text", "Grid", "Stack", "Divider"];
  const texts = await rows(page).evaluateAll((els) =>
    els.map((el) => (el.querySelector("[data-row-id]") as HTMLElement).innerText)
  );
  return texts.map((t) => names.find((n) => t.trim().startsWith(n)) ?? t.trim());
}

async function open(page: Page, designer: string) {
  await page.goto(designer);
  await expect(page.getByRole("tab", { name: "Components" })).toBeVisible();
  await expect(frame(page).locator("body")).toBeVisible({ timeout: 20_000 });
}

async function dragHandle(
  page: Page,
  handle: Locator,
  target: Locator,
  where: "top" | "middle" | "bottom"
) {
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  const y = to.y + (where === "top" ? 3 : where === "bottom" ? to.height - 3 : to.height / 2);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 });
  await page.mouse.move(to.x + 60, y, { steps: 12 });
  await page.mouse.up();
}

let a: { slug: string; designer: string; id: string };

test("entry points: Design link, Designed badge and the home design buttons", async ({ page }) => {
  await signIn(page);
  a = await createPage(page, "Designer A", "Theme body A");
  await page.goto("/admin/pages");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Designer A" })
      .getByRole("link", { name: "Design", exact: true })
  ).toBeVisible();
  await page.goto(`/admin/pages/${a.id}`);
  await expect(page.getByRole("link", { name: "Design this page" })).toBeVisible();
  await page.goto("/admin/settings");
  await expect(page.getByRole("link", { name: /Design the home page/ }).first()).toBeVisible();
});

test("add blocks from the palette, edit in the inspector, select from the preview", async ({
  page,
}) => {
  await signIn(page);
  await open(page, a.designer);
  await expect(status(page)).toContainText("Saved");

  await add(page, "Section");
  await add(page, "Heading");
  await add(page, "Text");
  await add(page, "Button");
  await add(page, "Cards grid");
  expect(await order(page)).toEqual(["Section", "Heading", "Text", "Button", "Cards grid"]);

  // Heading goes into the Section: it is indented one level deeper.
  await expect(rowOf(page, /^Heading/)).toHaveAttribute("aria-level", "2");

  await show(page, "Structure");
  await rowOf(page, /^Heading/)
    .locator("[data-row-id]")
    .click();
  await page.getByLabel("Text", { exact: true }).fill("Hello designer");
  await expect(frame(page).getByText("Hello designer")).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toContainText("Saved", { timeout: 15_000 });

  // Selecting inside the preview moves the selection in the inspector.
  await rowOf(page, /^Button/)
    .locator("[data-row-id]")
    .click();
  await expect(page.getByRole("heading", { name: "Button", exact: true })).toBeVisible();
  await frame(page).getByText("Hello designer").click();
  await expect(page.getByRole("heading", { name: "Heading", exact: true })).toBeVisible();
  await expect(rowOf(page, /^Heading/)).toHaveAttribute("aria-selected", "true");
});

test("reorder with buttons, mouse drag and keyboard; invalid drops change nothing", async ({
  page,
}) => {
  await signIn(page);
  const p = await createPage(page, "Designer B", "Theme body B");
  await open(page, p.designer);
  await add(page, "Section");
  await add(page, "Heading");
  await add(page, "Button");
  await add(page, "Divider");
  const base = await order(page);
  expect(base.slice(0, 3)).toEqual(["Section", "Heading", "Button"]);

  // Move buttons.
  await rowOf(page, /^Button/)
    .getByRole("button", { name: "Move up" })
    .click();
  expect((await order(page)).slice(0, 3)).toEqual(["Section", "Button", "Heading"]);
  await rowOf(page, /^Button/)
    .getByRole("button", { name: "Move down" })
    .click();
  expect((await order(page)).slice(0, 3)).toEqual(["Section", "Heading", "Button"]);

  // Alt+Arrow on the focused row.
  await rowOf(page, /^Button/)
    .locator("[data-row-id]")
    .focus();
  await page.keyboard.press("Alt+ArrowUp");
  expect((await order(page)).slice(0, 3)).toEqual(["Section", "Button", "Heading"]);

  // Mouse drag: Heading above Button (top third of the Button row).
  const handle = rowOf(page, /^Heading/).getByRole("button", { name: /Drag to move/ });
  await dragHandle(page, handle, rowOf(page, /^Button/), "top");
  await expect
    .poll(async () => (await order(page)).slice(0, 3))
    .toEqual(["Section", "Heading", "Button"]);

  // Keyboard drag: Space, ArrowDown, Space.
  const kb = rowOf(page, /^Heading/).getByRole("button", { name: /Drag to move/ });
  await kb.focus();
  // dnd-kit needs a moment to measure after each key.
  for (const key of ["Space", "ArrowDown", "ArrowDown", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await expect
    .poll(async () => (await order(page)).slice(0, 3))
    .not.toEqual(["Section", "Heading", "Button"]);

  // Escape cancels a keyboard drag.
  const before = await order(page);
  const k2 = rowOf(page, /^Heading/).getByRole("button", { name: /Drag to move/ });
  await k2.focus();
  for (const key of ["Space", "ArrowDown", "Escape"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  expect(await order(page)).toEqual(before);

  // Invalid drop: a second Section dropped into a Grid. Nothing changes.
  await show(page, "Structure");
  await rowOf(page, /^Section/)
    .locator("[data-row-id]")
    .click();
  await add(page, "Grid");
  await show(page, "Structure");
  await rowOf(page, /^Grid/).locator("[data-row-id]").click();
  await add(page, "Section");
  await show(page, "Structure");
  const sections = rows(page).filter({ hasText: /^Section/ });
  await expect(sections).toHaveCount(2);
  const snapshot = await order(page);
  await dragHandle(
    page,
    sections.nth(1).getByRole("button", { name: /Drag to move/ }),
    rowOf(page, /^Grid/),
    "middle"
  );
  expect(await order(page)).toEqual(snapshot);
  await expect(rows(page).filter({ hasText: /^Section/ })).toHaveCount(2);
});

test("an invalid link shows an inline error and blocks Publish", async ({ page }) => {
  await signIn(page);
  const p = await createPage(page, "Designer C", "Theme body C");
  await open(page, p.designer);
  await add(page, "Section");
  await add(page, "Button");
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeEnabled();
  await page.getByLabel("Link", { exact: true }).fill("javascript:alert(1)");
  await expect(
    page.getByRole("alert").filter({ hasText: "Use a path starting with /" })
  ).toBeVisible();
  await expect(publish).toBeDisabled();
  await expect(status(page)).toContainText("Fix errors to save");
  await page.getByLabel("Link", { exact: true }).fill("/pages/ok");
  await expect(
    page.getByRole("alert").filter({ hasText: "Use a path starting with /" })
  ).toHaveCount(0);
  await expect(publish).toBeEnabled();
});

test("undo, redo and the device toggle", async ({ page }) => {
  await signIn(page);
  const p = await createPage(page, "Designer D", "Theme body D");
  await open(page, p.designer);
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(undo).toBeDisabled();
  await add(page, "Section");
  await add(page, "Heading");
  expect(await order(page)).toEqual(["Section", "Heading"]);
  await undo.click();
  expect(await order(page)).toEqual(["Section"]);
  await redo.click();
  expect(await order(page)).toEqual(["Section", "Heading"]);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  expect(await order(page)).toEqual(["Section"]);

  await page.setViewportSize({ width: 1920, height: 1000 });
  const width = async () => (await page.locator('iframe[title="Canvas"]').boundingBox())!.width;
  const desktop = await width();
  await page.getByRole("button", { name: "Mobile" }).click();
  await expect.poll(width).toBeLessThanOrEqual(392);
  expect(await width()).toBeGreaterThan(340);
  await page.getByRole("button", { name: "Tablet" }).click();
  await expect.poll(width).toBeGreaterThan(700);
  expect(await width()).toBeLessThanOrEqual(770);
  await page.getByRole("button", { name: "Desktop" }).click();
  await expect.poll(width).toBeGreaterThan(desktop - 5);
});

test("draft is private, publish goes live and strips XSS, discard and reset work", async ({
  page,
  request,
  context,
}) => {
  await signIn(page);
  const p = await createPage(page, "Designer E", "Original theme body E");
  // What a visitor sees (the raw HTML also carries the stored page text in the RSC payload).
  const publicHtml = async () => {
    const visitor = await context.newPage();
    await visitor.goto(`/pages/${p.slug}`);
    const text = await visitor.locator("body").innerText();
    // Real elements only: the payload typed as text is shown escaped, which is fine.
    const injected =
      (await visitor.locator("img[onerror], [onerror], [onclick]").count()) +
      (await visitor.locator("script:not([src])", { hasText: "alert(1)" }).count());
    await visitor.close();
    return { text, injected };
  };
  const rawHtml = async () => (await request.get(`/pages/${p.slug}`)).text();
  try {
    await open(page, p.designer);
    // No layout means visitors see the theme's own template, so nothing is unpublished.
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await add(page, "Section");
    await add(page, "Heading");
    await page.getByLabel("Text", { exact: true }).fill("Live designer heading");
    await add(page, "Text");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Rich words ");
    await page.keyboard.insertText("<script>alert(1)</script>");
    // A second text block: typing both payloads into one field intermittently crashed the editor
    // with React error #185 during manual runs, so each payload gets its own block.
    await add(page, "Text");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("More ");
    await page.keyboard.insertText("<img src=x onerror=alert(2)>");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(status(page)).toContainText("Saved");
    expect((await publicHtml()).text).not.toContain("Live designer heading");
    expect((await publicHtml()).text).toContain("Original theme body E");

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await publicHtml()).text.includes("Live designer heading"))
      .toBe(true);
    const visible = await publicHtml();
    expect(visible.text).toContain("Rich words");
    expect(visible.text).not.toContain("Original theme body E");
    expect(visible.injected).toBe(0);
    expect(await rawHtml()).not.toMatch(/<script>alert\(1\)<\/script>|<img src=x onerror/i);

    // The state persists after a reload.
    await open(page, p.designer);
    expect(await order(page)).toEqual(["Section", "Heading", "Text", "Text"]);
    await expect(page.getByText("Published", { exact: true })).toBeVisible();

    // A change makes the draft differ; discarding brings the published layout back.
    await rowOf(page, /^Heading/)
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText("Draft differs from live")).toBeVisible();
    await expect(status(page)).toContainText("Saved", { timeout: 15_000 });
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft discarded." })).toBeAttached();
    // KNOWN APP GAP: the editor keeps showing the discarded draft until the page is reloaded
    // (initialDoc is only read once). Reload to see the real state.
    await open(page, p.designer);
    expect(await order(page)).toEqual(["Section", "Heading", "Text", "Text"]);
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    expect((await publicHtml()).text).toContain("Live designer heading");
  } finally {
    // Back to the theme template, whatever happened above.
    await open(page, p.designer);
    await page.locator('summary[aria-label="More options"]').click();
    const resetItem = page.getByRole("button", { name: "Reset to theme" });
    if (await resetItem.isEnabled()) await resetItem.click();
    await expect
      .poll(async () => (await publicHtml()).text.includes("Original theme body E"), {
        timeout: 15_000,
      })
      .toBe(true);
  }
  expect((await publicHtml()).text).not.toContain("Live designer heading");
});

test("the home page designer publishes to the public home, then resets", async ({
  page,
  request,
}) => {
  await signIn(page);
  const homeHtml = async () => (await request.get("/")).text();
  try {
    await open(page, "/admin/design/home");
    await add(page, "Section");
    await add(page, "Heading");
    await page.getByLabel("Text", { exact: true }).fill("Designed home heading");
    await expect(status(page)).toContainText("Saved", { timeout: 15_000 });
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect
      .poll(async () => (await homeHtml()).includes("Designed home heading"), { timeout: 20_000 })
      .toBe(true);
  } finally {
    await open(page, "/admin/design/home");
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Reset to theme" }).click();
    await expect
      .poll(async () => (await homeHtml()).includes("Designed home heading"), { timeout: 20_000 })
      .toBe(false);
  }
});

test("anonymous visitors cannot reach the designer or its preview", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of [a.designer, "/admin/design/home"]) {
    await page.goto(`${baseURL}${path}`);
    await expect(page).toHaveURL(/\/login/);
  }
  for (const path of ["/design-preview/home", `/design-preview/page/${a.id}`]) {
    const res = await page.request.get(`${baseURL}${path}`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401, 403, 404]).toContain(res.status());
    expect(await res.text()).not.toContain("data-bid");
  }
  await context.close();
});

test("the preview route can only be framed by the admin itself", async ({ page }) => {
  await signIn(page);
  const res = await page.request.get(`/design-preview/page/${a.id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(await res.text()).toContain("noindex");
  const normal = await page.request.get("/");
  expect(normal.headers()["x-frame-options"]).toBe("DENY");
});

test("typing markup-like text character by character, across an autosave, never crashes the editor", async ({
  page,
}) => {
  await signIn(page);
  const p = await createPage(page, "Designer F", "Theme body F");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await open(page, p.designer);
  await add(page, "Section");
  await add(page, "Text");
  const editor = page.locator(".ProseMirror");
  const payloads = ["Rich words <script>alert(1)</script>", "<img src=x onerror=alert(2)>"];
  for (let round = 0; round < 3; round++) {
    for (const payload of payloads) {
      await editor.click();
      await page.keyboard.press("Control+End");
      const half = Math.floor(payload.length / 2);
      await page.keyboard.type(payload.slice(0, half), { delay: 20 });
      await page.waitForTimeout(1700); // long enough for the autosave to fire mid-word
      await page.keyboard.type(payload.slice(half) + " ", { delay: 20 });
    }
  }
  await expect(status(page)).toContainText("Saved", { timeout: 15_000 });
  await editor.click();
  await page.keyboard.type("still alive");
  await expect(editor).toContainText("still alive");
  expect(errors).toEqual([]);
  // The tags were typed as text, so they are escaped, never real elements.
  await expect(editor.locator("script, img")).toHaveCount(0);
});

test("Discard re-syncs the editor without a reload", async ({ page }) => {
  await signIn(page);
  const p = await createPage(page, "Designer G", "Theme body G");
  try {
    await open(page, p.designer);
    await add(page, "Section");
    await add(page, "Heading");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published", { exact: true })).toBeVisible({ timeout: 15_000 });
    // Edit and let the autosave store the draft.
    await show(page, "Structure");
    await rowOf(page, /^Heading/)
      .getByRole("button", { name: "Delete" })
      .click();
    expect(await order(page)).toEqual(["Section"]);
    await expect(page.getByText("Draft differs from live")).toBeVisible();
    await expect(status(page)).toContainText("Saved", { timeout: 15_000 });

    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect.poll(() => order(page), { timeout: 15_000 }).toEqual(["Section", "Heading"]);
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expect(page.getByText("Draft differs from live")).toHaveCount(0);
    // It stays that way: no stale autosave brings the draft back.
    await page.waitForTimeout(3000);
    expect(await order(page)).toEqual(["Section", "Heading"]);
    await open(page, p.designer);
    expect(await order(page)).toEqual(["Section", "Heading"]);
  } finally {
    await open(page, p.designer);
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Reset to theme" }).click();
    await expect.poll(() => order(page), { timeout: 15_000 }).toEqual([]);
  }
});

test("Reset empties the editor without a reload and it stays empty", async ({ page, request }) => {
  await signIn(page);
  const p = await createPage(page, "Designer H", "Theme body H");
  await open(page, p.designer);
  await add(page, "Section");
  await add(page, "Heading");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible({ timeout: 15_000 });
  await show(page, "Structure");
  await rowOf(page, /^Heading/)
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(status(page)).toContainText("Saved", { timeout: 15_000 });

  await page.locator('summary[aria-label="More options"]').click();
  await page.getByRole("button", { name: "Reset to theme" }).click();
  await expect.poll(() => order(page), { timeout: 15_000 }).toEqual([]);
  // No layout means visitors see the theme's own template, so nothing is unpublished.
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await page.waitForTimeout(3000);
  expect(await order(page)).toEqual([]);
  await open(page, p.designer);
  expect(await order(page)).toEqual([]);
  // No layout means visitors see the theme's own template, so nothing is unpublished.
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  const html = await (await request.get(`/pages/${p.slug}`)).text();
  expect(html).toContain("Theme body H");
});

test("panels collapse, focus mode hides both, and the choice is remembered", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/admin/design/home");
  await page.evaluate(() => localStorage.removeItem("designer.panels"));
  try {
    await open(page, "/admin/design/home");
    // The designer has the window to itself: no admin sidebar.
    await expect(page.locator("#admin-sidebar")).toHaveCount(0);
    const left = page.locator("#designer-left-panel");
    const right = page.locator("#designer-inspector-panel");
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();

    await page.getByTestId("designer-toggle-left").click();
    await expect(left).toBeHidden();
    await expect(right).toBeVisible();
    await page.reload();
    await expect(page.getByRole("tab", { name: "Components" })).toHaveCount(0);
    await expect(page.locator("#designer-left-panel")).toBeHidden(); // remembered
    await page.getByTestId("designer-toggle-left").click();
    await expect(page.locator("#designer-left-panel")).toBeVisible();

    await page.getByTestId("designer-toggle-right").click();
    await expect(right).toBeHidden();
    await page.getByTestId("designer-toggle-right").click();
    await expect(right).toBeVisible();

    const focus = page.getByTestId("designer-focus-mode");
    await expect(focus).toHaveAttribute("aria-pressed", "false");
    await focus.click();
    await expect(focus).toHaveAttribute("aria-pressed", "true");
    await expect(left).toBeHidden();
    await expect(right).toBeHidden();
    await focus.click();
    await expect(focus).toHaveAttribute("aria-pressed", "false");
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
  } finally {
    await page.evaluate(() => localStorage.removeItem("designer.panels"));
  }
});

test("desktop preview shows the desktop layout (no hamburger); mobile shows it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/admin/design/home");
  await page.evaluate(() => localStorage.removeItem("designer.panels"));
  await open(page, "/admin/design/home");
  const burger = frame(page).getByRole("button", { name: "Open menu" });
  await page.getByRole("button", { name: "Desktop" }).click();
  await expect(page.getByLabel("Preview zoom")).toBeVisible();
  await expect(burger).toBeHidden();
  const iframe = page.locator('iframe[title="Canvas"]');
  const width = await iframe.evaluate((el) => (el as HTMLIFrameElement).offsetWidth);
  expect(width).toBe(1280); // true width, scaled down with CSS
  await page.getByRole("button", { name: "Mobile" }).click();
  await expect(burger).toBeVisible();
  expect(await iframe.evaluate((el) => (el as HTMLIFrameElement).offsetWidth)).toBe(390);
  await page.getByRole("button", { name: "Desktop" }).click();
  await expect(burger).toBeHidden();
});
