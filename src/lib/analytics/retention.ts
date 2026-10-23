import { prisma } from "@/lib/db";

export const PAGE_VIEW_RETENTION_DAYS = 90;

/** Deletes page views older than the retention window. Returns how many rows were removed. */
export async function purgeOldPageViews(
  now = new Date(),
  days = PAGE_VIEW_RETENTION_DAYS
): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.pageView.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
