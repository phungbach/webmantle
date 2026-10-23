import fs from "node:fs";
import path from "node:path";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sanitizeRichText } from "@/lib/security/sanitize";
import { parseThemePages, type ThemePage } from "@/lib/themes/page-schemas";

/**
 * Static pages that ship with a theme (pages.json).
 *
 *   install / update   missing pages are created. Pages already there keep their text, so an
 *                      editor's changes survive a theme update; only the template is refreshed.
 *   theme active       the pages are published at their own address (/pages/<slug>).
 *   theme inactive     the pages are hidden: status becomes draft and the slug is parked as
 *                      "<slug>--<theme id>", which frees the address for the next theme.
 *   uninstall          the pages are deleted.
 *
 * A page that belongs to a theme has Page.themeId set. Pages written by editors are never touched.
 */

const ACTIVE_KEY = "activeThemeId";

/** Other-language texts of a page, cleaned like the page editor's body, stored as JSON. */
function serializeTranslations(page: ThemePage): string {
  const entries = Object.entries(page.translations);
  if (entries.length === 0) return "";
  return JSON.stringify(
    Object.fromEntries(
      entries.map(([locale, t]) => [locale, { ...t, body: sanitizeRichText(t.body) }])
    )
  );
}
export const parked = (slug: string, themeId: string) => `${slug}--${themeId}`;
export const isParked = (slug: string, themeId: string) => slug.endsWith(`--${themeId}`);
export const unparked = (slug: string, themeId: string) =>
  isParked(slug, themeId) ? slug.slice(0, -`--${themeId}`.length) : slug;

export type ThemePagesResult = { created: number; skipped: string[] };

function readPagesFile(dir: string) {
  const file = path.join(dir, "pages.json");
  if (!fs.existsSync(file)) return [];
  try {
    return parseThemePages(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return [];
  }
}

export async function pickAuthorId(actorId: string | null): Promise<string | null> {
  if (actorId) {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true } });
    if (actor) return actor.id;
  }
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  return admin?.id ?? null;
}

export async function isActiveTheme(themeId: string): Promise<boolean> {
  const row = await prisma.siteSetting.findUnique({ where: { key: ACTIVE_KEY } });
  return row?.value === themeId;
}

/** Creates the theme's pages after an install or update. `live` is true when the theme is active. */
export async function syncThemePages(
  themeId: string,
  themeDir: string,
  actorId: string | null
): Promise<ThemePagesResult> {
  const pages = readPagesFile(themeDir);
  const result: ThemePagesResult = { created: 0, skipped: [] };
  if (pages.length === 0) return result;
  const live = await isActiveTheme(themeId);
  const authorId = await pickAuthorId(actorId);
  if (!authorId) {
    result.skipped.push(...pages.map((p) => p.slug));
    return result;
  }

  for (const page of pages) {
    const owned = await prisma.page.findFirst({
      where: { themeId, slug: { in: [page.slug, parked(page.slug, themeId)] } },
    });
    if (owned) {
      await prisma.page.update({
        where: { id: owned.id },
        data: {
          template: page.template,
          isHome: page.isHome,
          translations: serializeTranslations(page),
        },
      });
      continue;
    }
    const taken = await prisma.page.findUnique({ where: { slug: page.slug } });
    // A page made before themes could ship pages, using this theme's own template, is adopted.
    if (taken && !taken.themeId && page.template && taken.template === page.template) {
      await prisma.page.update({
        where: { id: taken.id },
        data: { themeId, translations: serializeTranslations(page) },
      });
      if (!live) await parkPage(taken.id, taken.slug, themeId);
      continue;
    }
    if (live && taken) {
      result.skipped.push(page.slug);
      continue;
    }
    await prisma.page.create({
      data: {
        slug: live ? page.slug : parked(page.slug, themeId),
        title: page.title,
        body: sanitizeRichText(page.body),
        template: page.template,
        isHome: page.isHome,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        translations: serializeTranslations(page),
        status: live ? "published" : "draft",
        themeId,
        authorId,
      },
    });
    result.created++;
  }
  if (result.created > 0 || result.skipped.length > 0) {
    await audit({
      actorId,
      action: "theme.pages.sync",
      targetType: "theme",
      targetId: themeId,
      detail: { created: result.created, skipped: result.skipped },
    });
  }
  return result;
}

async function parkPage(id: string, slug: string, themeId: string) {
  await prisma.page.update({
    where: { id },
    data: { slug: parked(unparked(slug, themeId), themeId), status: "draft" },
  });
}

/** Publishes the theme's pages at their own addresses. Used when the theme becomes active. */
export async function showThemePages(themeId: string, actorId: string | null) {
  const rows = await prisma.page.findMany({ where: { themeId } });
  const skipped: string[] = [];
  for (const row of rows) {
    if (!isParked(row.slug, themeId)) continue;
    const slug = unparked(row.slug, themeId);
    if (await prisma.page.findUnique({ where: { slug } })) {
      skipped.push(slug); // an editor's own page already uses this address
      continue;
    }
    await prisma.page.update({ where: { id: row.id }, data: { slug, status: "published" } });
  }
  if (rows.length > 0) {
    await audit({
      actorId,
      action: "theme.pages.show",
      targetType: "theme",
      targetId: themeId,
      detail: { pages: rows.length, skipped },
    });
  }
}

/** Hides the theme's pages: draft status and a parked slug. Used when another theme takes over. */
export async function hideThemePages(themeId: string, actorId: string | null) {
  const rows = await prisma.page.findMany({ where: { themeId } });
  for (const row of rows) {
    if (!isParked(row.slug, themeId) || row.status !== "draft")
      await parkPage(row.id, row.slug, themeId);
  }
  if (rows.length > 0) {
    await audit({
      actorId,
      action: "theme.pages.hide",
      targetType: "theme",
      targetId: themeId,
      detail: { pages: rows.length },
    });
  }
}

/**
 * Custom page templates that only this theme offers. Pages made before themes could ship pages
 * (themeId empty) but laid out with one of these templates belong to the theme in practice.
 */
export async function exclusivePageTemplates(themeId: string): Promise<string[]> {
  const themes = await prisma.theme.findMany({ select: { id: true, manifestJson: true } });
  const offered = (json: string): string[] => {
    try {
      const manifest = JSON.parse(json) as {
        customTemplates?: { id: string; appliesTo: string[] }[];
      };
      return (manifest.customTemplates ?? [])
        .filter((t) => t.appliesTo.includes("page"))
        .map((t) => t.id);
    } catch {
      return [];
    }
  };
  const mine = themes.find((t) => t.id === themeId);
  if (!mine) return [];
  const others = new Set(
    themes.filter((t) => t.id !== themeId).flatMap((t) => offered(t.manifestJson))
  );
  return offered(mine.manifestJson).filter((id) => !others.has(id));
}

/**
 * Deletes the theme's pages. Used when the theme is uninstalled. Pages without an owner that use
 * one of the theme's own page templates (`legacyTemplates`) go with it.
 */
export async function deleteThemePages(
  themeId: string,
  actorId: string | null,
  legacyTemplates: string[] = []
) {
  const owned = await prisma.page.deleteMany({ where: { themeId } });
  const legacy =
    legacyTemplates.length > 0
      ? await prisma.page.deleteMany({
          where: { themeId: null, template: { in: legacyTemplates } },
        })
      : { count: 0 };
  const count = owned.count + legacy.count;
  if (count > 0) {
    await audit({
      actorId,
      action: "theme.pages.delete",
      targetType: "theme",
      targetId: themeId,
      detail: { pages: count, withoutOwner: legacy.count },
    });
  }
  return count;
}
