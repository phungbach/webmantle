import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { THEME_BACKUP_DIR } from "@/lib/env";
import {
  deleteThemeBackup,
  deleteThemeBackups,
  listThemeBackups,
  restoreThemeBackup,
} from "@/lib/themes/backups";
import { clearPreviousTheme, activateTheme } from "@/lib/themes/activate";
import { validateThemeDirectory } from "@/lib/themes/validate";
import { getInstalledTheme } from "@/lib/themes/registry";
import { createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";
import { copyDir, tmpDir } from "../helpers/tmp";

let admin: Awaited<ReturnType<typeof createUser>>;

/** Makes a backup folder the way an update would: a copy of an older version of the theme. */
function makeBackup(themeId: string, version: string, stamp = Date.now()) {
  const dir = copyDir(themeDir(themeId), path.join(tmpDir("backup-"), "src"));
  const file = path.join(dir, "theme.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.version = version;
  fs.writeFileSync(file, JSON.stringify(manifest));
  const target = path.join(THEME_BACKUP_DIR, `${themeId}-${version}-${stamp}`);
  fs.mkdirSync(THEME_BACKUP_DIR, { recursive: true });
  fs.cpSync(dir, target, { recursive: true });
  return path.basename(target);
}

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
});

describe("theme backups", () => {
  it("lists backups for installed themes, newest first", () => {
    makeBackup("default", "1.0.0", 1_700_000_000_000);
    makeBackup("default", "1.0.5", 1_800_000_000_000);
    makeBackup("starter", "1.0.0", 1_750_000_000_000);
    const list = listThemeBackups("default");
    expect(list.map((b) => b.version)).toEqual(["1.0.5", "1.0.0"]);
    expect(list.every((b) => b.themeId === "default")).toBe(true);
    expect(listThemeBackups().length).toBe(3);
  });

  it("restores a backup as the installed version and keeps a backup of the replaced one", async () => {
    const name = makeBackup("default", "1.0.0");
    const before = (await getInstalledTheme("default"))!.version;
    const result = await restoreThemeBackup(name, admin.id);
    expect(result).toMatchObject({ id: "default", version: "1.0.0", previousVersion: before });
    expect((await getInstalledTheme("default"))!.version).toBe("1.0.0");
    expect(listThemeBackups("default").some((b) => b.version === before)).toBe(true);
  });

  it("refuses names that are not backups of this CMS, including traversal attempts", async () => {
    for (const name of ["../default-1.0.0-1", "default", "x/../../secret", "default-1.0.0-abc"]) {
      await expect(restoreThemeBackup(name, admin.id), name).rejects.toMatchObject({
        code: "not-found",
      });
    }
  });

  it("refuses to restore a backup of a theme that is not installed", async () => {
    const name = makeBackup("starter", "1.0.0");
    await prisma.theme.delete({ where: { id: "starter" } });
    await expect(restoreThemeBackup(name, admin.id)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("deleting theme backups", () => {
  it("removes one backup folder, leaves the others and the installed theme, and logs it", async () => {
    const old = makeBackup("default", "1.0.0", 1_700_000_000_000);
    const newer = makeBackup("default", "1.0.5", 1_800_000_000_000);
    const other = makeBackup("starter", "1.0.0", 1_750_000_000_000);
    const before = (await getInstalledTheme("default"))!.version;

    const result = await deleteThemeBackup(old, admin.id);
    expect(result).toEqual({ themeId: "default", version: "1.0.0" });
    expect(fs.existsSync(path.join(THEME_BACKUP_DIR, old))).toBe(false);
    expect(fs.existsSync(path.join(THEME_BACKUP_DIR, newer))).toBe(true);
    expect(fs.existsSync(path.join(THEME_BACKUP_DIR, other))).toBe(true);
    expect(
      listThemeBackups()
        .map((b) => b.name)
        .sort()
    ).toEqual([newer, other].sort());
    expect((await getInstalledTheme("default"))!.version).toBe(before);

    const log = await prisma.auditLog.findFirst({ where: { action: "theme.backup.delete" } });
    expect(log).toMatchObject({ actorId: admin.id, targetType: "theme", targetId: "default" });
  });

  it("refuses names that are not backups, a backup that is already gone, and path tricks", async () => {
    const keep = makeBackup("default", "1.0.0", 1_700_000_000_000);
    for (const name of [
      "../default-1.0.0-1700000000000",
      "default",
      "x/../../secret",
      "default-1.0.0-abc",
      "default-9.9.9-1700000000000",
      "",
    ]) {
      await expect(deleteThemeBackup(name, admin.id), name).rejects.toMatchObject({
        code: "not-found",
      });
    }
    expect(fs.existsSync(path.join(THEME_BACKUP_DIR, keep))).toBe(true);
    await deleteThemeBackup(keep, admin.id);
    await expect(deleteThemeBackup(keep, admin.id)).rejects.toMatchObject({ code: "not-found" });
  });

  it("deletes all backups of one theme, or all but the newest, and no other theme's", async () => {
    makeBackup("default", "1.0.0", 1_700_000_000_000);
    makeBackup("default", "1.0.3", 1_750_000_000_000);
    const newest = makeBackup("default", "1.0.5", 1_800_000_000_000);
    const starter = makeBackup("starter", "1.0.0", 1_700_000_000_000);

    expect(await deleteThemeBackups("default", admin.id, 1)).toBe(2);
    expect(listThemeBackups("default").map((b) => b.name)).toEqual([newest]);

    expect(await deleteThemeBackups("default", admin.id)).toBe(1);
    expect(listThemeBackups("default")).toEqual([]);
    expect(await deleteThemeBackups("default", admin.id)).toBe(0);
    expect(listThemeBackups("starter").map((b) => b.name)).toEqual([starter]);
  });

  it("a deleted backup can no longer be restored, but the others still can", async () => {
    const gone = makeBackup("default", "1.0.0", 1_700_000_000_000);
    const kept = makeBackup("default", "1.0.1", 1_710_000_000_000);
    await deleteThemeBackup(gone, admin.id);
    await expect(restoreThemeBackup(gone, admin.id)).rejects.toMatchObject({ code: "not-found" });
    const restored = await restoreThemeBackup(kept, admin.id);
    expect(restored.version).toBe("1.0.1");
  });
});

describe("theme detail checks", () => {
  it("the installed built-in themes pass the file check shown on their detail page", async () => {
    for (const id of ["default", "starter"]) {
      const row = (await getInstalledTheme(id))!;
      const report = validateThemeDirectory(row.path);
      expect(report.ok, id).toBe(true);
      expect(report.errors).toEqual([]);
    }
  });

  it("clearing the rollback target keeps the active theme and removes the old pointer", async () => {
    await activateTheme("starter", admin.id); // default becomes the rollback target
    expect(
      await prisma.siteSetting.findUnique({ where: { key: "previousThemeId" } })
    ).toMatchObject({ value: "default" });
    await clearPreviousTheme(admin.id);
    expect(
      await prisma.siteSetting.findUnique({ where: { key: "previousThemeId" } })
    ).toMatchObject({ value: "" });
    expect(await prisma.siteSetting.findUnique({ where: { key: "activeThemeId" } })).toMatchObject({
      value: "starter",
    });
  });
});
