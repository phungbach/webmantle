// Simple on-page SEO checks shown in the post editor and summarised on the dashboard.
// They only look at saved fields, so they are cheap to run for every post.

export type SeoCheckId = "meta" | "image";
export type SeoCheck = { id: SeoCheckId; ok: boolean; detail?: number };

export const META_MIN = 70;
export const META_MAX = 160;

export function seoChecks(post: {
  seoDescription: string;
  excerpt?: string;
  featuredImage: string | null;
}): SeoCheck[] {
  const meta = (post.seoDescription.trim() || post.excerpt?.trim() || "").length;
  return [
    { id: "meta", ok: meta >= META_MIN && meta <= META_MAX, detail: meta },
    { id: "image", ok: Boolean(post.featuredImage) },
  ];
}

/** Share of passed checks, 0 to 100. */
export function seoScore(checks: SeoCheck[]): number {
  if (checks.length === 0) return 100;
  return Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
}
