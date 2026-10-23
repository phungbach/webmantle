import { z } from "zod";
import { isValidSlug } from "@/lib/content/slug";

/**
 * Shape of a theme's pages.json: the static pages that arrive with the theme. They are created
 * when the theme is installed, shown while the theme is active, hidden when another theme takes
 * over, and deleted when the theme is uninstalled.
 */
export const MAX_THEME_PAGES = 30;

/** Words of a page in another language. Title and body are what the visitor reads. */
export const pageTranslationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(50_000).default(""),
  seoTitle: z.string().max(70).default(""),
  seoDescription: z.string().max(200).default(""),
});
export type PageTranslation = z.infer<typeof pageTranslationSchema>;

export const themePageSchema = z.object({
  slug: z
    .string()
    .max(60)
    .refine(isValidSlug, "Slug may only contain lowercase letters, numbers and single dashes"),
  title: z.string().trim().min(1).max(200),
  /** "" = the theme's default page template, otherwise one of its custom page templates. */
  template: z
    .string()
    .max(40)
    .regex(/^([a-z][a-z-]{1,30})?$/, "Invalid template name")
    .default(""),
  /**
   * The theme's home page. It is shown at "/" (not at /pages/<slug>) and holds the home layout and
   * SEO text, so the home page is managed with the other pages. At most one per theme, and it uses
   * the theme's home template, so `template` stays empty.
   */
  isHome: z.boolean().default(false),
  /** HTML. It is cleaned with the same sanitizer as the page editor before it is stored. */
  body: z.string().max(50_000).default(""),
  seoTitle: z.string().max(70).default(""),
  seoDescription: z.string().max(200).default(""),
  /** Other languages, keyed by locale code (for example "en"). The Vietnamese text above is the base. */
  translations: z.record(z.string().regex(/^[a-z]{2}$/), pageTranslationSchema).default({}),
});
export type ThemePage = z.infer<typeof themePageSchema>;

/** Checks a whole pages.json. Returns problems as text, or an empty list. */
export function checkThemePages(raw: unknown, pageTemplateIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return ["pages.json must be a JSON array"];
  if (raw.length > MAX_THEME_PAGES) return [`pages.json can hold at most ${MAX_THEME_PAGES} pages`];
  const problems: string[] = [];
  const seen = new Set<string>();
  let homes = 0;
  raw.forEach((entry, index) => {
    const parsed = themePageSchema.safeParse(entry);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      problems.push(
        `pages.json #${index + 1}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}`.trim()
      );
      return;
    }
    const page = parsed.data;
    if (seen.has(page.slug)) problems.push(`pages.json: slug "${page.slug}" is used twice`);
    seen.add(page.slug);
    if (page.isHome) {
      homes++;
      if (homes > 1) problems.push(`pages.json "${page.slug}": only one page can be the home page`);
      if (page.template)
        problems.push(`pages.json "${page.slug}": the home page uses the theme's home template`);
    }
    if (page.template && !pageTemplateIds.has(page.template))
      problems.push(
        `pages.json "${page.slug}": template "${page.template}" is not a custom page template of this theme`
      );
  });
  return problems;
}

/** Pages that passed checkThemePages. Entries that do not match are skipped. */
export function parseThemePages(raw: unknown): ThemePage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = themePageSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
