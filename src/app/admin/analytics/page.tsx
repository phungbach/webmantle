import { prisma } from "@/lib/db";
import { Card, Note, StatCard } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import {
  AreaChart,
  BarChart,
  CHART,
  DonutChart,
  HeatMap,
  PillBars,
} from "@/components/admin/charts";
import { formatShortDate } from "@/lib/format";
import { getTrafficStats, percentChange } from "@/lib/analytics/stats";
import { getLocale } from "@/lib/i18n/server";
import { intlLocale, tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const MONTHS = 12;
const DAYS = 30;
const WEEKS = 26;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

// Counts come from saved content only. Visitor traffic is not recorded, so there are no page views here.
export default async function AnalyticsPage() {
  const locale = await getLocale();
  const T = tr(locale);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const monthsStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));
  const daysStart = new Date(today.getTime() - (DAYS - 1) * DAY_MS);
  // Monday of the current week, then back WEEKS - 1 weeks.
  const weekday = (today.getUTCDay() + 6) % 7;
  const heatStart = new Date(today.getTime() - weekday * DAY_MS - (WEEKS - 1) * 7 * DAY_MS);

  const [traffic, posts, statusCounts, pages, media, categories, revisions] = await Promise.all([
    getTrafficStats(now),
    prisma.post.findMany({
      where: { createdAt: { gte: monthsStart } },
      select: { createdAt: true },
    }),
    prisma.post.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.page.count(),
    prisma.media.count(),
    prisma.category.findMany({
      select: { name: true, _count: { select: { posts: true } } },
      orderBy: { posts: { _count: "desc" } },
      take: 5,
    }),
    prisma.postRevision.findMany({
      where: { createdAt: { gte: heatStart } },
      select: { createdAt: true },
    }),
  ]);

  // Posts per month, last 12 months.
  const monthFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    timeZone: "UTC",
  });
  const monthly = Array.from({ length: MONTHS }, (_, i) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1) + i, 1));
    const value = posts.filter(
      (p) =>
        p.createdAt.getUTCFullYear() === start.getUTCFullYear() &&
        p.createdAt.getUTCMonth() === start.getUTCMonth()
    ).length;
    return { label: monthFormat.format(start), value };
  });

  // Posts per day, last 30 days.
  const perDay = new Map<string, number>();
  for (const p of posts)
    perDay.set(dayKey(p.createdAt), (perDay.get(dayKey(p.createdAt)) ?? 0) + 1);
  const daily = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(daysStart.getTime() + i * DAY_MS);
    return { date, value: perDay.get(dayKey(date)) ?? 0 };
  });
  const dailyTotal = daily.reduce((sum, d) => sum + d.value, 0);

  // Editing activity (saved revisions) per day, last 26 weeks, one column per week.
  const saves = new Map<string, number>();
  for (const r of revisions)
    saves.set(dayKey(r.createdAt), (saves.get(dayKey(r.createdAt)) ?? 0) + 1);
  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(heatStart.getTime() + (w * 7 + d) * DAY_MS);
      return { date: dayKey(date), count: saves.get(dayKey(date)) ?? 0 };
    })
  );
  let previousMonth = -1;
  const monthLabels = weeks.map((week) => {
    const first = new Date(`${week[0]!.date}T00:00:00Z`);
    const month = first.getUTCMonth();
    if (month === previousMonth) return null;
    previousMonth = month;
    return monthFormat.format(first);
  });
  // A label needs about four columns of room; drop the first one when the next month follows closely.
  const nextLabel = monthLabels.findIndex((label, i) => i > 0 && label !== null);
  if (nextLabel !== -1 && nextLabel < 4) monthLabels[0] = null;

  const count = (status: string) => statusCounts.find((s) => s.status === status)?._count._all ?? 0;
  const published = count("published");
  const drafts = count("draft");
  const archived = count("archived");
  const allPosts = published + drafts + archived;
  const publishedShare = allPosts === 0 ? 0 : (published / allPosts) * 100;

  const numberFormat = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });
  const percentFormat = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  const delta = (current: number, previous: number, key: "analytics.deltaPrev30") => {
    const change = percentChange(current, previous);
    if (change === null) return { text: T("analytics.deltaNew"), tone: "neutral" as const };
    return {
      text: T(key, { pct: `${percentFormat.format(change)}%` }),
      tone: change >= 0 ? ("success" as const) : ("warning" as const),
    };
  };
  const viewsDelta = delta(traffic.views30, traffic.viewsPrev30, "analytics.deltaPrev30");
  const visitorsDelta = delta(traffic.visitors30, traffic.visitorsPrev30, "analytics.deltaPrev30");
  const weekdayEn = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  });
  // Vietnamese short weekdays are "T2" to "T7" and "CN".
  const weekdayLabel = (date: Date) =>
    locale === "vi"
      ? (["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getUTCDay()] ?? "")
      : weekdayEn.format(date);
  const sourceTotal = traffic.sources.reduce((sum, row) => sum + row.views, 0);

  const statusRows = [
    { label: T("ui.statusPublished"), value: published, color: CHART.blue },
    { label: T("ui.statusDraft"), value: drafts, color: CHART.cyan },
    { label: T("ui.statusArchived"), value: archived, color: CHART.track },
  ];

  return (
    <>
      <PageHeader title={T("analytics.title")} description={T("analytics.description")} />

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
        {T("analytics.sectionTraffic")}
      </h2>
      {!traffic.hasData ? (
        <div className="mb-4 max-w-2xl">
          <Note tone="success">{T("analytics.noTraffic")}</Note>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={T("analytics.views30")}
          value={numberFormat.format(traffic.views30)}
          hint={viewsDelta.text}
          tone={viewsDelta.tone}
        />
        <StatCard
          label={T("analytics.visitors30")}
          value={numberFormat.format(traffic.visitors30)}
          hint={visitorsDelta.text}
          tone={visitorsDelta.tone}
        />
        <StatCard
          label={T("analytics.viewsPerVisitor")}
          value={numberFormat.format(
            traffic.visitors30 === 0 ? 0 : traffic.views30 / traffic.visitors30
          )}
        />
        <StatCard
          label={T("analytics.viewsToday")}
          value={numberFormat.format(traffic.viewsToday)}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-5 text-base font-semibold text-ink">{T("analytics.views7")}</h2>
          <BarChart
            data={traffic.week.map((d) => ({
              label: weekdayLabel(d.date),
              value: d.views,
            }))}
            maxLabel={T("analytics.max")}
            ariaLabel={T("analytics.views7")}
          />
        </Card>
        <Card>
          <h2 className="mb-5 text-base font-semibold text-ink">{T("analytics.sources")}</h2>
          <PillBars
            suffix="%"
            rows={traffic.sources.map((row) => ({
              label: T(`analytics.source.${row.source}` as "analytics.source.search"),
              value: sourceTotal === 0 ? 0 : Math.round((row.views / sourceTotal) * 100),
            }))}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">{T("analytics.trend30")}</h2>
            <span className="flex items-center gap-4 text-xs text-ink-3">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: CHART.blue }} />
                {T("analytics.legendViews")}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-4 border-t-2 border-dashed"
                  style={{ borderColor: CHART.cyan }}
                />
                {T("analytics.legendVisitors")}
              </span>
            </span>
          </div>
          <AreaChart
            id="traffic-area"
            values={traffic.daily.map((d) => d.views)}
            secondary={traffic.daily.map((d) => d.visitors)}
            labels={[
              formatShortDate(traffic.daily[0]!.date, locale),
              formatShortDate(traffic.daily[Math.floor(DAYS / 2)]!.date, locale),
              formatShortDate(traffic.daily[DAYS - 1]!.date, locale),
            ]}
            ariaLabel={T("analytics.trend30")}
          />
        </Card>
        <Card>
          <h2 className="mb-5 text-base font-semibold text-ink">{T("analytics.topPosts")}</h2>
          {traffic.topPosts.length === 0 ? (
            <p className="text-sm text-ink-3">{T("analytics.noPosts")}</p>
          ) : (
            <PillBars rows={traffic.topPosts.map((p) => ({ label: p.title, value: p.views }))} />
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-wide text-ink-3">
        {T("analytics.sectionContent")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={T("dashboard.publishedPosts")} value={published} />
        <StatCard label={T("dashboard.drafts")} value={drafts} />
        <StatCard label={T("dashboard.pages")} value={pages} />
        <StatCard label={T("dashboard.mediaFiles")} value={media} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">{T("analytics.postsByMonth")}</h2>
            <span className="text-xs text-ink-3">{T("analytics.postsByMonthHint")}</span>
          </div>
          <BarChart
            data={monthly}
            maxLabel={T("analytics.max")}
            ariaLabel={T("analytics.postsByMonth")}
          />
        </Card>
        <Card>
          <h2 className="mb-5 text-base font-semibold text-ink">{T("analytics.statusMix")}</h2>
          <DonutChart
            percent={publishedShare}
            caption={T("ui.statusPublished")}
            ariaLabel={T("analytics.statusMix")}
          />
          <ul className="mt-6 space-y-2.5 text-sm">
            {statusRows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 text-ink-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: row.color }}
                  />
                  {row.label}
                </span>
                <span className="font-medium text-ink">{row.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">{T("analytics.last30")}</h2>
            <span className="text-xs text-ink-3">{T("analytics.total", { n: dailyTotal })}</span>
          </div>
          <AreaChart
            id="analytics-area"
            values={daily.map((d) => d.value)}
            labels={[
              formatShortDate(daily[0]!.date, locale),
              formatShortDate(daily[Math.floor(DAYS / 2)]!.date, locale),
              formatShortDate(daily[DAYS - 1]!.date, locale),
            ]}
            ariaLabel={T("analytics.last30")}
          />
        </Card>
        <Card>
          <h2 className="mb-5 text-base font-semibold text-ink">{T("analytics.topCategories")}</h2>
          {categories.length === 0 ? (
            <p className="text-sm text-ink-3">{T("analytics.noCategories")}</p>
          ) : (
            <PillBars rows={categories.map((c) => ({ label: c.name, value: c._count.posts }))} />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{T("analytics.activity")}</h2>
          <span className="text-xs text-ink-3">{T("analytics.activityHint")}</span>
        </div>
        <HeatMap
          weeks={weeks}
          monthLabels={monthLabels}
          legend={{ less: T("analytics.less"), more: T("analytics.more") }}
          ariaLabel={T("analytics.activity")}
        />
      </Card>
    </>
  );
}
