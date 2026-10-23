/**
 * Deletes PageView rows older than 90 days. Run by hand or from an external scheduler (cron):
 *   npx tsx scripts/purge-page-views.ts
 */
import { prisma } from "../src/lib/db";
import { PAGE_VIEW_RETENTION_DAYS, purgeOldPageViews } from "../src/lib/analytics/retention";

async function main() {
  const removed = await purgeOldPageViews();
  console.log(`Removed ${removed} page views older than ${PAGE_VIEW_RETENTION_DAYS} days.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
