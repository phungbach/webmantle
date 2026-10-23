/**
 * Prepares a clean database for the Playwright run: migrate, then seed the admin and built-in themes.
 * Runs with the e2e environment set by playwright.config.ts. Never touches data/cms.db.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), "data", "e2e");
if (!process.env.CMS_DATA_DIR || path.resolve(process.env.CMS_DATA_DIR) !== dir) {
  throw new Error("e2e-prepare must run with CMS_DATA_DIR set to data/e2e");
}
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });
execSync("npx tsx prisma/seed-english-center.ts", { stdio: "inherit", env: process.env });
// The end-to-end tests switch between the stock themes, which live in tests/fixtures/themes.
execSync("npx tsx scripts/e2e-fixture-themes.ts", { stdio: "inherit", env: process.env });
