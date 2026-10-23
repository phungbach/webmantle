import { listPublishedPosts, type PostCard } from "@/lib/content/queries";
import type { LayoutNode } from "@/lib/themes/contract";

export type TagRequest = { tag: string; limit: number };

const DEFAULT_LIMIT = 6;

/** Tags a layout asks for through the `tag` prop, with the largest `limit` among the blocks. */
export function collectTagRequests(node: LayoutNode): TagRequest[] {
  const wanted = new Map<string, number>();
  const walk = (n: LayoutNode) => {
    const tag = n.props?.tag;
    if (n.component === "CourseList" && typeof tag === "string" && tag) {
      const limit = typeof n.props?.limit === "number" ? n.props.limit : DEFAULT_LIMIT;
      wanted.set(tag, Math.max(wanted.get(tag) ?? 0, limit));
    }
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return [...wanted.entries()].map(([tag, limit]) => ({ tag, limit }));
}

/** Loads the posts a layout asked for. Themes never query the database themselves. */
export async function loadTagPosts(
  requests: TagRequest[],
  locale: string
): Promise<Record<string, PostCard[]>> {
  const entries = await Promise.all(
    requests.map(async ({ tag, limit }) => {
      const listing = await listPublishedPosts({ tagSlug: tag, pageSize: limit, locale });
      return [tag, listing.items] as const;
    })
  );
  return Object.fromEntries(entries);
}
