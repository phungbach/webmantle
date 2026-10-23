import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildZip, zipDirectory } from "../helpers/zip-builder";

export const ADMIN = { email: "e2e-admin@example.com", password: "e2e-admin-password-123" };

/** A ZIP that is missing required files and contains a script. Used to show validation feedback. */
export function hostileThemeZip(): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-bad-")), "bad-theme.zip");
  fs.writeFileSync(
    file,
    buildZip([
      { name: "theme.json", data: Buffer.from('{"id":"bad-theme"}') },
      { name: "templates/evil.js", data: Buffer.from("process.exit(1)") },
    ])
  );
  return file;
}

/** A valid copy of the starter theme under a new id, so upload succeeds in a clean database. */
export function uploadableThemeZip(id: string): string {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-theme-"));
  fs.cpSync(path.resolve(__dirname, "..", "fixtures", "themes", "starter"), src, {
    recursive: true,
  });
  const manifestPath = path.join(src, "theme.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.id = id;
  manifest.name = "Uploaded E2E Theme";
  manifest.version = "1.0.0";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-zip-")), `${id}.zip`);
  fs.writeFileSync(file, zipDirectory(src));
  return file;
}

/** A small PNG file (signature and size only) saved to a temp folder, for upload tests. */
export function smallPngFile(): string {
  const png = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(4, 16);
  png.writeUInt32BE(4, 20);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-img-")), "photo.png");
  fs.writeFileSync(file, png);
  return file;
}
