"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { saveAppearance, setLogoMedia } from "@/lib/appearance";
import { userMessage } from "@/lib/errors";
import { saveMedia, MEDIA_MAX_BYTES } from "@/lib/media";
import { attempt, backWith, formString, tm } from "@/app/admin/actions/shared";
import { MENU_KEY, MENU_ROWS, rowsToMenu, saveSiteMenu, type MenuRow } from "@/lib/menu";

const PAGE = "/admin/settings?tab=appearance";

/** Saves the colour set, heading colour, season and guard. */
export async function saveAppearanceAction(formData: FormData) {
  const user = await requirePermission("settings:manage");
  const result = await attempt("appearance-save", async () => {
    await saveAppearance({
      palette: formString(formData, "palette") || "theme",
      h1Mode: formString(formData, "h1Mode") || "theme",
      h1Color: formString(formData, "h1Color") || "#111827",
      season: formString(formData, "season") || "off",
      motion: formString(formData, "motion") || "on",
      blockDevtools: formData.get("blockDevtools") === "on",
    });
    await audit({
      actorId: user.id,
      action: "appearance.save",
      targetType: "setting",
      targetId: "appearance",
    });
  });
  revalidatePath("/", "layout");
  if (!result.ok) backWith(PAGE, "error", result.message);
  backWith(PAGE, "ok", await tm("appearance.saved"));
}

/**
 * Stores the logo. The browser crops the image to a square before sending it (see LogoUploader),
 * and the server checks the file contents again like any media upload.
 */
export async function uploadLogoAction(
  formData: FormData
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const user = await requirePermission("settings:manage");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MEDIA_MAX_BYTES) {
      return { ok: false, message: await tm("appearance.logoInvalid") };
    }
    const id = await saveMedia(user, Buffer.from(await file.arrayBuffer()), "Logo");
    await setLogoMedia(id);
    await audit({ actorId: user.id, action: "appearance.logo", targetType: "media", targetId: id });
    revalidatePath("/", "layout");
    return { ok: true, message: await tm("appearance.logoDone") };
  } catch (error) {
    console.error("[admin:logo]", error instanceof Error ? error.message : error);
    return { ok: false, message: userMessage(error) };
  }
}

/** Removes the logo; the default logo and favicon are used again. */
export async function removeLogoAction() {
  const user = await requirePermission("settings:manage");
  await setLogoMedia("");
  await audit({
    actorId: user.id,
    action: "appearance.logo-remove",
    targetType: "setting",
    targetId: "logoMediaId",
  });
  revalidatePath("/", "layout");
  backWith("/admin/settings", "ok", await tm("appearance.logoRemoved"));
}

/** Saves the main menu from the editor rows (label, link and level for each row). */
export async function saveMenuAction(formData: FormData) {
  const user = await requirePermission("settings:manage");
  const count = Math.min(Math.max(Number(formString(formData, "rowCount")) || 0, 0), MENU_ROWS);
  const rows: MenuRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      label: formString(formData, `label_${i}`),
      href: formString(formData, `href_${i}`),
      child: formString(formData, `level_${i}`) === "child",
    });
  }
  const result = await attempt("appearance-menu", async () => {
    await saveSiteMenu(rowsToMenu(rows));
    await audit({
      actorId: user.id,
      action: "appearance.menu",
      targetType: "setting",
      targetId: MENU_KEY,
    });
  });
  revalidatePath("/", "layout");
  if (!result.ok) backWith(PAGE, "error", result.message);
  backWith(PAGE, "ok", await tm("appearance.menuSaved"));
}

/** Removes the custom menu so the theme's own links are used again. */
export async function resetMenuAction() {
  const user = await requirePermission("settings:manage");
  const result = await attempt("appearance-menu-reset", async () => {
    await saveSiteMenu([]);
    await audit({
      actorId: user.id,
      action: "appearance.menu",
      targetType: "setting",
      targetId: MENU_KEY,
    });
  });
  revalidatePath("/", "layout");
  if (!result.ok) backWith(PAGE, "error", result.message);
  backWith(PAGE, "ok", await tm("appearance.menuCleared"));
}
