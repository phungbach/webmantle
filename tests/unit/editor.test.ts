import { describe, expect, it } from "vitest";
import { isSafeLinkUrl } from "@/components/admin/editor/safe-url";
import { sanitizeRichText } from "@/lib/security/sanitize";

describe("editor link and image addresses", () => {
  it("accepts web, mail and internal addresses", () => {
    expect(isSafeLinkUrl("https://example.com/a?b=1")).toBe(true);
    expect(isSafeLinkUrl("http://example.com")).toBe(true);
    expect(isSafeLinkUrl("mailto:hello@example.com")).toBe(true);
    expect(isSafeLinkUrl("/gioi-thieu")).toBe(true);
  });

  it("refuses script, data and protocol-relative addresses", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,x",
      "//evil.example",
      "ftp://x",
      "",
      "https://a b.com",
    ]) {
      expect(isSafeLinkUrl(bad), bad).toBe(false);
    }
  });
});

describe("editor HTML survives sanitization", () => {
  // Typical output of the Tiptap editor with the extensions used by the admin.
  const fromEditor = [
    "<h2>Giới thiệu</h2>",
    "<p>Chữ <strong>đậm</strong>, <em>nghiêng</em>, <u>gạch chân</u>, <s>gạch ngang</s>, <code>mã</code>.</p>",
    "<h3>Mục nhỏ</h3>",
    "<ul><li><p>Một</p></li><li><p>Hai</p></li></ul>",
    "<ol><li><p>Bước 1</p></li></ol>",
    "<blockquote><p>Trích dẫn</p></blockquote>",
    '<pre><code class="language-ts">const a = 1;</code></pre>',
    '<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">liên kết</a></p>',
    '<img src="/media/abc123def456" alt="Ảnh">',
    "<hr>",
  ].join("");

  it("keeps the formatting an editor produces", () => {
    const out = sanitizeRichText(fromEditor);
    for (const expected of [
      "<h2>",
      "<h3>",
      "<strong>",
      "<em>",
      "<u>",
      "<s>",
      "<code>",
      "<ul>",
      "<ol>",
      "<blockquote>",
      "<pre>",
      "<hr",
      '<img src="/media/abc123def456"',
      'href="https://example.com"',
    ]) {
      expect(out, expected).toContain(expected);
    }
  });

  it("removes what an editor should never store", () => {
    const out = sanitizeRichText(
      '<p>x</p><img src="javascript:alert(1)"><a href="javascript:alert(2)">y</a><script>z()</script>'
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<script");
    expect(out).not.toMatch(/<img[^>]*src=/);
  });
});
