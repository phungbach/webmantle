import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { savePost } from "@/lib/content/mutations";
import { setSiteSetting } from "@/lib/settings";
import {
  getSeoSettings,
  saveSeoSettings,
  seoTemplate,
  siteOgImageUrl,
  SEO_DEFAULTS,
} from "@/lib/seo/site";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { generateMetadata as layoutMetadata } from "@/app/layout";
import { generateMetadata as homeMetadata } from "@/app/page";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { GET as feedGET } from "@/app/feed.xml/route";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "en" }), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

const valid = {
  separator: "·",
  homeTitle: "",
  homeDescription: "",
  defaultOgImageId: "",
  twitterHandle: "",
  noindexSite: false,
};

type User = Awaited<ReturnType<typeof createUser>>;
let editor: User;

const postInput = (slug: string, extra: Record<string, unknown> = {}) => ({
  title: `Post ${slug}`,
  slug,
  body: "<p>x</p>",
  status: "published" as const,
  ...extra,
});

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  editor = await createUser("editor");
});

describe("SEO settings", () => {
  it("returns defaults on a fresh site", async () => {
    expect(await getSeoSettings()).toEqual(SEO_DEFAULTS);
  });

  it("round trips saved values and strips a leading @ from the handle", async () => {
    const media = await prisma.media.create({
      data: { filename: "x.png", mimeType: "image/png", byteSize: 1 },
    });
    const res = await saveSeoSettings({
      separator: "|",
      homeTitle: "Home title",
      homeDescription: "Home description",
      defaultOgImageId: media.id,
      twitterHandle: "@hiennha_com",
      noindexSite: "on",
    });
    expect(res.changed.length).toBe(6);
    expect(await getSeoSettings()).toEqual({
      separator: "|",
      homeTitle: "Home title",
      homeDescription: "Home description",
      defaultOgImageId: media.id,
      twitterHandle: "hiennha_com",
      noindexSite: true,
    });
    expect(
      (
        await saveSeoSettings({
          ...valid,
          separator: "|",
          homeTitle: "Home title",
          homeDescription: "Home description",
          defaultOgImageId: media.id,
          twitterHandle: "hiennha_com",
          noindexSite: true,
        })
      ).changed
    ).toEqual([]);
  });

  it("rejects invalid input", async () => {
    const bad = [
      { separator: "#" },
      { homeTitle: "x".repeat(71) },
      { homeDescription: "x".repeat(201) },
      { twitterHandle: "has space" },
      { twitterHandle: "waytoolonghandle_123" },
      { defaultOgImageId: "does-not-exist" },
    ];
    for (const patch of bad) {
      await expect(saveSeoSettings({ ...valid, ...patch })).rejects.toThrow();
    }
    expect(await getSeoSettings()).toEqual(SEO_DEFAULTS);
  });

  it("falls back to defaults when stored values are bad", async () => {
    await setSiteSetting("seo.separator", "###");
    await setSiteSetting("seo.homeTitle", "y".repeat(100));
    await setSiteSetting("seo.twitterHandle", "not valid!");
    await setSiteSetting("seo.noindexSite", "maybe");
    expect(await getSeoSettings()).toEqual(SEO_DEFAULTS);
  });

  it("builds the title template and the share image address", () => {
    expect(seoTemplate("Hiennha.com", "·")).toBe("%s · Hiennha.com");
    expect(seoTemplate("S", "—")).toBe("%s — S");
    expect(siteOgImageUrl({ defaultOgImageId: null }, "http://x.test")).toBeNull();
    const url = siteOgImageUrl({ defaultOgImageId: "abc" }, "http://x.test/");
    expect(url).toMatch(/^http:\/\/x\.test\/media\/abc/);
  });
});

describe("root layout metadata", () => {
  it("uses the site title setting, never a hard-coded name", async () => {
    await setSiteSetting("siteTitle", "Hiennha.com");
    const m = await layoutMetadata();
    const title = m.title as { default: string; template: string };
    expect(title.default).toBe("Hiennha.com");
    expect(title.template).toBe("%s · Hiennha.com");
    expect(m.openGraph?.siteName).toBe("Hiennha.com");
    expect(JSON.stringify(m)).not.toMatch(/"Blog"/);
  });

  it("applies the separator and the home title override", async () => {
    await setSiteSetting("siteTitle", "Hiennha.com");
    await saveSeoSettings({
      ...valid,
      separator: "—",
      homeTitle: "Nội thất đẹp",
      twitterHandle: "hien",
    });
    const m = await layoutMetadata();
    const title = m.title as { default: string; template: string };
    expect(title.template).toBe("%s — Hiennha.com");
    expect(title.default).toBe("Nội thất đẹp");
    expect((m.twitter as { site?: string }).site).toBe("@hien");
  });

  it("adds robots noindex only when the whole site is noindex", async () => {
    expect((await layoutMetadata()).robots).toBeUndefined();
    await saveSeoSettings({ ...valid, noindexSite: true });
    expect((await layoutMetadata()).robots).toMatchObject({ index: false });
  });
});

describe("home page metadata", () => {
  it("has an absolute title, a description and canonical /", async () => {
    await setSiteSetting("siteTitle", "Hiennha.com");
    const m = await homeMetadata({ searchParams: Promise.resolve({}) });
    expect(m.title).toMatchObject({ absolute: "Hiennha.com" });
    expect(typeof m.description).toBe("string");
    expect(String(m.alternates?.canonical)).toMatch(/\/$/);
  });
  it("uses a self canonical for page 2", async () => {
    const m = await homeMetadata({ searchParams: Promise.resolve({ page: "2" }) });
    expect(String(m.alternates?.canonical)).toContain("page=2");
    const first = await homeMetadata({ searchParams: Promise.resolve({ page: "1" }) });
    expect(String(first.alternates?.canonical)).not.toContain("page=");
  });
});

describe("robots and sitemap", () => {
  it("normal site: disallows private areas and advertises the sitemap", async () => {
    const r = await robots();
    expect(r.sitemap).toMatch(/sitemap\.xml$/);
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    for (const p of ["/admin", "/preview", "/design-preview", "/search", "/api", "/login"])
      expect(disallow).toContain(p);
  });

  it("noindex site: blocks everything, no sitemap line, empty sitemap", async () => {
    await savePost(editor, postInput("live"));
    await saveSeoSettings({ ...valid, noindexSite: true });
    const r = await robots();
    expect(r.sitemap).toBeUndefined();
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.disallow).toBe("/");
    expect(await sitemap()).toEqual([]);
  });

  it("includes only public content", async () => {
    const cat = await prisma.category.create({ data: { name: "Có bài", slug: "co-bai" } });
    await prisma.category.create({ data: { name: "Trống", slug: "trong" } });
    await prisma.page.create({
      data: {
        slug: "about",
        title: "About",
        body: "<p>x</p>",
        status: "published",
        authorId: editor.id,
      },
    });
    await prisma.page.create({
      data: {
        slug: "secret-page",
        title: "S",
        body: "<p>x</p>",
        status: "draft",
        authorId: editor.id,
      },
    });
    await savePost(editor, postInput("live", { categoryIds: [cat.id] }));
    await savePost(editor, postInput("draft-one", { status: "draft" }));
    await savePost(editor, postInput("hidden-from-search", { robots: "noindex" }));
    const urls = (await sitemap()).map((e) => e.url);
    const has = (suffix: string) => urls.some((u) => u.endsWith(suffix));
    expect(has("/")).toBe(true);
    expect(has("/posts")).toBe(true);
    expect(has("/posts/live")).toBe(true);
    expect(has("/pages/about")).toBe(true);
    expect(has("/categories/co-bai")).toBe(true);
    expect(has("/categories/trong")).toBe(false);
    expect(has("/posts/draft-one")).toBe(false);
    expect(has("/posts/hidden-from-search")).toBe(false);
    expect(has("/pages/secret-page")).toBe(false);
    const post = (await sitemap()).find((e) => e.url.endsWith("/posts/live"));
    expect(post?.lastModified).toBeTruthy();
  });
});

describe("JSON-LD", () => {
  const nasty = `</script><script>alert(1)</script> & "q" \u2028 \u2029`;
  it("safeJsonLd escapes markup and stays valid JSON", () => {
    const out = safeJsonLd({ name: nasty, nested: [nasty] });
    expect(out).not.toMatch(
      new RegExp(`[<>&${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`)
    );
    expect(JSON.parse(out).name).toBe(nasty);
  });
  it("breadcrumb output parses and has no raw <", () => {
    const out = breadcrumbJsonLd([
      { name: nasty, url: "http://x.test/" },
      { name: "Post", url: "http://x.test/posts/a" },
    ]);
    expect(out).not.toContain("<");
    const data = JSON.parse(out);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toHaveLength(2);
    expect(data.itemListElement[1].position).toBe(2);
  });
});

describe("feed", () => {
  it("has language, lastBuildDate, atom self link and guid", async () => {
    await setSiteSetting("siteTitle", "Hiennha.com");
    await savePost(editor, postInput("in-feed"));
    const xml = await (await feedGET()).text();
    expect(xml).toContain("<title>Hiennha.com</title>");
    expect(xml).toMatch(/<language>[a-z-]+<\/language>/i);
    expect(xml).toContain("<lastBuildDate>");
    expect(xml).toMatch(/<atom:link href="[^"]+\/feed\.xml" rel="self"/);
    expect(xml).toMatch(/<guid isPermaLink="true">[^<]+\/posts\/in-feed<\/guid>/);
  });
});
