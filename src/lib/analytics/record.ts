import { prisma } from "@/lib/db";
import { getSigningSecret, SITE_URL } from "@/lib/env";
import { classifySource, dayKey, isBot, parseTrackPath, visitorHash } from "@/lib/analytics/track";

const DEDUPE_MS = 30 * 60 * 1000;
const KEEP_DAYS = 400;

export type ViewInput = {
  path: unknown;
  referrer: unknown;
  internal: boolean;
  ip: string;
  userAgent: string;
  requestHost: string;
};

/** Stores one page view. Returns false when the visit is not counted. */
export async function recordPageView(input: ViewInput, now = new Date()): Promise<boolean> {
  if (isBot(input.userAgent)) return false;
  const target = parseTrackPath(input.path);
  if (!target) return false;

  // Only published content counts, so made-up addresses cannot fill the table.
  let postId: string | null = null;
  if (target.kind === "post") {
    const post = await prisma.post.findFirst({
      where: { slug: target.slug, status: "published", publishedAt: { lte: now } },
      select: { id: true },
    });
    if (!post) return false;
    postId = post.id;
  } else if (target.kind === "page") {
    const page = await prisma.page.findFirst({
      where: { slug: target.slug, status: "published" },
      select: { id: true },
    });
    if (!page) return false;
  }

  const visitor = visitorHash(getSigningSecret(), input.ip, input.userAgent, dayKey(now));
  // A reload or a quick return to the same page is one view, not two.
  const recent = await prisma.pageView.findFirst({
    where: {
      visitor,
      path: target.path,
      createdAt: { gte: new Date(now.getTime() - DEDUPE_MS) },
    },
    select: { id: true },
  });
  if (recent) return false;

  const referrer = typeof input.referrer === "string" ? input.referrer.slice(0, 500) : "";
  const source = classifySource(
    referrer,
    [new URL(SITE_URL).host, input.requestHost],
    input.internal
  );
  await prisma.pageView.create({ data: { path: target.path, postId, visitor, source } });

  // Old rows are removed now and then, so the table does not grow without limit.
  if (Math.random() < 0.01) {
    await prisma.pageView.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000) } },
    });
  }
  return true;
}
