import fs from "node:fs";
import path from "node:path";
import { THEME_BACKUP_DIR } from "@/lib/env";
import { isInside, installThemeDirectory } from "@/lib/themes/install";
import { ThemeError } from "@/lib/themes/errors";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withThemeLock } from "@/lib/themes/lock";

/**
 * Backups are written by updates: install.ts copies the outgoing version to backups/themes/<id>-<version>-<time>.
 * This module lists them and restores one by installing it through the normal update path, so a
 * restore is validated like any other install and keeps a backup of the version it replaces.
 */

export type ThemeBackup = {
  name: string;
  themeId: string;
  version: string;
  createdAt: Date;
};

const NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+\.\d+\.\d+)-(\d{10,})$/;

export function listThemeBackups(themeId?: string): ThemeBackup[] {
  if (!fs.existsSync(THEME_BACKUP_DIR)) return [];
  return fs
    .readdirSync(THEME_BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = NAME.exec(entry.name);
      if (!match) return null;
      return {
        name: entry.name,
        themeId: match[1]!,
        version: match[2]!,
        createdAt: new Date(Number(match[3])),
      };
    })
    .filter((b): b is ThemeBackup => b !== null && (!themeId || b.themeId === themeId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Restores a backup as the installed version of its theme. The backup name must come from the list. */
export async function restoreThemeBackup(name: string, actorId: string | null) {
  const match = NAME.exec(name);
  if (!match) throw new ThemeError("not-found", "That backup does not exist.");
  const dir = path.join(THEME_BACKUP_DIR, name);
  if (!isInside(THEME_BACKUP_DIR, dir) || !fs.existsSync(dir)) {
    throw new ThemeError("not-found", "That backup does not exist.");
  }
  const themeId = match[1]!;
  const installed = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!installed) throw new ThemeError("not-found", `Theme "${themeId}" is not installed.`);
  const result = await installThemeDirectory(dir, actorId);
  return result;
}

/** Folder of a backup. The name must come from the list: anything else, or a missing folder, is "not found". */
function locateBackup(name: string) {
  const match = NAME.exec(name);
  const dir = path.join(THEME_BACKUP_DIR, name);
  if (!match || !isInside(THEME_BACKUP_DIR, dir) || !fs.existsSync(dir)) {
    throw new ThemeError("not-found", "That backup does not exist.");
  }
  return { dir, themeId: match[1]!, version: match[2]! };
}

/**
 * Deletes one backup for good. The installed theme is not touched: a backup is only a copy of an
 * older version. Runs inside the theme lock, so it cannot overlap an install or a restore.
 */
export function deleteThemeBackup(name: string, actorId: string | null) {
  return withThemeLock(async () => {
    const { dir, themeId, version } = locateBackup(name);
    fs.rmSync(dir, { recursive: true, force: true });
    await audit({
      actorId,
      action: "theme.backup.delete",
      targetType: "theme",
      targetId: themeId,
      detail: { backup: name, version },
    });
    return { themeId, version };
  });
}

/**
 * Deletes the backups of one theme, newest first kept: `keep` 0 removes them all, 1 keeps only the
 * newest. Returns how many were deleted.
 */
export function deleteThemeBackups(themeId: string, actorId: string | null, keep = 0) {
  return withThemeLock(async () => {
    const doomed = listThemeBackups(themeId).slice(Math.max(0, keep));
    for (const backup of doomed) {
      fs.rmSync(path.join(THEME_BACKUP_DIR, backup.name), { recursive: true, force: true });
    }
    if (doomed.length > 0) {
      await audit({
        actorId,
        action: "theme.backup.delete",
        targetType: "theme",
        targetId: themeId,
        detail: { count: doomed.length, kept: keep, versions: doomed.map((b) => b.version) },
      });
    }
    return doomed.length;
  });
}
