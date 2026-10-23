import { prisma } from "@/lib/db";
import { trustProxy } from "@/lib/auth/client-ip";

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown>;
  /** Client address (first x-forwarded-for hop). Use requestMeta() inside a request. */
  ip?: string | null;
  /** Browser identification; stored truncated to 200 characters. */
  userAgent?: string | null;
};

export const AUDIT_USER_AGENT_MAX = 200;

/**
 * Address and browser of the current request, for auth events. Returns empty values outside a
 * request (scripts, tests). Behind a reverse proxy, configure it to set x-forwarded-for.
 */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    // Only trusted when a proxy we control sets the header; otherwise it is client-controlled.
    const ip = trustProxy()
      ? (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim().slice(0, 64) || null
      : null;
    const userAgent = h.get("user-agent")?.slice(0, AUDIT_USER_AGENT_MAX) || null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/** Names of the fields whose value differs between `before` and `after`. */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<Record<keyof T, unknown>>
): string[] {
  return Object.keys(after).filter((key) => {
    const a = before[key];
    const b = after[key as keyof T];
    if (a instanceof Date && b instanceof Date) return a.getTime() !== b.getTime();
    return a !== b;
  });
}

/** Records an administrative action. Detail must never contain passwords, tokens or file paths. */
export async function audit(entry: AuditEntry) {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      detail: JSON.stringify(entry.detail ?? {}),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, AUDIT_USER_AGENT_MAX) : null,
    },
  });
}
