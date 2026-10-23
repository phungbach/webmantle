import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export const AUDIT_RETENTION_DAYS = 365;
/** Failed sign-ins, rejected installs and deletions are kept longer. */
export const AUDIT_LONG_RETENTION_DAYS = 730;

/**
 * Deletes audit entries older than `days`; entries that are failures (action ends in "-failed" or
 * "rejected") or deletions (action contains "delete" or "uninstall") wait for `failedDays`.
 * Returns the number of rows removed.
 */
export async function purgeOldAudit(
  now = new Date(),
  days = AUDIT_RETENTION_DAYS,
  failedDays = AUDIT_LONG_RETENTION_DAYS
): Promise<number> {
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const longCutoff = new Date(now.getTime() - failedDays * DAY_MS);
  const longLived = [
    { action: { endsWith: "-failed" } },
    { action: { endsWith: "rejected" } },
    { action: { contains: "delete" } },
    { action: { contains: "uninstall" } },
  ];
  const [normal, long] = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff }, NOT: { OR: longLived } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: longCutoff }, OR: longLived } }),
  ]);
  return normal.count + long.count;
}
