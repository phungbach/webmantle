import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  FilterTabs,
  Flash,
  SearchBox,
  Toolbar,
  cellClass,
  rowClass,
  type Tone,
  RowActions,
  RowDelete,
} from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { createUserAction, deleteUserAction } from "@/app/admin/actions/content";
import { getCurrentUser } from "@/lib/auth/session";
import { can, canView } from "@/lib/auth/permissions";
import { queryParam } from "@/lib/http";
import { maskPrivate } from "@/lib/redact";
import { formatWhen } from "@/lib/format";
import { listHref, pick } from "@/lib/admin/list";
import { getLocale } from "@/lib/i18n/server";
import { t, tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";
const ROLES = ["admin", "editor", "author", "viewer"] as const;
const ROLE_TONE: Record<string, Tone> = {
  admin: "success",
  editor: "success",
  author: "warning",
  viewer: "neutral",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !canView(user.role, "users:manage")) redirect("/admin");
  const readOnly = !can(user.role, "users:manage");
  const params = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  const q = queryParam(params.q);
  const role = pick(params.role, ROLES);
  const scope = q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {};
  const [users, grouped] = await Promise.all([
    prisma.user.findMany({
      where: { ...scope, ...(role ? { role } : {}) },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.user.groupBy({ by: ["role"], where: scope, _count: { _all: true } }),
  ]);
  const countOf = (r: string) => grouped.find((g) => g.role === r)?._count._all ?? 0;
  const all = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const tab = (label: string, value: string, count: number) => ({
    label,
    count,
    href: listHref("/admin/users", { q, role: value }),
    active: role === value,
  });

  return (
    <>
      <PageHeader
        title={T("users.title")}
        action={
          readOnly ? undefined : (
            <Link href="/admin/users?new=1">
              <Button icon={Plus}>{T("users.add")}</Button>
            </Link>
          )
        }
      />
      <Flash ok={params.ok} error={params.error} />

      {params.new && !readOnly ? (
        <Card className="mb-6 max-w-xl">
          <h2 className="mb-3 text-base font-semibold text-ink">{T("users.add")}</h2>
          <form action={createUserAction} className="space-y-4">
            <Field label={T("common.name")} name="name" required maxLength={100} />
            <Field label={T("login.email")} name="email" type="email" required maxLength={254} />
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink">{T("users.role")}</span>
              <select
                name="role"
                defaultValue="author"
                className="w-full rounded-control border border-line-strong bg-white px-3 py-2 text-sm text-ink"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(locale, `admin.role.${r}` as "admin.role.admin")}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={T("users.tempPassword")}
              name="password"
              type="password"
              required
              hint={T("users.tempPasswordHint")}
            />
            <div className="flex gap-2">
              <Button>{T("users.create")}</Button>
              <Link href="/admin/users">
                <Button variant="secondary" type="button">
                  {T("common.cancel")}
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      ) : null}

      <Toolbar>
        <FilterTabs
          label={T("users.role")}
          tabs={[
            tab(T("ui.all"), "", all),
            tab(T("users.tabAdmin"), "admin", countOf("admin")),
            tab(T("users.tabEditor"), "editor", countOf("editor")),
            tab(T("users.tabAuthor"), "author", countOf("author")),
            tab(T("users.tabViewer"), "viewer", countOf("viewer")),
          ]}
        />
        <SearchBox placeholder={T("users.searchHint")} defaultValue={q} hidden={{ role }} />
      </Toolbar>
      <DataTable
        title={T("users.listTitle")}
        head={[
          T("common.name"),
          T("users.role"),
          T("users.email"),
          T("users.lastLogin"),
          { label: "", className: "w-20" },
        ]}
        empty={users.length === 0 ? T("users.none") : undefined}
      >
        {users.map((u) => (
          <tr key={u.id} className={rowClass}>
            <td className={`${cellClass} font-medium`}>{u.name}</td>
            <td className={cellClass}>
              <Badge tone={ROLE_TONE[u.role] ?? "neutral"}>
                {T(`admin.role.${u.role}` as "admin.role.admin")}
              </Badge>
            </td>
            <td className={`${cellClass} text-ink-2`}>
              {readOnly ? maskPrivate(u.email) : u.email}
            </td>
            <td className={`${cellClass} whitespace-nowrap text-ink-3`}>
              {u.sessions[0]
                ? formatWhen(u.sessions[0].createdAt, locale)
                : T("users.neverSignedIn")}
            </td>
            <td className={cellClass}>
              <RowActions>
                {readOnly ? null : u.id !== user.id ? (
                  <RowDelete
                    action={deleteUserAction}
                    message={T("users.deleteConfirm", { email: u.email })}
                    fields={{ id: u.id }}
                    label={`${T("common.delete")}: ${u.email}`}
                  />
                ) : (
                  <span className="text-xs text-ink-3">{T("users.you")}</span>
                )}
              </RowActions>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
