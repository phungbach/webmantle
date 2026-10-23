import { describe, expect, it } from "vitest";
import { checkThemePages, parseThemePages } from "@/lib/themes/page-schemas";

describe("pages.json home page", () => {
  const home = { slug: "trang-chu", title: "Trang chủ", isHome: true };

  it("accepts one home page and defaults isHome to false", () => {
    expect(checkThemePages([home, { slug: "lien-he", title: "Liên hệ" }], new Set())).toEqual([]);
    expect(parseThemePages([{ slug: "lien-he", title: "Liên hệ" }])[0]?.isHome).toBe(false);
  });

  it("rejects two home pages", () => {
    const problems = checkThemePages([home, { ...home, slug: "home-2" }], new Set());
    expect(problems.join()).toContain("only one page can be the home page");
  });

  it("rejects a home page with a custom template", () => {
    const problems = checkThemePages([{ ...home, template: "projects" }], new Set(["projects"]));
    expect(problems.join()).toContain("home template");
  });
});
