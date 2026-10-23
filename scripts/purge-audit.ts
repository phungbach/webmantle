/**
 * Deletes audit log entries past their retention (365 days; 730 for failures and deletions).
 * Run by hand or from an external scheduler: npm run audit:purge
 */
import { prisma } from "../src/lib/db";
import {
  AUDIT_LONG_RETENTION_DAYS,
  AUDIT_RETENTION_DAYS,
  purgeOldAudit,
} from "../src/lib/audit-retention";

async function main() {
  const removed = await purgeOldAudit();
  console.log(
    `Removed ${removed} audit entries (older than ${AUDIT_RETENTION_DAYS} days, or ${AUDIT_LONG_RETENTION_DAYS} for failures and deletions).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
