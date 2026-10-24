import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getDashboardData } from "@/lib/admin/dashboard";
import { getTrafficStats } from "@/lib/analytics/stats";
import { dayKey } from "@/lib/analytics/track";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00Z");
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3600_000);

let authorId: string;
let n = 0;
async function post(data: {
  title: string;
  status?: string;
  publishedAt?: Date | null;
  updatedAt?: Date;
  body?: string;
}) {
  n += 1;
  return prisma.post.create({
    data: { slug: `p-${n}`, status: "draft", body: "<p>hello</p>", authorId, ...data },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await prisma.pageView.deleteMany();
  authorId = (await createUser("admin")).id;
});

describe("getDashboardData", () => {
  it("returns zeros and null theme on an empty site", async () => {
    const d = await getDashboardData(NOW);
    expect(d.published).toBe(0);
    expect(d.drafts).toBe(0);
    expect(d.published30).toBe(0);
    expect(d.staleDrafts).toBe(0);
    expect(d.recent).toEqual([]);
    expect(d.topPosts).toEqual([]);
    expect(d.scheduled).toEqual([]);
    expect(d.activeTheme).toBeNull();
    expect(d.week).toEqual({ current: 0, previous: 0 });
    expect(d.daily7).toHaveLength(7);
    expect(d.daily7.every((x) => x.views === 0)).toBe(true);
  });

  it("counts published, drafts and published in the last 30 days", async () => {
    await post({ title: "A", status: "published", publishedAt: ago(2) });
    await post({ title: "B", status: "published", publishedAt: ago(29) });
    await post({ title: "C", status: "published", publishedAt: ago(60) });
    await post({ title: "D" });
    await post({ title: "E" });
    const d = await getDashboardData(NOW);
    expect(d.published).toBeGreaterThanOrEqual(3);
    expect(d.drafts).toBe(2);
    expect(d.published30).toBe(2);
    expect(d.seo.average).toBeGreaterThanOrEqual(0);
    expect(d.seo.average).toBeLessThanOrEqual(100);
    expect(d.seo.needWork).toBeGreaterThanOrEqual(0);
    expect(d.seo.needWork).toBeLessThanOrEqual(d.published);
  });

  it("excludes scheduled posts from the published count and lists them soonest first", async () => {
    await post({ title: "Live", status: "published", publishedAt: ago(1) });
    const later = await post({
      title: "Later",
      status: "published",
      publishedAt: new Date(NOW.getTime() + 5 * DAY),
    });
    const soon = await post({
      title: "Soon",
      status: "published",
      publishedAt: new Date(NOW.getTime() + 1 * DAY),
    });
    const d = await getDashboardData(NOW);
    expect(d.published).toBe(1);
    expect(d.scheduled.map((p) => p.id)).toEqual([soon.id, later.id]);
  });

  it("caps recent at 5 and scheduled at 5", async () => {
    for (let i = 0; i < 8; i++) await post({ title: `D${i}`, updatedAt: ago(i) });
    for (let i = 0; i < 7; i++)
      await post({
        title: `S${i}`,
        status: "published",
        publishedAt: new Date(NOW.getTime() + (i + 1) * DAY),
      });
    const d = await getDashboardData(NOW);
    expect(d.recent).toHaveLength(5);
    expect(d.scheduled).toHaveLength(5);
  });

  it("reports the active theme when one is installed", async () => {
    await installBuiltIns();
    const d = await getDashboardData(NOW);
    expect(d.activeTheme).not.toBeNull();
  });

  it("zero-fills daily7 oldest first and compares weeks", async () => {
    const mk = (createdAt: Date) => ({ path: "/", visitor: "v", source: "direct", createdAt });
    await prisma.pageView.createMany({
      data: [
        mk(ago(0, 1)),
        mk(ago(0, 2)),
        mk(ago(2)),
        mk(ago(6)),
        mk(ago(8)), // previous week
        mk(ago(9)),
        mk(ago(9, 1)),
      ],
    });
    const d = await getDashboardData(NOW);
    expect(d.daily7).toHaveLength(7);
    const keys = d.daily7.map((x) => dayKey(new Date(x.date)));
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(7);
    const byKey = new Map(d.daily7.map((x) => [dayKey(new Date(x.date)), x.views]));
    expect(byKey.get(dayKey(NOW))).toBe(2);
    expect(byKey.get(dayKey(ago(2)))).toBe(1);
    expect(byKey.get(dayKey(ago(6)))).toBe(1);
    expect(byKey.get(dayKey(ago(1)))).toBe(0);
    expect(d.week).toEqual({ current: 4, previous: 3 });
  });

  it("orders topPosts by views, at most 5", async () => {
    const posts = [];
    for (let i = 0; i < 6; i++)
      posts.push(await post({ title: `T${i}`, status: "published", publishedAt: ago(10) }));
    const views = [1, 6, 3, 5, 2, 4];
    const data = posts.flatMap((p, i) =>
      Array.from({ length: views[i] ?? 0 }, () => ({
        path: `/posts/${p.slug}`,
        postId: p.id,
        visitor: "v",
        createdAt: ago(1),
      }))
    );
    await prisma.pageView.createMany({ data });
    const d = await getDashboardData(NOW);
    expect(d.topPosts).toHaveLength(5);
    const ids = posts.map((p) => p.id);
    expect(d.topPosts.map((p) => p.id)).toEqual([1, 3, 5, 2, 4].map((i) => ids[i]));
  });
});

describe("getTrafficStats regression", () => {
  it("matches a naive in-memory computation", async () => {
    const posts = [];
    for (let i = 0; i < 7; i++)
      posts.push(await post({ title: `P${i}`, status: "published", publishedAt: ago(40) }));
    const sources = ["direct", "search", "social", "referral", "internal"];
    const rows: {
      path: string;
      postId: string | null;
      visitor: string;
      source: string;
      createdAt: Date;
    }[] = [];
    // deterministic pseudo-random data spanning 70 days (older than 60 should be ignored)
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 400; i++) {
      const p = rnd() < 0.7 ? posts[Math.floor(rnd() * posts.length)] : null;
      rows.push({
        path: p ? `/posts/${p.slug}` : "/",
        postId: p?.id ?? null,
        visitor: `v${Math.floor(rnd() * 40)}-${Math.floor(rnd() * 5)}`,
        source: sources[Math.floor(rnd() * sources.length)] ?? "direct",
        createdAt: new Date(NOW.getTime() - rnd() * 70 * DAY),
      });
    }
    await prisma.pageView.createMany({ data: rows });

    const stats = await getTrafficStats(NOW);

    const startOfDay = (d: Date) =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const start30 = new Date(startOfDay(NOW).getTime() - 29 * DAY);
    const startPrev = new Date(start30.getTime() - 30 * DAY);
    const cur = rows.filter((r) => r.createdAt >= start30);
    const prev = rows.filter((r) => r.createdAt >= startPrev && r.createdAt < start30);

    expect(stats.hasData).toBe(cur.length + prev.length > 0);
    expect(stats.views30).toBe(cur.length);
    expect(stats.viewsPrev30).toBe(prev.length);
    expect(stats.visitors30).toBe(new Set(cur.map((r) => r.visitor)).size);
    expect(stats.visitorsPrev30).toBe(new Set(prev.map((r) => r.visitor)).size);

    expect(stats.daily).toHaveLength(30);
    stats.daily.forEach((day, i) => {
      const date = new Date(start30.getTime() + i * DAY);
      const key = dayKey(date);
      const inDay = cur.filter((r) => dayKey(r.createdAt) === key);
      expect(dayKey(new Date(day.date))).toBe(key);
      expect(day.views).toBe(inDay.length);
      expect(day.visitors).toBe(new Set(inDay.map((r) => r.visitor)).size);
    });
    expect(stats.viewsToday).toBe(stats.daily[29]?.views);
    expect(stats.week).toEqual(
      stats.daily.slice(-7).map((d) => ({ date: d.date, views: d.views }))
    );

    for (const s of stats.sources) {
      expect(s.views).toBe(cur.filter((r) => r.source === s.source).length);
    }
    expect(stats.sources.map((s) => s.source)).toEqual(["search", "direct", "social", "referral"]);

    const counts = new Map<string, number>();
    for (const r of cur) if (r.postId) counts.set(r.postId, (counts.get(r.postId) ?? 0) + 1);
    const expected = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    expect(stats.topPosts.map((p) => p.views)).toEqual(expected.map((e) => e[1]));
    // ids may differ only among ties; compare as view-count-per-id
    for (const p of stats.topPosts) expect(counts.get(p.id)).toBe(p.views);
    for (const p of stats.topPosts) {
      expect(p.title).toBe(posts.find((x) => x.id === p.id)?.title);
    }
  });

  it("reports no data on an empty table", async () => {
    const s = await getTrafficStats(NOW);
    expect(s.hasData).toBe(false);
    expect(s.views30).toBe(0);
    expect(s.daily).toHaveLength(30);
    expect(s.topPosts).toEqual([]);
  });
});
