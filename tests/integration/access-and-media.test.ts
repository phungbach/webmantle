import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ForbiddenError, assertPermission } from "@/lib/auth/session";
import {
  savePost,
  deletePost,
  createUser as createUserService,
  deleteUser,
  saveCategory,
} from "@/lib/content/mutations";
import { saveMedia, deleteMedia, MEDIA_MAX_BYTES } from "@/lib/media";
import {
  activateInstalledTheme,
  removeTheme,
  updateThemeSettings,
  uploadTheme,
} from "@/lib/themes/manage";
import { ValidationError } from "@/lib/errors";
import { ROOT, createUser, installBuiltIns, resetDatabase } from "../helpers/db";
import { getInstalledTheme } from "@/lib/themes/registry";
import { MEDIA_DIR } from "@/lib/env";
import { GET as mediaGET } from "@/app/media/[id]/route";
import { GET as assetGET } from "@/app/theme-assets/[themeId]/[version]/[...path]/route";
import { GET as feedGET } from "@/app/feed.xml/route";

type User = Awaited<ReturnType<typeof createUser>>;
let admin: User;
let editor: User;
let author: User;
let other: User;

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
  editor = await createUser("editor");
  author = await createUser("author");
  other = await createUser("author", "Other author");
});

function pngOfSize(width: number, height: number): Buffer {
  const png = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

describe("authorization on the server", () => {
  it("admin-only theme operations are refused to editors and authors", async () => {
    await expect(activateInstalledTheme(editor, "starter")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(activateInstalledTheme(author, "starter")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeTheme(editor, "starter")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateThemeSettings(author, "starter", { accentColor: "#000000" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(uploadTheme(author, new File([Buffer.from("x")], "t.zip"))).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(await prisma.siteSetting.findUnique({ where: { key: "activeThemeId" } })).toMatchObject({
      value: "default",
    });
  });

  it("authors cannot publish, and editors cannot manage users or themes", async () => {
    await expect(
      savePost(author, { title: "Pub", slug: "pub", body: "x", status: "published" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createUserService(editor, {
        name: "x",
        email: "x@example.com",
        role: "admin",
        password: "correct horse battery",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(() => assertPermission(editor, "themes:manage")).toThrow(ForbiddenError);
  });

  it("authors can only edit and delete their own posts", async () => {
    const post = await savePost(author, {
      title: "Mine",
      slug: "mine",
      body: "x",
      status: "draft",
    });
    await expect(
      savePost(other, { id: post.id, title: "Hijack", slug: "mine", body: "x", status: "draft" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deletePost(other, post.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deletePost(author, post.id);
    expect(await prisma.post.count()).toBe(0);
  });

  it("an author's own draft cannot be made featured", async () => {
    const post = await savePost(author, {
      title: "Feature me",
      slug: "feature-me",
      body: "x",
      status: "draft",
      featured: true,
    });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).featured).toBe(false);
  });

  it("refuses to delete the last administrator and yourself", async () => {
    await expect(deleteUser(admin, admin.id)).rejects.toThrow(ValidationError);
    await expect(deleteUser(admin, editor.id)).resolves.toBeUndefined();
  });

  it("refuses to delete a user who has posts", async () => {
    await savePost(author, { title: "T", slug: "t-owned", body: "x", status: "draft" });
    await expect(deleteUser(admin, author.id)).rejects.toThrow(/posts or pages/);
  });

  it("rejects duplicate slugs with a clear message", async () => {
    await savePost(editor, { title: "A", slug: "same", body: "x", status: "published" });
    await expect(
      savePost(editor, { title: "B", slug: "same", body: "x", status: "published" })
    ).rejects.toThrow(/already in use/);
  });

  it("rejects reserved slugs", async () => {
    await expect(saveCategory(admin, { name: "Admin", slug: "admin" })).rejects.toThrow(
      ValidationError
    );
  });
});

describe("media uploads", () => {
  it("accepts a real PNG and records its size", async () => {
    const id = await saveMedia(author, pngOfSize(800, 600), "A chart");
    const row = await prisma.media.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      mimeType: "image/png",
      width: 800,
      height: 600,
      altText: "A chart",
    });
    expect(row.filename).toMatch(/^[0-9a-f]{32}\.png$/);
    fs.rmSync(path.join(MEDIA_DIR, row.filename), { force: true });
  });

  it("rejects SVG and HTML files that carry an image extension", async () => {
    await expect(saveMedia(author, Buffer.from("<svg onload=alert(1)/>"), "")).rejects.toThrow(
      ValidationError
    );
    await expect(saveMedia(author, Buffer.from("<html></html>"), "")).rejects.toThrow(
      ValidationError
    );
  });

  it("enforces the size limit", async () => {
    const big = Buffer.alloc(MEDIA_MAX_BYTES + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big, 0);
    await expect(saveMedia(author, big, "")).rejects.toThrow(/5 MB/);
  });

  it("enforces dimension limits", async () => {
    await expect(saveMedia(author, pngOfSize(7000, 100), "")).rejects.toThrow(/pixels/);
  });

  it("serves an uploaded image by id and returns 404 for unknown ids", async () => {
    const id = await saveMedia(author, pngOfSize(10, 10), "");
    const ok = await mediaGET(new Request("http://x"), { params: Promise.resolve({ id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    const missing = await mediaGET(new Request("http://x"), {
      params: Promise.resolve({ id: "abcdefghijklmnop" }),
    });
    expect(missing.status).toBe(404);
    const traversal = await mediaGET(new Request("http://x"), {
      params: Promise.resolve({ id: "../../etc/passwd" }),
    });
    expect(traversal.status).toBe(404);
  });

  it("does not delete an image that a post still uses", async () => {
    const id = await saveMedia(author, pngOfSize(10, 10), "");
    await savePost(author, {
      title: "Hero",
      slug: "hero",
      body: "x",
      status: "draft",
      featured: false,
    });
    await prisma.post.update({ where: { slug: "hero" }, data: { featuredImage: id } });
    await expect(deleteMedia(author, id)).rejects.toThrow(/used by 1 post/);
  });
});

describe("public route handlers", () => {
  const params = (themeId: string, version: string, path: string[]) => ({
    params: Promise.resolve({ themeId, version, path }),
  });

  it("serves a theme stylesheet and asset, and refuses everything else", async () => {
    const version = (await getInstalledTheme("default"))!.version;
    const css = await assetGET(new Request("http://x"), params("default", version, ["styles.css"]));
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");

    const manifest = await assetGET(
      new Request("http://x"),
      params("default", version, ["theme.json"])
    );
    expect(manifest.status).toBe(404);

    const template = await assetGET(
      new Request("http://x"),
      params("default", version, ["templates", "home.json"])
    );
    expect(template.status).toBe(404);

    const traversal = await assetGET(
      new Request("http://x"),
      params("default", version, ["..", "..", "cms.db"])
    );
    expect(traversal.status).toBe(404);

    const hidden = await assetGET(
      new Request("http://x"),
      params("default", version, [".secret.key"])
    );
    expect(hidden.status).toBe(404);

    const wrongVersion = await assetGET(
      new Request("http://x"),
      params("default", "9.9.9", ["styles.css"])
    );
    expect(wrongVersion.status).toBe(404);

    const unknownTheme = await assetGET(
      new Request("http://x"),
      params("nope", "1.0.0", ["styles.css"])
    );
    expect(unknownTheme.status).toBe(404);
  });

  it("feeds include published posts only", async () => {
    await savePost(editor, {
      title: "Visible",
      slug: "visible",
      body: "<p>yes</p>",
      status: "published",
    });
    await savePost(editor, {
      title: "Hidden",
      slug: "hidden-draft",
      body: "<p>no</p>",
      status: "draft",
    });
    const res = await feedGET();
    const xml = await res.text();
    expect(xml).toContain("<title>Visible</title>");
    expect(xml).not.toContain("Hidden");
    expect(xml).toContain('<rss version="2.0"');
  });
});

describe("repository layout", () => {
  it("keeps database, media and theme files outside the public directory", () => {
    const publicDir = path.join(ROOT, "public");
    const dataDir = path.join(ROOT, "data");
    expect(fs.existsSync(path.join(publicDir, "theme-assets"))).toBe(false);
    expect(path.relative(publicDir, dataDir).startsWith("..")).toBe(true);
  });
});
