import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeFrame } from "@/components/theme/theme-frame";
import { getAdjacentPosts, getPublishedPostDetail, getRelatedPosts } from "@/lib/content/queries";
import { activateTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { getInstalledTheme, loadBundle } from "@/lib/themes/registry";
import { getThemeSettings } from "@/lib/themes/settings";
import { createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";

const THEME = "hien-studio";

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  const admin = await createUser("admin");
  await installThemeDirectory(themeDir(THEME), admin.id);
  await activateTheme(THEME, admin.id);
});

async function render(slug: string, locale: "vi" | "en") {
  const row = (await getInstalledTheme(THEME))!;
  const bundle = loadBundle(THEME, row.path);
  const values = await getThemeSettings(THEME, bundle.manifest.settingsSchema);
  const post = (await getPublishedPostDetail(slug, new Date(), locale))!;
  const adjacent = await getAdjacentPosts(post, new Date(), locale);
  const related = await getRelatedPosts(post, 4, new Date(), locale);
  return renderToStaticMarkup(
    <ThemeFrame
      bundle={bundle}
      values={values}
      ctx={{
        site: { title: "Studio", description: "", url: "http://localhost", locale, logoUrl: null },
        view: { kind: "single-post", title: post.title, post, related, adjacent },
      }}
    />
  );
}

describe("post page of the theme", () => {
  it("shows a table of contents that links to the headings, share links, author and neighbours", async () => {
    const html = await render("chon-go-cho-san-nha", "vi");
    expect(html).toContain('class="cms-toc"');
    expect(html).toMatch(/href="#oc-cho-dep-nhung-mem"/);
    expect(html).toContain('id="oc-cho-dep-nhung-mem"');
    expect(html).toContain("facebook.com/sharer");
    expect(html).toContain('class="cms-author"');
    expect(html).toContain('class="cms-adjacent"');
    expect(html).toContain("Trong bài này");
  });

  it("uses the English words for the same elements", async () => {
    const html = await render("chon-go-cho-san-nha", "en");
    expect(html).toContain("In this article");
    expect(html).toContain("min read");
    expect(html).toContain("Next post");
    expect(html).toMatch(/href="#walnut-beautiful-but-soft"/);
  });

  it("draws related posts as a large card and two small ones, with a link to all posts", async () => {
    const html = await render("chon-go-cho-san-nha", "en");
    expect(html).toContain("cms-related--cards");
    expect(html).toContain("cms-post-list--related");
    expect(html).toContain("cms-post--related");
    expect(html).toContain('href="/posts"');
    expect(html).toContain("See all posts");
  });
});
