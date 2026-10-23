import { requirePermission } from "@/lib/auth/session";
import { listAuditLogsForExport } from "@/lib/admin/audit";
import { parseAuditFilters } from "@/components/admin/audit-filters";

export const dynamic = "force-dynamic";

/** Neutralises spreadsheet formula injection, then quotes the field when needed. */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  try {
    await requirePermission("audit:read");
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const status = name === "UnauthorizedError" ? 401 : 403;
    return new Response(status === 401 ? "Unauthorized" : "Forbidden", { status });
  }
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { opts } = parseAuditFilters(params);
  const rows = await listAuditLogsForExport(opts);
  const lines = [["time", "actor", "action", "targetType", "targetId", "ip", "detail"]];
  for (const r of rows) {
    lines.push([
      r.createdAt.toISOString(),
      r.actorName ?? "",
      r.action,
      r.targetType,
      r.targetId,
      r.ip ?? "",
      JSON.stringify(r.detail ?? {}),
    ]);
  }
  const body = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
