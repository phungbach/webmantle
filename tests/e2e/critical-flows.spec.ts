import { expect, test, type Page } from "@playwright/test";
import { ADMIN, hostileThemeZip, smallPngFile, uploadableThemeZip } from "./helpers";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}

// Next.js adds its own route announcer with the same ARIA roles. Exclude it so only app messages match.
const ANNOUNCER = ':not([id="__next-route-announcer__"])';
const flashAlert = (page: Page) => page.locator(`[role="alert"]${ANNOUNCER}`);
const flashStatus = (page: Page) => page.locator(`[role="status"]${ANNOUNCER}`);

test.describe.configure({ mode: "serial" });

// Most flows below check English labels, so the browser starts in English.
// The language tests at the end clear this cookie to check the Vietnamese default.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
});

test("admin area redirects anonymous visitors to sign-in", async ({ page }) => {
  await page.goto("/admin/posts");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("wrong password is rejected without revealing which field was wrong", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(flashAlert(page)).toContainText("Email or password is incorrect.");
});

test("administrator publishes a post that appears on the public site", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E Published Post");
  // The body is a rich text editor. Typed text is stored as paragraphs.
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Hello from the browser test.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(flashStatus(page)).toContainText("Post saved.");

  await page.goto("/");
  await expect(page.getByRole("link", { name: "E2E Published Post" }).first()).toBeVisible();
  await page.goto("/posts/e2e-published-post");
  await expect(page.getByRole("heading", { level: 1, name: "E2E Published Post" })).toBeVisible();
  await expect(page.locator(".cms-article")).toContainText("Hello from the browser test.");
  await expect(page.locator(".cms-article script")).toHaveCount(0);
});

test("an invalid theme archive is rejected with the reasons shown", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/themes");
  await page.locator('input[name="archive"]').setInputFiles(hostileThemeZip());
  await page.getByRole("button", { name: "Upload and validate" }).click();
  await expect(flashAlert(page)).toBeVisible();
  await expect(flashAlert(page)).toContainText("templates/evil.js");
});

test("theme preview renders without activating the theme", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/themes");
  // Preview opens in a new tab so the admin screen stays in place.
  const [preview] = await Promise.all([
    page.waitForEvent("popup"),
    page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Midnight Grid" }) })
      .getByRole("link", { name: "Preview" })
      .click(),
  ]);
  await preview.waitForLoadState("domcontentloaded");
  await expect(preview.getByText("Preview of an inactive theme")).toBeVisible();
  await expect(preview.locator(".cms-theme-root")).toHaveAttribute("data-theme-id", "starter");

  await page.goto("/");
  await expect(page.locator(".cms-theme-root")).toHaveAttribute("data-theme-id", "default");
});

test("activate a theme, roll back, and keep the same content", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);

  await page.goto("/admin/themes");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Midnight Grid" }) })
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(flashStatus(page)).toContainText("Activated starter");

  await page.goto("/");
  await expect(page.locator(".cms-theme-root")).toHaveAttribute("data-theme-id", "starter");
  await expect(page.getByRole("link", { name: "E2E Published Post" }).first()).toBeVisible();

  await page.goto("/admin/themes");
  await page.getByRole("button", { name: /Roll back to default/ }).click();
  await expect(flashStatus(page)).toContainText("Rolled back to default");

  await page.goto("/");
  await expect(page.locator(".cms-theme-root")).toHaveAttribute("data-theme-id", "default");
  await expect(page.getByRole("link", { name: "E2E Published Post" }).first()).toBeVisible();
});

test("a valid theme archive installs and appears in the theme manager", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/themes");
  await page.locator('input[name="archive"]').setInputFiles(uploadableThemeZip("uploaded-e2e"));
  await page.getByRole("button", { name: "Upload and validate" }).click();
  await expect(flashStatus(page)).toContainText("Installed uploaded-e2e 1.0.0");
  await expect(page.getByText("Uploaded E2E Theme")).toBeVisible();
});

test("public pages expose SEO metadata, feeds and a 404 page", async ({ page, request }) => {
  await page.goto("/posts/e2e-published-post");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/posts\/e2e-published-post$/
  );
  // BlogPosting plus BreadcrumbList.
  const ld = page.locator('script[type="application/ld+json"]');
  await expect(ld).toHaveCount(2);
  const all = (await ld.allTextContents()).join("\n");
  expect(all).toContain('"@type":"BlogPosting"');
  expect(all).toContain('"@type":"BreadcrumbList"');
  const feed = await request.get("/feed.xml");
  expect(feed.headers()["content-type"]).toContain("rss");
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("/posts/e2e-published-post");
  const missing = await page.goto("/posts/does-not-exist");
  expect(missing?.status()).toBe(404);
});

test("editor picks a theme template for a post and the public page uses it", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E Wide Article");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Wide layout body.");
  await page.getByLabel("Template").selectOption("full-width");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(flashStatus(page)).toContainText("Post saved.");

  await page.goto("/posts/e2e-wide-article");
  await expect(page.locator(".cms-theme-root")).toHaveAttribute(
    "data-custom-template",
    "full-width"
  );
  await expect(page.locator(".cms-article")).toContainText("Wide layout body.");
});

test("Vietnamese is the default language and visitors can switch to English", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();

  await page.goto("/");
  await expect(page.locator("header.cms-header")).toContainText("Trang chủ");
  await page.getByRole("link", { name: "English" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("header.cms-header")).toContainText("Home");
});

test("editor creates a formatted static page that the public site renders", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/pages/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E Rich Page");
  await page.getByLabel("Status").selectOption("published");

  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.getByRole("button", { name: "Large heading" }).click();
  await page.keyboard.type("Tiêu đề trang");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Đoạn đậm");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.press("Enter");
  // Image from the computer, inserted into a normal paragraph before the list starts.
  await page.locator(".cms-editor input[type=file]").setInputFiles(smallPngFile());
  await expect(page.locator(".ProseMirror img")).toHaveAttribute("src", /^\/media\//);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("Mục một");

  await page.getByRole("button", { name: "Create page" }).click();
  await expect(flashStatus(page)).toContainText("Page saved.");

  await page.goto("/pages/e2e-rich-page");
  await expect(page.locator(".cms-page__body img")).toHaveAttribute("src", /^\/media\//);
  await expect(page.locator(".cms-page__body h2")).toHaveText("Tiêu đề trang");
  await expect(page.locator(".cms-page__body strong")).toHaveText("Đoạn đậm");
  await expect(page.locator(".cms-page__body li")).toHaveText("Mục một");
});

test("link button opens a dialog that adds a link to the selected text", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/pages/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E Link Page");
  await page.getByLabel("Status").selectOption("published");

  const editor = page.locator(".ProseMirror");
  // Tiptap mounts after the page loads; wait until the text area is editable before typing.
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await editor.click();
  await page.keyboard.type("Đọc thêm tại đây");
  await page.keyboard.press("ControlOrMeta+A");

  // Without a selection the dialog does not open; with one it does.
  await page.getByRole("button", { name: "Add link" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Link address").fill("https://example.com/tai-lieu");
  await dialog.getByLabel("Open in a new tab").check();
  await dialog.getByRole("button", { name: "Save link" }).click();
  await expect(dialog).toBeHidden();
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com/tai-lieu");

  await page.getByRole("button", { name: "Create page" }).click();
  await expect(flashStatus(page)).toContainText("Page saved.");
  await page.goto("/pages/e2e-link-page");
  const link = page.locator(".cms-page__body a");
  await expect(link).toHaveAttribute("href", "https://example.com/tai-lieu");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("link dialog refuses unsafe addresses", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/pages/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E Unsafe Link");
  const editor = page.locator(".ProseMirror");
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await editor.click();
  await page.keyboard.type("Chữ");
  await page.keyboard.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Add link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Link address").fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Save link" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Invalid address");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(editor.locator("a")).toHaveCount(0);
});

test("administrator turns a plugin on from the Plugins tab", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/settings?tab=plugins");
  const card = page.getByRole("row").filter({ hasText: "Liên kết ngoài" });
  await expect(card.getByRole("cell", { name: "Off", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Turn on" }).click();
  await expect(flashStatus(page)).toContainText("Updated plugin external-links.");
  await expect(card.getByRole("cell", { name: "On", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Turn off" }).click();
  await expect(card.getByRole("cell", { name: "Off", exact: true })).toBeVisible();
});

test("theme detail page shows templates, file check and mobile preview", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/themes");
  await expect(page.getByRole("heading", { name: "Backups" })).toBeVisible();
  await page.getByRole("link", { name: "Details" }).first().click();
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "File check" })).toBeVisible();
  await expect(page.getByText("Valid", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Preview mobile" })).toHaveAttribute(
    "href",
    /device=mobile/
  );
});
