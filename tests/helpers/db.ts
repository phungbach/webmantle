import path from "node:path";
import fs from "node:fs";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { installThemeDirectory } from "@/lib/themes/install";
import { CMS_VERSION } from "@/lib/themes/contract";
import { DATA_DIR } from "@/lib/env";
import { clearBundleCache } from "@/lib/themes/registry";

export const ROOT = path.resolve(__dirname, "..", "..");

/** The stock themes "default" and "starter" are test fixtures; every other theme ships in themes/. */
export function themeDir(id: string): string {
  return ["default", "starter"].includes(id)
    ? path.join(ROOT, "tests", "fixtures", "themes", id)
    : path.join(ROOT, "themes", id);
}

/** Empties every table and the theme directory. Each integration test starts from this state. */
export async function resetDatabase() {
  await prisma.pageView.deleteMany();
  await prisma.postRevision.deleteMany();
  await prisma.postCategory.deleteMany();
  await prisma.postTag.deleteMany();
  await prisma.post.deleteMany();
  await prisma.page.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.media.deleteMany();
  await prisma.themeSetting.deleteMany();
  await prisma.themeHistory.deleteMany();
  await prisma.theme.deleteMany();
  await prisma.siteSetting.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  fs.rmSync(path.join(DATA_DIR, "themes"), { recursive: true, force: true });
  fs.rmSync(path.join(DATA_DIR, "backups"), { recursive: true, force: true });
  fs.rmSync(path.join(DATA_DIR, "media"), { recursive: true, force: true });
  clearBundleCache();
}

export async function createUser(
  role: "admin" | "editor" | "author" | "viewer",
  name: string = role
) {
  const user = await prisma.user.create({
    data: {
      email: `${role}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name,
      role,
      passwordHash: await hashPassword("correct horse battery"),
    },
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Installs the two stock fixture themes and makes "default" active (it is the fallback in tests). */
export async function installBuiltIns() {
  await installThemeDirectory(themeDir("default"), null);
  await installThemeDirectory(themeDir("starter"), null);
  await prisma.siteSetting.create({ data: { key: "activeThemeId", value: "default" } });
}

export { CMS_VERSION };
