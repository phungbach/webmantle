import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeFrame } from "@/components/theme/theme-frame";
import { ValidationError } from "@/lib/errors";
import { savePage, savePost, saveCategory } from "@/lib/content/mutations";
import { getPublishedPage, getPublishedPostDetail } from "@/lib/content/queries";
import { activateTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { loadBundle, getInstalledTheme } from "@/lib/themes/registry";
import { availableCustomTemplates } from "@/lib/themes/templates";
import { getThemeSettings } from "@/lib/themes/settings";
import { validateThemeDirectory } from "@/lib/themes/validate";
import { prisma } from "@/lib/db";
import { createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";
import { copyDir, tmpDir } from "../helpers/tmp";

type User = Awaited<ReturnType<typeof createUser>>;
let admin: User;

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
});

async function renderPostWith(slug: string, themeId: string, templateId: string) {
  const post = await getPublishedPostDetail(slug);
  const row = await getInstalledTheme(themeId);
  const bundle = loadBundle(themeId, row!.path);
  const values = await getThemeSettings(themeId, bundle.manifest.settingsSchema);
  return renderToStaticMarkup(
    <ThemeFrame
      bundle={bundle}
      values={values}
      ctx={{
        site: { title: "T", description: "", url: "http://localhost", locale: "en" },
        view: { kind: "single-post", templateId, title: post!.title, post: post!, related: [] },
        preview: false,
      }}
    />
  );
}

describe("template declarations", () => {
  it("lists the custom templates the active theme offers per kind", async () => {
    const posts = await availableCustomTemplates("single-post");
    const pages = await availableCustomTemplates("page");
    expect(posts.map((t) => t.id)).toEqual(["full-width"]);
    expect(pages.map((t) => t.id).sort()).toEqual(["landing"]);
  });

  it("rejects a declared custom template whose file is missing", () => {
    const dir = copyDir(themeDir("default"), path.join(tmpDir("tpl-"), "t"));
    fs.rmSync(path.join(dir, "templates", "landing.json"));
    const report = validateThemeDirectory(dir);
    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => e.file)).toContain("templates/landing.json");
  });

  it("rejects a template file that is not declared", () => {
    const dir = copyDir(themeDir("default"), path.join(tmpDir("tpl-"), "t"));
    fs.writeFileSync(
      path.join(dir, "templates", "sneaky.json"),
      JSON.stringify({ contractVersion: 1, root: { component: "Shell" } })
    );
    expect(validateThemeDirectory(dir).errors.some((e) => e.code === "unknown-template")).toBe(
      true
    );
  });

  it("refuses custom template names that collide with core templates", () => {
    const dir = copyDir(themeDir("default"), path.join(tmpDir("tpl-"), "t"));
    const file = path.join(dir, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    manifest.customTemplates = [{ id: "archive", label: "Clash", appliesTo: ["page"] }];
    fs.writeFileSync(file, JSON.stringify(manifest));
    const report = validateThemeDirectory(dir);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.message.includes("reserved"))).toBe(true);
  });

  it("refuses invalid custom template ids", () => {
    const dir = copyDir(themeDir("default"), path.join(tmpDir("tpl-"), "t"));
    const file = path.join(dir, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    manifest.customTemplates = [{ id: "../evil", label: "x", appliesTo: ["page"] }];
    fs.writeFileSync(file, JSON.stringify(manifest));
    expect(validateThemeDirectory(dir).ok).toBe(false);
  });
});

describe("choosing a template for content", () => {
  it("stores a template that the active theme offers and renders it", async () => {
    await savePost(admin, {
      title: "Wide",
      slug: "wide",
      body: "<p>x</p>",
      status: "published",
      template: "full-width",
    });
    const html = await renderPostWith("wide", "default", "full-width");
    expect(html).toContain('data-custom-template="full-width"');
    expect((await getPublishedPostDetail("wide"))?.template).toBe("full-width");
  });

  it("refuses a template the active theme does not offer", async () => {
    await expect(
      savePost(admin, {
        title: "Nope",
        slug: "nope",
        body: "x",
        status: "published",
        template: "not-a-thing",
      })
    ).rejects.toThrow(ValidationError);
    // "landing" exists, but only for pages, not for posts
    await expect(
      savePost(admin, {
        title: "Wrong kind",
        slug: "wrong-kind",
        body: "x",
        status: "published",
        template: "landing",
      })
    ).rejects.toThrow(/does not offer/);
  });

  it("lets a page use a page template", async () => {
    await savePage(admin, {
      title: "Home landing",
      slug: "home-landing",
      body: "<p>x</p>",
      status: "published",
      template: "landing",
    });
    expect((await getPublishedPage("home-landing"))?.template).toBe("landing");
  });

  it("uses the default layout when no template is chosen", async () => {
    await savePost(admin, { title: "Plain", slug: "plain", body: "<p>x</p>", status: "published" });
    const html = await renderPostWith("plain", "default", "");
    expect(html).not.toContain("data-custom-template");
  });
});

describe("templates across theme switches", () => {
  it("keeps the template choice in content and falls back to the default layout on another theme", async () => {
    await savePost(admin, {
      title: "Travelling",
      slug: "travelling",
      body: "<p>x</p>",
      status: "published",
      template: "full-width",
    });
    await activateTheme("starter", admin.id); // starter does not offer full-width
    const html = await renderPostWith("travelling", "starter", "full-width");
    expect(html).not.toContain("data-custom-template");
    expect(html).toContain("Travelling");
    // The chosen value is still stored, so switching back restores the template.
    expect((await getPublishedPostDetail("travelling"))?.template).toBe("full-width");
    await activateTheme("default", admin.id);
    expect(await renderPostWith("travelling", "default", "full-width")).toContain(
      'data-custom-template="full-width"'
    );
  });

  it("treats a theme whose declared custom template file disappeared as invalid", async () => {
    const row = await getInstalledTheme("default");
    fs.rmSync(path.join(row!.path, "templates", "full-width.json"));
    // The declaration remains, so the theme is incomplete. It must not be rendered half-broken.
    expect(() => loadBundle("default", row!.path)).toThrow(/failed validation/);
  });

  it("supports a new template added by a third-party theme without changing the core", async () => {
    const source = copyDir(themeDir("starter"), path.join(tmpDir("third-party-"), "src"));
    const manifestPath = path.join(source, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.id = "gallery-theme";
    manifest.name = "Gallery theme";
    manifest.customTemplates = [
      {
        id: "gallery",
        label: "Photo gallery",
        description: "Image-first post",
        appliesTo: ["single-post"],
      },
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    // The starter's own showcase template is not declared by this package, so its file goes too.
    fs.rmSync(path.join(source, "templates", "showcase.json"));
    fs.writeFileSync(
      path.join(source, "templates", "gallery.json"),
      JSON.stringify({
        contractVersion: 1,
        root: {
          component: "Shell",
          children: [
            { component: "SiteHeader", props: { variant: "simple" } },
            {
              component: "Section",
              props: { width: "full" },
              children: [{ component: "PostDetail", props: { showFeaturedImage: true } }],
            },
            { component: "SiteFooter" },
          ],
        },
      })
    );
    await installThemeDirectory(source, admin.id);
    await activateTheme("gallery-theme", admin.id);
    await savePost(admin, {
      title: "Holiday photos",
      slug: "holiday",
      body: "<p>pics</p>",
      status: "published",
      template: "gallery",
    });
    const html = await renderPostWith("holiday", "gallery-theme", "gallery");
    expect(html).toContain('data-custom-template="gallery"');
    expect(html).toContain("Holiday photos");
    expect(await availableCustomTemplates("single-post")).toEqual([
      { id: "gallery", label: "Photo gallery", description: "Image-first post" },
    ]);
    expect(await prisma.theme.count({ where: { id: "gallery-theme" } })).toBe(1);
  });
});

describe("category archives are unaffected", () => {
  it("still resolves categories without a custom template", async () => {
    const category = await saveCategory(admin, { name: "Notes", slug: "notes" });
    expect(category).toBeTruthy();
    expect(await prisma.category.count()).toBe(1);
  });
});
