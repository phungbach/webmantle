import path from "node:path";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { validateThemeDirectory } from "@/lib/themes/validate";

const dir = path.resolve(process.cwd(), "themes/webcore");

describe("built-in theme webcore", () => {
  it("passes the same validation as an uploaded theme", async () => {
    const report = await validateThemeDirectory(dir);
    expect(report.errors).toEqual([]);
  });

  it("ships a home page and the guide pages, each guide screenshot present", () => {
    const pages = JSON.parse(fs.readFileSync(path.join(dir, "pages.json"), "utf8")) as {
      slug: string;
      isHome?: boolean;
      body: string;
    }[];
    expect(pages.filter((p) => p.isHome)).toHaveLength(1);
    expect(pages.map((p) => p.slug)).toEqual(
      expect.arrayContaining(["gioi-thieu", "huong-dan", "huong-dan-viet-bai"])
    );
    for (const page of pages) {
      for (const [, file] of page.body.matchAll(
        /theme-assets\/webcore\/current\/assets\/([\w-]+\.jpg)/g
      )) {
        expect(fs.existsSync(path.join(dir, "assets", file!)), `${page.slug}: ${file}`).toBe(true);
      }
    }
  });
});
