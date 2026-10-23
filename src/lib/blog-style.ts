import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSiteSetting } from "@/lib/settings";
import { fromZod } from "@/lib/errors";

/**
 * Blog look, set in Admin → Blog style. It applies to every theme as a stylesheet on top of the
 * theme's own CSS: "theme" means leave the theme's choice alone. Values are fixed options, so the
 * generated CSS only ever contains the values listed here.
 */

export const BLOG_STYLE_KEY = "blogStyle";

export const blogStyleSchema = z.object({
  listLayout: z.enum(["theme", "list", "grid"]),
  cardStyle: z.enum(["theme", "flat", "card", "raised"]),
  cardRadius: z.number().int().min(0).max(24),
  showImages: z.boolean(),
  showExcerpts: z.boolean(),
  titleSize: z.enum(["theme", "small", "medium", "large"]),
  listWidth: z.enum(["theme", "narrow", "content", "wide"]),
  articleWidth: z.enum(["theme", "narrow", "content", "wide"]),
  bodySize: z.enum(["theme", "medium", "large"]),
});
export type BlogStyle = z.infer<typeof blogStyleSchema>;

export const BLOG_STYLE_DEFAULTS: BlogStyle = {
  listLayout: "theme",
  cardStyle: "theme",
  cardRadius: 12,
  showImages: true,
  showExcerpts: true,
  titleSize: "theme",
  listWidth: "theme",
  articleWidth: "theme",
  bodySize: "theme",
};

const WIDTHS = { narrow: "42rem", content: "48rem", wide: "64rem" } as const;
const TITLE_SIZES = { small: "1.125rem", medium: "1.5rem", large: "2rem" } as const;
const BODY_SIZES = { medium: "1.0625rem", large: "1.25rem" } as const;
const SHADOWS = { card: "0 1px 3px rgba(15,23,42,.08)", raised: "0 10px 30px rgba(15,23,42,.14)" };

/** The stored style, or the defaults when nothing valid is stored. */
export async function getBlogStyle(): Promise<BlogStyle> {
  const row = await prisma.siteSetting.findUnique({ where: { key: BLOG_STYLE_KEY } });
  if (!row?.value) return BLOG_STYLE_DEFAULTS;
  try {
    const parsed = blogStyleSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : BLOG_STYLE_DEFAULTS;
  } catch {
    return BLOG_STYLE_DEFAULTS;
  }
}

export async function saveBlogStyle(input: unknown) {
  const parsed = blogStyleSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  await setSiteSetting(BLOG_STYLE_KEY, JSON.stringify(parsed.data));
}

/** CSS for the blog style. Empty when every option is "theme", so nothing is added to the page. */
export function blogStyleCss(style: BlogStyle): string {
  const root = ".cms-theme-root";
  const rules: string[] = [];
  const list = `${root} .cms-post-list:not(.cms-post-list--compact)`;

  if (style.listLayout === "list") {
    rules.push(`${list}{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem}`);
  }
  if (style.listLayout === "grid") {
    rules.push(`${list}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5rem}`);
    rules.push(`@media (max-width:640px){${list}{grid-template-columns:minmax(0,1fr)}}`);
  }

  if (style.cardStyle === "flat") {
    rules.push(
      `${root} .cms-post{background:transparent;border:0;border-radius:0;box-shadow:none;padding:0}`
    );
  }
  if (style.cardStyle === "card" || style.cardStyle === "raised") {
    rules.push(
      `${root} .cms-post{background:var(--color-surface);border:1px solid var(--color-border);border-radius:${style.cardRadius}px;padding:1.25rem;box-shadow:${SHADOWS[style.cardStyle]}}`
    );
  }

  if (style.titleSize !== "theme") {
    rules.push(
      `${root} .cms-post__title{font-size:${TITLE_SIZES[style.titleSize]};line-height:1.25}`
    );
  }
  if (!style.showImages) rules.push(`${root} .cms-post__image{display:none}`);
  if (!style.showExcerpts) rules.push(`${root} .cms-post__excerpt{display:none}`);

  if (style.listWidth !== "theme") {
    rules.push(`${root} .cms-post-list{max-width:${WIDTHS[style.listWidth]};margin-inline:auto}`);
  }
  if (style.articleWidth !== "theme") {
    rules.push(`${root} .cms-article{max-width:${WIDTHS[style.articleWidth]};margin-inline:auto}`);
  }
  if (style.bodySize !== "theme") {
    rules.push(
      `${root} .cms-article__body{font-size:${BODY_SIZES[style.bodySize]};line-height:1.75}`
    );
  }

  return rules.join("\n");
}
