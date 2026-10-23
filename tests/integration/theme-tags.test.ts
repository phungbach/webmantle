import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getPublishedPostDetail, getTagBySlug, getTagWithCounts } from "@/lib/content/queries";
import { activateTheme, uninstallTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";

const THEME = "hien-studio";
let admin: { id: string };

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
});

type TagEntry = { slug: string; name: string; translations?: Record<string, { name: string }> };

/** A copy of the sample theme with its own tags.json and tags on the first two posts. */
function themeCopy(version: string, tags: TagEntry[], postTags: string[][]): string {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "hien-tags-"));
  fs.cpSync(themeDir(THEME), copy, { recursive: true });
  fs.writeFileSync(path.join(copy, "tags.json"), JSON.stringify(tags));
  const postsFile = path.join(copy, "posts.json");
  const posts = JSON.parse(fs.readFileSync(postsFile, "utf8")) as { tags?: string[] }[];
  posts.forEach((post, i) => (post.tags = postTags[i] ?? []));
  fs.writeFileSync(postsFile, JSON.stringify(posts));
  const manifestFile = path.join(copy, "theme.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.version = version;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  return copy;
}

const WOOD: TagEntry = { slug: "go", name: "Gỗ", translations: { en: { name: "Wood" } } };
const FLOOR: TagEntry = { slug: "san", name: "Sàn" };
const KITCHEN: TagEntry = { slug: "bep", name: "Bếp" };

describe("tags that ship with a theme", () => {
  it("creates them hidden, shows them when the theme is active and hides them again", async () => {
    await installThemeDirectory(
      themeCopy("9.1.0", [WOOD, FLOOR], [["go", "san"], ["go"]]),
      admin.id
    );
    expect(await prisma.tag.count({ where: { themeId: THEME, hidden: true } })).toBe(2);
    expect(await getTagWithCounts()).toHaveLength(0);
    expect(await getTagBySlug("go")).toBeNull();

    await activateTheme(THEME, admin.id);
    const shown = await getTagWithCounts();
    expect(shown.map((t) => t.slug).sort()).toEqual(["go", "san"]);
    expect(shown.find((t) => t.slug === "go")?.count).toBe(2);
    expect((await getTagBySlug("go", "en"))?.name).toBe("Wood");
    expect((await getTagBySlug("go"))?.name).toBe("Gỗ");
    const post = await prisma.post.findFirstOrThrow({ where: { themeId: THEME } });
    const detail = await getPublishedPostDetail(post.slug, new Date(), "en");
    expect(detail?.tags.map((t) => t.name)).toContain("Wood");

    await activateTheme("starter", admin.id);
    expect(await getTagWithCounts()).toHaveLength(0);
    expect(await getTagBySlug("go")).toBeNull();
    const parked = await prisma.tag.findMany({ where: { themeId: THEME } });
    expect(parked.every((t) => t.hidden && t.slug.endsWith(`--${THEME}`))).toBe(true);

    await activateTheme(THEME, admin.id);
    expect((await getTagWithCounts()).map((t) => t.slug).sort()).toEqual(["go", "san"]);
  });

  it("follows the file on update: renames, adds and removes tags", async () => {
    await installThemeDirectory(
      themeCopy("9.1.0", [WOOD, FLOOR], [["go", "san"], ["go"]]),
      admin.id
    );
    await activateTheme(THEME, admin.id);

    const stone: TagEntry = { slug: "da", name: "Đá" };
    const renamed: TagEntry = { ...WOOD, name: "Gỗ tự nhiên" };
    await installThemeDirectory(
      themeCopy("9.2.0", [renamed, stone], [["go", "da"], ["go"]]),
      admin.id
    );

    const names = (await getTagWithCounts()).map((t) => t.name).sort();
    expect(names).toEqual(["Gỗ tự nhiên", "Đá"].sort());
    expect(await prisma.tag.findUnique({ where: { slug: "san" } })).toBeNull();
    // The new tag also reaches the post that was installed before.
    expect((await getTagWithCounts()).find((t) => t.slug === "da")?.count).toBe(1);
  });

  it("hands a tag to the editors when one of their posts still uses it", async () => {
    await installThemeDirectory(themeCopy("9.1.0", [WOOD, KITCHEN], [["go"], ["bep"]]), admin.id);
    await activateTheme(THEME, admin.id);
    const tag = await prisma.tag.findUniqueOrThrow({ where: { slug: "bep" } });
    const mine = await prisma.post.create({
      data: { slug: "bai-cua-toi", title: "Bài của tôi", authorId: admin.id, status: "draft" },
    });
    await prisma.postTag.create({ data: { postId: mine.id, tagId: tag.id } });

    await installThemeDirectory(themeCopy("9.2.0", [WOOD], [["go"], []]), admin.id);
    const kept = await prisma.tag.findUniqueOrThrow({ where: { slug: "bep" } });
    expect(kept.themeId).toBeNull();
    expect(kept.hidden).toBe(false);
    expect(await prisma.postTag.count({ where: { postId: mine.id } })).toBe(1);
    // A tag nobody else uses is deleted.
    await installThemeDirectory(themeCopy("9.3.0", [], [[], []]), admin.id);
    expect(await prisma.tag.findUnique({ where: { slug: "go" } })).toBeNull();
  });

  it("adopts a matching tag made by an editor and leaves other editor tags alone", async () => {
    await prisma.tag.create({ data: { slug: "go", name: "Gỗ" } });
    await prisma.tag.create({ data: { slug: "cua-toi", name: "Của tôi" } });
    await installThemeDirectory(themeCopy("9.1.0", [WOOD], [["go"], []]), admin.id);
    expect((await prisma.tag.findFirstOrThrow({ where: { name: "Gỗ" } })).themeId).toBe(THEME);
    expect((await prisma.tag.findUniqueOrThrow({ where: { slug: "cua-toi" } })).themeId).toBeNull();

    await activateTheme(THEME, admin.id);
    await activateTheme("starter", admin.id);
    await activateTheme("default", admin.id);
    await uninstallTheme(THEME, admin.id);
    expect(await prisma.tag.count({ where: { themeId: THEME } })).toBe(0);
    expect(await prisma.tag.findUnique({ where: { slug: "cua-toi" } })).not.toBeNull();
  });

  it("rejects a post that names a tag the theme does not have", async () => {
    const copy = themeCopy("9.1.0", [WOOD], [["khong-co"], []]);
    await expect(installThemeDirectory(copy, admin.id)).rejects.toMatchObject({ code: "invalid" });
  });
});
