import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, DataTable, StatCard, StatusBadge, cellClass, rowClass } from "@/components/admin/ui";
import { BarChart } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { statusLabel } from "@/lib/admin/labels";
import { getDashboardData } from "@/lib/admin/dashboard";
import { formatDate, formatShortDate } from "@/lib/format";
import { percentChange } from "@/lib/analytics/stats";
import { getLocale } from "@/lib/i18n/server";
import { intlLocale, tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const locale = await getLocale();
  const T = tr(locale);
  const user = await getCurrentUser();
  const {
    published,
    published30,
    drafts,
    staleDrafts,
    week,
    seo,
    recent,
    activeTheme,
    daily7,
    topPosts,
    scheduled,
  } = await getDashboardData();
  const needWork = seo.needWork;
  const average = seo.average;
  const weekdayEn = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
  const weekdayLabel = (date: Date) =>
    locale === "vi"
      ? (["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getUTCDay()] ?? "")
      : weekdayEn.format(date);
  const numberFormat = new Intl.NumberFormat(intlLocale(locale));

  const weekChange = percentChange(week.current, week.previous);
  const percentFormat = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  return (
    <>
      <PageHeader
        title={T("dashboard.title")}
        action={
          <Link
            href="/admin/posts/new"
            className="inline-flex items-center gap-2 rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {T("posts.new")}
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={T("dashboard.statPublished")}
          value={published}
          hint={T("dashboard.hintLast30", { n: published30 })}
        />
        <StatCard
          label={T("ui.statusDraft")}
          value={drafts}
          hint={T("dashboard.hintStale", { n: staleDrafts })}
          tone={staleDrafts > 0 ? "warning" : "success"}
        />
        <StatCard
          label={T("dashboard.views7")}
          value={new Intl.NumberFormat(intlLocale(locale)).format(week.current)}
          hint={
            weekChange === null
              ? T("analytics.deltaNew")
              : T("analytics.deltaPrev7", { pct: `${percentFormat.format(weekChange)}%` })
          }
          tone={weekChange !== null && weekChange < 0 ? "warning" : "success"}
        />
        <StatCard
          label={T("dashboard.statSeoScore")}
          value={`${average}/100`}
          hint={T("dashboard.seoNeedWork", { n: needWork })}
          tone={needWork > 0 ? "warning" : "success"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-5 text-base font-semibold text-ink">{T("analytics.views7")}</h2>
          <BarChart
            data={daily7.map((d) => ({ label: weekdayLabel(d.date), value: d.views }))}
            maxLabel={T("analytics.max")}
            ariaLabel={T("analytics.views7")}
          />
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-ink">{T("dashboard.topPostsWeek")}</h2>
          {topPosts.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">{T("dashboard.noViewsYet")}</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {topPosts.map((post) => (
                <li key={post.id} className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/admin/posts/${post.id}`}
                    className="min-w-0 truncate hover:underline"
                  >
                    {post.title}
                  </Link>
                  <span className="shrink-0 text-ink-3">{numberFormat.format(post.views)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DataTable
            title={T("dashboard.recentPosts")}
            head={[T("common.title"), T("common.status"), T("common.author"), T("ui.updated")]}
            empty={recent.length === 0 ? T("posts.none") : undefined}
          >
            {recent.map((post) => (
              <tr key={post.id} className={rowClass}>
                <td className={`${cellClass} font-medium`}>
                  <Link href={`/admin/posts/${post.id}`} className="hover:underline">
                    {post.title}
                  </Link>
                </td>
                <td className={cellClass}>
                  <StatusBadge value={post.status} label={statusLabel(T, post.status)} />
                </td>
                <td className={`${cellClass} text-ink-2`}>{post.authorName}</td>
                <td className={`${cellClass} whitespace-nowrap text-ink-3`}>
                  {formatShortDate(post.updatedAt, locale)}
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold text-ink">{T("dashboard.scheduled")}</h2>
            {scheduled.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">{T("dashboard.noScheduled")}</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {scheduled.map((post) => (
                  <li key={post.id} className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/admin/posts/${post.id}`}
                      className="min-w-0 truncate hover:underline"
                    >
                      {post.title}
                    </Link>
                    <span className="shrink-0 text-ink-3">
                      {formatShortDate(post.publishedAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-ink">{T("dashboard.activeTheme")}</h2>
            <p className="mt-2 text-sm text-ink-2">
              {activeTheme
                ? T("dashboard.themeSummary", {
                    name: activeTheme.name,
                    version: activeTheme.version,
                    date: formatDate(activeTheme.installedAt.toISOString(), locale),
                  })
                : T("dashboard.fallback")}
            </p>
            {can(user?.role ?? "", "themes:manage") ? (
              <Link
                className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
                href="/admin/themes"
              >
                {T("dashboard.manageThemes")}
              </Link>
            ) : null}
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-ink">
              {needWork > 0
                ? T("dashboard.seoCardTitle", { n: needWork })
                : T("dashboard.statSeoScore")}
            </h2>
            <p className="mt-2 text-sm text-ink-2">
              {needWork > 0 ? T("dashboard.seoCardBody") : T("dashboard.seoAllGood")}
            </p>
            <Link
              className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
              href="/admin/posts"
            >
              {T("dashboard.openPosts")}
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
