import Link from "next/link";
import { PencilRuler, Plus } from "lucide-react";
import { Badge } from "@/components/admin/ui";
import { prisma } from "@/lib/db";
import {
  Button,
  DataTable,
  FilterTabs,
  RowActions,
  RowDelete,
  RowLink,
  Flash,
  SearchBox,
  StatusBadge,
  Toolbar,
  cellClass,
  rowClass,
} from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { deletePageAction } from "@/app/admin/actions/content";
import { queryParam } from "@/lib/http";
import { formatShortDate } from "@/lib/format";
import { listHref, pick } from "@/lib/admin/list";
import { statusLabel } from "@/lib/admin/labels";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";
const STATUSES = ["published", "draft", "archived"] as const;

export default async function PagesList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  const q = queryParam(params.q);
  const status = pick(params.status, STATUSES);
  const scope = q ? { OR: [{ title: { contains: q } }, { slug: { contains: q } }] } : {};
  const [pages, grouped] = await Promise.all([
    prisma.page.findMany({
      where: { ...scope, ...(status ? { status } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.page.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);
  const countOf = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const all = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const tab = (label: string, value: string, count: number) => ({
    label,
    count,
    href: listHref("/admin/pages", { q, status: value }),
    active: status === value,
  });

  return (
    <>
      <PageHeader
        title={T("admin.nav.pages")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/design/home"
              className="inline-flex items-center rounded-control border border-line-strong bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {T("builder.designHome")}
            </Link>
            <Link href="/admin/pages/new">
              <Button icon={Plus}>{T("pages.new")}</Button>
            </Link>
          </div>
        }
      />
      <Flash
        ok={typeof params.ok === "string" ? params.ok : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />
      <Toolbar>
        <FilterTabs
          label={T("common.status")}
          tabs={[
            tab(T("ui.all"), "", all),
            tab(T("ui.statusPublished"), "published", countOf("published")),
            tab(T("ui.statusDraft"), "draft", countOf("draft")),
            tab(T("ui.statusArchived"), "archived", countOf("archived")),
          ]}
        />
        <SearchBox placeholder={T("pages.searchHint")} defaultValue={q} hidden={{ status }} />
      </Toolbar>
      <DataTable
        title={T("pages.listTitle")}
        head={[
          T("common.title"),
          T("common.status"),
          T("ui.path"),
          T("ui.updated"),
          { label: "", className: "w-48" },
        ]}
        empty={pages.length === 0 ? T("pages.none") : undefined}
      >
        {pages.map((page) => (
          <tr key={page.id} className={rowClass}>
            <td className={cellClass}>
              <Link
                className="font-medium text-ink hover:underline"
                href={`/admin/pages/${page.id}`}
              >
                {page.title}
              </Link>
              {page.isHome ? (
                <span className="ml-2 align-middle">
                  <Badge tone="success">{T("pages.homeBadge")}</Badge>
                </span>
              ) : null}
              {page.layout || page.layoutDraft ? (
                <span className="ml-2 align-middle">
                  <Badge tone="neutral">{T("builder.designed")}</Badge>
                </span>
              ) : null}
            </td>
            <td className={cellClass}>
              <StatusBadge value={page.status} label={statusLabel(T, page.status)} />
            </td>
            <td className={`${cellClass} text-ink-2`}>
              {page.isHome ? "/" : `/pages/${page.slug}`}
            </td>
            <td className={`${cellClass} whitespace-nowrap text-ink-3`}>
              {formatShortDate(page.updatedAt, locale)}
            </td>
            <td className={`${cellClass} whitespace-nowrap`}>
              <RowActions>
                <RowLink
                  href={page.isHome ? "/admin/design/home" : `/admin/pages/${page.id}/design`}
                  icon={PencilRuler}
                >
                  {T("builder.design")}
                </RowLink>
                <RowDelete
                  action={deletePageAction}
                  message={T("pages.deleteConfirm", { title: page.title })}
                  fields={{ id: page.id }}
                  label={`${T("common.delete")}: ${page.title}`}
                />
              </RowActions>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
