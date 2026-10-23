import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeFrame } from "@/components/theme/theme-frame";
import { installThemeDirectory } from "@/lib/themes/install";
import { loadBundle, getInstalledTheme } from "@/lib/themes/registry";
import { getThemeSettings } from "@/lib/themes/settings";
import { checkThemeContent } from "@/lib/themes/content-schemas";
import { ROOT, createUser, installBuiltIns, resetDatabase } from "../helpers/db";

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  await createUser("admin");
  await installThemeDirectory(path.join(ROOT, "themes", "english-center"), null);
});

async function render(kind: "home" | "archive" | "not-found" | "page", templateId?: string) {
  const row = (await getInstalledTheme("english-center"))!;
  const bundle = loadBundle("english-center", row.path);
  const values = await getThemeSettings("english-center", bundle.manifest.settingsSchema);
  return renderToStaticMarkup(
    <ThemeFrame
      bundle={bundle}
      values={values}
      ctx={{
        site: {
          title: "Trung tâm",
          description: "",
          url: "http://localhost",
          locale: "vi",
          logoUrl: null,
        } as never,
        view: { kind, templateId, posts: [], total: 0, title: "Tất cả bài viết" },
        preview: false,
      }}
    />
  );
}

// The version in the asset addresses follows the theme, so a version bump does not break this test.
const version = (
  JSON.parse(
    fs.readFileSync(path.join(ROOT, "themes", "english-center", "theme.json"), "utf8")
  ) as {
    version: string;
  }
).version;

describe("english-center theme", () => {
  it("ships content that passes the content check", async () => {
    const content = JSON.parse(
      (await import("node:fs")).readFileSync(
        path.join(ROOT, "themes", "english-center", "content.json"),
        "utf8"
      )
    );
    expect(checkThemeContent(content)).toEqual([]);
  });

  it("the home page opens with a hero and shows courses, features and teachers", async () => {
    const html = await render("home");
    expect(html).toContain("cms-header--mega");
    expect(html).toContain("cms-mkt--promo");
    expect(html).toContain("Học tiếng Anh đúng trình độ");
    expect(html).toContain("Luyện thi IELTS");
    expect(html).toContain("cms-mkt--courses");
    expect(html).toContain("cms-mkt--team");
    expect(html).not.toContain("cms-mkt--pricing");
  });

  it("the course, pricing and about pages use their own templates", async () => {
    const courses = await render("page", "courses");
    expect(courses).toContain("Chọn khoá học theo mục tiêu");
    expect(courses).toContain("cms-mkt--courses");

    const pricing = await render("page", "pricing");
    expect(pricing).toContain("Học phí minh bạch");
    expect(pricing).toContain("cms-mkt--pricing");

    const about = await render("page", "about");
    expect(about).toContain("Chúng tôi dạy tiếng Anh");
    expect(about).toContain("cms-mkt--team");
    expect(about).toContain("cms-mkt--stats");
  });

  it("every image named in content.json exists in the theme's assets folder", () => {
    const dir = path.join(ROOT, "themes", "english-center");
    const content = JSON.parse(fs.readFileSync(path.join(dir, "content.json"), "utf8"));
    const files: string[] = [];
    const collect = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") {
        for (const [key, v] of Object.entries(value)) {
          if (key === "image" && typeof v === "string") files.push(v);
          else collect(v);
        }
      }
    };
    collect(content);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(fs.existsSync(path.join(dir, file))).toBe(true);
  });

  it("course cards and the hero use the theme's images, and feature items show icons", async () => {
    const html = await render("home");
    expect(html).toContain(`/theme-assets/english-center/${version}/assets/hero.png`);
    expect(html).toContain(`/theme-assets/english-center/${version}/assets/course-ielts.png`);
    expect(html).toContain("cms-mkt__icon");
  });

  it("sections carry their background tone so the page alternates colour bands", async () => {
    const html = await render("home");
    expect(html).toContain("cms-section--tone-dark");
    expect(html).toContain("cms-section--tone-tint");
    expect(html).toContain("cms-section--tone-accent");
  });

  it("the stats setting is exposed on the theme root", async () => {
    const html = await render("home");
    expect(html).toContain('data-setting-show-stats="true"');
  });

  it("archive and not-found pages render with the same header and footer", async () => {
    const archive = await render("archive");
    expect(archive).toContain("Tất cả bài viết");
    expect(archive).toContain("cms-footer");
    const missing = await render("not-found");
    expect(missing).toContain("Ôi, trang này lạc đường rồi");
    expect(missing).toContain("cms-search");
  });
});
