import { ICON_KEYS } from "@/lib/themes/content-schemas";

/**
 * Blocks the page designer offers. The designer builds its palette and inspector forms from this
 * table, so every prop of every block has a field here. Labels are i18n keys:
 *   block name        builder.block.<Type>      description  builder.blockHint.<Type>
 *   field label       builder.field.<name>      option label builder.opt.<value> (icons: builder.icon.<key>)
 *   category label    builder.cat.<category>
 */

export const BUILDER_TYPES = [
  "Section",
  "Grid",
  "Stack",
  "SectionTitle",
  "PostList",
  "CategoryList",
  "TagList",
  "SearchForm",
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
export type BuilderBlockType = (typeof BUILDER_TYPES)[number];

export type BlockCategory = "layout" | "text" | "media" | "marketing" | "posts";

export type FieldKind =
  "text" | "textarea" | "richtext" | "select" | "number" | "switch" | "media" | "link" | "list";

export type Field = {
  /** Prop name (inside a list: the name of the property of each item). */
  name: string;
  kind: FieldKind;
  /** For "select". `label` is an i18n key. */
  options?: { value: string; label: string }[];
  /** For "number". */
  min?: number;
  max?: number;
  /** For "list": the fields of one item. */
  itemFields?: Field[];
  maxItems?: number;
  minItems?: number;
  /** True when the prop may be left out. */
  optional?: boolean;
  /** Maximum text length, for text-like fields. */
  maxLength?: number;
};

export type BlockDef = {
  type: BuilderBlockType;
  category: BlockCategory;
  /** Name of an icon in lucide-react. */
  icon: string;
  /** True when the block can hold other blocks. */
  container: boolean;
  /** Props of a newly added block; valid for the block's schema. */
  defaults: Record<string, unknown>;
  fields: Field[];
};

const opts = (...values: string[]) =>
  values.map((value) => ({ value, label: `builder.opt.${value}` }));
const ALIGN3 = opts("left", "center", "right");
const TONE4 = opts("plain", "tint", "dark", "accent");
const GAP = opts("sm", "md", "lg");

export const BLOCK_DEFS: Record<BuilderBlockType, BlockDef> = {
  Section: {
    type: "Section",
    category: "layout",
    icon: "PanelTop",
    container: true,
    defaults: { width: "content", tone: "plain" },
    fields: [
      { name: "width", kind: "select", options: opts("narrow", "content", "wide", "full") },
      { name: "tone", kind: "select", options: TONE4 },
    ],
  },
  Grid: {
    type: "Grid",
    category: "layout",
    icon: "LayoutGrid",
    container: true,
    defaults: { columns: 2, gap: "md" },
    fields: [
      { name: "columns", kind: "number", min: 1, max: 4 },
      { name: "gap", kind: "select", options: GAP },
    ],
  },
  Stack: {
    type: "Stack",
    category: "layout",
    icon: "Rows3",
    container: true,
    defaults: { gap: "md" },
    fields: [{ name: "gap", kind: "select", options: GAP }],
  },
  Spacer: {
    type: "Spacer",
    category: "layout",
    icon: "MoveVertical",
    container: false,
    defaults: { size: "md" },
    fields: [{ name: "size", kind: "select", options: opts("sm", "md", "lg", "xl") }],
  },
  Divider: {
    type: "Divider",
    category: "layout",
    icon: "Minus",
    container: false,
    defaults: {},
    fields: [],
  },
  SectionTitle: {
    type: "SectionTitle",
    category: "text",
    icon: "Type",
    container: false,
    defaults: { eyebrow: "", title: "Section title", text: "" },
    fields: [
      { name: "eyebrow", kind: "text", optional: true, maxLength: 200 },
      { name: "title", kind: "text", maxLength: 200 },
      { name: "text", kind: "textarea", optional: true, maxLength: 200 },
    ],
  },
  Heading: {
    type: "Heading",
    category: "text",
    icon: "Heading",
    container: false,
    defaults: { text: "Heading", level: 2, align: "left" },
    fields: [
      { name: "text", kind: "text", maxLength: 200 },
      { name: "level", kind: "number", min: 1, max: 4 },
      { name: "align", kind: "select", options: ALIGN3 },
    ],
  },
  RichText: {
    type: "RichText",
    category: "text",
    icon: "AlignLeft",
    container: false,
    defaults: { html: "<p>Write something here.</p>", align: "left" },
    fields: [
      { name: "html", kind: "richtext", maxLength: 20000 },
      { name: "align", kind: "select", options: ALIGN3 },
    ],
  },
  Button: {
    type: "Button",
    category: "text",
    icon: "MousePointerClick",
    container: false,
    defaults: { label: "Learn more", href: "/", variant: "primary", align: "left", newTab: false },
    fields: [
      { name: "label", kind: "text", maxLength: 80 },
      { name: "href", kind: "link" },
      { name: "variant", kind: "select", options: opts("primary", "secondary", "outline") },
      { name: "align", kind: "select", options: ALIGN3 },
      { name: "newTab", kind: "switch" },
    ],
  },
  Image: {
    type: "Image",
    category: "media",
    icon: "Image",
    container: false,
    defaults: { alt: "", caption: "", width: "content", rounded: false },
    fields: [
      { name: "mediaId", kind: "media", optional: true },
      { name: "alt", kind: "text", maxLength: 200 },
      { name: "caption", kind: "text", maxLength: 200 },
      { name: "href", kind: "link", optional: true },
      { name: "width", kind: "select", options: opts("content", "wide", "full") },
      { name: "rounded", kind: "switch" },
    ],
  },
  Gallery: {
    type: "Gallery",
    category: "media",
    icon: "GalleryHorizontal",
    container: false,
    defaults: { images: [], columns: 3 },
    fields: [
      {
        name: "images",
        kind: "list",
        maxItems: 12,
        itemFields: [
          { name: "mediaId", kind: "media" },
          { name: "alt", kind: "text", maxLength: 200 },
        ],
      },
      { name: "columns", kind: "number", min: 2, max: 4 },
    ],
  },
  BannerHero: {
    type: "BannerHero",
    category: "marketing",
    icon: "PanelTopOpen",
    container: false,
    defaults: {
      eyebrow: "",
      title: "A headline that grabs attention",
      text: "",
      buttonLabel: "",
      align: "left",
      tone: "tint",
    },
    fields: [
      { name: "eyebrow", kind: "text", optional: true, maxLength: 100 },
      { name: "title", kind: "text", maxLength: 200 },
      { name: "text", kind: "textarea", optional: true, maxLength: 400 },
      { name: "buttonLabel", kind: "text", optional: true, maxLength: 80 },
      { name: "buttonHref", kind: "link", optional: true },
      { name: "mediaId", kind: "media", optional: true },
      { name: "align", kind: "select", options: opts("left", "center") },
      { name: "tone", kind: "select", options: TONE4 },
    ],
  },
  CardsGrid: {
    type: "CardsGrid",
    category: "marketing",
    icon: "LayoutPanelTop",
    container: false,
    defaults: {
      items: [
        { title: "First card", text: "", icon: "star" },
        { title: "Second card", text: "", icon: "check" },
        { title: "Third card", text: "", icon: "heart" },
      ],
      columns: 3,
    },
    fields: [
      {
        name: "items",
        kind: "list",
        minItems: 1,
        maxItems: 12,
        itemFields: [
          { name: "title", kind: "text", maxLength: 120 },
          { name: "text", kind: "textarea", optional: true, maxLength: 300 },
          {
            name: "icon",
            kind: "select",
            optional: true,
            options: ICON_KEYS.map((value) => ({ value, label: `builder.icon.${value}` })),
          },
          { name: "href", kind: "link", optional: true },
          { name: "mediaId", kind: "media", optional: true },
        ],
      },
      { name: "columns", kind: "number", min: 2, max: 4 },
    ],
  },
  CtaBlock: {
    type: "CtaBlock",
    category: "marketing",
    icon: "Megaphone",
    container: false,
    defaults: {
      title: "Ready to get started?",
      text: "",
      buttonLabel: "Contact us",
      buttonHref: "/",
      tone: "accent",
    },
    fields: [
      { name: "title", kind: "text", maxLength: 200 },
      { name: "text", kind: "textarea", optional: true, maxLength: 300 },
      { name: "buttonLabel", kind: "text", maxLength: 80 },
      { name: "buttonHref", kind: "link" },
      { name: "tone", kind: "select", options: opts("tint", "dark", "accent") },
    ],
  },
  PostList: {
    type: "PostList",
    category: "posts",
    icon: "Newspaper",
    container: false,
    defaults: { layout: "grid", limit: 6, showExcerpt: true, skipFeatured: false },
    fields: [
      { name: "layout", kind: "select", options: opts("list", "grid", "compact") },
      { name: "limit", kind: "number", min: 1, max: 24 },
      { name: "showExcerpt", kind: "switch" },
      { name: "skipFeatured", kind: "switch" },
    ],
  },
  CategoryList: {
    type: "CategoryList",
    category: "posts",
    icon: "FolderTree",
    container: false,
    defaults: { limit: 10 },
    fields: [{ name: "limit", kind: "number", min: 1, max: 50 }],
  },
  TagList: {
    type: "TagList",
    category: "posts",
    icon: "Tags",
    container: false,
    defaults: { limit: 20 },
    fields: [{ name: "limit", kind: "number", min: 1, max: 50 }],
  },
  SearchForm: {
    type: "SearchForm",
    category: "posts",
    icon: "Search",
    container: false,
    defaults: { placeholder: "Search articles" },
    fields: [{ name: "placeholder", kind: "text", maxLength: 200 }],
  },
};

export function isContainer(type: string): boolean {
  return (BUILDER_TYPES as readonly string[]).includes(type)
    ? BLOCK_DEFS[type as BuilderBlockType].container
    : false;
}

export function isBuilderType(type: string): type is BuilderBlockType {
  return (BUILDER_TYPES as readonly string[]).includes(type);
}
