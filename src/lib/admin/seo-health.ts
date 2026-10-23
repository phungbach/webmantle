import { prisma } from "@/lib/db";
import { META_MAX, META_MIN } from "@/lib/admin/seo-checks";

export type SeoIssueId =
  "noDescription" | "descriptionLength" | "noImage" | "longTitle" | "duplicateTitle" | "noindex";

export type SeoIssue = {
  id: SeoIssueId;
  count: number;
  examples: { id: string; title: string }[];
};

export type SeoHealth = { total: number; passing: number; issues: SeoIssue[] };

const TITLE_MAX = 60;
const EXAMPLES = 5;
// A safety cap: only short fields are read (never bodies), but the list must stay bounded.
const MAX_POSTS = 5000;

/** Counts SEO problems over published, publicly visible posts. Bodies are never loaded. */
export async function getSeoHealth(now: Date = new Date()): Promise<SeoHealth> {
  const posts = await prisma.post.findMany({
    where: { status: "published", publishedAt: { lte: now } },
    select: {
      id: true,
      title: true,
      seoTitle: true,
      seoDescription: true,
      excerpt: true,
      featuredImage: true,
      robotsIndex: true,
    },
    orderBy: { publishedAt: "desc" },
    take: MAX_POSTS,
  });

  const titleOf = (p: (typeof posts)[number]) => p.seoTitle.trim() || p.title.trim();
  const titleCounts = new Map<string, number>();
  for (const p of posts) {
    const key = titleOf(p).toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const buckets: Record<SeoIssueId, (typeof posts)[number][]> = {
    noDescription: [],
    descriptionLength: [],
    noImage: [],
    longTitle: [],
    duplicateTitle: [],
    noindex: [],
  };
  const flagged = new Set<string>();
  for (const p of posts) {
    const meta = (p.seoDescription.trim() || p.excerpt.trim()).length;
    const hit = (id: SeoIssueId) => {
      buckets[id].push(p);
      flagged.add(p.id);
    };
    if (meta === 0) hit("noDescription");
    else if (meta < META_MIN || meta > META_MAX) hit("descriptionLength");
    if (!p.featuredImage) hit("noImage");
    if (titleOf(p).length > TITLE_MAX) hit("longTitle");
    if ((titleCounts.get(titleOf(p).toLowerCase()) ?? 0) > 1) hit("duplicateTitle");
    if (!p.robotsIndex) hit("noindex");
  }

  const issues = (Object.keys(buckets) as SeoIssueId[]).map((id) => ({
    id,
    count: buckets[id].length,
    examples: buckets[id].slice(0, EXAMPLES).map((p) => ({ id: p.id, title: p.title })),
  }));
  return { total: posts.length, passing: posts.length - flagged.size, issues };
}
