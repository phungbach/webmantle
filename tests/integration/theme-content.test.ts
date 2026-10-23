import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getCategoryBySlug,
  getCategoryWithCounts,
  getPublishedPostDetail,
  listPublishedPosts,
} from "@/lib/content/queries";
import { activateTheme, uninstallTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { ROOT, createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";

const THEME = "hien-studio";
const read = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "themes", THEME, file), "utf8")) as {
    slug: string;
    title?: string;
    name?: string;
    categories?: string[];
  }[];
const posts = read("posts.json");
const categories = read("categories.json");
let admin: { id: string };

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
});

const install = () => installThemeDirectory(themeDir(THEME), admin.id);

describe("posts and categories that ship with a theme", () => {
  it("creates them hidden when the theme is installed but not active", async () => {
    await install();
    expect(await prisma.post.findMany({ where: { themeId: THEME, status: "draft" } })).toHaveLength(
      posts.length
    );
    expect(
      await prisma.category.findMany({ where: { themeId: THEME, hidden: true } })
    ).toHaveLength(categories.length);
    expect((await listPublishedPosts({})).total).toBe(0);
    expect(await getCategoryWithCounts()).toHaveLength(0);
    expect(await getCategoryBySlug(categories[0]!.slug)).toBeNull();
  });

  it("shows them on activation, translated on request, and hides them again", async () => {
    await install();
    await activateTheme(THEME, admin.id);
    expect((await listPublishedPosts({})).total).toBe(posts.length);
    const cats = await getCategoryWithCounts();
    expect(cats).toHaveLength(categories.length);
    // Project posts carry a tag, not a category.
    expect(cats.reduce((sum, c) => sum + c.count, 0)).toBe(
      posts.filter((p) => p.categories?.length).length
    );

    const vi = await getPublishedPostDetail(posts[0]!.slug);
    const en = await getPublishedPostDetail(posts[0]!.slug, new Date(), "en");
    expect(vi?.title).toBe(posts[0]!.title);
    expect(en?.title).toMatch(/oak/i);
    expect(en?.categories[0]?.name).toBe("Materials");
    expect((await getCategoryBySlug(categories[0]!.slug, "en"))?.name).toBe("Materials");
    const english = await listPublishedPosts({ locale: "en", search: "walnut" });
    expect(english.total).toBe(1);

    await activateTheme("starter", admin.id);
    expect((await listPublishedPosts({})).total).toBe(0);
    expect(await getCategoryWithCounts()).toHaveLength(0);
    expect(await prisma.post.count({ where: { themeId: THEME, status: "draft" } })).toBe(
      posts.length
    );
  });

  it("deletes them when the theme is uninstalled", async () => {
    await install();
    await activateTheme(THEME, admin.id);
    await activateTheme("starter", admin.id);
    await activateTheme("default", admin.id);
    await uninstallTheme(THEME, admin.id);
    expect(await prisma.post.count({ where: { themeId: THEME } })).toBe(0);
    expect(await prisma.category.count({ where: { themeId: THEME } })).toBe(0);
  });

  it("adopts items made before themes could ship them, and leaves the editor's own items alone", async () => {
    await prisma.category.create({
      data: { slug: categories[0]!.slug, name: categories[0]!.name! },
    });
    await prisma.category.create({ data: { slug: "cua-toi", name: "Của tôi" } });
    await prisma.post.create({
      data: {
        slug: posts[0]!.slug,
        title: posts[0]!.title!,
        body: "<p>cũ</p>",
        status: "published",
        publishedAt: new Date("2026-01-01"),
        authorId: admin.id,
      },
    });
    await install();
    const adopted = await prisma.post.findFirst({ where: { title: posts[0]!.title } });
    expect(adopted?.themeId).toBe(THEME);
    expect(adopted?.body).toBe("<p>cũ</p>");
    expect((await prisma.category.findUnique({ where: { slug: "cua-toi" } }))?.themeId).toBeNull();
    await activateTheme(THEME, admin.id);
    await activateTheme("starter", admin.id);
    await activateTheme("default", admin.id);
    await uninstallTheme(THEME, admin.id);
    expect(await prisma.category.findUnique({ where: { slug: "cua-toi" } })).not.toBeNull();
  });

  it("rejects a post that names a category the theme does not have", async () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "hien-"));
    fs.cpSync(themeDir(THEME), copy, { recursive: true });
    const file = path.join(copy, "posts.json");
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    list[0].categories = ["khong-co"];
    fs.writeFileSync(file, JSON.stringify(list));
    await expect(installThemeDirectory(copy, admin.id)).rejects.toMatchObject({ code: "invalid" });
  });

  it("serves a post's theme picture and reading time, and rejects a picture the theme does not have", async () => {
    await install();
    await activateTheme(THEME, admin.id);
    const post = await getPublishedPostDetail(posts[0]!.slug);
    expect(post?.featuredImageUrl).toMatch(
      /^\/theme-assets\/hien-studio\/current\/assets\/.+\.jpg$/
    );
    expect(post?.readMinutes).toBeGreaterThanOrEqual(1);

    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "hien-"));
    fs.cpSync(themeDir(THEME), copy, { recursive: true });
    const file = path.join(copy, "posts.json");
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    list[0].image = "assets/khong-co.jpg";
    fs.writeFileSync(file, JSON.stringify(list));
    const manifestPath = path.join(copy, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.version = "9.2.0";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await expect(installThemeDirectory(copy, admin.id)).rejects.toMatchObject({ code: "invalid" });
  });
});
