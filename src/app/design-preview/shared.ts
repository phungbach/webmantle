import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { can, canView } from "@/lib/auth/permissions";
import { getLayoutState, type LayoutTarget } from "@/lib/builder/store";
import { composeLayout } from "@/lib/builder/compose";
import type { ThemeBundle } from "@/lib/themes/registry";

/**
 * The preview shows unpublished work, so it is only available to people who may edit the target, and
 * to the read-only demo account, which may look but never change (its actions are refused).
 */
export async function requireDesigner(target: LayoutTarget) {
  const user = await getCurrentUser();
  const permission = target.kind === "home" ? "settings:manage" : "content:write-any";
  if (!user || !canView(user.role, permission)) notFound();
  // Theme texts and pictures are site-wide, so editing them needs the settings permission.
  return { canEditContent: can(user.role, "settings:manage") };
}

/** Draft first, then the published layout. Undefined means "show the theme's own template". */
export async function previewLayout(bundle: ThemeBundle, target: LayoutTarget) {
  const { draft, published } = await getLayoutState(target);
  const doc = draft ?? published;
  return doc
    ? composeLayout(bundle, target.kind === "home" ? "home" : "page", doc, { editIds: true })
    : undefined;
}
