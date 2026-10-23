import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./helpers";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}

const ANNOUNCER = ':not([id="__next-route-announcer__"])';
const flashStatus = (page: Page) => page.locator(`[role="status"]${ANNOUNCER}`);

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
});

test("a menu saved in Appearance replaces the header links, and can be reset", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);

  await page.goto("/admin/settings?tab=appearance");
  await page.locator('input[name="label_0"]').fill("E2E Menu Item");
  await page.locator('input[name="href_0"]').fill("/pages/e2e-menu");
  // Pick an existing page from the list: it fills the link and the empty name.
  await page
    .locator('select[aria-label="Pick an existing page…"]')
    .nth(1)
    .selectOption({ label: "Search" });
  await expect(page.locator('input[name="href_1"]')).toHaveValue("/search");
  await expect(page.locator('input[name="label_1"]')).toHaveValue("Search");
  await page.locator('select[name="level_1"]').selectOption("child");
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(flashStatus(page)).toContainText("Menu saved.");

  await page.goto("/");
  const header = page.locator(".cms-header__nav");
  // An item with children opens as a dropdown; the child link sits inside it.
  await expect(header.locator("summary", { hasText: "E2E Menu Item" })).toBeVisible();
  await expect(header.locator('a[href="/search"]')).toHaveCount(1);

  await page.goto("/admin/settings?tab=appearance");
  await page.getByRole("button", { name: "Use the theme's menu" }).click();
  await expect(flashStatus(page)).toContainText("Back to the theme's menu.");

  await page.goto("/");
  await expect(
    page.locator(".cms-header__nav").getByRole("link", { name: "E2E Menu Item" })
  ).toHaveCount(0);
});

test("the menu editor adds and removes rows", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/settings?tab=appearance");
  const labels = page.locator('input[name^="label_"]');
  const before = await labels.count();
  await page.getByRole("button", { name: "Add row" }).click();
  await expect(labels).toHaveCount(before + 1);
  await page.getByRole("button", { name: "Remove row" }).last().click();
  await expect(labels).toHaveCount(before);
});
