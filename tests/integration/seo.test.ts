import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { savePost } from "@/lib/content/mutations";
import { getPublishedPostDetail } from "@/lib/content/queries";
import { ValidationError } from "@/lib/errors";
import { resolveSeo } from "@/lib/seo/resolve";
import { SITE_URL } from "@/lib/env";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";

type User = Awaited<ReturnType<typeof createUser>>;
let admin: User;
let editor: User;
let author: User;

const base = {
  title: "Bài kiểm tra SEO",
  slug: "bai-kiem-tra-seo",
  body: "<p>Nội dung.</p>",
  status: "published" as const,
};

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
  editor = await createUser("editor");
  author = await createUser("author");
});

describe("saving SEO fields", () => {
  it("stores the SEO values an editor enters", async () => {
    const { id } = await savePost(editor, {
      ...base,
      seoTitle: "Tiêu đề SEO",
      seoDescription: "Mô tả meta cho bài kiểm tra.",
      focusKeyword: "kiểm tra seo",
      robots: "noindex",
      follow: "nofollow",
      canonicalUrl: "https://example.com/goc",
      ogTitle: "OG",
      ogDescription: "OG mô tả",
      twitterCard: "summary",
    });
    const row = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      seoTitle: "Tiêu đề SEO",
      focusKeyword: "kiểm tra seo",
      robotsIndex: false,
      robotsFollow: false,
      canonicalUrl: "https://example.com/goc",
      ogTitle: "OG",
      twitterCard: "summary",
    });
  });

  it("keeps advanced controls (robots, canonical, share image) unchanged for authors", async () => {
    const { id } = await savePost(author, {
      ...base,
      status: "draft",
      robots: "noindex",
      canonicalUrl: "https://evil.example/x",
    });
    const created = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(created.robotsIndex).toBe(true);
    expect(created.canonicalUrl).toBe("");

    // An editor sets the advanced values; the author's later save must not change them.
    await savePost(editor, {
      id,
      ...base,
      status: "draft",
      robots: "noindex",
      canonicalUrl: "https://example.com/goc",
    });
    await savePost(author, {
      id,
      ...base,
      status: "draft",
      robots: "index",
      canonicalUrl: "https://evil.example/x",
      seoTitle: "Tiêu đề của tác giả",
    });
    const after = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(after.robotsIndex).toBe(false);
    expect(after.canonicalUrl).toBe("https://example.com/goc");
    expect(after.seoTitle).toBe("Tiêu đề của tác giả");
  });

  it("refuses canonical and share addresses that are not http or https", async () => {
    await expect(
      savePost(editor, { ...base, canonicalUrl: "javascript:alert(1)" })
    ).rejects.toThrow(ValidationError);
    await expect(savePost(editor, { ...base, canonicalUrl: "data:text/html,x" })).rejects.toThrow(
      ValidationError
    );
  });

  it("refuses an image reference that does not exist", async () => {
    await expect(savePost(editor, { ...base, featuredImage: "abcdefghijklmnop" })).rejects.toThrow(
      /no longer exists/
    );
  });

  it("saves the featured image alt text in the media library", async () => {
    const media = await prisma.media.create({
      data: {
        filename: "x.png",
        mimeType: "image/png",
        byteSize: 10,
        altText: "",
        uploadedById: admin.id,
      },
    });
    const { id } = await savePost(editor, {
      ...base,
      featuredImage: media.id,
      featuredImageAlt: "Mô tả ảnh",
    });
    expect((await prisma.media.findUniqueOrThrow({ where: { id: media.id } })).altText).toBe(
      "Mô tả ảnh"
    );
    const detail = await getPublishedPostDetail(base.slug);
    expect(detail?.featuredImageAlt).toBe("Mô tả ảnh");
    expect(detail?.id).toBe(id);
  });

  it("resolves the public metadata from the stored values", async () => {
    await savePost(editor, { ...base, focusKeyword: "seo" });
    const detail = await getPublishedPostDetail(base.slug);
    const seo = resolveSeo(
      {
        title: detail!.title,
        slug: detail!.slug,
        excerpt: detail!.excerpt,
        body: detail!.bodyHtml,
        seoTitle: detail!.seoTitle,
        seoDescription: detail!.seoDescription,
        canonicalUrl: detail!.canonicalSetting,
        ogTitle: detail!.ogTitle,
        ogDescription: detail!.ogDescription,
        robotsIndex: detail!.robotsIndex,
        robotsFollow: detail!.robotsFollow,
        twitterCard: detail!.twitterCard,
        focusKeyword: detail!.focusKeyword,
        featuredImageUrl: detail!.featuredImageUrl,
        socialImageUrl: detail!.socialImageUrl,
        featuredImageAlt: detail!.featuredImageAlt,
      },
      SITE_URL
    );
    expect(seo.canonical).toBe(`${SITE_URL}/posts/${base.slug}`);
    expect(seo.robots).toEqual({ index: true, follow: true });
    expect(seo.focusKeyword).toBe("seo");
  });
});

describe("sitemap and robots", () => {
  it("lists only public, indexable posts that are canonical to themselves", async () => {
    await savePost(editor, { ...base, slug: "tot", title: "Tốt" });
    await savePost(editor, { ...base, slug: "an", title: "Ẩn", robots: "noindex" });
    await savePost(editor, { ...base, slug: "nhap", title: "Nháp", status: "draft" });
    await savePost(editor, {
      ...base,
      slug: "chinh-tac",
      title: "Bản khác",
      canonicalUrl: "https://other.example/x",
    });
    const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 16);
    await savePost(editor, { ...base, slug: "hen-gio", title: "Hẹn giờ", publishedAt: future });

    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/posts/tot`);
    expect(urls).not.toContain(`${SITE_URL}/posts/an`);
    expect(urls).not.toContain(`${SITE_URL}/posts/nhap`);
    expect(urls).not.toContain(`${SITE_URL}/posts/chinh-tac`);
    expect(urls).not.toContain(`${SITE_URL}/posts/hen-gio`);
  });

  it("blocks admin, preview and search without blocking public pages", async () => {
    const rules = await robots();
    const rule = Array.isArray(rules.rules) ? rules.rules[0]! : rules.rules!;
    const disallow = [rule.disallow].flat() as string[];
    expect(disallow).toEqual(expect.arrayContaining(["/admin", "/preview", "/api"]));
    for (const publicPath of ["/", "/posts/abc", "/pages/about", "/categories/tin"]) {
      expect(disallow.some((d) => publicPath.startsWith(d))).toBe(false);
    }
    expect(rules.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
