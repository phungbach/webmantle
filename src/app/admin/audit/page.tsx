import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Badge,
  Card,
  DataTable,
  FilterTabs,
  SearchBox,
  Toolbar,
  cellClass,
  rowClass,
  type Tone,
} from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { AUDIT_GROUPS, parseAuditFilters } from "@/components/admin/audit-filters";
import { getCurrentUser } from "@/lib/auth/session";
import { isReadOnlyRole, maskPrivate } from "@/lib/redact";
import { canView } from "@/lib/auth/permissions";
import { queryParam } from "@/lib/http";
import { formatWhen } from "@/lib/format";
import { listHref } from "@/lib/admin/list";
import { listAuditLogs, type AuditGroup } from "@/lib/admin/audit";
import { auditActionLabel, auditKind, type AuditKind } from "@/lib/admin/labels";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<AuditKind, Tone> = {
  login: "success",
  edit: "success",
  config: "warning",
  delete: "neutral",
};

const GROUP_KEY = {
  auth: "audit.groupAuth",
  content: "audit.groupContent",
  appearance: "audit.groupAppearance",
  system: "audit.groupSystem",
  users: "audit.groupUsers",
  failed: "audit.groupFailed",
} as const satisfies Record<AuditGroup, string>;

const fieldClass =
  "rounded-control border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

function display(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !canView(user.role, "audit:read")) redirect("/admin");
  const params = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  const f = parseAuditFilters(params);
  const requestedPage = Math.max(1, Number.parseInt(queryParam(params.page, 6), 10) || 1);
  const result = await listAuditLogs({ ...f.opts, page: requestedPage, pageSize: 50 });

  const base = { q: f.q, group: f.group, actor: f.actor, from: f.from, to: f.to };
  const href = (extra: Record<string, string | undefined>) =>
    listHref("/admin/audit", { ...base, ...extra });
  const tab = (label: string, group: string, count: number) => ({
    label,
    count,
    href: listHref("/admin/audit", { ...base, group, page: undefined }),
    active: f.group === group,
  });
  const total = AUDIT_GROUPS.reduce((sum, g) => sum + (result.counts[g] ?? 0), 0);
  const kindLabel: Record<AuditKind, string> = {
    login: T("audit.kindLogin"),
    edit: T("audit.kindEdit"),
    config: T("audit.kindConfig"),
    delete: T("audit.kindDelete"),
  };
  const actorName = (id: string | null, name: string | null) =>
    id ? (name ?? T("audit.removedUser")) : T("audit.anonymous");
  // The demo account is open to anyone: emails and addresses are masked for it.
  const hide = isReadOnlyRole(user.role);
  const priv = (text: string) => (hide ? maskPrivate(text) : text);
  const exportHref = listHref("/admin/audit/export", base);

  return (
    <>
      <PageHeader
        title={T("audit.title")}
        action={
          <a
            href={exportHref}
            className="inline-flex items-center rounded-control border border-line-strong bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            {T("audit.exportCsv")}
          </a>
        }
      />
      <Toolbar>
        <FilterTabs
          label={T("ui.type")}
          tabs={[
            tab(T("ui.all"), "", total),
            ...AUDIT_GROUPS.map((g) => tab(T(GROUP_KEY[g]), g, result.counts[g] ?? 0)),
          ]}
        />
        <SearchBox
          placeholder={T("audit.searchHint")}
          defaultValue={f.q}
          hidden={{ group: f.group, actor: f.actor, from: f.from, to: f.to }}
        />
      </Toolbar>
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        {f.q ? <input type="hidden" name="q" value={f.q} /> : null}
        {f.group ? <input type="hidden" name="group" value={f.group} /> : null}
        <label className="text-xs font-medium text-ink-2">
          {T("audit.filterActor")}
          <select name="actor" defaultValue={f.actor} className={`${fieldClass} mt-1 block`}>
            <option value="">{T("audit.filterAllActors")}</option>
            {result.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-2">
          {T("audit.filterFrom")}
          <input
            type="date"
            name="from"
            defaultValue={f.from}
            className={`${fieldClass} mt-1 block`}
          />
        </label>
        <label className="text-xs font-medium text-ink-2">
          {T("audit.filterTo")}
          <input type="date" name="to" defaultValue={f.to} className={`${fieldClass} mt-1 block`} />
        </label>
        <button
          type="submit"
          className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          {T("common.filter")}
        </button>
      </form>
      <DataTable
        title={T("audit.listTitle")}
        head={[T("audit.action"), T("ui.type"), T("audit.actor"), T("audit.time")]}
        empty={result.rows.length === 0 ? T("audit.none") : undefined}
      >
        {result.rows.map((r) => {
          const kind = auditKind(r.action);
          const label = auditActionLabel(T, r.action);
          const changed = Array.isArray(r.detail.changed) ? r.detail.changed : [];
          const entries = Object.entries(r.detail).filter(([key]) => key !== "changed");
          return (
            <tr key={r.id} className={rowClass}>
              <td className={cellClass}>
                <details className="group">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    {label}
                    {label !== r.action ? (
                      <span className="block text-xs font-normal text-ink-3">{r.action}</span>
                    ) : null}
                  </summary>
                  <div className="mt-3 rounded-control border border-line bg-canvas p-3 text-xs">
                    <p className="mb-2 font-semibold text-ink">{T("audit.detailTitle")}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                      <dt className="text-ink-3">{T("audit.actor")}</dt>
                      <dd>{actorName(r.actorId, r.actorName)}</dd>
                      <dt className="text-ink-3">{T("audit.time")}</dt>
                      <dd>{r.createdAt.toISOString()}</dd>
                      <dt className="text-ink-3">{T("audit.target")}</dt>
                      <dd className="break-all">
                        {r.targetType} {priv(r.targetId)}
                        {r.targetHref ? (
                          <>
                            {" "}
                            <Link
                              href={r.targetHref}
                              className="font-medium text-brand-600 hover:underline"
                            >
                              {T("audit.openTarget")}
                            </Link>
                          </>
                        ) : null}
                      </dd>
                      <dt className="text-ink-3">{T("audit.ip")}</dt>
                      <dd>{hide ? "•••" : (r.ip ?? "-")}</dd>
                      <dt className="text-ink-3">{T("audit.userAgent")}</dt>
                      <dd className="break-all">{hide ? "•••" : (r.userAgent ?? "-")}</dd>
                      <dt className="text-ink-3">{T("audit.changes")}</dt>
                      <dd>
                        {changed.length === 0 && entries.length === 0 ? (
                          <span className="text-ink-3">{T("audit.noChanges")}</span>
                        ) : null}
                        {changed.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {changed.map((c, i) => (
                              <span
                                key={`${display(c)}-${i}`}
                                className="rounded-full bg-subtle px-2 py-0.5 text-ink-2"
                              >
                                {display(c)}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {entries.length > 0 ? (
                          <span className="mt-1 block space-y-0.5">
                            {entries.map(([key, value]) => (
                              <span key={key} className="block break-all">
                                <span className="text-ink-3">{key}:</span> {priv(display(value))}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </dd>
                    </dl>
                  </div>
                </details>
                <div className="max-w-md truncate text-xs text-ink-3">
                  {r.targetHref ? (
                    <Link href={r.targetHref} className="text-brand-600 hover:underline">
                      {r.targetType} {priv(r.targetId).slice(0, 16)}
                    </Link>
                  ) : (
                    <>
                      {r.targetType} {priv(r.targetId).slice(0, 16)}
                    </>
                  )}
                </div>
              </td>
              <td className={cellClass}>
                <Badge tone={KIND_TONE[kind]}>{kindLabel[kind]}</Badge>
              </td>
              <td className={`${cellClass} text-ink-2`}>{actorName(r.actorId, r.actorName)}</td>
              <td className={`${cellClass} whitespace-nowrap text-ink-3`}>
                {formatWhen(r.createdAt, locale)}
              </td>
            </tr>
          );
        })}
      </DataTable>
      {result.pageCount > 1 ? (
        <Card className="mt-4">
          <nav
            aria-label={T("audit.pageOf", { page: result.page, pages: result.pageCount })}
            className="flex items-center justify-between text-sm"
          >
            {result.page > 1 ? (
              <Link
                href={href({ page: String(result.page - 1) })}
                className="font-medium text-brand-600 hover:underline"
              >
                {T("audit.prev")}
              </Link>
            ) : (
              <span className="text-ink-3">{T("audit.prev")}</span>
            )}
            <span className="text-ink-2">
              {T("audit.pageOf", { page: result.page, pages: result.pageCount })}
            </span>
            {result.page < result.pageCount ? (
              <Link
                href={href({ page: String(result.page + 1) })}
                className="font-medium text-brand-600 hover:underline"
              >
                {T("audit.next")}
              </Link>
            ) : (
              <span className="text-ink-3">{T("audit.next")}</span>
            )}
          </nav>
        </Card>
      ) : null}
    </>
  );
}
