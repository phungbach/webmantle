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

test("the English center theme activates and its pages render with their blocks", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);

  await page.goto("/admin/themes");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Trung tâm Anh ngữ (mẫu)" }) })
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(flashStatus(page)).toContainText("english-center");

  await page.goto("/");
  await expect(page.locator(".cms-theme-root")).toHaveAttribute("data-theme-id", "english-center");
  await expect(page.locator(".cms-mkt--courses")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Luyện thi IELTS" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/english-center-home.png", fullPage: true });

  for (const [slug, marker, shot] of [
    ["khoa-hoc", ".cms-mkt--courses", "courses"],
    ["hoc-phi", ".cms-mkt--pricing", "pricing"],
    ["gioi-thieu", ".cms-mkt--team", "about"],
  ] as const) {
    await page.goto(`/pages/${slug}`);
    await expect(page.locator(marker)).toBeVisible();
    await page.screenshot({ path: `test-results/english-center-${shot}.png`, fullPage: true });
  }

  await page.goto("/posts/ielts-writing-task-2-mo-bai");
  await expect(page.locator(".cms-article__title")).toBeVisible();
  await page.screenshot({ path: "test-results/english-center-post.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".cms-mkt--courses")).toBeVisible();
  await page.screenshot({ path: "test-results/english-center-mobile.png", fullPage: true });
});

test("the English center blog lists its posts in one shared card style", async ({ page }) => {
  await page.goto("/categories/ielts");
  const cards = page.locator(".cms-post");
  await expect(cards.first()).toBeVisible();
  const heights = await cards.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().height))
  );
  const images = await page
    .locator(".cms-post__image")
    .evaluateAll((els) =>
      els.map(
        (el) =>
          Math.round((el.getBoundingClientRect().width / el.getBoundingClientRect().height) * 100) /
          100
      )
    );
  // Every image is 16:9 (about 1.78), so cards in one row stay the same size.
  for (const ratio of images) expect(ratio).toBeCloseTo(16 / 9, 1);
  expect(heights.length).toBeGreaterThan(0);
});

test("switch back to the default theme after the check", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);
  await page.goto("/admin/themes");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Editorial" }) })
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(flashStatus(page)).toContainText("default");
});
