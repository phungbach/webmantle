import { describe, expect, it } from "vitest";
import { sanitizeRichText, stripToText } from "@/lib/security/sanitize";
import { isValidSlug, slugify } from "@/lib/content/slug";
import { createPreviewToken, verifyPreviewToken } from "@/lib/themes/preview-token";
import { coerceSettingValue, resolveSettings, buildThemeCss } from "@/lib/themes/settings";
import { detectImage } from "@/lib/media";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { can, canView, type Permission } from "@/lib/auth/permissions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import { postSchema } from "@/lib/validation/schemas";
import type { SettingDefinition } from "@/lib/themes/contract";

describe("HTML sanitization", () => {
  it("removes scripts and event handlers", () => {
    const out = sanitizeRichText(
      '<p onclick="x()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>'
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).toContain("<p>hi</p>");
  });

  it("blocks javascript: and data: links", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
    expect(sanitizeRichText('<a href="data:text/html,<script>1</script>">x</a>')).not.toContain(
      "data:"
    );
  });

  it("forces safe rel attributes on links", () => {
    expect(sanitizeRichText('<a href="https://example.com">x</a>')).toContain(
      'rel="noopener noreferrer nofollow"'
    );
  });

  it("strips iframes and forms", () => {
    const out = sanitizeRichText(
      '<iframe src="https://evil"></iframe><form action="/x"><input></form>'
    );
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("form");
  });

  it("produces plain text excerpts without markup", () => {
    expect(stripToText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });
});

describe("slugs", () => {
  it("normalizes titles", () => {
    expect(slugify("Hello, World! Đẹp lắm")).toBe("hello-world-dep-lam");
  });

  it("rejects reserved and malformed slugs", () => {
    expect(isValidSlug("admin")).toBe(false);
    expect(isValidSlug("Hello")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
    expect(isValidSlug("good-slug-1")).toBe(true);
  });
});

describe("preview tokens", () => {
  it("accepts a fresh token for the same theme", () => {
    const token = createPreviewToken("starter");
    expect(verifyPreviewToken(token)?.themeId).toBe("starter");
  });

  it("rejects tampered payloads", () => {
    const token = createPreviewToken("starter");
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ themeId: "admin", exp: Date.now() + 60000 })
    ).toString("base64url");
    expect(verifyPreviewToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyPreviewToken(`${body}.AAAA`)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const now = Date.now();
    const token = createPreviewToken("starter", now - 60 * 60 * 1000);
    expect(verifyPreviewToken(token, now)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyPreviewToken(undefined)).toBeNull();
    expect(verifyPreviewToken("")).toBeNull();
    expect(verifyPreviewToken("a.b.c")).toBeNull();
  });
});

describe("theme settings", () => {
  const color: SettingDefinition = {
    key: "accentColor",
    label: "Accent",
    type: "color",
    default: "#123456",
    cssVariable: "--color-accent",
  };
  const text: SettingDefinition = {
    key: "tagline",
    label: "Tagline",
    type: "text",
    default: "hi",
    maxLength: 20,
    cssVariable: "--tagline",
  };
  const select: SettingDefinition = {
    key: "font",
    label: "Font",
    type: "select",
    default: "serif",
    options: ["serif", "sans"],
  };
  const flag: SettingDefinition = {
    key: "showExcerpts",
    label: "Show",
    type: "boolean",
    default: true,
  };

  it("accepts valid values and normalizes colors", () => {
    expect(coerceSettingValue(color, "#ABCDEF")).toBe("#abcdef");
    expect(coerceSettingValue(select, "sans")).toBe("sans");
    expect(coerceSettingValue(flag, "false")).toBe(false);
  });

  it("rejects invalid colors and unknown select options", () => {
    expect(() => coerceSettingValue(color, "red;}body{")).toThrow();
    expect(() => coerceSettingValue(select, "comic-sans")).toThrow();
  });

  it("refuses CSS injection through text settings that feed a CSS variable", () => {
    expect(() => coerceSettingValue(text, "x}body{display:none")).toThrow();
    expect(() => coerceSettingValue(text, "url(https://evil.example/x)")).toThrow();
    expect(() => coerceSettingValue(text, "a".repeat(21))).toThrow();
  });

  it("falls back to defaults for stored values that no longer validate", () => {
    const resolved = resolveSettings(
      [color, select],
      new Map([
        ["accentColor", "not-a-color"],
        ["font", "sans"],
      ])
    );
    expect(resolved.accentColor).toBe("#123456");
    expect(resolved.font).toBe("sans");
  });

  it("builds CSS from validated values only", () => {
    const css = buildThemeCss({ "color-bg": "#fff" }, [color, select], {
      accentColor: "#abcdef",
      font: "serif",
    });
    expect(css).toBe(":root{--color-bg: #fff;--color-accent: #abcdef;}");
  });
});

describe("media detection", () => {
  it("recognizes PNG by its signature and reads dimensions", () => {
    const png = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(detectImage(png)).toMatchObject({
      mimeType: "image/png",
      extension: "png",
      width: 640,
      height: 480,
    });
  });

  it("rejects SVG, HTML and executables even with an image extension", () => {
    expect(() => detectImage(Buffer.from("<svg onload=alert(1)></svg>"))).toThrow(ValidationError);
    expect(() => detectImage(Buffer.from("<html><script>alert(1)</script></html>"))).toThrow(
      ValidationError
    );
    expect(() => detectImage(Buffer.from("MZ\x90\x00executable"))).toThrow(ValidationError);
  });
});

describe("authentication primitives", () => {
  it("hashes passwords and verifies them", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("stores only a hash of session tokens", () => {
    expect(hashToken("abc")).not.toContain("abc");
    expect(hashToken("abc")).toHaveLength(64);
  });

  it("blocks requests after the limit within the window", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(hitRateLimit(key, 5, 60_000, now).allowed).toBe(true);
    const blocked = hitRateLimit(key, 5, 60_000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(hitRateLimit(key, 5, 60_000, now + 61_000).allowed).toBe(true);
  });
});

describe("role permissions", () => {
  it("gives admins everything and authors only their own content", () => {
    expect(can("admin", "themes:manage")).toBe(true);
    expect(can("admin", "users:manage")).toBe(true);
    expect(can("editor", "content:publish")).toBe(true);
    expect(can("editor", "themes:manage")).toBe(false);
    expect(can("author", "content:publish")).toBe(false);
    expect(can("author", "content:write-any")).toBe(false);
    expect(can("author", "content:write-own")).toBe(true);
    expect(can("admin", "plugins:manage")).toBe(true);
    expect(can("editor", "plugins:manage")).toBe(false);
    expect(can("author", "plugins:manage")).toBe(false);
  });

  it("treats unknown roles as having no permissions", () => {
    expect(can("superuser", "content:write-own")).toBe(false);
    expect(can("", "themes:manage")).toBe(false);
  });
});

describe("post input validation", () => {
  it("rejects missing titles and invalid slugs", () => {
    expect(postSchema.safeParse({ title: "", slug: "ok", body: "", status: "draft" }).success).toBe(
      false
    );
    expect(
      postSchema.safeParse({ title: "T", slug: "admin", body: "", status: "draft" }).success
    ).toBe(false);
    expect(
      postSchema.safeParse({ title: "T", slug: "fine", body: "", status: "published" }).success
    ).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(
      postSchema.safeParse({ title: "T", slug: "t", body: "", status: "deleted" }).success
    ).toBe(false);
  });
});

describe("guide videos in rich text", () => {
  it("keeps a video from /videos and forces safe attributes", () => {
    const out = sanitizeRichText(
      '<figure><video src="/videos/guide-1.mp4" poster="/videos/guide-1.jpg" autoplay onerror="x()"></video></figure>'
    );
    expect(out).toContain('src="/videos/guide-1.mp4"');
    expect(out).toContain('poster="/videos/guide-1.jpg"');
    expect(out).toContain('controls="controls"');
    expect(out).toContain('preload="none"');
    expect(out).not.toContain("autoplay");
    expect(out).not.toContain("onerror");
  });

  it("drops videos that do not come from /videos", () => {
    expect(sanitizeRichText('<video src="https://evil.example/x.mp4"></video><p>a</p>')).toBe(
      "<p>a</p>"
    );
    expect(sanitizeRichText('<video src="/videos/../secret.mp4"></video>')).toBe("");
  });
});

describe("read-only demo role", () => {
  const ALL: Permission[] = [
    "content:write-own",
    "content:write-any",
    "content:publish",
    "taxonomy:manage",
    "media:upload",
    "themes:manage",
    "settings:manage",
    "users:manage",
    "audit:read",
    "plugins:manage",
  ];

  it("holds no write permission", () => {
    for (const permission of ALL) expect(can("viewer", permission), permission).toBe(false);
  });

  it("may open every admin screen", () => {
    for (const permission of ALL) expect(canView("viewer", permission), permission).toBe(true);
  });

  it("does not widen the other roles", () => {
    expect(canView("author", "users:manage")).toBe(false);
    expect(canView("editor", "themes:manage")).toBe(false);
    expect(canView("admin", "users:manage")).toBe(true);
    expect(canView("nobody", "audit:read")).toBe(false);
  });
});

describe("private data shown to the demo account", () => {
  it("masks emails and IP addresses", async () => {
    const { maskPrivate } = await import("@/lib/redact");
    expect(maskPrivate("admin@mail.com")).toBe("a***@m***.com");
    expect(maskPrivate("user jane.doe@example.co.uk from 203.0.113.9")).toBe(
      "user j***@e***.co.uk from •••.•••.•••.•••"
    );
    expect(maskPrivate("2001:db8:85a3::8a2e:370:7334")).toContain("••••:••••");
    expect(maskPrivate("no personal data here")).toBe("no personal data here");
  });
});
