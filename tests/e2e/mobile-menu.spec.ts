import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 800 } });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
});

const toggle = (page: Page) => page.getByRole("button", { name: /^(Open|Close) menu$/ });
const nav = (page: Page) => page.locator("header").getByRole("navigation");

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("header[data-mobile-nav='ready']")).toHaveCount(1);
}

const bodyOverflow = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).overflow);

test("the toggle is hidden on desktop and visible on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await expect(toggle(page)).toBeHidden();
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeHidden();
});

test("opening shows the links; Escape closes and returns focus to the button", async ({ page }) => {
  await ready(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(toggle(page)).toHaveAccessibleName("Close menu");
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page)).toBeFocused();
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeHidden();
});

test("following a link navigates and leaves the menu closed", async ({ page }) => {
  await ready(page);
  await toggle(page).click();
  await nav(page).getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search/);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  expect(await bodyOverflow(page)).not.toBe("hidden");
});

test("tapping outside the menu closes it", async ({ page }) => {
  await ready(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await page.mouse.click(4, 790);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
});

test("the page does not scroll while the menu is open, and is restored on close", async ({
  page,
}) => {
  await ready(page);
  const before = await bodyOverflow(page);
  expect(before).not.toBe("hidden");
  await toggle(page).click();
  expect(await bodyOverflow(page)).toBe("hidden");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  expect(await bodyOverflow(page)).toBe(before);
});

test("growing the window to desktop width closes the menu", async ({ page }) => {
  await ready(page);
  await toggle(page).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(toggle(page)).toBeHidden();
  // The scroll lock is released by the resize listener, a moment after the layout changes.
  await expect.poll(() => bodyOverflow(page)).not.toBe("hidden");
});

test("without JavaScript the navigation stays visible", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 800 },
  });
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  await expect(page.locator("header[data-mobile-nav='ready']")).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "Search" })).toBeVisible();
  await context.close();
});

test("no horizontal scroll at 390px and no console problems", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

  const noOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await ready(page);
  expect(await noOverflow()).toBe(true);
  await toggle(page).click();
  expect(await noOverflow()).toBe(true);
  await page.keyboard.press("Escape");

  const href = await page.locator('a[href^="/posts/"]').first().getAttribute("href");
  test.skip(!href, "no post on the home page to open");
  await page.goto(href!);
  await expect(page.locator("header[data-mobile-nav='ready']")).toHaveCount(1);
  expect(await noOverflow()).toBe(true);

  expect(problems).toEqual([]);
});
