import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getPublishedPage } from "@/lib/content/queries";
import { activateTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { contentFor, loadBundle, getInstalledTheme } from "@/lib/themes/registry";
import { createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";

const THEME = "hien-studio";
let admin: { id: string };

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
  await installThemeDirectory(themeDir(THEME), admin.id);
  await activateTheme(THEME, admin.id);
});

async function bundle() {
  const row = (await getInstalledTheme(THEME))!;
  return loadBundle(THEME, row.path);
}

describe("a theme that can switch to English", () => {
  it("lays content.en.json over content.json block by block", async () => {
    const b = await bundle();
    const vi = contentFor(b, "vi") as { hero: { title: string }; stats: unknown[] };
    const en = contentFor(b, "en") as { hero: { title: string }; stats: unknown[] };
    expect(vi.hero.title).toMatch(/Thiết kế/);
    expect(en.hero.title).toBe("Interior design that fits the way you live");
    expect(en.stats).toHaveLength(vi.stats.length);
    // A language without a file falls back to the base content.
    expect(contentFor(b, "fr")).toBe(b.content);
  });

  it("serves a page in English when the theme ships a translation, and Vietnamese otherwise", async () => {
    const vi = await getPublishedPage("cong-trinh", "vi");
    const en = await getPublishedPage("cong-trinh", "en");
    expect(vi?.title).toBe("Công trình");
    expect(en?.title).toBe("Projects");
    expect(en?.bodyHtml).toContain("designed and built by the studio");
    expect((await getPublishedPage("cong-trinh", "fr"))?.title).toBe("Công trình");
    // An editor's own page has no translation and keeps its text in every language.
    await prisma.page.create({
      data: {
        slug: "ghi-chu",
        title: "Ghi chú",
        body: "<p>x</p>",
        status: "published",
        authorId: admin.id,
      },
    });
    expect((await getPublishedPage("ghi-chu", "en"))?.title).toBe("Ghi chú");
  });

  it("checks the language files like content.json", async () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "hien-"));
    fs.cpSync(themeDir(THEME), copy, { recursive: true });
    fs.writeFileSync(
      path.join(copy, "content.en.json"),
      JSON.stringify({ heroprojects: { title: "x" } })
    );
    const manifestPath = path.join(copy, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.version = "9.1.0";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await expect(installThemeDirectory(copy, admin.id)).rejects.toMatchObject({ code: "invalid" });
  });

  it("keeps every English block in step with the Vietnamese ones", async () => {
    const b = await bundle();
    const en = b.contentByLocale.en!;
    for (const key of Object.keys(en))
      expect(b.content, `content.json lacks "${key}"`).toHaveProperty(key);
    for (const key of Object.keys(b.content))
      expect(en, `content.en.json lacks "${key}"`).toHaveProperty(key);
  });
});
