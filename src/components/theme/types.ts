import type { PageDetailData } from "@/lib/content/types";
import type { PostCard, PostDetail } from "@/lib/content/queries";
import type { LayoutNode, TemplateType } from "@/lib/themes/contract";

export type AdjacentPost = { title: string; url: string };

/** Everything a theme can display. Themes never query the database themselves. */
export type ViewModel = {
  kind: TemplateType;
  /** Optional custom template chosen for this post or page. Ignored when the theme does not offer it. */
  templateId?: string;
  title?: string;
  description?: string;
  archiveKind?: "archive" | "index" | "category" | "tag" | "author";
  featured?: PostCard | null;
  posts?: PostCard[];
  total?: number;
  post?: PostDetail;
  related?: PostCard[];
  /** The posts just before and after this one, by date. */
  adjacent?: { previous: AdjacentPost | null; next: AdjacentPost | null };
  page?: PageDetailData;
  pagination?: { basePath: string; current: number; totalPages: number; query?: string };
  query?: string;
  categories?: { name: string; slug: string; count: number }[];
  tags?: { name: string; slug: string; count: number }[];
  /** Posts by tag slug, for blocks that show the posts of one tag (see CourseList `tag`). */
  tagPosts?: Record<string, PostCard[]>;
  /** Layout built with the page designer. When set it is rendered instead of the theme template. */
  layoutOverride?: LayoutNode;
};

export type RenderContext = {
  /** The theme's content.json (marketing blocks). Empty when the theme has none. */
  content?: Record<string, unknown>;
  site: {
    title: string;
    description: string;
    url: string;
    locale: string;
    /** Logo address, when one is set in Appearance. */
    logoUrl?: string | null;
    /** Site-wide appearance (colours, season, guard). Missing values mean the defaults. */
    appearance?: import("@/lib/appearance").Appearance;
    /** Main menu from Appearance → Menu. Empty means use the theme's own links. */
    menu?: import("@/lib/menu").MenuItem[];
    /** Blog look from Admin → Blog style. Missing means the theme's own look. */
    blogStyle?: import("@/lib/blog-style").BlogStyle;
  };
  theme: { id: string; version: string; values: Record<string, string | boolean> };
  view: ViewModel;
  preview: boolean;
  /** Page designer preview: blocks get data-bid wrappers and the edit bridge is added. */
  edit?: boolean;
  /** Edit mode and the user may edit the theme's own texts and pictures (content-bound elements get data-ce). */
  contentEdit?: boolean;
};
