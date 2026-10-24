import { expect, test, type Page } from "@playwright/test";
import { ADMIN, smallPngFile } from "./helpers";

// Edits the active theme's own texts, buttons and pictures straight in the page designer.
// The e2e site starts on the "Editorial" theme (no marketing content), so this spec activates
// "Trung tâm Anh ngữ (mẫu)" (english-center) and switches back at the end.
// Editor and author roles do not exist in the e2e fixtures; the permission rule (no data-ce
// bindings without settings:manage) is covered by the integration tests instead.

test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: "serial", timeout: 90_000 });

const problems: string[] = [];
const ALT = "E2E theme picture";

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

const frame = (page: Page) => page.frameLocator('iframe[title="Canvas"]');
const ce = (page: Page, path: string) => frame(page).locator(`[data-ce="${path}"]`);
const status = (page: Page) =>
  page.getByRole("status").filter({ hasText: /Saved|Saving|Unsaved|Fix errors|Save failed/ });

async function openHome(page: Page) {
  await page.goto("/admin/design/home");
  await expect(page.getByRole("tab", { name: "Components" })).toBeVisible();
  await expect(ce(page, "hero.title")).toBeVisible({ timeout: 25_000 });
}

/** What a visitor sees, read in a separate page so the designer is not involved. */
async function publicPage(page: Page, path = "/") {
  const visitor = await page.context().newPage();
  await visitor.goto(path);
  const text = await visitor.locator("body").innerText();
  const injected =
    (await visitor.locator("[onerror], [onclick]").count()) +
    (await visitor.locator("script:not([src])", { hasText: "alert(" }).count());
  const heroImage = await visitor
    .locator(".cms-mkt--promo img")
    .first()
    .getAttribute("src")
    .catch(() => null);
  await visitor.close();
  return { text, injected, heroImage };
}

async function editText(page: Page, path: string, text: string) {
  const el = ce(page, path);
  await el.dblclick();
  await page.keyboard.insertText(text);
  await page.keyboard.press("Enter");
  await expect(ce(page, path)).toHaveText(text, { timeout: 20_000 });
}

async function saved(page: Page) {
  await expect(status(page)).toContainText("Saved", { timeout: 20_000 });
}

async function resetKeyIfEdited(page: Page, path: string) {
  await ce(page, path).first().click();
  const reset = page.getByRole("button", { name: "Reset to theme default" });
  // The inspector needs a moment to open; the button only exists for edited blocks.
  try {
    await reset.waitFor({ timeout: 3000 });
    await reset.click();
    await expect(reset).toHaveCount(0, { timeout: 15_000 });
  } catch {
    /* not edited */
  }
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible({ timeout: 20_000 });
}

let mediaId = "";

test("setup: activate the English center theme and upload a library picture", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/themes");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Trung tâm Anh ngữ (mẫu)" }) })
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "english-center" })).toBeVisible();

  await page.goto("/admin/media?upload=1");
  await page.locator('input[type="file"]').setInputFiles(smallPngFile());
  await page.getByLabel("Alt text").fill(ALT);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Image uploaded.")).toBeVisible();
  const src = await page.locator(`img[alt="${ALT}"]`).first().getAttribute("src");
  mediaId = /\/media\/([a-z0-9]+)/.exec(src ?? "")?.[1] ?? "";
  expect(mediaId).not.toBe("");
});

test("edit texts in the preview: double click, Enter saves, Escape cancels", async ({ page }) => {
  await signIn(page);
  await openHome(page);
  try {
    await expect(ce(page, "hero.title")).not.toHaveText("E2E New Hero Title");
    await editText(page, "hero.title", "E2E New Hero Title");
    await saved(page);
    await expect(ce(page, "hero.title")).toHaveText("E2E New Hero Title");

    // Escape puts the old text back and saves nothing.
    const el = ce(page, "hero.title");
    await el.dblclick();
    await page.keyboard.insertText("should be thrown away");
    await page.keyboard.press("Escape");
    await expect(ce(page, "hero.title")).toHaveText("E2E New Hero Title");
    await page.waitForTimeout(1500);
    await expect(ce(page, "hero.title")).toHaveText("E2E New Hero Title");
  } finally {
    await openHome(page);
    await resetKeyIfEdited(page, "hero.title");
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(ce(page, "hero.title")).not.toHaveText("E2E New Hero Title", { timeout: 20_000 });
  }
});

test("clicking a button selects it; label and link are edited in the inspector", async ({
  page,
}) => {
  await signIn(page);
  await openHome(page);
  try {
    const url = page.url();
    await ce(page, "hero.primaryLabel").click();
    expect(page.url()).toBe(url); // no navigation inside the preview
    await expect(page.getByRole("heading", { name: "Hero banner" })).toBeVisible();
    const label = page.getByLabel("Primary button label");
    const link = page.getByLabel("Primary button link");
    await expect(label).toBeVisible();
    await expect(link).toHaveValue(/^\//);

    await label.fill("Go now");
    await expect(ce(page, "hero.primaryLabel")).toContainText("Go now", { timeout: 20_000 });

    // An unsafe link shows an inline error and is not kept.
    await link.fill("javascript:alert(1)");
    const inline = page.locator('p[role="alert"][id^="tc-"]'); // the field's own message (a toast may repeat the server's)
    await expect(inline).toContainText("Use a path starting with /");
    await expect(status(page)).toContainText(/Saved|Save failed/, { timeout: 20_000 });
    await page.waitForTimeout(1500);
    await link.fill("/pages/e2e-target");
    await expect(inline).toHaveCount(0);
    await expect
      .poll(async () => ce(page, "hero.primaryLabel").getAttribute("href"), { timeout: 20_000 })
      .toBe("/pages/e2e-target");
    const mid = await ce(page, "hero.primaryLabel").getAttribute("href");
    expect(mid).not.toContain("javascript");
  } finally {
    await openHome(page);
    await resetKeyIfEdited(page, "hero.primaryLabel");
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Discard draft" }).click();
  }
});

test("pictures: choose from the library, then go back to the theme's own", async ({ page }) => {
  await signIn(page);
  await openHome(page);
  try {
    const original = await ce(page, "hero.image").getAttribute("src");
    expect(original).toContain("/theme-assets/");
    await ce(page, "hero.image").click();
    await page.getByRole("button", { name: "Choose image" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(ALT) })
      .click();
    await expect
      .poll(() => ce(page, "hero.image").getAttribute("src"), { timeout: 20_000 })
      .toContain(`/media/${mediaId}`);

    await page.getByRole("button", { name: "Use the theme's own image" }).click();
    await expect
      .poll(() => ce(page, "hero.image").getAttribute("src"), { timeout: 20_000 })
      .toContain("/theme-assets/");
  } finally {
    await openHome(page);
    await resetKeyIfEdited(page, "hero.image");
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Discard draft" }).click();
  }
});

test("list items: duplicate, move and delete a course, then reset the block", async ({ page }) => {
  await signIn(page);
  await openHome(page);
  const titles = () => frame(page).locator('[data-ce^="courses."][data-ce$=".title"]');
  try {
    await expect(titles().first()).toBeVisible();
    const count = await titles().count();
    const first = await titles().first().innerText();
    await titles().first().click();
    await page.getByRole("button", { name: "Duplicate" }).first().click();
    await expect(titles()).toHaveCount(count + 1, { timeout: 20_000 });

    await page.getByRole("button", { name: "Move down" }).first().click();
    await expect
      .poll(async () => (await titles().first().innerText()) === first, { timeout: 20_000 })
      .toBe(true);
    await page.getByRole("button", { name: "Remove item" }).first().click();
    await expect(titles()).toHaveCount(count, { timeout: 20_000 });

    // Reset the whole block to the theme default.
    await titles().first().click();
    await page.getByRole("button", { name: "Duplicate" }).first().click();
    await expect(titles()).toHaveCount(count + 1, { timeout: 20_000 });
    await page.getByRole("button", { name: "Reset to theme default" }).click();
    await expect(titles()).toHaveCount(count, { timeout: 20_000 });
  } finally {
    await openHome(page);
    await resetKeyIfEdited(page, "courses.0.title").catch(() => {});
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Discard draft" }).click();
  }
});

test("drafts stay private; Publish makes theme edits live site-wide; Discard restores", async ({
  page,
}) => {
  await signIn(page);
  await openHome(page);
  const before = await publicPage(page);
  try {
    await editText(page, "hero.title", "E2E Published Hero");
    await editText(page, "footer.copyright", "E2E Footer Line");
    await saved(page);
    const draftOnly = await publicPage(page);
    expect(draftOnly.text).not.toContain("E2E Published Hero");
    expect(draftOnly.text).not.toContain("E2E Footer Line");

    await publish(page);
    const live = await publicPage(page);
    expect(live.text).toContain("E2E Published Hero");
    expect(live.text).toContain("E2E Footer Line");
    // The footer is shared: another public page shows it too.
    expect((await publicPage(page, "/search")).text).toContain("E2E Footer Line");

    // Discard drops a newer draft and keeps what is published.
    await editText(page, "hero.title", "E2E Thrown Away");
    await saved(page);
    await page.locator('summary[aria-label="More options"]').click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(ce(page, "hero.title")).toHaveText("E2E Published Hero", { timeout: 20_000 });
    expect((await publicPage(page)).text).not.toContain("E2E Thrown Away");
  } finally {
    await openHome(page);
    await resetKeyIfEdited(page, "hero.title");
    await resetKeyIfEdited(page, "footer.copyright");
    const dirty = await page.getByRole("button", { name: "Publish", exact: true }).isEnabled();
    if (dirty) await publish(page);
  }
  const after = await publicPage(page);
  expect(after.text).toBe(before.text);
});

test("markup typed as text is shown literally on the public page", async ({ page }) => {
  await signIn(page);
  await openHome(page);
  const payload = "<script>alert(1)</script><img src=x onerror=alert(2)>";
  try {
    await editText(page, "hero.title", payload);
    await saved(page);
    await publish(page);
    const live = await publicPage(page);
    expect(live.text).toContain(payload);
    expect(live.injected).toBe(0);
  } finally {
    await openHome(page);
    await resetKeyIfEdited(page, "hero.title");
    if (await page.getByRole("button", { name: "Publish", exact: true }).isEnabled())
      await publish(page);
  }
  expect((await publicPage(page)).text).not.toContain("alert(1)");
});

test("an image used by the theme content cannot be deleted until it is released", async ({
  page,
}) => {
  await signIn(page);
  await openHome(page);
  try {
    await ce(page, "hero.image").click();
    await page.getByRole("button", { name: "Choose image" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(ALT) })
      .click();
    await expect
      .poll(() => ce(page, "hero.image").getAttribute("src"), { timeout: 20_000 })
      .toContain(`/media/${mediaId}`);
    await saved(page);
    await publish(page);
    expect((await publicPage(page)).heroImage).toContain(`/media/${mediaId}`);

    const card = () =>
      page
        .locator("div,article,section")
        .filter({ has: page.locator(`img[alt="${ALT}"]`) })
        .filter({ has: page.getByRole("button", { name: "Delete" }) })
        .last();
    await page.goto("/admin/media");
    await card().getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(/used by .*theme content/i)).toBeVisible();
    await expect(page.locator(`img[alt="${ALT}"]`).first()).toBeVisible();

    // Release it: reset the block and publish, then deletion works.
    await openHome(page);
    await resetKeyIfEdited(page, "hero.title");
    await publish(page);
    await page.goto("/admin/media");
    await card().getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Image deleted.")).toBeVisible();
    await expect(page.locator(`img[alt="${ALT}"]`)).toHaveCount(0);
  } finally {
    await openHome(page);
    await resetKeyIfEdited(page, "hero.title").catch(() => {});
    if (await page.getByRole("button", { name: "Publish", exact: true }).isEnabled())
      await publish(page);
  }
});

test("cleanup: switch back to the Editorial theme", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/themes");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Editorial" }) })
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Activated|Editorial|default/ })
  ).toBeVisible();
});
