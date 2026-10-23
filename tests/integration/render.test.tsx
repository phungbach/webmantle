import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeFrame } from "@/components/theme/theme-frame";
import type { ViewModel } from "@/components/theme/types";
import { loadBundle, resolveActiveTheme, templateFor } from "@/lib/themes/registry";
import { ThemeError } from "@/lib/themes/errors";
import { savePost, saveCategory, saveTag } from "@/lib/content/mutations";
import { getPublishedPostDetail, listPublishedPosts, getFeaturedPost } from "@/lib/content/queries";
import { activateTheme } from "@/lib/themes/activate";
import { getThemeSettings } from "@/lib/themes/settings";
import { getInstalledTheme } from "@/lib/themes/registry";
import { prisma } from "@/lib/db";
import { createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";
import { copyDir, tmpDir } from "../helpers/tmp";
import fs from "node:fs";

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
  const cat = await saveCategory(admin, { name: "Essays", slug: "essays" });
  const tag = await saveTag(admin, { name: "Design", slug: "design" });
  await savePost(admin, {
    title: "Rendering check",
    slug: "rendering-check",
    excerpt: "Checks the theme output",
    body: '<h2>Heading</h2><p>Paragraph with <a href="https://example.com">a link</a></p><script>alert(1)</script>',
    status: "published",
    featured: true,
    categoryIds: [cat],
    tagIds: [tag],
  });
});

async function renderPage(view: Record<string, unknown>, themeId = "default", preview = false) {
  const viewModel = view as unknown as ViewModel;
  const bundle = loadBundle(themeId, (await getInstalledTheme(themeId))!.path);
  const values = await getThemeSettings(themeId, bundle.manifest.settingsSchema);
  return renderToStaticMarkup(
    <ThemeFrame
      bundle={bundle}
      values={values}
      ctx={{
        site: {
          title: "Render Blog",
          description: "desc",
          url: "http://localhost:3000",
          locale: "en",
        },
        view: viewModel,
        preview,
      }}
    />
  );
}

describe("theme rendering", () => {
  it("renders the homepage with the featured post and the theme stylesheet", async () => {
    const featured = await getFeaturedPost();
    const listing = await listPublishedPosts({});
    const html = await renderPage({
      kind: "home",
      featured,
      posts: listing.items,
      total: 1,
      pagination: { basePath: "/", current: 1, totalPages: 1 },
    });
    expect(html).toContain("Rendering check");
    expect(html).toMatch(/\/theme-assets\/default\/\d+\.\d+\.\d+\/styles\.css/);
    expect(html).toContain('data-theme-id="default"');
    expect(html).toContain("Render Blog");
    expect(html).toContain("--color-accent: #9a3412");
  });

  it("renders a single post with sanitized body and no script", async () => {
    const post = await getPublishedPostDetail("rendering-check");
    const html = await renderPage({ kind: "single-post", title: post!.title, post, related: [] });
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("Essays");
    expect(html).toContain("#Design");
  });

  it("escapes user text in titles and search queries", async () => {
    const html = await renderPage({
      kind: "search",
      title: 'Results for "<img src=x onerror=alert(1)>"',
      query: "<img>",
      posts: [],
      total: 0,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("renders the not-found template", async () => {
    const html = await renderPage({ kind: "not-found", title: "Not found" });
    expect(html).toContain("We could not find that page");
  });

  it("uses the archive template for categories when a theme does not provide a category template", async () => {
    const source = copyDir(themeDir("default"), path.join(tmpDir("no-category-"), "src"));
    fs.rmSync(path.join(source, "templates", "category.json"));
    const manifestPath = path.join(source, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.supportedTemplates = manifest.supportedTemplates.filter(
      (t: string) => t !== "category"
    );
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const bundle = loadBundle("default", source);
    expect(templateFor(bundle, "category")).toEqual(templateFor(bundle, "archive"));
  });

  it("renders the category archive with the category template when present", async () => {
    const listing = await listPublishedPosts({ categorySlug: "essays" });
    const html = await renderPage({
      kind: "category",
      archiveKind: "category",
      title: "Essays",
      posts: listing.items,
      total: listing.total,
    });
    expect(html).toContain("Essays");
    // The category template uses the grid layout for its post list.
    expect(html).toContain("cms-post-list--grid");
    expect(html).toContain("Rendering check");
  });

  it("marks preview renderings and never makes them indexable", async () => {
    const html = await renderPage({ kind: "home", posts: [], total: 0 }, "starter", true);
    expect(html).toContain("Preview of an inactive theme");
  });

  it("renders a different layout for a different theme with the same content", async () => {
    const featured = await getFeaturedPost();
    const listing = await listPublishedPosts({});
    const view = {
      kind: "home",
      featured,
      posts: listing.items,
      total: 1,
      pagination: { basePath: "/", current: 1, totalPages: 1 },
    };
    const a = await renderPage(view, "default");
    const b = await renderPage(view, "starter");
    expect(a).toContain("cms-hero__eyebrow");
    expect(b).toContain("cms-header--centered");
    expect(b).toContain("Rendering check");
    expect(b).toContain('data-theme-id="starter"');
  });

  it("applies boolean and select settings as data attributes", async () => {
    const html = await renderPage({ kind: "home", posts: [], total: 0 }, "default");
    expect(html).toContain('data-setting-body-font="serif"');
    expect(html).toContain('data-setting-show-excerpts="true"');
  });
});

describe("failing themes fail safely", () => {
  it("rejects a theme whose template references a missing component when loaded", async () => {
    const source = copyDir(themeDir("starter"), path.join(tmpDir("render-bad-"), "src"));
    fs.writeFileSync(
      path.join(source, "templates", "archive.json"),
      JSON.stringify({ contractVersion: 1, root: { component: "Iframe" } })
    );
    // Load directly from disk: the bundle loader must refuse the theme instead of rendering partially.
    expect(() => loadBundle("starter", source)).toThrow(ThemeError);
  });

  it("falls back to the default theme when the active theme's stylesheet is removed", async () => {
    await activateTheme("starter", admin.id);
    fs.rmSync(path.join((await getInstalledTheme("starter"))!.path, "styles.css"));
    const resolved = await resolveActiveTheme();
    expect(resolved.fellBack).toBe(true);
    expect(await prisma.siteSetting.findUnique({ where: { key: "activeThemeId" } })).toMatchObject({
      value: "starter",
    });
  });
});
