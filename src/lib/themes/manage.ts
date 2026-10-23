import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { assertPermission, type CurrentUser } from "@/lib/auth/session";
import { createPreviewToken } from "@/lib/themes/preview-token";
import { activateTheme, rollbackTheme, uninstallTheme } from "@/lib/themes/activate";
import { installThemeArchive } from "@/lib/themes/install";
import { saveThemeSettings } from "@/lib/themes/settings";
import { getInstalledTheme } from "@/lib/themes/registry";
import { ThemeError } from "@/lib/themes/errors";
import { LIMITS } from "@/lib/themes/contract";

// Permission-checked entry points for the Theme Manager. Server Actions call these.

export async function uploadTheme(user: CurrentUser, file: File) {
  assertPermission(user, "themes:manage");
  if (file.size > LIMITS.uploadBytes)
    throw new ThemeError("invalid", "Theme archives must be 5 MB or smaller.");
  const buffer = Buffer.from(await file.arrayBuffer());
  return installThemeArchive(buffer, user.id);
}

export async function createThemePreviewToken(user: CurrentUser, themeId: string) {
  assertPermission(user, "themes:manage");
  if (!(await getInstalledTheme(themeId)))
    throw new ThemeError("not-found", "That theme is not installed.");
  await audit({
    actorId: user.id,
    action: "theme.preview",
    targetType: "theme",
    targetId: themeId,
  });
  return createPreviewToken(themeId);
}

export async function activateInstalledTheme(user: CurrentUser, themeId: string) {
  assertPermission(user, "themes:manage");
  return activateTheme(themeId, user.id);
}

export async function rollbackActiveTheme(user: CurrentUser) {
  assertPermission(user, "themes:manage");
  return rollbackTheme(user.id);
}

export async function removeTheme(user: CurrentUser, themeId: string) {
  assertPermission(user, "themes:manage");
  return uninstallTheme(themeId, user.id);
}

export async function updateThemeSettings(
  user: CurrentUser,
  themeId: string,
  input: Record<string, unknown>
) {
  assertPermission(user, "themes:manage");
  const theme = await getInstalledTheme(themeId);
  if (!theme) throw new ThemeError("not-found", "That theme is not installed.");
  const manifest = JSON.parse(theme.manifestJson) as {
    settingsSchema: Parameters<typeof saveThemeSettings>[1];
  };
  await saveThemeSettings(themeId, manifest.settingsSchema, input);
  await audit({
    actorId: user.id,
    action: "theme.settings",
    targetType: "theme",
    targetId: themeId,
    detail: { keys: Object.keys(input) },
  });
}

export async function themeHistory(limit = 50) {
  return prisma.themeHistory.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
