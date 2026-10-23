import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeText, htmlToText, truncate } from "@/lib/seo/text";
import { parseContent } from "@/lib/seo/content";
import { resolveSeo, type SeoSource } from "@/lib/seo/resolve";
import { analyzeSeo, type CheckId, type CheckStatus } from "@/lib/seo/analysis";
import { blogPostingJsonLd } from "@/lib/seo/jsonld";
import { postMetadata } from "@/lib/seo/metadata";

const SITE = "https://blog.example.com";

function source(overrides: Partial<SeoSource> = {}): SeoSource {
  return {
    title: "Lập trình Web hiện đại cho người mới",
    slug: "lap-trinh-web-hien-dai",
    excerpt: "Hướng dẫn lập trình web từ đầu với công cụ hiện đại và ví dụ thực tế.",
    body: "<p>Nội dung mở đầu về lập trình web.</p>",
    seoTitle: "",
    seoDescription: "",
    canonicalUrl: "",
    ogTitle: "",
    ogDescription: "",
    robotsIndex: true,
    robotsFollow: true,
    twitterCard: "summary_large_image",
    focusKeyword: "",
    featuredImageUrl: null,
    socialImageUrl: null,
    featuredImageAlt: "",
    ...overrides,
  };
}

/** A body long enough to pass the length check, with the keyword in the intro and an H2. */
const LONG_BODY =
  "<h2>Lập trình web là gì</h2>" +
  Array.from(
    { length: 40 },
    () => "<p>Lập trình web gồm nhiều bước từ thiết kế đến triển khai cho người dùng cuối.</p>"
  ).join("") +
  '<p>Tham khảo <a href="/gioi-thieu">trang giới thiệu</a> và <a href="https://example.org/doc">tài liệu</a>.</p>' +
  '<img src="/media/abc123def456" alt="Sơ đồ">';

function check(result: ReturnType<typeof analyzeSeo>, id: CheckId) {
  return result.checks.find((c) => c.id === id);
}
function statusOf(result: ReturnType<typeof analyzeSeo>, id: CheckId): CheckStatus | undefined {
  return check(result, id)?.status;
}

afterEach(() => vi.unstubAllEnvs());

describe("text helpers", () => {
  it("normalizes Vietnamese text for keyword matching", () => {
    expect(normalizeText("Đường Dẫn  SEO")).toBe("duong dan seo");
    expect(normalizeText("Lập trình")).toBe(normalizeText("lap trinh"));
  });

  it("turns HTML into text and decodes entities", () => {
    expect(htmlToText("<p>A &amp; B&nbsp;<strong>C</strong></p>")).toBe("A & B C");
  });

  it("truncates at a word boundary", () => {
    const out = truncate("một hai ba bốn năm sáu bảy tám", 14);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(14);
  });
});

describe("content parser", () => {
  it("reads headings, links and images from sanitized HTML", () => {
    const parsed = parseContent(
      '<h2>Mục</h2><h3>Con</h3><p>Văn bản</p><a href="/x">x</a><a href="https://e.com">e</a><img src="/media/a" alt="ok"><img src="/media/b">'
    );
    expect(parsed.headings).toEqual([
      { level: 2, text: "Mục" },
      { level: 3, text: "Con" },
    ]);
    expect(parsed.links).toEqual(["/x", "https://e.com"]);
    expect(parsed.images).toEqual([
      { src: "/media/a", alt: "ok" },
      { src: "/media/b", alt: null },
    ]);
    expect(parsed.words).toBeGreaterThan(0);
  });
});

describe("automatic SEO defaults", () => {
  it("fills title, description, canonical and share image when nothing was entered", () => {
    const seo = resolveSeo(
      source({ featuredImageUrl: "/media/hero1", featuredImageAlt: "" }),
      SITE
    );
    expect(seo.title).toBe("Lập trình Web hiện đại cho người mới");
    expect(seo.description.length).toBeGreaterThan(20);
    expect(seo.canonical).toBe(`${SITE}/posts/lap-trinh-web-hien-dai`);
    expect(seo.ogImage).toBe(`${SITE}/media/hero1`);
    expect(seo.ogImageAlt).toBe("Lập trình Web hiện đại cho người mới");
    expect(seo.robots).toEqual({ index: true, follow: true });
    expect(seo.twitterCard).toBe("summary_large_image");
  });

  it("uses entered values in preference to defaults", () => {
    const seo = resolveSeo(
      source({
        seoTitle: "Tiêu đề SEO",
        seoDescription: "Mô tả tùy chỉnh",
        socialImageUrl: "/media/share",
        featuredImageUrl: "/media/hero",
      }),
      SITE
    );
    expect(seo.title).toBe("Tiêu đề SEO");
    expect(seo.description).toBe("Mô tả tùy chỉnh");
    expect(seo.ogImage).toBe(`${SITE}/media/share`);
  });

  it("keeps an entered canonical address and makes it absolute", () => {
    expect(resolveSeo(source({ canonicalUrl: "https://other.example/bai" }), SITE).canonical).toBe(
      "https://other.example/bai"
    );
  });
});

describe("on-page checks", () => {
  it("passes a well-formed post with the keyword in place", () => {
    const result = analyzeSeo({
      ...source({
        seoTitle: "Lập trình Web cho người mới bắt đầu",
        seoDescription:
          "Hướng dẫn lập trình web từ đầu cho người mới, với công cụ hiện đại, ví dụ thực tế và lộ trình học rõ ràng từng bước.",
        focusKeyword: "lập trình web",
        body: LONG_BODY,
        featuredImageUrl: "/media/hero1",
        featuredImageAlt: "Màn hình lập trình",
      }),
      siteUrl: SITE,
      siteHost: "blog.example.com",
    });
    expect(statusOf(result, "titleKeyword")).toBe("good");
    expect(statusOf(result, "descriptionKeyword")).toBe("good");
    expect(statusOf(result, "keywordIntro")).toBe("good");
    expect(statusOf(result, "keywordHeading")).toBe("good");
    expect(statusOf(result, "keywordSlug")).toBe("good");
    expect(statusOf(result, "contentLength")).toBe("good");
    expect(statusOf(result, "h1Heading")).toBe("good");
    expect(statusOf(result, "featuredImageAlt")).toBe("good");
    expect(statusOf(result, "linksInternal")).toBe("good");
    expect(result.counts.bad).toBe(0);
  });

  it("flags a missing focus keyword as information, not an error", () => {
    const result = analyzeSeo({
      ...source({ body: LONG_BODY }),
      siteUrl: SITE,
      siteHost: "blog.example.com",
    });
    expect(statusOf(result, "keywordSet")).toBe("info");
    expect(result.counts.bad).toBe(0);
  });

  it("matches keywords regardless of Vietnamese diacritics", () => {
    const result = analyzeSeo({
      ...source({ title: "Lap trinh Web", focusKeyword: "lập trình web" }),
      siteUrl: SITE,
      siteHost: "blog.example.com",
    });
    expect(statusOf(result, "titleKeyword")).toBe("good");
  });

  it("reports an H1 inside the content, short content, and bad heading order", () => {
    const result = analyzeSeo({
      ...source({ body: "<h1>Trùng tiêu đề</h1><h3>Mục phụ</h3><p>Ngắn.</p>" }),
      siteUrl: SITE,
      siteHost: "blog.example.com",
    });
    expect(statusOf(result, "h1Heading")).toBe("bad");
    expect(statusOf(result, "headingOrder")).toBe("warn");
    expect(statusOf(result, "contentLength")).toBe("bad");
  });

  it("counts images without alt text", () => {
    const result = analyzeSeo({
      ...source({ body: '<img src="/media/a"><img src="/media/b" alt="ok">' }),
      siteUrl: SITE,
      siteHost: "blog.example.com",
    });
    expect(check(result, "imagesAlt")?.params).toMatchObject({ missing: 1, total: 2 });
    expect(statusOf(result, "imagesAlt")).toBe("warn");
  });

  it("warns about a missing featured image and a missing alt text on it", () => {
    const none = analyzeSeo({ ...source(), siteUrl: SITE, siteHost: "b.example.com" });
    expect(statusOf(none, "featuredImage")).toBe("warn");
    const noAlt = analyzeSeo({
      ...source({ featuredImageUrl: "/media/x", featuredImageAlt: " " }),
      siteUrl: SITE,
      siteHost: "b.example.com",
    });
    expect(statusOf(noAlt, "featuredImageAlt")).toBe("warn");
  });

  it("flags a non-URL canonical, another canonical target, and noindex", () => {
    const bad = analyzeSeo({
      ...source({ canonicalUrl: "not a url" }),
      siteUrl: SITE,
      siteHost: "b.example.com",
    });
    expect(statusOf(bad, "canonicalValid")).toBe("bad");
    const other = analyzeSeo({
      ...source({ canonicalUrl: "https://other.example/bai" }),
      siteUrl: SITE,
      siteHost: "b.example.com",
    });
    expect(statusOf(other, "canonicalOther")).toBe("warn");
    const noindex = analyzeSeo({
      ...source({ robotsIndex: false }),
      siteUrl: SITE,
      siteHost: "b.example.com",
    });
    expect(statusOf(noindex, "robotsNoindex")).toBe("warn");
  });

  it("counts internal and external links separately", () => {
    const result = analyzeSeo({
      ...source({ body: LONG_BODY }),
      siteUrl: SITE,
      siteHost: "blog.example.com",
    });
    expect(check(result, "linksInternal")?.params).toMatchObject({ count: 1 });
    expect(check(result, "linksExternal")?.params).toMatchObject({ count: 1 });
  });

  it("shows keyword density for reference without letting it change the counts", () => {
    const base = {
      ...source({ body: LONG_BODY, focusKeyword: "lập trình web" }),
      siteUrl: SITE,
      siteHost: "blog.example.com",
    };
    const result = analyzeSeo(base);
    expect(statusOf(result, "keywordDensity")).toBe("info");
    // Stuffing the keyword does not turn the density into an error.
    const stuffed = analyzeSeo({ ...base, body: `<p>${"lập trình web ".repeat(200)}</p>` });
    expect(statusOf(stuffed, "keywordDensity")).toBe("info");
  });
});

describe("structured data (JSON-LD)", () => {
  const seo = resolveSeo(source({ robotsIndex: true, featuredImageUrl: "/media/hero1" }), SITE);
  const base = {
    seo,
    headline: seo.title,
    authorName: "Tác giả",
    siteTitle: "Blog",
    datePublished: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-02T00:00:00.000Z",
    tags: ["web"],
    locale: "vi",
  };

  it("produces valid BlogPosting JSON with the canonical and image", () => {
    const data = JSON.parse(blogPostingJsonLd(base));
    expect(data["@type"]).toBe("BlogPosting");
    expect(data.mainEntityOfPage["@id"]).toBe(seo.canonical);
    expect(data.image).toEqual([`${SITE}/media/hero1`]);
    expect(data.keywords).toBe("web");
  });

  it("cannot be broken out of the script element by stored text", () => {
    const hostile = {
      ...base,
      headline: '</script><script>alert("x")</script>',
      authorName: "</script>",
    };
    const out = blogPostingJsonLd(hostile);
    expect(out).not.toContain("<");
    expect(out).not.toContain("</script");
    expect(JSON.parse(out).headline).toContain("</script>");
  });
});

describe("Next.js metadata for a post", () => {
  it("emits robots, canonical, Open Graph and Twitter values", () => {
    const seo = resolveSeo(
      source({
        robotsIndex: false,
        robotsFollow: false,
        featuredImageUrl: "/media/h",
        featuredImageAlt: "Ảnh",
      }),
      SITE
    );
    const meta = postMetadata(seo, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates?.canonical).toBe(seo.canonical);
    const og = meta.openGraph as { images?: { url: string; alt: string }[]; type?: string };
    expect(og.type).toBe("article");
    expect(og.images).toEqual([{ url: `${SITE}/media/h`, alt: "Ảnh" }]);
    expect((meta.twitter as { card?: string }).card).toBe("summary_large_image");
  });

  it("marks admin and error pages as not indexable", async () => {
    const admin = await import("@/app/admin/layout");
    expect(admin.metadata.robots).toMatchObject({ index: false });
    const notFound = await import("@/app/not-found");
    expect(notFound.metadata.robots).toMatchObject({ index: false });
  });
});

describe("site address configuration", () => {
  it("accepts an origin and rejects anything else", async () => {
    vi.resetModules();
    vi.stubEnv("SITE_URL", "https://blog.example.com/");
    const ok = await import("@/lib/env");
    expect(ok.SITE_URL).toBe("https://blog.example.com");

    for (const bad of [
      "javascript:alert(1)",
      "https://blog.example.com/path",
      "ftp://blog.example.com",
      "not a url",
    ]) {
      vi.resetModules();
      vi.stubEnv("SITE_URL", bad);
      await expect(import("@/lib/env")).rejects.toThrow(/SITE_URL/);
    }
  });
});
