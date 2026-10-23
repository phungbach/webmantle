import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("appearance page changes the colour set and the logo appears on the site", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/admin/settings?tab=appearance");

  await page.locator('input[name="palette"][value="green"]').check({ force: true });
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Appearance settings saved." })
  ).toBeVisible();
  const coloured = await (await page.request.get("/")).text();
  expect(coloured).toContain("--color-accent:#059669");

  // The logo lives on the General tab, not on Appearance.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.goto("/admin/settings");

  // A real PNG made in the browser, so the in-browser crop and the server check both run.
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(0, 0, 64, 48);
    return canvas.toDataURL("image/png");
  });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "logo-")), "logo.png");
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1]!, "base64"));

  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Logo updated.")).toBeVisible();

  await page.goto("/");
  await expect(page.locator(".cms-header__logo")).toHaveAttribute("src", /^\/media\//);
  // The logo keeps a small, fixed size in the header and footer, whatever its pixel size.
  const footerLogo = await page.locator(".cms-footer__logo").boundingBox();
  expect(footerLogo!.height).toBeLessThanOrEqual(60);
  const headerLogo = await page.locator(".cms-header__logo").boundingBox();
  expect(headerLogo!.height).toBeLessThanOrEqual(60);
  // The tab icon points at the logo id, so a new logo gets a new address and is not served from cache.
  const iconHref = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(iconHref).toMatch(/^\/site-icon\?v=[a-z0-9]+$/);
  const icon = await page.request.get(iconHref!);
  expect(icon.headers()["content-type"]).toContain("image/png");

  // Put the colour set back so later tests see the theme's own colours.
  await page.goto("/admin/settings?tab=appearance");
  await page.locator('input[name="palette"][value="theme"]').check({ force: true });
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Appearance settings saved." })
  ).toBeVisible();
});

test("clicking a colour set highlights it immediately, before saving", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/settings?tab=appearance");
  const indigo = page.locator("label", { hasText: "Indigo" });
  // A real click on the card, not a forced check of the hidden control.
  await indigo.click();
  await expect(page.locator('input[name="palette"][value="indigo"]')).toBeChecked();
  // brand-600: the highlight colour of the selected card.
  await expect(indigo).toHaveCSS("border-color", "rgb(59, 91, 219)");
});
