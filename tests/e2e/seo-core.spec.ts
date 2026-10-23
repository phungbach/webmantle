import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./helpers";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
});

/** The site title as saved in the database, read from the admin settings form. */
async function siteTitle(page: Page): Promise<string> {
  await page.goto("/admin/settings");
  return page.getByLabel("Site title").inputValue();
}

test("home title is the site title, not a hard-coded name, with meta and JSON-LD", async ({
  page,
}) => {
  await signIn(page);
  const title = await siteTitle(page);
  expect(title.length).toBeGreaterThan(0);

  const html = await (await page.request.get("/")).text();
  const titleTag = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  expect(titleTag.replace(/&amp;/g, "&")).toBe(title);
  if (title !== "Blog") expect(titleTag).not.toBe("Blog");
  expect(html).toMatch(/<meta name="description" content="[^"]+"/);
  expect(html).toMatch(/<link rel="canonical" href="http:\/\/localhost:3201\/?"/);
  expect(html).toContain('property="og:site_name"');
  expect(html).toMatch(/<script type="application\/ld\+json">[^]*?"@type":"WebSite"/);
  expect(html).toContain("search_term_string");
});

test("a post title ends with the site title after the separator", async ({ page }) => {
  await signIn(page);
  const title = await siteTitle(page);
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E SEO Core Post");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Body for the SEO core check.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Post saved." })).toBeVisible();

  const html = await (await page.request.get("/posts/e2e-seo-core-post")).text();
  const titleTag = (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "").replace(/&amp;/g, "&");
  expect(titleTag.endsWith(`· ${title}`)).toBe(true);
  expect(titleTag).toContain("E2E SEO Core Post");
  expect(html).toMatch(/"@type":"BreadcrumbList"/);
});

test("robots.txt and sitemap.xml respond", async ({ page }) => {
  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toContain("Disallow: /admin");
  expect(text).toContain("Sitemap:");
  const sm = await page.request.get("/sitemap.xml");
  expect(sm.status()).toBe(200);
  expect(await sm.text()).toContain("<urlset");
  const feed = await (await page.request.get("/feed.xml")).text();
  expect(feed).toContain("<atom:link");
});

test("SEO tab: home title and separator change the public titles, then are restored", async ({
  page,
}) => {
  await signIn(page);
  const site = await siteTitle(page);
  const titleOf = async (path: string) => {
    const html = await (await page.request.get(path)).text();
    return (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "").replace(/&amp;/g, "&");
  };

  await page.goto("/admin/settings?tab=seo");
  const separator = page.locator('#seo-form select[name="separator"]');
  const homeTitle = page.locator('#seo-form input[name="homeTitle"]');
  const originalSeparator = await separator.inputValue();
  const originalHome = await homeTitle.inputValue();

  const save = async () => {
    await page.getByRole("button", { name: "Save changes" }).first().click();
    await expect(page.getByText("SEO settings saved.")).toBeVisible();
  };

  try {
    await separator.selectOption("—");
    await homeTitle.fill("E2E Home Headline");
    await save();
    await expect(page).toHaveURL(/tab=seo/);

    expect(await titleOf("/")).toBe("E2E Home Headline");
    expect(await titleOf("/posts/e2e-seo-core-post")).toBe(`E2E SEO Core Post — ${site}`);
  } finally {
    await page.goto("/admin/settings?tab=seo");
    await page.locator('#seo-form select[name="separator"]').selectOption(originalSeparator);
    await page.locator('#seo-form input[name="homeTitle"]').fill(originalHome);
    await save();
  }
  expect(await titleOf("/")).toBe(originalHome || site);
  expect(await titleOf("/posts/e2e-seo-core-post")).toBe(
    `E2E SEO Core Post ${originalSeparator} ${site}`
  );
});
