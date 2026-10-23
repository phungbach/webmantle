/**
 * Idempotent setup: safe to run more than once.
 *  - Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD (only if no admin exists).
 *  - Creates a read-only demo account from DEMO_EMAIL / DEMO_PASSWORD, when both are set.
 *  - Installs the built-in themes through the same validation as uploads.
 *  - Sets the active theme to the fallback theme (Webcore) if none is set.
 *  - Creates one sample post so the public site is not empty.
 */
import fs from "node:fs";
import path from "node:path";
import { compareSemver } from "../src/lib/themes/contract";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { installThemeDirectory } from "../src/lib/themes/install";
import { ACTIVE_KEY } from "../src/lib/themes/activate";
import { showThemePages } from "../src/lib/themes/theme-pages";
import { showThemeContent } from "../src/lib/themes/theme-content";
import { FALLBACK_THEME_ID } from "../src/lib/themes/registry";
import { setSiteSetting } from "../src/lib/settings";
import { sanitizeRichText, stripToText } from "../src/lib/security/sanitize";

const ROOT = path.resolve(__dirname, "..");

async function ensureAdmin() {
  const existing = await prisma.user.findFirst({ where: { role: "admin" } });
  if (existing) {
    console.log(`Admin exists: ${existing.email}`);
    return existing;
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 12) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in .env before running the seed."
    );
  }
  const admin = await prisma.user.create({
    data: {
      email,
      name: process.env.ADMIN_NAME?.trim() || "Administrator",
      role: "admin",
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Created administrator ${admin.email}`);
  return admin;
}

/**
 * Installs built-in themes that are missing, and updates them when the shipped version is newer.
 * An update goes through the normal update path, which keeps a backup of the previous version.
 */
async function installBuiltInThemes() {
  for (const id of ["webcore", "hien-studio", "english-center"]) {
    const dir = path.join(ROOT, "themes", id);
    const shipped = JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8")) as {
      version: string;
    };
    const installed = await prisma.theme.findUnique({ where: { id } });
    if (installed && compareSemver(installed.version, shipped.version) >= 0) {
      console.log(`Theme ${id} is up to date (${installed.version})`);
      continue;
    }
    const result = await installThemeDirectory(dir, null);
    console.log(
      result.previousVersion
        ? `Updated theme ${result.id} ${result.previousVersion} -> ${result.version} (backup kept)`
        : `Installed theme ${result.id} ${result.version}`
    );
  }
}

async function ensureActiveTheme() {
  const active = await prisma.siteSetting.findUnique({ where: { key: ACTIVE_KEY } });
  if (!active) {
    await setSiteSetting(ACTIVE_KEY, FALLBACK_THEME_ID);
    // The theme's pages, categories, tags and posts were created hidden while no theme was active.
    await showThemePages(FALLBACK_THEME_ID, null);
    await showThemeContent(FALLBACK_THEME_ID, null);
    console.log(`Active theme set to ${FALLBACK_THEME_ID}`);
  }
}

async function ensureSampleContent(authorId: string) {
  const count = await prisma.post.count();
  if (count > 0) return;
  const body = sanitizeRichText(
    "<p>Chào mừng bạn. Bài viết này được tạo khi cài đặt để trang chủ không bị trống. Bạn có thể sửa hoặc xóa trong trang quản trị.</p><h2>Giao diện</h2><p>Đổi giao diện trong <strong>Giao diện</strong>. Bài viết của bạn không thay đổi.</p>"
  );
  await prisma.post.create({
    data: {
      slug: "welcome",
      title: "Chào mừng đến với blog của bạn",
      excerpt: stripToText(body, 160),
      body,
      status: "published",
      publishedAt: new Date(),
      featured: true,
      authorId,
    },
  });
  console.log("Created sample post /posts/welcome");
}

/** The demo account has the "viewer" role: it can open /admin but cannot add, change or delete anything. */
async function ensureDemoUser() {
  const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? "";
  if (!email || !password) return;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Demo account exists: ${email} (${existing.role})`);
    return;
  }
  if (password.length < 12) {
    console.log("DEMO_PASSWORD must be at least 12 characters; demo account skipped.");
    return;
  }
  await prisma.user.create({
    data: {
      email,
      name: process.env.DEMO_NAME?.trim() || "Demo",
      role: "viewer",
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Created read-only demo account ${email}`);
}

async function main() {
  const admin = await ensureAdmin();
  await ensureDemoUser();
  await installBuiltInThemes();
  await ensureActiveTheme();
  await ensureSampleContent(admin.id);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
