import { z } from "zod";

/**
 * Shape of a theme's content.json. The file holds the words, prices and lists that the marketing
 * components show. Known blocks are checked when the theme is installed; anything malformed is
 * rejected then, and components also skip items that do not match.
 */

const text = (max: number) => z.string().max(max);
/** Icons a theme may use in its text blocks. The core maps each name to a glyph. */
export const ICON_KEYS = [
  "check",
  "star",
  "users",
  "calendar",
  "clock",
  "book",
  "graduation",
  "chart",
  "target",
  "mic",
  "chat",
  "laptop",
  "plane",
  "child",
  "award",
  "shield",
  "handshake",
  "globe",
  "chalkboard",
  "puzzle",
  "coins",
  "heart",
  "pen",
  "location",
  "bolt",
  "rocket",
  "code",
  "lock",
  "key",
  "language",
  "cloud",
  "mobile",
  "layers",
  "search",
  "image",
  "palette",
  "gear",
  "link",
  "eye",
  "tag",
  "folder",
  "wand",
  "cube",
  "sitemap",
  "database",
  "gauge",
  "plug",
  "news",
  "upload",
  "list",
  "history",
  "file",
  "sliders",
  "userShield",
] as const;
export const iconKey = z.enum(ICON_KEYS);
/**
 * An image in content: a file shipped in the theme's assets/ folder ("assets/hero.png") or a picture
 * of the media library ("media/<id>"), which an editor can choose in the designer.
 */
export const assetImage = z
  .string()
  .regex(
    /^(assets\/[a-z0-9][a-z0-9-]{0,60}\.(png|webp|jpg|jpeg)|media\/[a-z0-9]{10,40})$/,
    "Use a file in assets/ (png, webp or jpg) or a media/<id> picture"
  );
const href = z
  .string()
  .max(300)
  .refine(
    (v) =>
      (v.startsWith("/") && !v.startsWith("//") && !/[\s\\\u0000-\u001f\u007f]/.test(v)) ||
      /^https?:\/\/[^\s\u0000-\u001f\u007f]+$/.test(v),
    "Use a path starting with / or an http(s) link"
  );

/** Heading level an editor may choose for a block's title. When absent the component's own default applies. */
export const HEADING_LEVELS = ["h1", "h2", "h3"] as const;
export const headingLevel = z.enum(HEADING_LEVELS);

export const searchSchema = z.object({
  headingLevel: headingLevel.optional(),
  title: text(200),
  subtitle: text(400).default(""),
  placeholder: text(120).default(""),
  button: text(40).default("Tìm kiếm"),
  examples: z.array(text(60)).max(8).default([]),
});

export const extensionSchema = z.object({
  ext: text(20),
  price: text(60),
  note: text(120).default(""),
  href: href.default("/"),
});

export const planSchema = z.object({
  name: text(80),
  price: text(40),
  period: text(40).default(""),
  specs: z.array(text(120)).max(12).default([]),
  badge: text(30).optional(),
  href: href.default("/"),
  cta: text(40).default("Chọn gói"),
});

export const pricingHeadSchema = z.object({
  headingLevel: headingLevel.optional(),
  title: text(160),
  description: text(400).default(""),
});

export const pricingSchema = pricingHeadSchema.extend({
  plans: z.array(planSchema).min(1).max(12),
});

export const featureSchema = z.object({
  title: text(120),
  text: text(300).default(""),
  icon: iconKey.optional(),
  image: assetImage.optional(),
  href: href.optional(),
});
export const statSchema = z.object({ value: text(30), label: text(80), icon: iconKey.optional() });
export const testimonialSchema = z.object({
  quote: text(400),
  name: text(80),
  role: text(120).default(""),
});
export const partnerSchema = z.object({ name: text(80) });
export const officeSchema = z.object({
  city: text(80),
  address: text(200),
  phone: text(40).default(""),
  email: text(120).default(""),
});
export const courseSchema = z.object({
  title: text(120),
  level: text(40).default(""),
  duration: text(40).default(""),
  schedule: text(120).default(""),
  price: text(40).default(""),
  text: text(300).default(""),
  badge: text(30).optional(),
  image: assetImage.optional(),
  href: href.default("/"),
});
export const teacherSchema = z.object({
  name: text(80),
  role: text(120).default(""),
  bio: text(300).default(""),
  experience: text(60).default(""),
  image: assetImage.optional(),
});
export const heroSchema = z.object({
  headingLevel: headingLevel.optional(),
  eyebrow: text(60).default(""),
  title: text(120),
  text: text(300).default(""),
  primaryLabel: text(40),
  primaryHref: href,
  secondaryLabel: text(40).default(""),
  secondaryHref: href.default("/"),
  /** An optional third button, used for "View demo". */
  tertiaryLabel: text(40).default(""),
  tertiaryHref: href.default("/"),
  highlights: z.array(text(60)).max(6).default([]),
  image: assetImage.optional(),
});
export const titleBlockSchema = z.object({
  headingLevel: headingLevel.optional(),
  eyebrow: text(60).default(""),
  title: text(160),
  text: text(400).default(""),
  image: assetImage.optional(),
  linkLabel: text(40).optional(),
  href: href.optional(),
});
export const ctaSchema = z.object({
  headingLevel: headingLevel.optional(),
  title: text(160),
  text: text(300).default(""),
  button: text(40),
  href: href,
  image: assetImage.optional(),
});

/** Menu of a documentation page (DocsPage): groups of links, shown on the left of the article. */
export const docsNavSchema = z.object({
  title: text(80).default(""),
  groups: z
    .array(
      z.object({
        title: text(80),
        links: z.array(z.object({ label: text(120), href })).max(40),
      })
    )
    .max(12),
});

export const navItemSchema: z.ZodType<{
  label: string;
  href: string;
  icon?: (typeof ICON_KEYS)[number];
  children?: { label: string; href: string; text?: string; icon?: (typeof ICON_KEYS)[number] }[];
}> = z.object({
  label: text(60),
  href,
  icon: iconKey.optional(),
  children: z
    .array(
      z.object({ label: text(60), href, text: text(160).optional(), icon: iconKey.optional() })
    )
    .max(20)
    .optional(),
});

export const footerSchema = z.object({
  columns: z
    .array(
      z.object({ title: text(80), links: z.array(z.object({ label: text(80), href })).max(20) })
    )
    .max(6),
  contact: text(300).default(""),
  copyright: text(200).default(""),
});

/** Blocks with a fixed shape. Keys not listed here are pricing blocks (see pricingSchema). */
const fixed: Record<string, z.ZodTypeAny> = {
  search: searchSchema,
  extensions: z.array(extensionSchema).max(40),
  features: z.array(featureSchema).max(24),
  stats: z.array(statSchema).max(12),
  testimonials: z.array(testimonialSchema).max(24),
  partners: z.array(partnerSchema).max(60),
  offices: z.array(officeSchema).max(12),
  hero: heroSchema,
  herocourses: heroSchema,
  heroprice: heroSchema,
  heroabout: heroSchema,
  heroprojects: heroSchema,
  heroprocess: heroSchema,
  heropricing: heroSchema,
  herocontact: heroSchema,
  courses: z.array(courseSchema).max(24),
  projects: z.array(courseSchema).max(24),
  process: z.array(featureSchema).max(24),
  values: z.array(featureSchema).max(24),
  teachers: z.array(teacherSchema).max(24),
  cta: ctaSchema,
  nav: z.array(navItemSchema).max(16),
  docsnav: docsNavSchema,
  footer: footerSchema,
};

function schemaForKey(key: string): z.ZodTypeAny {
  // Keys that start with "hero" are heroes and keys that start with "title" are section titles.
  return (
    fixed[key] ??
    (key.startsWith("hero")
      ? heroSchema
      : key.startsWith("title")
        ? titleBlockSchema
        : pricingSchema)
  );
}

/** Checks one block of content.json (its name and value). Returns problems as text, or an empty list. */
export function validateContentKey(key: string, value: unknown): string[] {
  if (!/^[a-z]{2,30}$/.test(key)) return [`content.json: "${key}" is not a valid block name`];
  const parsed = schemaForKey(key).safeParse(value);
  if (parsed.success) return [];
  const issue = parsed.error.issues[0];
  return [
    `content.json ${key}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}`.trim(),
  ];
}

/** Checks a whole content.json. Returns problems as text, or an empty list. */
export function checkThemeContent(content: unknown): string[] {
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return ["content.json must be a JSON object"];
  }
  return Object.entries(content as Record<string, unknown>).flatMap(([key, value]) =>
    validateContentKey(key, value)
  );
}
