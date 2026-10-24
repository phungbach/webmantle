import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./helpers";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}

const flashStatus = (page: Page) =>
  page.locator('[role="status"]:not([id="__next-route-announcer__"])');

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
});

test("settings hub shows five tabs and switches by URL", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/settings");
  const tabs = page.getByRole("tablist", { name: "Settings sections" });
  for (const name of ["General", "Appearance", "Blog style", "SEO", "Plugins"]) {
    await expect(tabs.getByRole("tab", { name })).toBeVisible();
  }
  await expect(tabs.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");

  await tabs.getByRole("tab", { name: "Blog style" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\?tab=blog-style/);
  await expect(page.getByRole("button", { name: "Save blog style" })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Blog style" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await page.goto("/admin/settings?tab=plugins");
  await expect(tabs.getByRole("tab", { name: "Plugins" })).toHaveAttribute("aria-selected", "true");

  // an unknown tab falls back to General
  await page.goto("/admin/settings?tab=bogus");
  await expect(tabs.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
});

test("the sidebar no longer lists Appearance, Blog style or Plugins", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation").first();
  await expect(page.getByRole("link", { name: "Settings", exact: true }).first()).toBeVisible();
  for (const name of ["Appearance", "Blog style", "Plugins"]) {
    await expect(page.locator(`aside a:text-is("${name}")`)).toHaveCount(0);
  }
  await expect(nav).toBeVisible();
});

test("saving the General form shows a confirmation and keeps the value", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/settings");
  const title = page.getByLabel("Site title");
  const original = await title.inputValue();
  await title.fill("Settings Hub E2E");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByText("Site settings saved.")).toBeVisible();
  await expect(page.getByLabel("Site title")).toHaveValue("Settings Hub E2E");

  await page.getByLabel("Site title").fill(original);
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByText("Site settings saved.")).toBeVisible();
});

test("old URLs redirect into the hub and keep the message", async ({ page }) => {
  await signIn(page);
  for (const [old, tab] of [
    ["/admin/appearance", "appearance"],
    ["/admin/blog-style", "blog-style"],
    ["/admin/plugins", "plugins"],
  ] as const) {
    await page.goto(old);
    await expect(page).toHaveURL(new RegExp(`/admin/settings\\?tab=${tab}`));
  }
  await page.goto("/admin/appearance?ok=Hello%20there");
  await expect(page).toHaveURL(/tab=appearance/);
  await expect(flashStatus(page)).toContainText("Hello there");
});

test("plugin detail page still opens", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/settings?tab=plugins");
  const link = page.locator('a[href^="/admin/plugins/"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/plugins\/[^/?]+/);
});

test("the logo card is on General and no longer on Appearance", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/settings");
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await page.goto("/admin/settings?tab=appearance");
  await expect(page.getByRole("button", { name: "Save appearance" })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator('input[name="siteTitle"]')).toHaveCount(0);
});
