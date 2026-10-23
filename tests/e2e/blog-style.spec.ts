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

test("a blog style saved in admin reaches the public list, and can be reset", async ({ page }) => {
  await signIn(page);

  await page.goto("/admin/settings?tab=blog-style");
  await page.getByLabel("Two columns (grid)").check();
  await page.getByRole("button", { name: "Save blog style" }).click();
  await expect(flashStatus(page)).toContainText("Blog style saved.");

  await page.goto("/");
  await expect(page.locator('style[data-blog-style="true"]')).toHaveCount(1);

  await page.goto("/admin/settings?tab=blog-style");
  await page.getByLabel("From theme").first().check();
  await page.getByRole("button", { name: "Save blog style" }).click();
  await expect(flashStatus(page)).toContainText("Blog style saved.");

  await page.goto("/");
  await expect(page.locator('style[data-blog-style="true"]')).toHaveCount(0);
});
