import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tmpDir(prefix = "cms-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function copyDir(src: string, dest: string) {
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}
