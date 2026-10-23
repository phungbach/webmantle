import { prisma } from "@/lib/db";
import { dayKey, type Source } from "@/lib/analytics/track";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrafficStats = {
  hasData: boolean;
  views30: number;
  viewsPrev30: number;
  visitors30: number;
  visitorsPrev30: number;
  viewsToday: number;
  /** Last 30 days, oldest first. */
  daily: { date: Date; views: number; visitors: number }[];
  /** Last 7 days, oldest first. */
  week: { date: Date; views: number }[];
  /** Share of visits by origin, new visits only (moves between pages of the site are left out). */
  sources: { source: Exclude<Source, "internal">; views: number }[];
  topPosts: { id: string; title: string; views: number }[];
};

const startOfDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Percent change from `previous` to `current`, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

type Count = bigint | number;

export async function getTrafficStats(now = new Date()): Promise<TrafficStats> {
  const today = startOfDay(now);
  const start30 = new Date(today.getTime() - 29 * DAY_MS);
  const startPrev = new Date(start30.getTime() - 30 * DAY_MS);
  const s30 = start30.getTime();
  const sPrev = startPrev.getTime();

  // All aggregation happens in SQL; createdAt is stored as epoch milliseconds.
  const [totals, dailyRows, sourceRows, topRows] = await Promise.all([
    prisma.$queryRaw<
      { views30: Count | null; viewsPrev: Count | null; visitors30: Count; visitorsPrev: Count }[]
    >`
      SELECT SUM(CASE WHEN "createdAt" >= ${s30} THEN 1 ELSE 0 END) AS views30,
             SUM(CASE WHEN "createdAt" < ${s30} THEN 1 ELSE 0 END) AS viewsPrev,
             COUNT(DISTINCT CASE WHEN "createdAt" >= ${s30} THEN "visitor" END) AS visitors30,
             COUNT(DISTINCT CASE WHEN "createdAt" < ${s30} THEN "visitor" END) AS visitorsPrev
      FROM "PageView" WHERE "createdAt" >= ${sPrev}`,
    prisma.$queryRaw<{ day: string; views: Count; visitors: Count }[]>`
      SELECT strftime('%Y-%m-%d', "createdAt" / 1000, 'unixepoch') AS day,
             COUNT(*) AS views, COUNT(DISTINCT "visitor") AS visitors
      FROM "PageView" WHERE "createdAt" >= ${s30}
      GROUP BY day`,
    prisma.$queryRaw<{ source: string; views: Count }[]>`
      SELECT "source" AS source, COUNT(*) AS views
      FROM "PageView" WHERE "createdAt" >= ${s30} AND "source" <> 'internal'
      GROUP BY "source"`,
    prisma.$queryRaw<{ id: string; title: string; views: Count }[]>`
      SELECT v."postId" AS id, COALESCE(p."title", v."postId") AS title, COUNT(*) AS views
      FROM "PageView" v LEFT JOIN "Post" p ON p."id" = v."postId"
      WHERE v."createdAt" >= ${s30} AND v."postId" IS NOT NULL
      GROUP BY v."postId"
      ORDER BY views DESC, v."postId" ASC
      LIMIT 5`,
  ]);

  const views30 = Number(totals[0]?.views30 ?? 0);
  const viewsPrev30 = Number(totals[0]?.viewsPrev ?? 0);

  const perDay = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(s30 + i * DAY_MS);
    const entry = perDay.get(dayKey(date));
    return { date, views: Number(entry?.views ?? 0), visitors: Number(entry?.visitors ?? 0) };
  });

  const bySource = new Map(sourceRows.map((r) => [r.source, Number(r.views)]));

  return {
    hasData: views30 + viewsPrev30 > 0,
    views30,
    viewsPrev30,
    // Visitor ids change every day, so distinct ids are distinct visitors per day, added up.
    visitors30: Number(totals[0]?.visitors30 ?? 0),
    visitorsPrev30: Number(totals[0]?.visitorsPrev ?? 0),
    viewsToday: daily[daily.length - 1]?.views ?? 0,
    daily,
    week: daily.slice(-7).map((d) => ({ date: d.date, views: d.views })),
    sources: (["search", "direct", "social", "referral"] as const).map((source) => ({
      source,
      views: bySource.get(source) ?? 0,
    })),
    topPosts: topRows.map((r) => ({ id: r.id, title: r.title, views: Number(r.views) })),
  };
}

/** Views in the last 7 days and in the 7 days before, for the dashboard card. */
export async function getWeekViews(now = new Date()) {
  const today = startOfDay(now);
  const start7 = new Date(today.getTime() - 6 * DAY_MS);
  const startPrev = new Date(start7.getTime() - 7 * DAY_MS);
  const [current, previous] = await Promise.all([
    prisma.pageView.count({ where: { createdAt: { gte: start7 } } }),
    prisma.pageView.count({ where: { createdAt: { gte: startPrev, lt: start7 } } }),
  ]);
  return { current, previous };
}
