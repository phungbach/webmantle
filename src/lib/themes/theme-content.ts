import fs from "node:fs";
import path from "node:path";
import { audit } from "@/lib/audit";
import { serializeFields } from "@/lib/content/fields";
import { prisma } from "@/lib/db";
import { sanitizeRichText } from "@/lib/security/sanitize";
import { parseThemeCategories, parseThemePosts, parseThemeTags } from "@/lib/themes/post-schemas";
import { isActiveTheme, isParked, parked, pickAuthorId, unparked } from "@/lib/themes/theme-pages";
import type { ThemeTag } from "@/lib/themes/post-schemas";

/**
 * Categories, tags and posts that ship with a theme (categories.json, tags.json, posts.json). They
 * follow the theme the same way its static pages do:
 *
 *   install / update   missing items are created. Categories and posts already there keep their
 *                      text. Tags follow the file: their names and translations are refreshed, and a
 *                      tag the theme no longer lists is removed (or handed to the editors when a
 *                      post of theirs still uses it).
 *   theme active       categories and tags are shown and posts are published at their own address.
 *   theme inactive     categories and tags are hidden and posts become drafts. Their slugs are
 *                      parked as "<slug>--<theme id>", which frees the address for the next theme.
 *   uninstall          the theme's posts, categories and tags are deleted.
 *
 * Items made by the theme have themeId set; items written by editors are never touched. Other
 * languages live in each item's `translations`, written by the theme and read on the public site.
 */

export type ThemeContentResult = {
  categories: number;
  tags: number;
  /** Tags the theme no longer lists, removed or handed over to the editors. */
  tagsRemoved: number;
  posts: number;
  skipped: string[];
};

function readJson(dir: string, file: string): unknown {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) return [];
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [];
  }
}

function clean(translations: Record<string, object>): string {
  const entries = Object.entries(translations);
  if (entries.length === 0) return "";
  return JSON.stringify(
    Object.fromEntries(
      entries.map(([locale, t]) => [
        locale,
        "body" in t ? { ...t, body: sanitizeRichText(String(t.body ?? "")) } : t,
      ])
    )
  );
}

function dateOf(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T08:00:00+07:00` : value);
}

export async function syncThemeContent(
  themeId: string,
  themeDir: string,
  actorId: string | null
): Promise<ThemeContentResult> {
  const categories = parseThemeCategories(readJson(themeDir, "categories.json"));
  const tags = parseThemeTags(readJson(themeDir, "tags.json"));
  const posts = parseThemePosts(readJson(themeDir, "posts.json"));
  const result: ThemeContentResult = {
    categories: 0,
    tags: 0,
    tagsRemoved: 0,
    posts: 0,
    skipped: [],
  };
  // A theme that dropped its tags.json still has tags from the last version to clean up.
  const hadTags = tags.length > 0 || (await prisma.tag.count({ where: { themeId } })) > 0;
  if (categories.length === 0 && posts.length === 0 && !hadTags) return result;
  const live = await isActiveTheme(themeId);
  const authorId = await pickAuthorId(actorId);

  for (const c of categories) {
    const translations = clean(c.translations);
    const owned = await prisma.category.findFirst({
      where: { themeId, slug: { in: [c.slug, parked(c.slug, themeId)] } },
    });
    if (owned) {
      await prisma.category.update({ where: { id: owned.id }, data: { translations } });
      continue;
    }
    const taken = await prisma.category.findUnique({ where: { slug: c.slug } });
    if (taken && !taken.themeId && taken.name === c.name) {
      await prisma.category.update({
        where: { id: taken.id },
        data: {
          themeId,
          translations,
          ...(live ? {} : { slug: parked(taken.slug, themeId), hidden: true }),
        },
      });
      continue;
    }
    if (live && taken) {
      result.skipped.push(`category:${c.slug}`);
      continue;
    }
    await prisma.category.create({
      data: {
        slug: live ? c.slug : parked(c.slug, themeId),
        name: c.name,
        description: c.description,
        seoDescription: c.seoDescription,
        translations,
        themeId,
        hidden: !live,
      },
    });
    result.categories++;
  }

  await syncThemeTags(themeId, tags, live, result);

  if (!authorId) {
    result.skipped.push(...posts.map((p) => `post:${p.slug}`));
    return finish(result, actorId, themeId);
  }
  for (const p of posts) {
    const translations = clean(p.translations);
    const owned = await prisma.post.findFirst({
      where: { themeId, slug: { in: [p.slug, parked(p.slug, themeId)] } },
    });
    if (owned) {
      await prisma.post.update({
        where: { id: owned.id },
        data: { translations, themeImage: p.image, fields: serializeFields(p.fields) },
      });
      // Tags added to posts.json in a newer version reach posts that are already installed.
      for (const tagId of await themeTagIds(themeId, p.tags)) {
        await prisma.postTag.upsert({
          where: { postId_tagId: { postId: owned.id, tagId } },
          update: {},
          create: { postId: owned.id, tagId },
        });
      }
      continue;
    }
    const taken = await prisma.post.findUnique({ where: { slug: p.slug } });
    if (taken && !taken.themeId && taken.title === p.title) {
      await prisma.post.update({
        where: { id: taken.id },
        data: {
          themeId,
          translations,
          themeImage: p.image,
          fields: serializeFields(p.fields),
          ...(live ? {} : { slug: parked(taken.slug, themeId), status: "draft" }),
        },
      });
      continue;
    }
    if (live && taken) {
      result.skipped.push(`post:${p.slug}`);
      continue;
    }
    const categoryIds: string[] = [];
    for (const slug of p.categories) {
      const row =
        (await prisma.category.findFirst({
          where: { themeId, slug: { in: [slug, parked(slug, themeId)] } },
        })) ?? (await prisma.category.findUnique({ where: { slug } }));
      if (row) categoryIds.push(row.id);
    }
    const tagIds = await themeTagIds(themeId, p.tags);
    const body = sanitizeRichText(p.body);
    await prisma.post.create({
      data: {
        slug: live ? p.slug : parked(p.slug, themeId),
        title: p.title,
        excerpt: p.excerpt,
        body,
        status: live ? "published" : "draft",
        publishedAt: dateOf(p.publishedAt),
        featured: p.featured,
        themeImage: p.image,
        fields: serializeFields(p.fields),
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        translations,
        themeId,
        authorId,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
    result.posts++;
  }
  return finish(result, actorId, themeId);
}

async function finish(result: ThemeContentResult, actorId: string | null, themeId: string) {
  if (
    result.categories + result.tags + result.tagsRemoved + result.posts > 0 ||
    result.skipped.length > 0
  ) {
    await audit({
      actorId,
      action: "theme.content.sync",
      targetType: "theme",
      targetId: themeId,
      detail: { ...result },
    });
  }
  return result;
}

/** Ids of the tags a post names: the theme's own (shown or parked), else an existing tag. */
async function themeTagIds(themeId: string, slugs: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const slug of slugs) {
    const row =
      (await prisma.tag.findFirst({
        where: { themeId, slug: { in: [slug, parked(slug, themeId)] } },
      })) ?? (await prisma.tag.findUnique({ where: { slug } }));
    if (row) ids.push(row.id);
  }
  return ids;
}

/** Makes the tags of this theme match tags.json. Called on install and on every update. */
async function syncThemeTags(
  themeId: string,
  tags: ThemeTag[],
  live: boolean,
  result: ThemeContentResult
) {
  for (const t of tags) {
    const translations = clean(t.translations);
    const owned = await prisma.tag.findFirst({
      where: { themeId, slug: { in: [t.slug, parked(t.slug, themeId)] } },
    });
    if (owned) {
      // The theme is the source of truth for its own tags: a new name or translation arrives here.
      await prisma.tag.update({ where: { id: owned.id }, data: { name: t.name, translations } });
      continue;
    }
    const taken = await prisma.tag.findUnique({ where: { slug: t.slug } });
    if (taken && !taken.themeId && taken.name === t.name) {
      await prisma.tag.update({
        where: { id: taken.id },
        data: {
          themeId,
          translations,
          ...(live ? {} : { slug: parked(taken.slug, themeId), hidden: true }),
        },
      });
      continue;
    }
    if (live && taken) {
      result.skipped.push(`tag:${t.slug}`);
      continue;
    }
    await prisma.tag.create({
      data: {
        slug: live ? t.slug : parked(t.slug, themeId),
        name: t.name,
        translations,
        themeId,
        hidden: !live,
      },
    });
    result.tags++;
  }

  // Tags this theme brought earlier but no longer lists.
  const wanted = new Set(tags.flatMap((t) => [t.slug, parked(t.slug, themeId)]));
  const stale = await prisma.tag.findMany({ where: { themeId } });
  for (const row of stale) {
    if (wanted.has(row.slug)) continue;
    const usedByEditors = await prisma.postTag.count({
      where: {
        tagId: row.id,
        post: { OR: [{ themeId: null }, { themeId: { not: themeId } }] },
      },
    });
    if (usedByEditors === 0) {
      await prisma.tag.delete({ where: { id: row.id } });
      result.tagsRemoved++;
      continue;
    }
    // An editor's post still uses it: keep the tag, but it now belongs to the editors.
    const slug = unparked(row.slug, themeId);
    if (slug !== row.slug && (await prisma.tag.findUnique({ where: { slug } }))) {
      result.skipped.push(`tag:${slug}`);
      continue;
    }
    await prisma.tag.update({
      where: { id: row.id },
      data: { themeId: null, hidden: false, slug, translations: "" },
    });
    result.tagsRemoved++;
  }
}

/** Shows the theme's categories and publishes its posts. Used when the theme becomes active. */
export async function showThemeContent(themeId: string, actorId: string | null) {
  const skipped: string[] = [];
  const categories = await prisma.category.findMany({ where: { themeId } });
  for (const row of categories) {
    if (!isParked(row.slug, themeId) && !row.hidden) continue;
    const slug = unparked(row.slug, themeId);
    if (slug !== row.slug && (await prisma.category.findUnique({ where: { slug } }))) {
      skipped.push(`category:${slug}`);
      continue;
    }
    await prisma.category.update({ where: { id: row.id }, data: { slug, hidden: false } });
  }
  const tags = await prisma.tag.findMany({ where: { themeId } });
  for (const row of tags) {
    if (!isParked(row.slug, themeId) && !row.hidden) continue;
    const slug = unparked(row.slug, themeId);
    if (slug !== row.slug && (await prisma.tag.findUnique({ where: { slug } }))) {
      skipped.push(`tag:${slug}`);
      continue;
    }
    await prisma.tag.update({ where: { id: row.id }, data: { slug, hidden: false } });
  }
  const posts = await prisma.post.findMany({ where: { themeId } });
  for (const row of posts) {
    if (!isParked(row.slug, themeId)) continue;
    const slug = unparked(row.slug, themeId);
    if (await prisma.post.findUnique({ where: { slug } })) {
      skipped.push(`post:${slug}`);
      continue;
    }
    await prisma.post.update({ where: { id: row.id }, data: { slug, status: "published" } });
  }
  if (categories.length + tags.length + posts.length > 0) {
    await audit({
      actorId,
      action: "theme.content.show",
      targetType: "theme",
      targetId: themeId,
      detail: {
        categories: categories.length,
        tags: tags.length,
        posts: posts.length,
        skipped,
      },
    });
  }
}

/** Hides the theme's categories and unpublishes its posts. Used when another theme takes over. */
export async function hideThemeContent(themeId: string, actorId: string | null) {
  const categories = await prisma.category.findMany({ where: { themeId } });
  for (const row of categories) {
    if (isParked(row.slug, themeId) && row.hidden) continue;
    await prisma.category.update({
      where: { id: row.id },
      data: { slug: parked(unparked(row.slug, themeId), themeId), hidden: true },
    });
  }
  const tags = await prisma.tag.findMany({ where: { themeId } });
  for (const row of tags) {
    if (isParked(row.slug, themeId) && row.hidden) continue;
    await prisma.tag.update({
      where: { id: row.id },
      data: { slug: parked(unparked(row.slug, themeId), themeId), hidden: true },
    });
  }
  const posts = await prisma.post.findMany({ where: { themeId } });
  for (const row of posts) {
    if (isParked(row.slug, themeId) && row.status === "draft") continue;
    await prisma.post.update({
      where: { id: row.id },
      data: { slug: parked(unparked(row.slug, themeId), themeId), status: "draft" },
    });
  }
  if (categories.length + tags.length + posts.length > 0) {
    await audit({
      actorId,
      action: "theme.content.hide",
      targetType: "theme",
      targetId: themeId,
      detail: { categories: categories.length, tags: tags.length, posts: posts.length },
    });
  }
}

/** Deletes the theme's posts, categories and tags. Used when the theme is uninstalled. */
export async function deleteThemeContent(themeId: string, actorId: string | null) {
  const posts = await prisma.post.deleteMany({ where: { themeId } });
  const categories = await prisma.category.deleteMany({ where: { themeId } });
  const tags = await prisma.tag.deleteMany({ where: { themeId } });
  if (posts.count + categories.count + tags.count > 0) {
    await audit({
      actorId,
      action: "theme.content.delete",
      targetType: "theme",
      targetId: themeId,
      detail: { posts: posts.count, categories: categories.count, tags: tags.count },
    });
  }
}
