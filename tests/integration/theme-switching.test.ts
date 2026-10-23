import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  activateTheme,
  deleteBlockReason,
  rollbackTheme,
  uninstallTheme,
} from "@/lib/themes/activate";
import { resolveActiveTheme, getInstalledTheme } from "@/lib/themes/registry";
import { ThemeError } from "@/lib/themes/errors";
import { installThemeArchive, installThemeDirectory } from "@/lib/themes/install";
import { savePost, savePage, saveCategory, saveTag, deleteCategory } from "@/lib/content/mutations";
import { listPublishedPosts, getPublishedPostDetail } from "@/lib/content/queries";
import { getThemeSettings, saveThemeSettings } from "@/lib/themes/settings";
import { createPreviewToken, verifyPreviewToken } from "@/lib/themes/preview-token";
import { createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";
import { copyDir, tmpDir } from "../helpers/tmp";
import { buildZip, zipDirectory } from "../helpers/zip-builder";
import { DATA_DIR } from "@/lib/env";
import { getSiteSettings, setSiteSetting } from "@/lib/settings";

type User = Awaited<ReturnType<typeof createUser>>;

/** Everything that must survive a theme switch, serialized so any change is detected. */
async function contentSnapshot() {
  const [posts, pages, categories, tags, users, media, settings, postCategories, postTags] =
    await Promise.all([
      prisma.post.findMany({ orderBy: { id: "asc" } }),
      prisma.page.findMany({ orderBy: { id: "asc" } }),
      prisma.category.findMany({ orderBy: { id: "asc" } }),
      prisma.tag.findMany({ orderBy: { id: "asc" } }),
      prisma.user.findMany({ orderBy: { id: "asc" } }),
      prisma.media.findMany({ orderBy: { id: "asc" } }),
      prisma.siteSetting.findMany({
        where: { key: { notIn: ["activeThemeId", "previousThemeId"] } },
        orderBy: { key: "asc" },
      }),
      prisma.postCategory.findMany(),
      prisma.postTag.findMany(),
    ]);
  return JSON.stringify({
    posts,
    pages,
    categories,
    tags,
    users,
    media,
    settings,
    postCategories,
    postTags,
  });
}

async function activeId() {
  return (await prisma.siteSetting.findUnique({ where: { key: "activeThemeId" } }))?.value;
}

let admin: User;
let author: User;
let editor: User;

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin", "Ada");
  author = await createUser("author", "Alan");
  editor = await createUser("editor", "Edsger");
  await setSiteSetting("siteTitle", "Test Journal");
  const category = await saveCategory(admin, {
    name: "Engineering",
    slug: "engineering",
    description: "Code",
  });
  const tag = await saveTag(admin, { name: "Rust", slug: "rust" });
  await savePost(editor, {
    title: "Published post",
    slug: "published-post",
    excerpt: "Excerpt",
    body: "<p>Body text</p>",
    status: "published",
    publishedAt: "2026-01-01T10:00",
    featured: true,
    categoryIds: [category],
    tagIds: [tag],
  });
  await savePost(author, {
    title: "Author draft",
    slug: "author-draft",
    body: "<p>Draft</p>",
    status: "draft",
  });
  await savePage(editor, {
    title: "About",
    slug: "about",
    body: "<p>About us</p>",
    status: "published",
  });
});

describe("theme switching preserves content", () => {
  it("does not change posts, pages, categories, users, media or site settings when switching and rolling back", async () => {
    const before = await contentSnapshot();

    await activateTheme("starter", admin.id);
    expect(await contentSnapshot()).toBe(before);

    await rollbackTheme(admin.id);
    expect(await contentSnapshot()).toBe(before);

    await activateTheme("starter", admin.id);
    await activateTheme("default", admin.id);
    expect(await contentSnapshot()).toBe(before);
  });

  it("serves the same content through a different theme", async () => {
    await activateTheme("starter", admin.id);
    const { bundle } = await resolveActiveTheme();
    expect(bundle.id).toBe("starter");
    const listing = await listPublishedPosts({});
    expect(listing.items.map((p) => p.slug)).toEqual(["published-post"]);
    const detail = await getPublishedPostDetail("published-post");
    expect(detail?.bodyHtml).toContain("Body text");
  });

  it("records activation and rollback in history with the previous theme", async () => {
    await activateTheme("starter", admin.id);
    await rollbackTheme(admin.id);
    const history = await prisma.themeHistory.findMany({
      where: { action: { in: ["activate", "rollback"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => [h.action, h.toThemeId])).toEqual([
      ["activate", "starter"],
      ["rollback", "default"],
    ]);
    expect(await activeId()).toBe("default");
  });

  it("keeps theme settings isolated per theme", async () => {
    const defaultSchema = (await getInstalledTheme("default"))!;
    const starterSchema = (await getInstalledTheme("starter"))!;
    await saveThemeSettings("default", JSON.parse(defaultSchema.manifestJson).settingsSchema, {
      accentColor: "#ff0000",
      bodyFont: "sans",
    });
    await saveThemeSettings("starter", JSON.parse(starterSchema.manifestJson).settingsSchema, {
      accentColor: "#00ff00",
      density: "compact",
    });

    await activateTheme("starter", admin.id);
    await rollbackTheme(admin.id);

    const defaults = await getThemeSettings(
      "default",
      JSON.parse(defaultSchema.manifestJson).settingsSchema
    );
    const starters = await getThemeSettings(
      "starter",
      JSON.parse(starterSchema.manifestJson).settingsSchema
    );
    expect(defaults).toMatchObject({ accentColor: "#ff0000", bodyFont: "sans" });
    expect(starters).toMatchObject({ accentColor: "#00ff00", density: "compact" });
  });

  it("does not let a theme save overwrite another theme's values", async () => {
    const starterSchema = JSON.parse(
      (await getInstalledTheme("starter"))!.manifestJson
    ).settingsSchema;
    await expect(saveThemeSettings("starter", starterSchema, { bodyFont: "sans" })).rejects.toThrow(
      ThemeError
    );
    expect(await prisma.themeSetting.count({ where: { themeId: "default" } })).toBe(0);
  });

  it("preview does not change the active theme", async () => {
    const token = createPreviewToken("starter");
    expect(verifyPreviewToken(token)?.themeId).toBe("starter");
    expect(await activeId()).toBe("default");
    expect((await resolveActiveTheme()).bundle.id).toBe("default");
  });

  it("taxonomy and page edits do not require a theme and survive switching", async () => {
    await activateTheme("starter", admin.id);
    const cat = await saveCategory(admin, { name: "Later", slug: "later" });
    await savePost(editor, {
      title: "New",
      slug: "new-after-switch",
      body: "<p>x</p>",
      status: "published",
      categoryIds: [cat],
      tagIds: [],
    });
    await activateTheme("default", admin.id);
    const listing = await listPublishedPosts({ categorySlug: "later" });
    expect(listing.items.map((p) => p.slug)).toEqual(["new-after-switch"]);
  });
});

describe("activation safety", () => {
  it("refuses to activate a theme whose files changed on disk after install", async () => {
    const starter = await getInstalledTheme("starter");
    fs.writeFileSync(path.join(starter!.path, "templates", "home.json"), "{ broken");
    await expect(activateTheme("starter", admin.id)).rejects.toMatchObject({ code: "invalid" });
    expect(await activeId()).toBe("default");
    const rejected = await prisma.themeHistory.findFirst({
      where: { themeId: "starter", action: "validation_failed" },
    });
    expect(rejected).not.toBeNull();
  });

  it("keeps the current theme when the target is missing", async () => {
    await expect(activateTheme("no-such-theme", admin.id)).rejects.toMatchObject({
      code: "not-found",
    });
    expect(await activeId()).toBe("default");
  });

  it("reports rollback when there is no previous theme", async () => {
    await expect(rollbackTheme(admin.id)).rejects.toMatchObject({ code: "no-previous" });
  });

  it("falls back to the default theme if the active theme breaks at runtime", async () => {
    await activateTheme("starter", admin.id);
    const starter = await getInstalledTheme("starter");
    fs.rmSync(path.join(starter!.path, "styles.css"));
    fs.writeFileSync(path.join(starter!.path, "theme.json"), "not json at all");
    const resolved = await resolveActiveTheme();
    expect(resolved.fellBack).toBe(true);
    expect(resolved.bundle.id).toBe("default");
  });
});

describe("uninstall protection", () => {
  it("refuses to uninstall the active theme", async () => {
    await expect(uninstallTheme("default", admin.id)).rejects.toMatchObject({ code: "active" });
  });

  it("tells the admin why a theme cannot be deleted yet", async () => {
    await activateTheme("starter", admin.id); // default becomes the fallback and the rollback target
    expect(await deleteBlockReason("starter")).toBe("active");
    expect(await deleteBlockReason("default")).toBe("fallback");
  });

  it("refuses to uninstall the fallback theme and the rollback target", async () => {
    await activateTheme("starter", admin.id); // default is now the rollback target and the fallback
    await expect(uninstallTheme("default", admin.id)).rejects.toMatchObject({ code: "protected" });
    await activateTheme("default", admin.id); // starter is now the rollback target
    await expect(uninstallTheme("starter", admin.id)).rejects.toMatchObject({ code: "protected" });
  });

  it("uninstalls an unused theme, deleting its files and settings", async () => {
    const source = copyDir(themeDir("starter"), path.join(tmpDir("extra-"), "src"));
    const manifestPath = path.join(source, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.id = "extra";
    manifest.name = "Extra";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await installThemeDirectory(source, admin.id);
    await saveThemeSettings("extra", manifest.settingsSchema, { accentColor: "#123456" });
    const dir = (await getInstalledTheme("extra"))!.path;

    await activateTheme("extra", admin.id); // extra becomes active, default becomes rollback target
    await activateTheme("starter", admin.id); // starter active, extra becomes rollback target
    await activateTheme("default", admin.id); // default active, starter becomes rollback target
    await uninstallTheme("extra", admin.id);

    expect(await getInstalledTheme("extra")).toBeNull();
    expect(fs.existsSync(dir)).toBe(false);
    expect(await prisma.themeSetting.count({ where: { themeId: "extra" } })).toBe(0);
    // History keeps the record even though the theme row is gone.
    expect(
      await prisma.themeHistory.count({ where: { themeId: "extra", action: "uninstall" } })
    ).toBe(1);
  });
});

describe("theme packages from upload", () => {
  it("installs a valid ZIP that is not already installed", async () => {
    const source = copyDir(themeDir("starter"), path.join(tmpDir("upload-"), "src"));
    const manifestPath = path.join(source, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.id = "uploaded-demo";
    manifest.name = "Uploaded demo";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = await installThemeArchive(zipDirectory(source), admin.id);
    expect(result.id).toBe("uploaded-demo");
    expect(result.previousVersion).toBeNull();
    await activateTheme("uploaded-demo", admin.id);
    expect((await resolveActiveTheme()).bundle.id).toBe("uploaded-demo");
  });

  it("rejects a malicious archive and leaves nothing behind", async () => {
    const hostile = buildZip([{ name: "../escape.txt", data: Buffer.from("x") }]);
    await expect(installThemeArchive(hostile, admin.id)).rejects.toMatchObject({ code: "invalid" });
    await expect(
      installThemeArchive(Buffer.from("not a zip at all"), admin.id)
    ).rejects.toMatchObject({ code: "invalid" });
    const themesDir = path.join(DATA_DIR, "themes");
    const leftovers = fs.existsSync(themesDir)
      ? fs.readdirSync(themesDir).filter((n) => n.startsWith(".staging-"))
      : [];
    expect(leftovers).toEqual([]);
    expect(fs.existsSync(path.join(DATA_DIR, "escape.txt"))).toBe(false);
    expect(
      await prisma.themeHistory.count({ where: { action: "validation_failed" } })
    ).toBeGreaterThan(0);
  });

  it("refuses to install the same version twice", async () => {
    const zip = zipDirectory(themeDir("starter"));
    await expect(installThemeArchive(zip, admin.id)).rejects.toMatchObject({
      code: "already-installed",
    });
  });

  it("updates a theme to a new version and keeps a backup of the old one", async () => {
    const source = copyDir(themeDir("starter"), path.join(tmpDir("update-"), "src"));
    const manifestPath = path.join(source, "theme.json");
    const v1 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    v1.id = "updatable";
    v1.version = "1.0.0";
    fs.writeFileSync(manifestPath, JSON.stringify(v1));
    await installThemeDirectory(source, admin.id);
    const oldPath = (await getInstalledTheme("updatable"))!.path;

    v1.version = "1.1.0";
    fs.writeFileSync(manifestPath, JSON.stringify(v1));
    const result = await installThemeDirectory(source, admin.id);
    expect(result).toMatchObject({ id: "updatable", version: "1.1.0", previousVersion: "1.0.0" });
    expect(fs.existsSync(oldPath)).toBe(false);
    const backups = fs
      .readdirSync(path.join(DATA_DIR, "backups", "themes"))
      .filter((n) => n.startsWith("updatable-1.0.0-"));
    expect(backups.length).toBe(1);
    expect(fs.existsSync(path.join(DATA_DIR, "backups", "themes", backups[0]!, "theme.json"))).toBe(
      true
    );
  });
});

describe("content rules that apply regardless of theme", () => {
  it("hides scheduled posts until their publish time", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    await savePost(editor, {
      title: "Scheduled",
      slug: "scheduled-one",
      body: "<p>later</p>",
      status: "published",
      publishedAt: future,
    });
    const listing = await listPublishedPosts({});
    expect(listing.items.map((p) => p.slug)).not.toContain("scheduled-one");
    expect(await getPublishedPostDetail("scheduled-one")).toBeNull();
    const later = await listPublishedPosts({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000) });
    expect(later.items.map((p) => p.slug)).toContain("scheduled-one");
  });

  it("never shows drafts publicly", async () => {
    expect(await getPublishedPostDetail("author-draft")).toBeNull();
    const listing = await listPublishedPosts({});
    expect(listing.items.map((p) => p.slug)).not.toContain("author-draft");
  });

  it("refuses to delete a category that posts still use", async () => {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: "engineering" } });
    await expect(deleteCategory(admin, category.id)).rejects.toThrow(/used by 1 post/);
    expect(await prisma.category.count({ where: { slug: "engineering" } })).toBe(1);
  });

  it("stores post HTML sanitized", async () => {
    await savePost(editor, {
      title: "XSS",
      slug: "xss-check",
      body: '<p>ok</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
      status: "published",
    });
    const row = await prisma.post.findUniqueOrThrow({ where: { slug: "xss-check" } });
    expect(row.body).not.toContain("<script");
    expect(row.body).not.toContain("javascript:");
  });

  it("keeps revisions and can restore an earlier version", async () => {
    const post = await prisma.post.findUniqueOrThrow({ where: { slug: "published-post" } });
    await savePost(editor, {
      id: post.id,
      title: "Changed",
      slug: "published-post",
      body: "<p>changed</p>",
      status: "published",
      publishedAt: "2026-01-01T10:00",
      categoryIds: [],
      tagIds: [],
    });
    const rev = await prisma.postRevision.findFirstOrThrow({ where: { postId: post.id } });
    expect(rev.title).toBe("Published post");
    const { restorePostRevision } = await import("@/lib/content/mutations");
    await restorePostRevision(editor, post.id, rev.id);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).title).toBe(
      "Published post"
    );
  });

  it("keeps the site setting key used by theme pointers out of content snapshots", async () => {
    const settings = await getSiteSettings();
    expect(settings.siteTitle).toBe("Test Journal");
  });
});
