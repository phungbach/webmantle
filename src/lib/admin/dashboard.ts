import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { FALLBACK_THEME_ID } from "@/lib/themes/registry";
import { getWeekViews } from "@/lib/analytics/stats";
import { META_MAX, META_MIN } from "@/lib/admin/seo-checks";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DashboardData = {
  published: number;
  published30: number;
  drafts: number;
  staleDrafts: number;
  week: { current: number; previous: number };
  seo: { average: number; needWork: number };
  recent: { id: string; title: string; status: string; updatedAt: Date; authorName: string }[];
  activeTheme: { name: string; version: string; installedAt: Date } | null;
  /** Last 7 days (UTC), oldest first, zero-filled. */
  daily7: { date: Date; views: number }[];
  /** Top 5 posts by views in the last 7 days. */
  topPosts: { id: string; title: string; views: number }[];
  /** Published posts with a future publish date, soonest first (max 5). */
  scheduled: { id: string; title: string; publishedAt: Date }[];
};

const startOfDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Whitespace characters removed by JS String.trim() that matter in practice. */
const WS = " \t\n\r";

/**
 * Everything the /admin dashboard shows, fetched in one round of parallel queries.
 * SEO numbers mirror seoChecks()/seoScore() in seo-checks.ts (meta length in [META_MIN, META_MAX],
 * and a featured image), computed in SQL so no post rows are loaded.
 */
export async function getDashboardData(now = new Date()): Promise<DashboardData> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const start7 = new Date(startOfDay(now).getTime() - 6 * DAY_MS);
  const nowMs = now.getTime();
  const start7Ms = start7.getTime();

  const [
    published,
    published30,
    drafts,
    staleDrafts,
    week,
    seoRows,
    recentRows,
    theme,
    dailyRows,
    topRows,
    scheduled,
  ] = await Promise.all([
    prisma.post.count({ where: { status: "published", publishedAt: { lte: now } } }),
    prisma.post.count({ where: { status: "published", publishedAt: { gte: since30, lte: now } } }),
    prisma.post.count({ where: { status: "draft" } }),
    prisma.post.count({ where: { status: "draft", updatedAt: { lt: since7 } } }),
    getWeekViews(now),
    prisma.$queryRaw<{ total: bigint | number; both: bigint | number; one: bigint | number }[]>`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN ok_meta + ok_img = 2 THEN 1 ELSE 0 END), 0) AS both,
             COALESCE(SUM(CASE WHEN ok_meta + ok_img = 1 THEN 1 ELSE 0 END), 0) AS one
      FROM (
        SELECT CASE WHEN LENGTH(CASE WHEN LENGTH(TRIM("seoDescription", ${WS})) > 0
                                     THEN TRIM("seoDescription", ${WS})
                                     ELSE TRIM("excerpt", ${WS}) END)
                         BETWEEN ${META_MIN} AND ${META_MAX} THEN 1 ELSE 0 END AS ok_meta,
               CASE WHEN "featuredImage" IS NOT NULL AND "featuredImage" <> '' THEN 1 ELSE 0 END AS ok_img
        FROM "Post"
        WHERE "status" = 'published' AND "publishedAt" <= ${nowMs}
      )`,
    prisma.post.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        author: { select: { name: true } },
      },
    }),
    getSiteSettings().then((settings) =>
      prisma.theme.findUnique({
        where: { id: settings.activeThemeId ?? FALLBACK_THEME_ID },
        select: { name: true, version: true, installedAt: true },
      })
    ),
    prisma.$queryRaw<{ day: string; views: bigint | number }[]>`
      SELECT strftime('%Y-%m-%d', "createdAt" / 1000, 'unixepoch') AS day, COUNT(*) AS views
      FROM "PageView"
      WHERE "createdAt" >= ${start7Ms}
      GROUP BY day`,
    prisma.$queryRaw<{ id: string; title: string; views: bigint | number }[]>`
      SELECT p."id" AS id, p."title" AS title, COUNT(*) AS views
      FROM "PageView" v
      JOIN "Post" p ON p."id" = v."postId"
      WHERE v."createdAt" >= ${start7Ms}
      GROUP BY p."id"
      ORDER BY views DESC, p."id" ASC
      LIMIT 5`,
    prisma.post.findMany({
      where: { status: "published", publishedAt: { gt: now } },
      orderBy: { publishedAt: "asc" },
      take: 5,
      select: { id: true, title: true, publishedAt: true },
    }),
  ]);

  const total = Number(seoRows[0]?.total ?? 0);
  const both = Number(seoRows[0]?.both ?? 0);
  const one = Number(seoRows[0]?.one ?? 0);
  const seo = {
    average: total === 0 ? 100 : Math.round((both * 100 + one * 50) / total),
    needWork: total - both,
  };

  const byDay = new Map(dailyRows.map((r) => [r.day, Number(r.views)]));
  const daily7 = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start7Ms + i * DAY_MS);
    return { date, views: byDay.get(date.toISOString().slice(0, 10)) ?? 0 };
  });

  return {
    published,
    published30,
    drafts,
    staleDrafts,
    week,
    seo,
    recent: recentRows.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      updatedAt: p.updatedAt,
      authorName: p.author.name,
    })),
    activeTheme: theme,
    daily7,
    topPosts: topRows.map((r) => ({ id: r.id, title: r.title, views: Number(r.views) })),
    scheduled: scheduled.flatMap((p) =>
      p.publishedAt ? [{ id: p.id, title: p.title, publishedAt: p.publishedAt }] : []
    ),
  };
}
