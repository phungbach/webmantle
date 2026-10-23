import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getTagBySlug, getTagWithCounts, listPublishedPosts } from "@/lib/content/queries";
import { collectTagRequests, loadTagPosts } from "@/lib/themes/tag-posts";
import { activateTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { loadThemeById, templateFor } from "@/lib/themes/registry";
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

describe("project posts tagged congtrinh", () => {
  it("ships the tag and six projects with their facts", async () => {
    const tag = (await getTagWithCounts()).find((t) => t.slug === "congtrinh");
    expect(tag?.count).toBe(6);
    const listing = await listPublishedPosts({ tagSlug: "congtrinh", pageSize: 3 });
    expect(listing.total).toBe(6);
    expect(listing.items).toHaveLength(3);
    const first = listing.items[0]!;
    expect(first.fields.area).toBe("96 m² sàn");
    expect(first.fields.price).toBe("Từ 1,35 tỷ");
    expect(first.featuredImageUrl).toMatch(/^\/theme-assets\/hien-studio\/current\/assets\//);
  });

  it("gives the facts and the tag name in English on request", async () => {
    const en = await listPublishedPosts({ tagSlug: "congtrinh", locale: "en" });
    expect(en.items[0]!.fields.type).toBe("Townhouse");
    expect(en.items[0]!.fields.price).toMatch(/^From VND/);
    expect((await getTagBySlug("congtrinh", "en"))?.name).toBe("Projects");
  });

  it("is asked for by the home and projects templates, and loads the newest first", async () => {
    const bundle = await loadThemeById(THEME);
    const home = collectTagRequests(templateFor(bundle, "home"));
    expect(home).toEqual([{ tag: "congtrinh", limit: 3 }]);
    const projects = collectTagRequests(templateFor(bundle, "page", "projects"));
    expect(projects).toEqual([{ tag: "congtrinh", limit: 24 }]);

    const loaded = await loadTagPosts(home, "vi");
    expect(loaded.congtrinh!.map((p) => p.title)).toEqual([
      "Nhà phố 4 tầng, Bình Thạnh",
      "Căn hộ hai phòng ngủ, Thảo Điền",
      "Bếp và phòng ăn mở, Quận 7",
    ]);
  });

  it("picks up a project an editor adds, with the facts typed in the editor", async () => {
    const tag = await prisma.tag.findFirstOrThrow({ where: { slug: "congtrinh" } });
    const post = await prisma.post.create({
      data: {
        slug: "gac-lung-quan-3",
        title: "Gác lửng, Quận 3",
        authorId: admin.id,
        status: "published",
        publishedAt: new Date(),
        fields: JSON.stringify({ type: "Nhà ống", area: "38 m² sàn", price: "Từ 210 triệu" }),
        tags: { create: [{ tagId: tag.id }] },
      },
    });
    const loaded = await loadTagPosts([{ tag: "congtrinh", limit: 3 }], "vi");
    expect(loaded.congtrinh![0]!.id).toBe(post.id);
    expect(loaded.congtrinh![0]!.fields).toEqual({
      type: "Nhà ống",
      area: "38 m² sàn",
      price: "Từ 210 triệu",
    });
  });
});
