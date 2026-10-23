import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemePage } from "@/components/theme/theme-page";
import { prisma } from "@/lib/db";
import { activateTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { loadThemeById } from "@/lib/themes/registry";
import { getThemeSettings } from "@/lib/themes/settings";
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

async function render(kind: "home" | "page", locale: string, templateId?: string) {
  const bundle = await loadThemeById(THEME);
  const values = await getThemeSettings(THEME, bundle.manifest.settingsSchema);
  const element = await ThemePage({
    bundle,
    values,
    ctx: {
      site: { title: "Hiên", description: "", url: "http://localhost:3000", locale },
      view: { kind, templateId, posts: [], total: 0 },
    },
  });
  return renderToStaticMarkup(element);
}

describe("recent projects on the pages", () => {
  it("the home page shows the three newest posts tagged congtrinh as cards", async () => {
    const html = await render("home", "vi");
    expect(html).toContain("Nhà phố 4 tầng, Bình Thạnh");
    expect(html).toContain("96 m² sàn");
    expect(html).toContain("Từ 1,35 tỷ");
    expect(html).toContain('href="/posts/nha-pho-4-tang-binh-thanh"');
    expect(html).toMatch(/\/theme-assets\/hien-studio\/current\/assets\/project-nha-pho\.jpg/);
    expect(html).toContain("Căn hộ hai phòng ngủ, Thảo Điền");
    expect(html).toContain("Bếp và phòng ăn mở, Quận 7");
    // The fourth project is only on the projects page.
    expect(html).not.toContain("Phòng khách thông tầng, Thủ Đức");
  });

  it("the projects page lists all six, in English on request", async () => {
    const html = await render("page", "en", "projects");
    expect(html).toContain("Four-storey townhouse, Bình Thạnh");
    expect(html).toContain("96 m² floor area");
    expect(html).toContain("Double-height living room, Thủ Đức");
    expect(html.match(/cms-mkt__course"/g)?.length).toBe(6);
  });

  it("shows a project an editor adds, and falls back to content.json when no post has the tag", async () => {
    const tag = await prisma.tag.findFirstOrThrow({ where: { slug: "congtrinh" } });
    await prisma.post.create({
      data: {
        slug: "gac-lung-quan-3",
        title: "Gác lửng, Quận 3",
        authorId: admin.id,
        status: "published",
        publishedAt: new Date(),
        fields: JSON.stringify({ type: "Nhà ống", price: "Từ 210 triệu" }),
        tags: { create: [{ tagId: tag.id }] },
      },
    });
    const withNew = await render("home", "vi");
    expect(withNew).toContain("Gác lửng, Quận 3");
    expect(withNew).toContain("Từ 210 triệu");

    await prisma.postTag.deleteMany({});
    const fallback = await render("home", "vi");
    expect(fallback).toContain("Nhà phố 4 tầng, Bình Thạnh");
    expect(fallback).toContain("assets/project-nha-pho.jpg");
    expect(fallback).not.toContain("Gác lửng");
  });
});
