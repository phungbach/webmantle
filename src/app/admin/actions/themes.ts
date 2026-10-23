"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { ThemeError } from "@/lib/themes/errors";
import {
  activateInstalledTheme,
  removeTheme,
  rollbackActiveTheme,
  updateThemeSettings,
  uploadTheme,
} from "@/lib/themes/manage";
import { attempt, backWith, formString, tm, type ActionState } from "@/app/admin/actions/shared";
import { redirect } from "next/navigation";
import { clearBundleCache } from "@/lib/themes/registry";
import { deleteThemeBackup, deleteThemeBackups, restoreThemeBackup } from "@/lib/themes/backups";
import { clearPreviousTheme } from "@/lib/themes/activate";
import { prisma } from "@/lib/db";

const THEMES = "/admin/themes";

function publicCacheRefresh() {
  clearBundleCache();
  // Public pages are dynamic, so this only matters if a page is ever moved to a cached mode.
  revalidatePath("/", "layout");
}

/** Used by the upload form via useActionState. Returns the validation report instead of redirecting. */
export async function uploadThemeAction(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const file = formData.get("archive");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: await tm("themes.chooseZip") };
  try {
    const user = await requirePermission("themes:manage");
    const result = await uploadTheme(user, file);
    publicCacheRefresh();
    const warnings = result.report.warnings;
    return {
      ok: true,
      message: result.previousVersion
        ? await tm("flash.themeUpdated", {
            id: result.id,
            from: result.previousVersion,
            version: result.version,
          })
        : await tm("flash.themeInstalled", { id: result.id, version: result.version }),
      errors: warnings,
    };
  } catch (error) {
    console.error("[admin:theme-upload]", error instanceof Error ? error.message : error);
    if (error instanceof ThemeError) {
      const issues =
        error.report?.errors.map((e) => (e.file ? `${e.file}: ${e.message}` : e.message)) ?? [];
      return { ok: false, message: error.message, errors: issues };
    }
    return {
      ok: false,
      message:
        error instanceof Error && error.name === "ForbiddenError"
          ? error.message
          : await tm("flash.themeInvalidFile"),
    };
  }
}

export async function activateThemeAction(formData: FormData) {
  const themeId = formString(formData, "themeId");
  const result = await attempt("theme-activate", async () =>
    activateInstalledTheme(await requirePermission("themes:manage"), themeId)
  );
  publicCacheRefresh();
  if (!result.ok) backWith(THEMES, "error", result.message);
  backWith(
    THEMES,
    "ok",
    result.value.changed
      ? await tm("flash.themeActivated", { id: themeId })
      : await tm("flash.themeAlready", { id: themeId })
  );
}

export async function rollbackThemeAction() {
  const result = await attempt("theme-rollback", async () =>
    rollbackActiveTheme(await requirePermission("themes:manage"))
  );
  publicCacheRefresh();
  if (!result.ok) backWith(THEMES, "error", result.message);
  backWith(THEMES, "ok", await tm("flash.themeRolledBack", { id: result.value.activeThemeId }));
}

export async function uninstallThemeAction(formData: FormData) {
  const themeId = formString(formData, "themeId");
  const result = await attempt("theme-uninstall", async () =>
    removeTheme(await requirePermission("themes:manage"), themeId)
  );
  if (!result.ok) backWith(THEMES, "error", result.message);
  backWith(THEMES, "ok", await tm("flash.themeUninstalled", { id: themeId }));
}

export async function saveThemeSettingsAction(formData: FormData) {
  const themeId = formString(formData, "themeId");
  const values = await readThemeForm(formData, themeId);
  const result = await attempt("theme-settings", async () =>
    updateThemeSettings(await requirePermission("themes:manage"), themeId, values)
  );
  publicCacheRefresh();
  if (!result.ok) backWith(`${THEMES}/${encodeURIComponent(themeId)}`, "error", result.message);
  backWith(`${THEMES}/${encodeURIComponent(themeId)}`, "ok", await tm("flash.themeSettingsSaved"));
}

/** Builds typed values from the form using the theme's own schema, so unknown fields are ignored. */
async function readThemeForm(formData: FormData, themeId: string) {
  const theme = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!theme) redirect(THEMES);
  const manifest = JSON.parse(theme.manifestJson) as {
    settingsSchema: { key: string; type: string }[];
  };
  const values: Record<string, unknown> = {};
  for (const def of manifest.settingsSchema) {
    if (def.type === "boolean") values[def.key] = formData.get(def.key) === "on";
    else values[def.key] = formString(formData, def.key);
  }
  return values;
}

/** Restores a backup of an installed theme as its current version. */
export async function restoreThemeBackupAction(formData: FormData) {
  const name = formString(formData, "backup");
  const user = await requirePermission("themes:manage");
  const result = await attempt("theme-restore", async () => {
    const restored = await restoreThemeBackup(name, user.id);
    return restored;
  });
  publicCacheRefresh();
  if (!result.ok) backWith(THEMES, "error", result.message);
  backWith(
    THEMES,
    "ok",
    await tm("flash.themeRestoredFrom", { id: result.value.id, version: result.value.version })
  );
}

/** Where to go after a backup is deleted: the theme list, or the detail page the button was on. */
function backTarget(formData: FormData): string {
  const to = formString(formData, "returnTo");
  return /^\/admin\/themes(\/[a-z0-9]+(-[a-z0-9]+)*)?$/.test(to) ? to : THEMES;
}

/** Deletes one backup of a theme for good. The installed theme is not changed. */
export async function deleteThemeBackupAction(formData: FormData) {
  const user = await requirePermission("themes:manage");
  const back = backTarget(formData);
  const result = await attempt("theme-backup-delete", () =>
    deleteThemeBackup(formString(formData, "backup"), user.id)
  );
  if (!result.ok) backWith(back, "error", result.message);
  backWith(
    back,
    "ok",
    await tm("flash.backupDeleted", { id: result.value.themeId, version: result.value.version })
  );
}

/** Deletes the backups of one theme: all of them, or all but the newest when `keep` is 1. */
export async function deleteThemeBackupsAction(formData: FormData) {
  const user = await requirePermission("themes:manage");
  const back = backTarget(formData);
  const themeId = formString(formData, "themeId");
  const keep = formString(formData, "keep") === "1" ? 1 : 0;
  const result = await attempt("theme-backups-delete", async () => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(themeId))
      throw new ThemeError("not-found", "Unknown theme.");
    return deleteThemeBackups(themeId, user.id, keep);
  });
  if (!result.ok) backWith(back, "error", result.message);
  backWith(back, "ok", await tm("flash.backupsDeleted", { id: themeId, count: result.value }));
}

/** Forgets the rollback target, so an old theme can be removed. The active theme is not changed. */
export async function clearRollbackAction() {
  const user = await requirePermission("themes:manage");
  const result = await attempt("theme-clear-rollback", async () => clearPreviousTheme(user.id));
  if (!result.ok) backWith(THEMES, "error", result.message);
  backWith(THEMES, "ok", await tm("flash.rollbackCleared"));
}
