import { NextResponse } from "next/server";
import { listInstalledThemes } from "@/lib/themes/registry";
import { getSiteSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/http";
import { can } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/** Admin-only list of installed themes. File paths are deliberately not included. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in required.");
  if (!can(user.role, "themes:manage"))
    return apiError(403, "forbidden", "You do not have permission to do this.");
  const [themes, settings] = await Promise.all([listInstalledThemes(), getSiteSettings()]);
  return NextResponse.json({
    data: themes.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      author: t.author,
      description: t.description,
      installedAt: t.installedAt,
      active: t.id === settings.activeThemeId,
    })),
  });
}
