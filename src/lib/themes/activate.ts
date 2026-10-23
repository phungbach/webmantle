import fs from "node:fs";
import path from "node:path";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { setSiteSetting } from "@/lib/settings";
import { ThemeError } from "@/lib/themes/errors";
import { FALLBACK_THEME_ID, loadBundle, resolveActiveTheme } from "@/lib/themes/registry";
import { withThemeLock } from "@/lib/themes/lock";
import { validateThemeDirectory } from "@/lib/themes/validate";
import { isInside } from "@/lib/themes/install";
import { THEMES_DIR } from "@/lib/env";
import {
  deleteThemePages,
  exclusivePageTemplates,
  hideThemePages,
  showThemePages,
} from "@/lib/themes/theme-pages";
import { deleteThemeContent, hideThemeContent, showThemeContent } from "@/lib/themes/theme-content";

export const ACTIVE_KEY = "activeThemeId";
export const PREVIOUS_KEY = "previousThemeId";

export type ActivationResult = {
  activeThemeId: string;
  previousThemeId: string | null;
  changed: boolean;
};

async function readThemePointers() {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [ACTIVE_KEY, PREVIOUS_KEY] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    activeThemeId: map.get(ACTIVE_KEY) || null,
    previousThemeId: map.get(PREVIOUS_KEY) || null,
  };
}

/**
 * Makes an installed theme active.
 * 1. Re-validates the files, so a theme edited on disk since install cannot go live.
 * 2. Loads the bundle, which checks every template resolves.
 * 3. Switches the active pointer and writes history in one transaction.
 * 4. Confirms the public renderer now resolves the new theme. If it does not, the previous pointer is restored.
 * Content, users, categories, SEO fields and other themes' settings are never modified here.
 */
export function activateTheme(themeId: string, actorId: string | null): Promise<ActivationResult> {
  return withThemeLock(() => activateUnlocked(themeId, actorId, "activate"));
}

/** Switches back to the theme that was active before the current one. */
export function rollbackTheme(actorId: string | null): Promise<ActivationResult> {
  return withThemeLock(async () => {
    const pointers = await readThemePointers();
    if (!pointers.previousThemeId) {
      throw new ThemeError("no-previous", "There is no previous theme to roll back to.");
    }
    return activateUnlocked(pointers.previousThemeId, actorId, "rollback");
  });
}

async function activateUnlocked(
  themeId: string,
  actorId: string | null,
  action: "activate" | "rollback"
): Promise<ActivationResult> {
  const theme = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!theme) throw new ThemeError("not-found", `Theme "${themeId}" is not installed.`);

  const pointers = await readThemePointers();
  if (pointers.activeThemeId === themeId) {
    return { activeThemeId: themeId, previousThemeId: pointers.previousThemeId, changed: false };
  }

  const report = validateThemeDirectory(theme.path);
  if (!report.ok) {
    await prisma.themeHistory.create({
      data: {
        action: "validation_failed",
        themeId,
        detail: report.errors
          .map((e) => e.message)
          .join("; ")
          .slice(0, 500),
        actorId,
      },
    });
    throw new ThemeError(
      "invalid",
      `Theme "${themeId}" cannot be activated because it is invalid.`,
      report
    );
  }
  // Throws ThemeError if any template fails to parse. Nothing has changed yet.
  loadBundle(themeId, theme.path);

  const previousThemeId = pointers.activeThemeId;
  const priorRollbackTarget = pointers.previousThemeId;
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: ACTIVE_KEY },
      create: { key: ACTIVE_KEY, value: themeId },
      update: { value: themeId },
    });
    await tx.siteSetting.upsert({
      where: { key: PREVIOUS_KEY },
      create: { key: PREVIOUS_KEY, value: previousThemeId ?? "" },
      update: { value: previousThemeId ?? "" },
    });
    await tx.themeHistory.create({
      data: {
        action,
        fromThemeId: previousThemeId,
        toThemeId: themeId,
        themeId,
        detail: JSON.stringify({ version: theme.version }),
        actorId,
      },
    });
  });

  // Verify the public site can actually resolve the new theme.
  const check = await resolveActiveTheme().catch(() => null);
  if (!check || check.fellBack || check.bundle.id !== themeId) {
    await restorePointer(previousThemeId, priorRollbackTarget, themeId, actorId);
    throw new ThemeError(
      "activation-failed",
      `Activation of "${themeId}" failed verification and was reverted.`
    );
  }

  // Static pages follow the active theme: the old theme's pages are hidden, the new one's shown.
  if (previousThemeId) {
    await hideThemePages(previousThemeId, actorId);
    await hideThemeContent(previousThemeId, actorId);
  }
  await showThemePages(themeId, actorId);
  await showThemeContent(themeId, actorId);

  await audit({
    actorId,
    action: action === "rollback" ? "theme.rollback" : "theme.activate",
    targetType: "theme",
    targetId: themeId,
    detail: { from: previousThemeId, version: theme.version },
  });
  return { activeThemeId: themeId, previousThemeId, changed: true };
}

async function restorePointer(
  activeBefore: string | null,
  rollbackBefore: string | null,
  failedThemeId: string,
  actorId: string | null
) {
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: ACTIVE_KEY },
      create: { key: ACTIVE_KEY, value: activeBefore ?? FALLBACK_THEME_ID },
      update: { value: activeBefore ?? FALLBACK_THEME_ID },
    });
    await tx.siteSetting.upsert({
      where: { key: PREVIOUS_KEY },
      create: { key: PREVIOUS_KEY, value: rollbackBefore ?? "" },
      update: { value: rollbackBefore ?? "" },
    });
    await tx.themeHistory.create({
      data: {
        action: "validation_failed",
        themeId: failedThemeId,
        detail: "Automatic rollback after failed activation verification",
        actorId,
      },
    });
  });
}

/** Why a theme cannot be deleted right now, or null when it can. Mirrors the checks in uninstallTheme. */
export async function deleteBlockReason(
  themeId: string
): Promise<"active" | "fallback" | "rollback" | null> {
  const pointers = await readThemePointers();
  if (pointers.activeThemeId === themeId) return "active";
  if (themeId === FALLBACK_THEME_ID) return "fallback";
  if (pointers.previousThemeId === themeId) return "rollback";
  return null;
}

/**
 * Removes an installed theme's files and database row. Its settings are removed with it.
 * Protected: the active theme, the fallback theme, and the rollback target.
 */
export function uninstallTheme(themeId: string, actorId: string | null): Promise<void> {
  return withThemeLock(async () => {
    const theme = await prisma.theme.findUnique({ where: { id: themeId } });
    if (!theme) throw new ThemeError("not-found", `Theme "${themeId}" is not installed.`);

    const pointers = await readThemePointers();
    if (pointers.activeThemeId === themeId) {
      throw new ThemeError(
        "active",
        "The active theme cannot be uninstalled. Activate another theme first."
      );
    }
    if (themeId === FALLBACK_THEME_ID) {
      throw new ThemeError(
        "protected",
        "The fallback theme cannot be uninstalled. It is what visitors see if the active theme breaks."
      );
    }
    if (pointers.previousThemeId === themeId) {
      throw new ThemeError(
        "protected",
        "This theme is the rollback target. Activate another theme before removing it."
      );
    }

    if (isInside(THEMES_DIR, theme.path)) {
      fs.rmSync(theme.path, { recursive: true, force: true });
      // The folder holds one sub-folder per version. Remove it too once it is empty.
      const parent = path.dirname(theme.path);
      if (isInside(THEMES_DIR, parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    }
    await deleteThemePages(themeId, actorId, await exclusivePageTemplates(themeId));
    await deleteThemeContent(themeId, actorId);
    await prisma.theme.delete({ where: { id: themeId } });
    await prisma.themeHistory.create({
      data: {
        action: "uninstall",
        themeId,
        detail: JSON.stringify({ version: theme.version }),
        actorId,
      },
    });
    await audit({
      actorId,
      action: "theme.uninstall",
      targetType: "theme",
      targetId: themeId,
      detail: { version: theme.version },
    });
  });
}

/** Clears the rollback pointer. Used by admins who want to remove an old theme and no longer need rollback. */
export async function clearPreviousTheme(actorId: string | null) {
  await setSiteSetting(PREVIOUS_KEY, "");
  await audit({
    actorId,
    action: "theme.rollback-cleared",
    targetType: "theme",
    targetId: PREVIOUS_KEY,
  });
}
