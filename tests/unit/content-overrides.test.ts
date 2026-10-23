import { describe, expect, it } from "vitest";
import { applyContentOverrides } from "@/lib/themes/content-overrides";
import { contentImageUrl } from "@/lib/themes/content-image";
import { assetImage } from "@/lib/themes/content-schemas";

describe("applyContentOverrides", () => {
  const base = { hero: { title: "Base", text: "t" }, nav: [{ label: "A", href: "/a" }], cta: { x: 1 } };

  it("replaces whole top-level keys, nothing deeper", () => {
    const out = applyContentOverrides(base, { hero: { title: "New" } });
    expect(out.hero).toEqual({ title: "New" });
    expect(out.nav).toBe(base.nav);
    expect(out.cta).toBe(base.cta);
  });

  it("does not mutate its inputs", () => {
    const content = structuredClone(base);
    const overrides = { hero: { title: "New" } };
    const frozenContent = JSON.stringify(content);
    const frozenOver = JSON.stringify(overrides);
    const out = applyContentOverrides(content, overrides);
    expect(JSON.stringify(content)).toBe(frozenContent);
    expect(JSON.stringify(overrides)).toBe(frozenOver);
    expect(out).not.toBe(content);
  });

  it("ignores bad keys", () => {
    const overrides: Record<string, unknown> = {
      "Bad-key": 1,
      Upper: 2,
      "9starts": 3,
      ["a".repeat(42)]: 5,
      "has space": 6,
      "": 7,
    };
    Object.defineProperty(overrides, "__proto__", { value: { polluted: true }, enumerable: true });
    const out = applyContentOverrides(base, overrides);
    expect(Object.keys(out).sort()).toEqual(["cta", "hero", "nav"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it("a key named like an Object member only becomes a plain own value", () => {
    // "constructor" matches the key pattern; it must not touch any prototype.
    const out = applyContentOverrides(base, { constructor: { polluted: true } });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(out, "constructor")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(base)).toEqual(["hero", "nav", "cta"]);
  });

  it("accepts the longest allowed key and adds new keys", () => {
    const key = "a".repeat(41);
    expect(applyContentOverrides({}, { [key]: 1, fresh: 2 })).toEqual({ [key]: 1, fresh: 2 });
  });
});

describe("contentImageUrl", () => {
  it("maps media references to the media route", () => {
    expect(contentImageUrl("english-center", "1.4.0", "media/abcdefghij1")).toBe("/media/abcdefghij1");
  });
  it("maps asset files to the theme-assets route", () => {
    expect(contentImageUrl("english-center", "1.4.0", "assets/hero.jpg")).toBe(
      "/theme-assets/english-center/1.4.0/assets/hero.jpg"
    );
  });
  it("only references that pass the content schema can reach the URL, and none can traverse", () => {
    const garbage = [
      "../../etc/passwd",
      "assets/../../x.png",
      "media/../x",
      "media/ab",
      "media/ABCDEFGHIJ",
      "/etc/passwd",
      "assets/.hidden.png",
      "https://evil.example/x.png",
      "javascript:alert(1)",
      "assets/a b.png",
      "assets/x.svg",
      "",
    ];
    for (const ref of garbage) {
      const parsed = assetImage.safeParse(ref);
      expect(parsed.success, ref).toBe(false);
    }
    for (const ref of ["assets/hero.jpg", "media/abcdefghij", "assets/a-b-1.webp"]) {
      expect(assetImage.safeParse(ref).success).toBe(true);
      expect(contentImageUrl("t", "1.0.0", ref)).not.toContain("..");
    }
  });
});
