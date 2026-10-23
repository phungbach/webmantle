import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  Button,
  DataTable,
  FilterTabs,
  Flash,
  Pager,
  SearchBox,
  StatusBadge,
  Toolbar,
  cellClass,
  rowClass,
  RowActions,
  RowDelete,
  RowLink,
} from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { deletePostAction } from "@/app/admin/actions/content";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { pageParam, queryParam } from "@/lib/http";
import { formatShortDate } from "@/lib/format";
import { listHref, pick } from "@/lib/admin/list";
import { statusLabel } from "@/lib/admin/labels";
import { getLocale } from "@/lib/i18n/server";
import { intlLocale, tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const STATUSES = ["published", "draft", "archived"] as const;

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  const q = queryParam(params.q);
  const status = pick(params.status, STATUSES);
  const page = pageParam(params.page);
  const user = await getCurrentUser();
  const scope = {
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { slug: { contains: q } },
            { author: { name: { contains: q } } },
          ],
        }
      : {}),
    // Authors see only their own posts.
    ...(user?.role === "author" ? { authorId: user.id } : {}),
  };
  const where = { ...scope, ...(status ? { status } : {}) };
  const [total, posts, grouped] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: { author: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.post.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Total recorded views for the posts shown on this page.
  const viewRows = posts.length
    ? await prisma.pageView.groupBy({
        by: ["postId"],
        where: { postId: { in: posts.map((p) => p.id) } },
        _count: { _all: true },
      })
    : [];
  const viewsById = new Map(viewRows.map((row) => [row.postId, row._count._all]));
  const numberFormat = new Intl.NumberFormat(intlLocale(locale));
  const countOf = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const all = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const tab = (label: string, value: string, count: number) => ({
    label,
    count,
    href: listHref("/admin/posts", { q, status: value }),
    active: status === value,
  });

  return (
    <>
      <PageHeader
        title={T("posts.title")}
        action={
          <Link href="/admin/posts/new">
            <Button icon={Plus}>{T("posts.new")}</Button>
          </Link>
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
        <SearchBox placeholder={T("posts.searchHint")} defaultValue={q} hidden={{ status }} />
      </Toolbar>
      <DataTable
        title={T("posts.listTitle")}
        head={[
          T("common.title"),
          T("posts.views"),
          T("common.status"),
          T("common.author"),
          T("ui.updated"),
          { label: "", className: "w-20" },
        ]}
        empty={posts.length === 0 ? T("posts.none") : undefined}
      >
        {posts.map((post) => {
          const scheduled =
            post.status === "published" && post.publishedAt && post.publishedAt > new Date();
          const canDelete = user && (user.role !== "author" || can(user.role, "content:write-own"));
          return (
            <tr key={post.id} className={rowClass}>
              <td className={cellClass}>
                <Link
                  className="font-medium text-ink hover:underline"
                  href={`/admin/posts/${post.id}`}
                >
                  {post.title}
                </Link>
                <div className="text-xs text-ink-3">/posts/{post.slug}</div>
              </td>
              <td className={`${cellClass} tabular-nums text-ink-2`}>
                {numberFormat.format(viewsById.get(post.id) ?? 0)}
              </td>
              <td className={cellClass}>
                <StatusBadge
                  value={scheduled ? "draft" : post.status}
                  label={scheduled ? T("common.scheduled") : statusLabel(T, post.status)}
                />
                {post.featured ? (
                  <span className="ml-2 text-xs text-warning-600">{T("common.featured")}</span>
                ) : null}
              </td>
              <td className={`${cellClass} text-ink-2`}>{post.author.name}</td>
              <td className={`${cellClass} whitespace-nowrap text-ink-3`}>
                {formatShortDate(post.updatedAt, locale)}
              </td>
              <td className={cellClass}>
                <RowActions>
                  <RowLink href={`/admin/posts/${post.id}`} icon={Pencil}>
                    {T("common.edit")}
                  </RowLink>
                  {canDelete ? (
                    <RowDelete
                      action={deletePostAction}
                      message={T("posts.deleteConfirm", { title: post.title })}
                      fields={{ id: post.id }}
                      label={`${T("posts.delete")}: ${post.title}`}
                    />
                  ) : null}
                </RowActions>
              </td>
            </tr>
          );
        })}
      </DataTable>
      <Pager
        basePath="/admin/posts"
        page={page}
        totalPages={totalPages}
        query={{ q, status }}
        labels={{
          previous: T("common.previous"),
          next: T("common.next"),
          pageOf: T("common.pageOf", { page, total: totalPages }),
          label: T("common.pagination"),
        }}
      />
    </>
  );
}
