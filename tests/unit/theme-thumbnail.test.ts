import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateThemeDirectory } from "@/lib/themes/validate";
import { LIMITS } from "@/lib/themes/contract";
import { copyDir, tmpDir } from "../helpers/tmp";
import { ROOT, themeDir } from "../helpers/db";

const dirs: string[] = [];
function fresh(source = "starter"): string {
  const dir = copyDir(themeDir(source), path.join(tmpDir("theme-"), "t"));
  dirs.push(path.dirname(dir));
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function setThumbnail(dir: string, value: unknown) {
  const file = path.join(dir, "theme.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.thumbnail = value;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}
const codes = (dir: string) =>
  validateThemeDirectory(dir).errors.map((e) => `${e.code}:${e.file ?? ""}`);

describe("theme thumbnail", () => {
  it("every bundled theme has its own picture inside the size limit", () => {
    const ids = fs
      .readdirSync(path.join(ROOT, "themes"))
      .filter((id) => fs.existsSync(path.join(ROOT, "themes", id, "theme.json")));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const sizes = new Set<number>();
    for (const id of ids) {
      const dir = themeDir(id);
      const report = validateThemeDirectory(dir);
      expect(report.errors, id).toEqual([]);
      const thumbnail = report.manifest?.thumbnail;
      expect(thumbnail, id).toMatch(/^assets\/.+\.(jpg|png|webp)$/);
      const size = fs.statSync(path.join(dir, thumbnail!)).size;
      expect(size).toBeLessThanOrEqual(LIMITS.thumbnailBytes);
      sizes.add(size);
    }
    // Different pictures, not one image copied around.
    expect(sizes.size).toBe(ids.length);
  });

  it("accepts a theme that names a picture it contains", () => {
    const dir = fresh();
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dir, "assets", "cover.png"), Buffer.alloc(2000, 1));
    setThumbnail(dir, "assets/cover.png");
    expect(codes(dir)).toEqual([]);
  });

  it("rejects a thumbnail that is not in the theme", () => {
    const dir = fresh();
    setThumbnail(dir, "assets/missing.jpg");
    expect(codes(dir)).toContain("missing-thumbnail:assets/missing.jpg");
  });

  it("rejects a thumbnail over the size limit", () => {
    const dir = fresh();
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "assets", "big.jpg"),
      Buffer.alloc(LIMITS.thumbnailBytes + 1, 1)
    );
    setThumbnail(dir, "assets/big.jpg");
    expect(codes(dir)).toContain("thumbnail-size:assets/big.jpg");
  });

  it("rejects a path outside assets/ or a type that is not a picture", () => {
    for (const bad of [
      "../x.jpg",
      "theme.json",
      "assets/font.woff2",
      "assets/a/b.jpg",
      "https://x/y.jpg",
      5,
    ]) {
      const dir = fresh();
      setThumbnail(dir, bad);
      expect(
        codes(dir).some((c) => c.startsWith("manifest")),
        String(bad)
      ).toBe(true);
    }
  });
});
