/**
 * Consistent backup of the database, media and installed themes.
 *
 * The database is copied with SQLite's VACUUM INTO, which reads a consistent snapshot even while the
 * app is writing. Copying cms.db with cp can produce a corrupt backup under load; do not do that.
 *
 * Usage: npm run db:backup            -> data/backups/<timestamp>/
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { DATA_DIR, MEDIA_DIR, THEMES_DIR } from "../src/lib/env";

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function copyDir(src: string, dest: string, files: string[]) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => !path.basename(p).startsWith(".staging-"),
  });
  for (const f of listFiles(dest)) files.push(path.relative(path.dirname(dest), f));
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]
    );
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(DATA_DIR, "backups", stamp);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });

  const dbCopy = path.join(target, "cms.db");
  // VACUUM INTO refuses to overwrite and takes a read snapshot; the path is generated here, not user input.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${dbCopy.replace(/'/g, "''")}'`);

  const files: string[] = [];
  copyDir(MEDIA_DIR, path.join(target, "media"), files);
  copyDir(THEMES_DIR, path.join(target, "themes"), files);

  const checksums: Record<string, string> = { "cms.db": sha256(dbCopy) };
  for (const f of listFiles(path.join(target, "media")).concat(
    listFiles(path.join(target, "themes"))
  )) {
    checksums[path.relative(target, f)] = sha256(f);
  }
  fs.writeFileSync(
    path.join(target, "MANIFEST.json"),
    JSON.stringify({ createdAt: new Date().toISOString(), files: checksums }, null, 2)
  );
  console.log(`Backup written to ${target} (${Object.keys(checksums).length} files)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
