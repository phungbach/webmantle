import { queryParam } from "@/lib/http";
import { pick } from "@/lib/admin/list";
import type { AuditGroup } from "@/lib/admin/audit";

export const AUDIT_GROUPS = [
  "auth",
  "content",
  "appearance",
  "system",
  "users",
  "failed",
] as const satisfies readonly AuditGroup[];

export type AuditFilterParams = Record<string, string | string[] | undefined>;

/** Reads a YYYY-MM-DD date; anything else is ignored. `endOfDay` makes the bound inclusive. */
function parseDay(raw: string, endOfDay: boolean): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = endOfDay
    ? new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999))
    : new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== mo - 1) return undefined;
  return date;
}

/** Filters shared by the audit page and its CSV export, read from the query string. */
export function parseAuditFilters(params: AuditFilterParams) {
  const q = queryParam(params.q);
  const group = pick(queryParam(params.group), AUDIT_GROUPS);
  const actor = queryParam(params.actor, 64);
  const fromRaw = queryParam(params.from, 10);
  const toRaw = queryParam(params.to, 10);
  const from = parseDay(fromRaw, false);
  const to = parseDay(toRaw, true);
  return {
    q,
    group,
    actor,
    from: from ? fromRaw : "",
    to: to ? toRaw : "",
    opts: {
      q: q || undefined,
      group: group || undefined,
      actorId: actor || undefined,
      from,
      to,
    },
  };
}
