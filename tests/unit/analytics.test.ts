import { describe, expect, it } from "vitest";
import { classifySource, dayKey, isBot, parseTrackPath, visitorHash } from "@/lib/analytics/track";
import { percentChange } from "@/lib/analytics/stats";

describe("isBot", () => {
  it("rejects crawlers and empty agents", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(
      true
    );
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(undefined)).toBe(true);
  });
  it("accepts a normal browser", () => {
    expect(
      isBot(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
      )
    ).toBe(false);
  });
});

describe("classifySource", () => {
  const hosts = ["example.com", "localhost:3100"];
  it("treats a missing referrer as direct", () => {
    expect(classifySource("", hosts)).toBe("direct");
    expect(classifySource(undefined, hosts)).toBe("direct");
    expect(classifySource("not a url", hosts)).toBe("direct");
  });
  it("recognises search, social and other sites", () => {
    expect(classifySource("https://www.google.com/search?q=x", hosts)).toBe("search");
    expect(classifySource("https://www.bing.com/", hosts)).toBe("search");
    expect(classifySource("https://l.facebook.com/l.php", hosts)).toBe("social");
    expect(classifySource("https://t.co/abc", hosts)).toBe("social");
    expect(classifySource("https://news.example.org/post", hosts)).toBe("referral");
  });
  it("does not mistake look-alike hosts for search or social", () => {
    expect(classifySource("https://notfacebook.example.org/", hosts)).toBe("referral");
    expect(classifySource("https://fast.com/", hosts)).toBe("referral");
    expect(classifySource("https://google.com.vn/", hosts)).toBe("search");
  });
  it("marks moves inside the site as internal", () => {
    expect(classifySource("https://example.com/posts/a", hosts)).toBe("internal");
    expect(classifySource("http://localhost:3100/", hosts)).toBe("internal");
    expect(classifySource("https://google.com/", hosts, true)).toBe("internal");
  });
});

describe("parseTrackPath", () => {
  it("accepts public content paths", () => {
    expect(parseTrackPath("/")).toEqual({ kind: "home", path: "/" });
    expect(parseTrackPath("/posts")).toEqual({ kind: "posts", path: "/posts" });
    expect(parseTrackPath("/posts/hello-world?x=1#top")).toEqual({
      kind: "post",
      path: "/posts/hello-world",
      slug: "hello-world",
    });
    expect(parseTrackPath("/pages/about/")).toEqual({
      kind: "page",
      path: "/pages/about",
      slug: "about",
    });
  });
  it("decodes encoded slugs", () => {
    expect(parseTrackPath("/posts/b%C3%A0i-vi%E1%BA%BFt")).toMatchObject({ slug: "bài-viết" });
  });
  it("rejects everything else", () => {
    for (const bad of [
      "/admin",
      "/admin/posts",
      "/api/track",
      "/media/abc",
      "posts/a",
      "/posts/a/b",
      "/posts/%zz",
      "",
      5,
      null,
      "/" + "a".repeat(300),
    ]) {
      expect(parseTrackPath(bad)).toBeNull();
    }
  });
});

describe("visitorHash", () => {
  const day = dayKey(new Date("2026-10-20T10:00:00Z"));
  it("is stable within a day and different across days, addresses and browsers", () => {
    const base = visitorHash("secret", "1.2.3.4", "UA", day);
    expect(visitorHash("secret", "1.2.3.4", "UA", day)).toBe(base);
    expect(visitorHash("secret", "1.2.3.4", "UA", "2026-10-21")).not.toBe(base);
    expect(visitorHash("secret", "1.2.3.5", "UA", day)).not.toBe(base);
    expect(visitorHash("secret", "1.2.3.4", "UB", day)).not.toBe(base);
    expect(visitorHash("other", "1.2.3.4", "UA", day)).not.toBe(base);
  });
  it("does not contain the address", () => {
    expect(visitorHash("secret", "1.2.3.4", "UA", day)).not.toContain("1.2.3.4");
  });
});

describe("percentChange", () => {
  it("computes change and handles a zero baseline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });
});
