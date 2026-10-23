import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Builds a clean migrated database for the whole test run. The database lives in data/test and is
// never the development database.
export default function setup() {
  const dir = path.resolve(__dirname, "..", "data", "test");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `file:${path.join(dir, "cms.db")}` },
  });
}
