import type { Prisma } from "@prisma/client";
import { parseFields, pickFields, type PostFields } from "@/lib/content/fields";
import { prisma } from "@/lib/db";
import { stripToText } from "@/lib/security/sanitize";
import { SITE_URL } from "@/lib/env";

export const PAGE_SIZE = 10;

/** Text of a translation stored by a theme ({locale: {...}} as JSON), or null when there is none. */
function translation<T>(json: string, locale: string): Partial<T> | null {
  if (!json || locale === "vi") return null;
  try {
    return ((JSON.parse(json) as Record<string, Partial<T>>)[locale] as Partial<T>) ?? null;
  } catch {
    return null;
  }
}

type PostText = {
  title: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  fields?: unknown;
};
type CategoryText = { name: string; description: string };

/** A post is public when it is published and its publish date has arrived. Future dates are "scheduled". */
export function publicPostWhere(now = new Date()): Prisma.PostWhereInput {
  return { status: "published", publishedAt: { lte: now } };
}

export type PostCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  featured: boolean;
  featuredImageUrl: string | null;
  /** Whole minutes to read the post, at least 1. */
  readMinutes: number;
  author: { name: string; slug: string };
  categories: { name: string; slug: string }[];
  tags: { name: string; slug: string }[];
  /** Project facts such as area and price, in the visitor's language when the theme provides it. */
  fields: PostFields;
  url: string;
};

export type PostDetail = PostCard & {
  template: string;
  bodyHtml: string;
  updatedAt: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  socialImageUrl: string | null;
  focusKeyword: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogTitle: string;
  ogDescription: string;
  twitterCard: string;
  featuredImageAlt: string;
  /** Raw stored canonical value ("" when not set). */
  canonicalSetting: string;
};

export type Listing = { items: PostCard[]; total: number; page: number; totalPages: number };

const cardInclude = {
  author: { select: { name: true, id: true } },
  categories: {
    include: { category: { select: { name: true, slug: true, translations: true, hidden: true } } },
  },
  tags: {
    include: { tag: { select: { name: true, slug: true, translations: true, hidden: true } } },
  },
} satisfies Prisma.PostInclude;

type PostWithCard = Prisma.PostGetPayload<{ include: typeof cardInclude }>;

function toCard(post: PostWithCard, locale = "vi"): PostCard {
  const text = translation<PostText>(post.translations, locale);
  const body = text?.body ?? post.body;
  const excerpt = (text?.excerpt ?? post.excerpt) || stripToText(body, 180);
  return {
    id: post.id,
    slug: post.slug,
    title: text?.title || post.title,
    excerpt,
    publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
    featured: post.featured,
    featuredImageUrl: post.featuredImage
      ? `/media/${post.featuredImage}`
      : post.themeImage && post.themeId
        ? `/theme-assets/${post.themeId}/current/${post.themeImage}`
        : null,
    readMinutes: Math.max(1, Math.ceil(stripToText(body, 100_000).split(/\s+/).length / 180)),
    // Authors have no public slug; their id keeps author URLs stable when names change.
    author: { name: post.author.name, slug: post.author.id },
    categories: post.categories
      .filter((c) => !c.category.hidden)
      .map((c) => ({
        name: translation<CategoryText>(c.category.translations, locale)?.name || c.category.name,
        slug: c.category.slug,
      })),
    tags: post.tags
      .filter((t) => !t.tag.hidden)
      .map((t) => ({
        name: translation<CategoryText>(t.tag.translations, locale)?.name || t.tag.name,
        slug: t.tag.slug,
      })),
    fields: { ...parseFields(post.fields), ...pickFields(text?.fields) },
    url: `/posts/${post.slug}`,
  };
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), Math.max(1, totalPages));
}

export async function listPublishedPosts(options: {
  page?: number;
  pageSize?: number;
  categorySlug?: string;
  tagSlug?: string;
  authorId?: string;
  search?: string;
  now?: Date;
  locale?: string;
}): Promise<Listing> {
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const where: Prisma.PostWhereInput = { ...publicPostWhere(now) };
  if (options.categorySlug)
    where.categories = { some: { category: { slug: options.categorySlug } } };
  if (options.tagSlug) where.tags = { some: { tag: { slug: options.tagSlug } } };
  if (options.authorId) where.authorId = options.authorId;
  if (options.search) {
    const q = options.search.slice(0, 100);
    where.OR = [
      { title: { contains: q } },
      { excerpt: { contains: q } },
      { body: { contains: q } },
      // The theme's other-language texts are stored as JSON text, so a plain match finds them.
      ...(options.locale && options.locale !== "vi" ? [{ translations: { contains: q } }] : []),
    ];
  }

  const total = await prisma.post.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = clampPage(options.page ?? 1, totalPages);
  const rows = await prisma.post.findMany({
    where,
    include: cardInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items: rows.map((r) => toCard(r, options.locale)), total, page, totalPages };
}

export async function getFeaturedPost(now = new Date(), locale = "vi"): Promise<PostCard | null> {
  const row = await prisma.post.findFirst({
    where: { ...publicPostWhere(now), featured: true },
    include: cardInclude,
    orderBy: [{ publishedAt: "desc" }],
  });
  return row ? toCard(row, locale) : null;
}

export async function getPublishedPostDetail(
  slug: string,
  now = new Date(),
  locale = "vi"
): Promise<PostDetail | null> {
  const row = await prisma.post.findFirst({
    where: { slug, ...publicPostWhere(now) },
    include: cardInclude,
  });
  if (!row) return null;
  const card = toCard(row, locale);
  const text = translation<PostText>(row.translations, locale);
  const featuredAlt = row.featuredImage
    ? await prisma.media.findUnique({ where: { id: row.featuredImage }, select: { altText: true } })
    : null;
  return {
    ...card,
    template: row.template,
    bodyHtml: text?.body ?? row.body, // stored already sanitized; sanitized again on write
    updatedAt: row.updatedAt.toISOString(),
    seoTitle: text ? (text.seoTitle ?? "") : row.seoTitle,
    seoDescription: text ? (text.seoDescription ?? "") : row.seoDescription,
    canonicalUrl: row.canonicalUrl || `${SITE_URL}/posts/${row.slug}`,
    canonicalSetting: row.canonicalUrl,
    socialImageUrl: row.socialImage
      ? `/media/${row.socialImage}`
      : row.featuredImage
        ? `/media/${row.featuredImage}`
        : null,
    focusKeyword: row.focusKeyword,
    robotsIndex: row.robotsIndex,
    robotsFollow: row.robotsFollow,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    twitterCard: row.twitterCard,
    featuredImageAlt: featuredAlt?.altText ?? "",
  };
}

export async function getRelatedPosts(
  post: PostDetail,
  limit: number,
  now = new Date(),
  locale = "vi"
): Promise<PostCard[]> {
  const categorySlugs = post.categories.map((c) => c.slug);
  const tagSlugs = post.tags.map((t) => t.slug);
  const rows = await prisma.post.findMany({
    where: {
      ...publicPostWhere(now),
      id: { not: post.id },
      OR: [
        ...(categorySlugs.length
          ? [{ categories: { some: { category: { slug: { in: categorySlugs } } } } }]
          : []),
        ...(tagSlugs.length ? [{ tags: { some: { tag: { slug: { in: tagSlugs } } } } }] : []),
      ],
    },
    include: cardInclude,
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
  });
  if (rows.length >= limit) return rows.map((r) => toCard(r, locale));
  // Top up with the latest posts so the block is never empty on a small blog.
  const extra = await prisma.post.findMany({
    where: { ...publicPostWhere(now), id: { notIn: [post.id, ...rows.map((r) => r.id)] } },
    include: cardInclude,
    orderBy: [{ publishedAt: "desc" }],
    take: limit - rows.length,
  });
  return [...rows, ...extra].map((r) => toCard(r, locale));
}

/** One page for the public site. `locale` picks the theme's translation when the page has one. */
/** The published home page of the active theme, if the theme brought one (see pages.json isHome). */
export async function getHomePage(locale = "vi") {
  const page = await prisma.page.findFirst({
    where: { isHome: true, status: "published" },
    select: {
      id: true,
      slug: true,
      title: true,
      seoTitle: true,
      seoDescription: true,
      translations: true,
    },
  });
  if (!page) return null;
  // A theme can ship the home page's SEO text in other languages (pages.json "translations").
  const translated = locale === "vi" ? null : translationOf(page.translations, locale);
  return {
    id: page.id,
    slug: page.slug,
    title: translated?.title || page.title,
    seoTitle: translated?.seoTitle || page.seoTitle,
    seoDescription: translated?.seoDescription || page.seoDescription,
  };
}

export async function getPublishedPage(slug: string, locale = "vi") {
  const page = await prisma.page.findFirst({ where: { slug, status: "published" } });
  if (!page) return null;
  const translated = locale === "vi" ? null : translationOf(page.translations, locale);
  return {
    id: page.id,
    slug: page.slug,
    isHome: page.isHome,
    title: translated?.title || page.title,
    template: page.template,
    bodyHtml: translated ? translated.body : page.body,
    seoTitle: translated ? translated.seoTitle : page.seoTitle,
    seoDescription: translated ? translated.seoDescription : page.seoDescription,
  };
}

function translationOf(json: string, locale: string) {
  if (!json) return null;
  try {
    const all = JSON.parse(json) as Record<
      string,
      { title: string; body: string; seoTitle: string; seoDescription: string }
    >;
    return all[locale] ?? null;
  } catch {
    return null;
  }
}

export async function getCategoryWithCounts(limit = 50, locale = "vi") {
  const rows = await prisma.category.findMany({
    where: { hidden: false },
    include: { posts: { where: { post: publicPostWhere() }, select: { postId: true } } },
    orderBy: { name: "asc" },
    take: limit,
  });
  return rows.map((c) => {
    const text = translation<CategoryText>(c.translations, locale);
    return {
      name: text?.name || c.name,
      slug: c.slug,
      description: text?.description ?? c.description,
      seoDescription: text ? "" : c.seoDescription,
      count: c.posts.length,
    };
  });
}

export async function getTagWithCounts(limit = 50, locale = "vi") {
  const rows = await prisma.tag.findMany({
    where: { hidden: false },
    include: { posts: { where: { post: publicPostWhere() }, select: { postId: true } } },
    orderBy: { name: "asc" },
    take: limit,
  });
  return rows.map((t) => ({
    name: translation<CategoryText>(t.translations, locale)?.name || t.name,
    slug: t.slug,
    count: t.posts.length,
  }));
}

export async function getCategoryBySlug(slug: string, locale = "vi") {
  const row = await prisma.category.findUnique({ where: { slug } });
  if (!row || row.hidden) return null;
  const text = translation<CategoryText>(row.translations, locale);
  if (!text) return row;
  return {
    ...row,
    name: text.name || row.name,
    description: text.description ?? row.description,
    seoDescription: "",
  };
}

export async function getTagBySlug(slug: string, locale = "vi") {
  const row = await prisma.tag.findUnique({ where: { slug } });
  if (!row || row.hidden) return null;
  const text = translation<CategoryText>(row.translations, locale);
  return text?.name ? { ...row, name: text.name } : row;
}

export async function getAuthorById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
}

/** Posts for the RSS feed and sitemap. Only public posts; never drafts. */
export async function publicPostsForFeeds(limit = 50, now = new Date()) {
  const rows = await prisma.post.findMany({
    where: publicPostWhere(now),
    include: cardInclude,
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
  });
  return rows.map((r) => toCard(r));
}

/**
 * Posts that may appear in the sitemap: published, dated in the past, allowed to be indexed, and
 * canonical to their own address. Anything else is left out, so the sitemap never lists a page
 * that search engines are told not to index or that points elsewhere.
 */
export async function publicPostSitemapEntries(now = new Date()) {
  const rows = await prisma.post.findMany({
    where: { ...publicPostWhere(now), robotsIndex: true },
    select: { slug: true, updatedAt: true, canonicalUrl: true },
    orderBy: [{ publishedAt: "desc" }],
    take: 5000,
  });
  return rows
    .filter((row) => !row.canonicalUrl || row.canonicalUrl === `${SITE_URL}/posts/${row.slug}`)
    .map(({ slug, updatedAt }) => ({ slug, updatedAt }));
}

export async function publicPageSitemapEntries() {
  return prisma.page.findMany({
    where: { status: "published", isHome: false }, // the home page is listed as "/"
    select: { slug: true, updatedAt: true },
    take: 1000,
  });
}

/** The public posts just before (older) and just after (newer) a post, with titles in the visitor's language. */
export async function getAdjacentPosts(
  post: { id: string; publishedAt: string },
  now = new Date(),
  locale = "vi"
) {
  const at = new Date(post.publishedAt);
  const pick = async (dir: "older" | "newer") => {
    const row = await prisma.post.findFirst({
      where: {
        ...publicPostWhere(now),
        id: { not: post.id },
        publishedAt: dir === "older" ? { lt: at, lte: now } : { gt: at, lte: now },
      },
      orderBy: { publishedAt: dir === "older" ? "desc" : "asc" },
      select: { slug: true, title: true, translations: true },
    });
    if (!row) return null;
    const text = translation<PostText>(row.translations, locale);
    return { title: text?.title || row.title, url: `/posts/${row.slug}` };
  };
  return { previous: await pick("older"), next: await pick("newer") };
}

export type TaxonomySitemapEntry = { key: string; lastModified: Date };

/** `lastModified` comes back from SQLite as epoch milliseconds. */
function toEntries(rows: { key: string; m: bigint | number }[]): TaxonomySitemapEntry[] {
  return rows.map((r) => ({ key: r.key, lastModified: new Date(Number(r.m)) }));
}

/**
 * Archive pages for the sitemap: categories, tags and authors that have at least one public post,
 * each with the date of its newest post update. Hidden categories and tags are left out.
 */
export async function publicArchiveSitemapEntries(now = new Date()) {
  const nowMs = now.getTime();
  const [categories, tags, authors, latest] = await Promise.all([
    prisma.$queryRaw<{ key: string; m: bigint | number }[]>`
      SELECT c."slug" AS key, MAX(p."updatedAt") AS m
      FROM "Category" c
      JOIN "PostCategory" pc ON pc."categoryId" = c."id"
      JOIN "Post" p ON p."id" = pc."postId"
      WHERE c."hidden" = 0 AND p."status" = 'published' AND p."publishedAt" <= ${nowMs}
      GROUP BY c."id" ORDER BY c."slug"`,
    prisma.$queryRaw<{ key: string; m: bigint | number }[]>`
      SELECT t."slug" AS key, MAX(p."updatedAt") AS m
      FROM "Tag" t
      JOIN "PostTag" pt ON pt."tagId" = t."id"
      JOIN "Post" p ON p."id" = pt."postId"
      WHERE t."hidden" = 0 AND p."status" = 'published' AND p."publishedAt" <= ${nowMs}
      GROUP BY t."id" ORDER BY t."slug"`,
    prisma.$queryRaw<{ key: string; m: bigint | number }[]>`
      SELECT p."authorId" AS key, MAX(p."updatedAt") AS m
      FROM "Post" p
      WHERE p."status" = 'published' AND p."publishedAt" <= ${nowMs}
      GROUP BY p."authorId" ORDER BY p."authorId"`,
    prisma.post.aggregate({ where: publicPostWhere(now), _max: { updatedAt: true } }),
  ]);
  return {
    categories: toEntries(categories),
    tags: toEntries(tags),
    authors: toEntries(authors),
    latestPostUpdate: latest._max.updatedAt,
  };
}
