import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./helpers";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cms_locale", value: "en", url: baseURL! }]);
});

test("SEO tab shows checks that update as the post is written", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill("Lập trình web cho người mới");

  await page.getByRole("tab", { name: "SEO" }).click();
  await expect(page.getByText(/passed ·/)).toBeVisible();
  await expect(page.getByText("Title length:")).toBeVisible();

  await page.getByLabel("Focus keyword").fill("lập trình web");
  await expect(page.getByText("Focus keyword in the title")).toBeVisible();
  // The keyword check is a plain statement with a status icon; it is not a ranking promise.
  await expect(page.getByText("does not guarantee a ranking on Google")).toBeVisible();
});

test("a published post renders its SEO tags into the HTML crawlers receive", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E SEO HTML");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Nội dung kiểm tra thẻ SEO.");
  await page.getByRole("tab", { name: "SEO" }).click();
  await page.getByLabel("Focus keyword").fill("seo");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Post saved." })).toBeVisible();

  // Read the server response directly, without running any JavaScript: this is what crawlers see.
  const html = await (await page.request.get("/posts/e2e-seo-html")).text();
  expect(html).toContain('<link rel="canonical" href="http://localhost:3201/posts/e2e-seo-html"');
  expect(html).toMatch(/<meta name="robots" content="index, follow"/);
  expect(html).toContain('property="og:title"');
  expect(html).toContain('property="og:type" content="article"');
  expect(html).toContain('name="twitter:card"');
  expect(html).toMatch(/<script type="application\/ld\+json">\{[^<]*"@type":"BlogPosting"/);
});

test("a noindex post is marked noindex and left out of the sitemap", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E Hidden From Search");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Bài này không lập chỉ mục.");
  await page.getByRole("tab", { name: "SEO" }).click();
  await page.getByLabel("Search engines").selectOption("noindex");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Post saved." })).toBeVisible();

  const html = await (await page.request.get("/posts/e2e-hidden-from-search")).text();
  expect(html).toMatch(/<meta name="robots" content="noindex, follow"/);

  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("e2e-hidden-from-search");
});

test("admin pages are not indexable", async ({ page }) => {
  await signIn(page);
  const html = await (await page.request.get("/admin/posts")).text();
  expect(html).toContain('content="noindex, nofollow"');
});
