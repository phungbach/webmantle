import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can, canView } from "@/lib/auth/permissions";
import { getLayoutState, type LayoutTarget } from "@/lib/builder/store";
import { getLocale } from "@/lib/i18n/server";
import { en, vi } from "@/lib/i18n/messages";
import { isLocale, tr } from "@/lib/i18n";
import { contentFor, resolveActiveTheme } from "@/lib/themes/registry";
import {
  applyContentOverrides,
  getContentEditState,
  loadContentOverrides,
} from "@/lib/themes/content-overrides";
import { editorLabels } from "@/components/admin/editor/labels";
import { Designer } from "@/components/admin/designer/designer";
import type { LayoutDoc, MediaItem } from "@/components/admin/designer/types";

/** Server side of the designer: checks the permission, loads both documents and the image library. */
export async function DesignerPage({ target }: { target: LayoutTarget }) {
  const user = await getCurrentUser();
  const permission = target.kind === "home" ? "settings:manage" : "content:write-any";
  if (!user || !canView(user.role, permission)) redirect("/admin");

  const locale = await getLocale();
  const T = tr(locale);
  let title = T("builder.homeTitle");
  let liveHref = "/";
  let backHref = "/admin/settings?tab=general";
  if (target.kind === "page") {
    const page = await prisma.page.findUnique({
      where: { id: target.id },
      select: { title: true, slug: true },
    });
    if (!page) notFound();
    title = page.title;
    liveHref = `/pages/${page.slug}`;
    backHref = `/admin/pages/${target.id}`;
  }

  // The theme's own texts and pictures, with this administrator's unpublished edits on top.
  const { bundle } = await resolveActiveTheme();
  const base = contentFor(bundle, locale);
  const [overrides, editState] = await Promise.all([
    loadContentOverrides(bundle.id, locale, { draft: true }),
    getContentEditState(bundle.id, locale),
  ]);

  const [state, media] = await Promise.all([
    getLayoutState(target),
    prisma.media.findMany({
      where: { mimeType: { in: ["image/jpeg", "image/png", "image/webp", "image/gif"] } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, altText: true, filename: true },
    }),
  ]);

  const table: Record<string, string> = isLocale(locale) && locale === "en" ? en : vi;
  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(table))
    if (key.startsWith("builder.")) messages[key] = value;

  const items: MediaItem[] = media.map((m) => ({ id: m.id, alt: m.altText, name: m.filename }));
  const initial: LayoutDoc | null = (state.draft ?? state.published) as LayoutDoc | null;

  return (
    <Designer
      target={target}
      title={title}
      backHref={backHref}
      liveHref={liveHref}
      previewSrc={
        target.kind === "home" ? "/design-preview/home" : `/design-preview/page/${target.id}`
      }
      initialDoc={initial}
      hasDraft={state.draft !== null}
      hasPublished={state.published !== null}
      messages={messages}
      editorLabels={editorLabels(T)}
      media={items}
      themeContent={{
        base,
        merged: applyContentOverrides(base, overrides),
        draftKeys: editState.draftKeys,
        publishedKeys: editState.publishedKeys,
        canEdit: can(user.role, "settings:manage"),
      }}
    />
  );
}
