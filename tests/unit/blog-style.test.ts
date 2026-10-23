import { describe, expect, it } from "vitest";
import { BLOG_STYLE_DEFAULTS, blogStyleCss, blogStyleSchema } from "@/lib/blog-style";

describe("blogStyleCss", () => {
  it("adds nothing when every option is left to the theme", () => {
    expect(blogStyleCss(BLOG_STYLE_DEFAULTS)).toBe("");
  });

  it("turns the list into a two-column grid that stacks on phones", () => {
    const css = blogStyleCss({ ...BLOG_STYLE_DEFAULTS, listLayout: "grid" });
    expect(css).toContain("repeat(2,minmax(0,1fr))");
    expect(css).toContain("@media (max-width:640px)");
  });

  it("uses the chosen corner radius only for boxed and raised cards", () => {
    expect(
      blogStyleCss({ ...BLOG_STYLE_DEFAULTS, cardStyle: "flat", cardRadius: 20 })
    ).not.toContain("20px");
    expect(blogStyleCss({ ...BLOG_STYLE_DEFAULTS, cardStyle: "card", cardRadius: 20 })).toContain(
      "border-radius:20px"
    );
  });

  it("hides images and excerpts when asked", () => {
    const css = blogStyleCss({ ...BLOG_STYLE_DEFAULTS, showImages: false, showExcerpts: false });
    expect(css).toContain(".cms-post__image{display:none}");
    expect(css).toContain(".cms-post__excerpt{display:none}");
  });

  it("never leaves the compact list alone with the grid rule", () => {
    expect(blogStyleCss({ ...BLOG_STYLE_DEFAULTS, listLayout: "list" })).toContain(
      ":not(.cms-post-list--compact)"
    );
  });
});

describe("blogStyleSchema", () => {
  it("refuses a radius outside 0–24 and unknown options", () => {
    expect(blogStyleSchema.safeParse({ ...BLOG_STYLE_DEFAULTS, cardRadius: 40 }).success).toBe(
      false
    );
    expect(
      blogStyleSchema.safeParse({ ...BLOG_STYLE_DEFAULTS, listLayout: "url(x)" }).success
    ).toBe(false);
  });
});
