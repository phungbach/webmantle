import { z } from "zod";
import { isValidSlug } from "@/lib/content/slug";

/**
 * Shapes of a theme's categories.json, tags.json and posts.json: the categories, tags and posts that arrive with the
 * theme. They follow the theme like its static pages do (see theme-content.ts).
 */
export const MAX_THEME_CATEGORIES = 30;
export const MAX_THEME_TAGS = 60;
export const MAX_THEME_POSTS = 50;

const slug = z
  .string()
  .max(60)
  .refine(isValidSlug, "Slug may only contain lowercase letters, numbers and single dashes");
const locale = z.string().regex(/^[a-z]{2}$/);

export const categoryTranslationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(""),
});

export const themeCategorySchema = z.object({
  slug,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(""),
  seoDescription: z.string().max(200).default(""),
  translations: z.record(locale, categoryTranslationSchema).default({}),
});
export type ThemeCategory = z.infer<typeof themeCategorySchema>;

export const tagTranslationSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const themeTagSchema = z.object({
  slug,
  name: z.string().trim().min(1).max(120),
  translations: z.record(locale, tagTranslationSchema).default({}),
});
export type ThemeTag = z.infer<typeof themeTagSchema>;

/** Project facts: type, area, schedule, price. Shown on the theme's project cards. */
export const themeFieldsSchema = z
  .object({
    type: z.string().trim().max(120),
    area: z.string().trim().max(120),
    schedule: z.string().trim().max(120),
    price: z.string().trim().max(120),
  })
  .partial()
  .strict();

export const postTranslationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().max(500).default(""),
  body: z.string().max(100_000).default(""),
  seoTitle: z.string().max(70).default(""),
  seoDescription: z.string().max(200).default(""),
  fields: themeFieldsSchema.optional(),
});

export const themePostSchema = z.object({
  slug,
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().max(500).default(""),
  body: z.string().max(100_000).default(""),
  /** Slugs from the theme's categories.json (or an existing category). */
  categories: z.array(slug).max(20).default([]),
  /** Slugs from the theme's tags.json. */
  tags: z.array(slug).max(20).default([]),
  /** A day (2026-09-12) or a full ISO time. */
  publishedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Use a date such as 2026-09-12"),
  featured: z.boolean().default(false),
  /** A picture from the theme's assets/ folder, for example "assets/a.jpg". */
  image: z
    .string()
    .regex(/^assets\/[a-z0-9][a-z0-9-]{0,60}\.(png|webp|jpg|jpeg)$/, "Use a file in assets/")
    .default(""),
  seoTitle: z.string().max(70).default(""),
  seoDescription: z.string().max(200).default(""),
  /** Facts about the post, for example { "area": "96 m² sàn", "price": "Từ 1,35 tỷ" }. */
  fields: themeFieldsSchema.default({}),
  translations: z.record(locale, postTranslationSchema).default({}),
});
export type ThemePost = z.infer<typeof themePostSchema>;

function checkList<T extends { slug: string }>(
  file: string,
  raw: unknown,
  max: number,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  extra?: (item: T) => string[]
): string[] {
  if (!Array.isArray(raw)) return [`${file} must be a JSON array`];
  if (raw.length > max) return [`${file} can hold at most ${max} entries`];
  const problems: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const parsed = schema.safeParse(entry);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      problems.push(
        `${file} #${index + 1}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}`.trim()
      );
      return;
    }
    if (seen.has(parsed.data.slug))
      problems.push(`${file}: slug "${parsed.data.slug}" is used twice`);
    seen.add(parsed.data.slug);
    problems.push(...(extra?.(parsed.data) ?? []));
  });
  return problems;
}

export const checkThemeCategories = (raw: unknown) =>
  checkList("categories.json", raw, MAX_THEME_CATEGORIES, themeCategorySchema);

export const checkThemeTags = (raw: unknown) =>
  checkList("tags.json", raw, MAX_THEME_TAGS, themeTagSchema);

/** `known` holds the category slugs a post may use, `knownTags` the tag slugs: the theme's own. */
export const checkThemePosts = (
  raw: unknown,
  known: ReadonlySet<string>,
  knownTags: ReadonlySet<string> = new Set()
) =>
  checkList("posts.json", raw, MAX_THEME_POSTS, themePostSchema, (post) => [
    ...(post.categories ?? [])
      .filter((c) => !known.has(c))
      .map((c) => `posts.json "${post.slug}": category "${c}" is not in categories.json`),
    ...(post.tags ?? [])
      .filter((tag) => !knownTags.has(tag))
      .map((tag) => `posts.json "${post.slug}": tag "${tag}" is not in tags.json`),
  ]);

function parseList<T>(raw: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
export const parseThemeCategories = (raw: unknown) => parseList(raw, themeCategorySchema);
export const parseThemeTags = (raw: unknown) => parseList(raw, themeTagSchema);
export const parseThemePosts = (raw: unknown) => parseList(raw, themePostSchema);
