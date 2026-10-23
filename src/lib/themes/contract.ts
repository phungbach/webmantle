import { z } from "zod";
import { ICON_KEYS } from "@/lib/themes/content-schemas";

/**
 * Theme contract, version 1.
 *
 * A theme is a DATA package, not code. It contains:
 *   theme.json            manifest (id, version, tokens, settings schema, required components)
 *   styles.css            stylesheet, scanned for dangerous constructs before install
 *   templates/*.json      declarative layouts that place core components in a region tree
 *   pages.json            optional static pages created with the theme and removed with it
 *   assets/*              images and fonts with allow-listed extensions
 *
 * Themes cannot ship JavaScript, HTML, or server code. Layouts may only reference components
 * from the core registry (COMPONENT_NAMES), and their props are validated against
 * COMPONENT_PROPS. Content always comes from the core, so every theme sees the same data.
 */

export const CONTRACT_VERSION = 1;
export const CMS_VERSION = "1.0.0";

/** Templates a theme must provide. */
export const REQUIRED_TEMPLATES = [
  "home",
  "single-post",
  "archive",
  "page",
  "search",
  "not-found",
] as const;
/** Optional. When missing, category archives render with the "archive" template. */
export const OPTIONAL_TEMPLATES = ["category"] as const;
export const TEMPLATE_TYPES = [...REQUIRED_TEMPLATES, ...OPTIONAL_TEMPLATES] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const COMPONENT_NAMES = [
  "Shell",
  "Section",
  "Grid",
  "Stack",
  "SiteHeader",
  "SiteFooter",
  "Breadcrumbs",
  "Hero",
  "FeaturedPost",
  "PostList",
  "PostDetail",
  "RelatedPosts",
  "PageBody",
  "ArchiveHeader",
  "Pagination",
  "SearchForm",
  "EmptyState",
  "CategoryList",
  "TagList",
  "DomainSearch",
  "ExtensionGrid",
  "PricingGrid",
  "FeatureList",
  "StatsStrip",
  "Testimonials",
  "LogoStrip",
  "OfficeList",
  "CtaBanner",
  "CourseList",
  "TeamGrid",
  "SectionTitle",
  "PromoHero",
  "DocsPage",
  // Blocks of the page designer (src/lib/builder). Their props hold the content themselves.
  "Heading",
  "RichText",
  "Image",
  "Button",
  "Spacer",
  "Divider",
  "Gallery",
  "BannerHero",
  "CardsGrid",
  "CtaBlock",
] as const;
export type ComponentName = (typeof COMPONENT_NAMES)[number];

export const ALLOWED_ASSET_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".woff2",
] as const;
export const ALLOWED_TEXT_EXTENSIONS = [".json", ".css", ".md"] as const;

/**
 * Custom templates are extra layouts a theme can offer for posts or pages, e.g. "full-width" or
 * "landing". Their ids are chosen by the theme author; they must not collide with the core types.
 * An editor picks one per post or page. If the active theme does not offer it, the default is used.
 */
export const CUSTOM_TEMPLATE_KINDS = ["single-post", "page"] as const;
export type CustomTemplateKind = (typeof CUSTOM_TEMPLATE_KINDS)[number];
export const RESERVED_TEMPLATE_IDS: readonly string[] = [...TEMPLATE_TYPES, "default", "custom"];

export const LIMITS = {
  uploadBytes: 5 * 1024 * 1024,
  archiveEntries: 300,
  entryUncompressedBytes: 3 * 1024 * 1024,
  totalUncompressedBytes: 15 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxLayoutNodes: 200,
  maxLayoutDepth: 10,
  maxSettings: 30,
  maxTokens: 60,
  thumbnailBytes: 400 * 1024,
} as const;

// ---------- Component prop schemas (shared by validation and rendering) ----------

/** Name of a block in content.json. Lowercase letters only. */
const contentKey = z.string().regex(/^[a-z]{2,30}$/, "Use lowercase letters");

const boundedInt = (min: number, max: number) => z.number().int().min(min).max(max);
const shortText = z.string().max(200);

/**
 * An address a person may enter in the designer: a path on this site ("/pages/about"), an
 * http(s) URL, a mailto: address or an in-page anchor ("#contact"). javascript:, data: and
 * protocol-relative ("//host") addresses are refused.
 */
export const linkSchema = z
  .string()
  .max(500)
  .refine(
    (v) =>
      (v.startsWith("/") &&
        !v.startsWith("//") &&
        !v.includes("\\") &&
        !/[\s\u0000-\u001f]/.test(v)) ||
      /^https?:\/\/[^\s]+$/i.test(v) ||
      /^mailto:[^\s]+$/i.test(v) ||
      /^#[A-Za-z0-9_-]*$/.test(v),
    "Use a path starting with /, an http(s) address, a mailto: address or #anchor"
  );
const mediaIdSchema = z.string().regex(/^[a-z0-9]{10,40}$/, "Not a valid image id");
const alignThree = z.enum(["left", "center", "right"]);

export const COMPONENT_PROPS = {
  Shell: z.object({}).strict(),
  Section: z
    .object({
      width: z.enum(["narrow", "content", "wide", "full"]).default("content"),
      // Background of the section. "plain" keeps the theme background.
      tone: z.enum(["plain", "tint", "dark", "accent"]).default("plain"),
    })
    .strict(),
  Grid: z
    .object({ columns: boundedInt(1, 4).default(2), gap: z.enum(["sm", "md", "lg"]).default("md") })
    .strict(),
  Stack: z.object({ gap: z.enum(["sm", "md", "lg"]).default("md") }).strict(),
  SiteHeader: z
    .object({ variant: z.enum(["simple", "centered", "split", "mega"]).default("simple") })
    .strict(),
  SiteFooter: z.object({ variant: z.enum(["simple", "columns"]).default("simple") }).strict(),
  Breadcrumbs: z.object({}).strict(),
  // Either the words are written here, or `source` names a "title..." block of content.json so
  // they can be translated.
  SectionTitle: z
    .object({
      eyebrow: shortText.optional(),
      title: shortText.optional(),
      text: shortText.optional(),
      source: contentKey.optional(),
    })
    .strict()
    .refine((v) => Boolean(v.title || v.source), "SectionTitle needs a title or a source"),
  // With `source` (a "title..." block of content.json) the words, heading level, picture and link
  // can be edited in the designer; without it the hero shows the site's title and description.
  Hero: z
    .object({
      eyebrow: shortText.default(""),
      showDescription: z.boolean().default(true),
      source: contentKey.optional(),
    })
    .strict(),
  FeaturedPost: z.object({ showExcerpt: z.boolean().default(true) }).strict(),
  PostList: z
    .object({
      layout: z.enum(["list", "grid", "compact"]).default("list"),
      limit: boundedInt(1, 24).default(10),
      showExcerpt: z.boolean().default(true),
      skipFeatured: z.boolean().default(false),
    })
    .strict(),
  PostDetail: z
    .object({
      showFeaturedImage: z.boolean().default(true),
      showToc: z.boolean().default(false),
      showShare: z.boolean().default(false),
      showAuthor: z.boolean().default(false),
      showAdjacent: z.boolean().default(false),
    })
    .strict(),
  RelatedPosts: z
    .object({
      limit: boundedInt(1, 12).default(3),
      /** "compact" is a plain list; "cards" shows pictures, a heading row and a link to all posts. */
      layout: z.enum(["compact", "cards"]).default("compact"),
    })
    .strict(),
  PageBody: z.object({}).strict(),
  ArchiveHeader: z
    .object({ showCount: z.boolean().default(false), source: contentKey.optional() })
    .strict(),
  Pagination: z.object({}).strict(),
  SearchForm: z
    .object({ placeholder: shortText.default("Search articles"), source: contentKey.optional() })
    .strict(),
  EmptyState: z
    .object({
      message: z.string().min(1).max(200).default("Nothing here yet."),
      source: contentKey.optional(),
    })
    .strict(),
  CategoryList: z.object({ limit: boundedInt(1, 50).default(10) }).strict(),
  TagList: z.object({ limit: boundedInt(1, 50).default(20) }).strict(),
  // Marketing blocks. Their items come from the theme's content.json, under the key `source`.
  DomainSearch: z.object({ source: contentKey.default("search") }).strict(),
  ExtensionGrid: z.object({ source: contentKey.default("extensions") }).strict(),
  PricingGrid: z.object({ source: contentKey }).strict(),
  FeatureList: z.object({ source: contentKey.default("features") }).strict(),
  StatsStrip: z.object({ source: contentKey.default("stats") }).strict(),
  Testimonials: z.object({ source: contentKey.default("testimonials") }).strict(),
  LogoStrip: z.object({ source: contentKey.default("partners") }).strict(),
  OfficeList: z.object({ source: contentKey.default("offices") }).strict(),
  CtaBanner: z.object({ source: contentKey.default("cta") }).strict(),
  // With `tag`, the cards are the published posts that carry that tag (newest first, at most `limit`).
  // The items of `source` are the fallback while no post has the tag yet.
  CourseList: z
    .object({
      source: contentKey.default("courses"),
      tag: z
        .string()
        .max(60)
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use a tag slug such as cong-trinh")
        .optional(),
      limit: boundedInt(1, 24).optional(),
    })
    .strict(),
  TeamGrid: z.object({ source: contentKey.default("teachers") }).strict(),
  PromoHero: z.object({ source: contentKey.default("hero") }).strict(),
  // A documentation page: the static page itself with a menu on the left (the "docsnav" block of
  // content.json), a table of contents on the right and previous / next links.
  DocsPage: z.object({ source: contentKey.default("docsnav") }).strict(),
  Heading: z
    .object({
      text: z.string().min(1).max(200),
      level: boundedInt(1, 4).default(2),
      align: alignThree.default("left"),
    })
    .strict(),
  RichText: z
    .object({ html: z.string().max(20000).default(""), align: alignThree.default("left") })
    .strict(),
  Image: z
    .object({
      mediaId: mediaIdSchema.optional(),
      alt: z.string().max(200).default(""),
      caption: z.string().max(200).default(""),
      href: linkSchema.optional(),
      width: z.enum(["content", "wide", "full"]).default("content"),
      rounded: z.boolean().default(false),
    })
    .strict(),
  Button: z
    .object({
      label: z.string().min(1).max(80),
      href: linkSchema,
      variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
      align: alignThree.default("left"),
      newTab: z.boolean().default(false),
    })
    .strict(),
  Spacer: z.object({ size: z.enum(["sm", "md", "lg", "xl"]).default("md") }).strict(),
  Divider: z.object({}).strict(),
  Gallery: z
    .object({
      images: z
        .array(z.object({ mediaId: mediaIdSchema, alt: z.string().max(200).default("") }).strict())
        .max(12)
        .default([]),
      columns: boundedInt(2, 4).default(3),
    })
    .strict(),
  BannerHero: z
    .object({
      eyebrow: z.string().max(100).default(""),
      title: z.string().min(1).max(200),
      text: z.string().max(400).default(""),
      buttonLabel: z.string().max(80).default(""),
      buttonHref: linkSchema.optional(),
      mediaId: mediaIdSchema.optional(),
      align: z.enum(["left", "center"]).default("left"),
      tone: z.enum(["plain", "tint", "dark", "accent"]).default("tint"),
    })
    .strict(),
  CardsGrid: z
    .object({
      items: z
        .array(
          z
            .object({
              title: z.string().min(1).max(120),
              text: z.string().max(300).default(""),
              icon: z.enum(ICON_KEYS).optional(),
              href: linkSchema.optional(),
              mediaId: mediaIdSchema.optional(),
            })
            .strict()
        )
        .min(1)
        .max(12),
      columns: boundedInt(2, 4).default(3),
    })
    .strict(),
  CtaBlock: z
    .object({
      title: z.string().min(1).max(200),
      text: z.string().max(300).default(""),
      buttonLabel: z.string().min(1).max(80),
      buttonHref: linkSchema,
      tone: z.enum(["tint", "dark", "accent"]).default("accent"),
    })
    .strict(),
} satisfies Record<ComponentName, z.ZodTypeAny>;

// ---------- Layout tree ----------

export type LayoutNode = {
  component: ComponentName;
  props?: Record<string, unknown>;
  children?: LayoutNode[];
  /** Block id from the page designer. Only set by composeLayout; theme files may not use it. */
  bid?: string;
};

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z
    .object({
      component: z.enum(COMPONENT_NAMES),
      props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      children: z.array(layoutNodeSchema).max(50).optional(),
    })
    .strict()
);

export const templateFileSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    root: layoutNodeSchema,
  })
  .strict();

// ---------- Manifest ----------

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "Must be a semantic version such as 1.0.0");
const themeId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits and single dashes")
  .min(2)
  .max(40);
const tokenKey = z.string().regex(/^[a-z][a-z0-9-]{0,40}$/);
// Token and setting values are injected as CSS custom properties, so the character set is strict.
// No braces, semicolons, angle brackets, backslashes, or url(); these cannot break out of a declaration.
const cssValue = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[#A-Za-z0-9 ,.%()'"+\-/]+$/, "Contains characters not allowed in CSS values")
  .refine(
    (v) => !/url\(|expression\(|@import|javascript:/i.test(v),
    "Contains a forbidden CSS construct"
  );

const settingDefinition = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,40}$/),
    label: z.string().min(1).max(80),
    type: z.enum(["color", "text", "select", "boolean"]),
    default: z.union([z.string().max(120), z.boolean()]),
    options: z.array(z.string().max(60)).max(30).optional(),
    cssVariable: z
      .string()
      .regex(/^--[a-z][a-z0-9-]{0,40}$/)
      .optional(),
    maxLength: z.number().int().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.type === "boolean" && typeof s.default !== "boolean") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Boolean setting needs a boolean default",
        path: ["default"],
      });
    }
    if (s.type !== "boolean" && typeof s.default !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Text, color and select settings need a string default",
        path: ["default"],
      });
    }
    if (
      s.type === "color" &&
      typeof s.default === "string" &&
      !/^#[0-9a-fA-F]{6}$/.test(s.default)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Color default must be a 6-digit hex value",
        path: ["default"],
      });
    }
    if (s.type === "select") {
      if (!s.options || s.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select settings need options",
          path: ["options"],
        });
      } else if (typeof s.default === "string" && !s.options.includes(s.default)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Default must be one of the options",
          path: ["default"],
        });
      }
    }
  });

export const manifestSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    id: themeId,
    name: z.string().min(1).max(80),
    version: semver,
    description: z.string().max(300).default(""),
    author: z.string().max(100).default(""),
    minimumCmsVersion: semver,
    supportedTemplates: z.array(z.enum(TEMPLATE_TYPES)).min(1),
    customTemplates: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^[a-z][a-z-]{1,30}$/, "Lowercase letters and dashes, 2 to 31 characters"),
            label: z.string().min(1).max(60),
            description: z.string().max(200).default(""),
            appliesTo: z.array(z.enum(CUSTOM_TEMPLATE_KINDS)).min(1),
          })
          .strict()
      )
      .max(20)
      .default([]),
    requiredComponents: z.array(z.enum(COMPONENT_NAMES)).max(COMPONENT_NAMES.length).default([]),
    tokens: z
      .record(tokenKey, cssValue)
      .refine((t) => Object.keys(t).length <= LIMITS.maxTokens, "Too many tokens")
      .default({}),
    settingsSchema: z.array(settingDefinition).max(LIMITS.maxSettings).default([]),
    assets: z
      .array(
        z
          .string()
          .regex(/^assets\/[A-Za-z0-9._/-]+$/)
          .max(200)
      )
      .max(100)
      .default([]),
    /** The theme's picture in the theme manager, for example "assets/thumbnail.jpg" (3:2, up to 400 KB). */
    thumbnail: z
      .string()
      .regex(
        /^assets\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i,
        "Use a .png, .jpg or .webp file in assets/"
      )
      .max(200)
      .optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    for (const required of REQUIRED_TEMPLATES) {
      if (!m.supportedTemplates.includes(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `supportedTemplates must include "${required}"`,
          path: ["supportedTemplates"],
        });
      }
    }
    const customIds = m.customTemplates.map((t) => t.id);
    if (new Set(customIds).size !== customIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom template ids must be unique",
        path: ["customTemplates"],
      });
    }
    for (const id of customIds) {
      if (RESERVED_TEMPLATE_IDS.includes(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}" is a reserved template name`,
          path: ["customTemplates"],
        });
      }
    }
    const keys = m.settingsSchema.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Setting keys must be unique",
        path: ["settingsSchema"],
      });
    }
  });

export type Manifest = z.infer<typeof manifestSchema>;
export type SettingDefinition = z.infer<typeof settingDefinition>;
/** Shared with plugins, which declare settings in the same format as themes. */
export const settingDefinitionSchema = settingDefinition;
export type SettingValue = string | boolean;

/** Compares "a.b.c" versions. Returns negative, zero or positive. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isAllowedThemeFile(relativePath: string): boolean {
  if (
    relativePath === "theme.json" ||
    relativePath === "styles.css" ||
    relativePath === "README.md"
  )
    return true;
  if (
    relativePath === "content.json" ||
    relativePath === "pages.json" ||
    relativePath === "categories.json" ||
    relativePath === "tags.json" ||
    relativePath === "posts.json"
  )
    return true;
  // Words for another language, e.g. content.en.json. They replace blocks of content.json.
  if (/^content\.[a-z]{2}\.json$/.test(relativePath)) return true;
  if (/^templates\/[a-z][a-z-]{0,30}\.json$/.test(relativePath)) return true;
  if (relativePath.startsWith("assets/")) {
    return ALLOWED_ASSET_EXTENSIONS.some((ext) => relativePath.toLowerCase().endsWith(ext));
  }
  return false;
}
