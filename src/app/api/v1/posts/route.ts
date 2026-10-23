import { NextResponse } from "next/server";
import { listPublishedPosts } from "@/lib/content/queries";
import { apiError, pageParam } from "@/lib/http";
import { clientIpFrom } from "@/lib/auth/client-ip";
import { hitRateLimit } from "@/lib/auth/rate-limit";

const LIMIT_PER_MINUTE = 120;

export const dynamic = "force-dynamic";

/**
 * Public, read-only API. Returns published posts only, in pages of at most 50.
 * Writes happen through authenticated Server Actions, not through this route.
 */
export async function GET(request: Request) {
  const rate = hitRateLimit(`api-posts:${clientIpFrom(request.headers)}`, LIMIT_PER_MINUTE, 60_000);
  if (!rate.allowed)
    return apiError(429, "rate_limited", "Too many requests. Try again shortly.", {
      "Retry-After": String(rate.retryAfterSeconds),
    });
  const url = new URL(request.url);
  const page = pageParam(url.searchParams.get("page") ?? undefined);
  const requested = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 50) : 10;
  const listing = await listPublishedPosts({ page, pageSize: limit });
  return NextResponse.json(
    {
      data: listing.items.map(
        ({ id, slug, title, excerpt, publishedAt, url: href, author, categories, tags }) => ({
          id,
          slug,
          title,
          excerpt,
          publishedAt,
          url: href,
          author: { name: author.name },
          categories,
          tags,
        })
      ),
      meta: { page: listing.page, totalPages: listing.totalPages, total: listing.total, limit },
    },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}
