import { describe, expect, it } from "vitest";
import { BLOCK_DEFS, BUILDER_TYPES, isContainer } from "@/lib/builder/blocks";
import {
  LAYOUT_LIMITS,
  layoutDocSchema,
  parseLayout,
  sanitizeLayoutDoc,
  validateLayoutInput,
  type LayoutDoc,
} from "@/lib/builder/schema";
import { COMPONENT_PROPS, linkSchema } from "@/lib/themes/contract";

let n = 0;
const id = () => `blk${String(++n).padStart(6, "0")}`;
const block = (type: string, props: Record<string, unknown> = {}, children?: unknown[]) => ({
  id: id(),
  type,
  props,
  ...(children ? { children } : {}),
});
const doc = (...blocks: unknown[]) => ({ version: 1, blocks });
const section = (...children: unknown[]) => block("Section", {}, children);

describe("block definitions", () => {
  it.each(BUILDER_TYPES)("%s: defaults validate against the component schema", (type) => {
    const def = BLOCK_DEFS[type];
    expect(def.type).toBe(type);
    // Some blocks need a value the palette fills in (none do by design: defaults must be valid).
    const parsed = COMPONENT_PROPS[type].safeParse(def.defaults);
    expect(parsed.success, JSON.stringify(parsed.success ? "" : parsed.error.issues)).toBe(true);
  });

  it.each(BUILDER_TYPES)("%s: a default block passes the whole-document schema", (type) => {
    const node = block(type, BLOCK_DEFS[type].defaults);
    const input = type === "Section" ? doc(node) : doc(section(node));
    expect(layoutDocSchema.safeParse(input).success).toBe(true);
  });

  it("only layout blocks are containers", () => {
    expect(BUILDER_TYPES.filter(isContainer).sort()).toEqual(["Grid", "Section", "Stack"]);
    expect(isContainer("Shell")).toBe(false);
  });
});

describe("document rules", () => {
  it("accepts an empty document and nested containers", () => {
    expect(layoutDocSchema.safeParse(doc()).success).toBe(true);
    const nested = doc(section(block("Grid", { columns: 3 }, [block("Heading", { text: "Hi" })])));
    const out = layoutDocSchema.parse(nested);
    expect(out.blocks[0]?.children?.[0]?.children?.[0]?.props).toMatchObject({
      text: "Hi",
      level: 2,
      align: "left",
    });
  });

  it("rejects the wrong version, extra keys and non-objects", () => {
    expect(layoutDocSchema.safeParse({ version: 2, blocks: [] }).success).toBe(false);
    expect(layoutDocSchema.safeParse({ version: 1, blocks: [], extra: 1 }).success).toBe(false);
    expect(layoutDocSchema.safeParse([]).success).toBe(false);
    expect(layoutDocSchema.safeParse(null).success).toBe(false);
    expect(layoutDocSchema.safeParse(doc({ ...block("Heading"), extra: 1 })).success).toBe(false);
  });

  it("rejects bad ids and duplicate ids", () => {
    for (const bad of ["", "abc", "ABCDEF1", "has space", "a".repeat(25), "bad-id-1", "../../x1"]) {
      expect(
        layoutDocSchema.safeParse(doc({ id: bad, type: "Divider", props: {} })).success,
        bad
      ).toBe(false);
    }
    const dup = [
      { id: "same123", type: "Divider", props: {} },
      { id: "same123", type: "Divider", props: {} },
    ];
    expect(layoutDocSchema.safeParse(doc(...dup)).success).toBe(false);
    expect(
      layoutDocSchema.safeParse(
        doc({ id: "outer12", type: "Section", props: {}, children: [dup[0]] }, dup[1])
      ).success
    ).toBe(false);
  });

  it("rejects non-builder types such as Shell, PageBody and SiteHeader", () => {
    for (const type of ["Shell", "PageBody", "SiteHeader", "SiteFooter", "Nope", "section"]) {
      expect(layoutDocSchema.safeParse(doc(block(type))).success, type).toBe(false);
    }
  });

  it("rejects a nested Section and children on non-containers", () => {
    expect(layoutDocSchema.safeParse(doc(section(section()))).success).toBe(false);
    expect(
      layoutDocSchema.safeParse(doc(section(block("Heading", {}, [block("Divider")])))).success
    ).toBe(false);
  });

  it("rejects unknown props and invalid prop values", () => {
    expect(layoutDocSchema.safeParse(doc(section(block("Heading", { bogus: 1 })))).success).toBe(
      false
    );
    expect(layoutDocSchema.safeParse(doc(section(block("Heading", { level: 9 })))).success).toBe(
      false
    );
    expect(layoutDocSchema.safeParse(doc(section(block("Button", { label: "x" })))).success).toBe(
      false
    );
  });

  it("enforces depth, node count and byte limits", () => {
    // Section > Grid > Stack > Stack > Stack = depth 5 (allowed); one more is not.
    // Section > Stack > ... > Divider with the given number of levels.
    const stack = (levels: number): unknown => {
      let node: unknown = block("Divider");
      for (let i = 0; i < levels - 1; i++) node = block("Stack", {}, [node]);
      return block("Section", {}, [node]);
    };
    expect(layoutDocSchema.safeParse(doc(stack(LAYOUT_LIMITS.depth - 1))).success).toBe(true);
    expect(layoutDocSchema.safeParse(doc(stack(LAYOUT_LIMITS.depth + 1))).success).toBe(false);

    const many = (count: number) =>
      doc(section(...Array.from({ length: count - 1 }, () => block("Divider"))));
    expect(layoutDocSchema.safeParse(many(LAYOUT_LIMITS.nodes)).success).toBe(true);
    expect(layoutDocSchema.safeParse(many(LAYOUT_LIMITS.nodes + 1)).success).toBe(false);

    const big = JSON.stringify(
      doc(
        section(
          ...Array.from({ length: 120 }, () =>
            block("RichText", { html: `<p>${"x".repeat(1900)}</p>` })
          )
        )
      )
    );
    expect(big.length).toBeGreaterThan(LAYOUT_LIMITS.bytes);
    expect(() => validateLayoutInput(big)).toThrow(/too large/i);
    expect(parseLayout(big)).toBeNull();
  });
});

describe("linkSchema", () => {
  const ok = [
    "/",
    "/path",
    "/a/b?x=1#y",
    "https://example.com",
    "http://example.com/a?b=c",
    "HTTPS://EXAMPLE.COM",
    "mailto:a@example.com",
    "#a",
    "#",
    "#section-1_x",
  ];
  const bad = [
    "",
    "//evil.example.com",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:msgbox(1)",
    "/a\\b",
    "\\\\host\\share",
    "https://exa mple.com",
    "https://",
    "mailto:",
    " /leading",
    "relative/path",
    "ftp://example.com",
    "#a b",
    "/" + "a".repeat(500),
  ];
  it.each(ok)("accepts %j", (v) => {
    expect(linkSchema.safeParse(v).success).toBe(true);
  });
  it.each(bad)("rejects %j", (v) => {
    expect(linkSchema.safeParse(v).success).toBe(false);
  });
});

describe("linkSchema internal paths", () => {
  // Site-relative paths may not contain spaces or control characters.
  it.each(["/path with space", "/a\u0001b", "/a\nb"])("rejects %j", (v) => {
    expect(linkSchema.safeParse(v).success).toBe(false);
  });
});

describe("parseLayout", () => {
  it("never throws and returns null for anything unusable", () => {
    const inputs = [
      "",
      "not json",
      "{",
      "null",
      "[]",
      "123",
      '"str"',
      '{"version":2,"blocks":[]}',
      '{"version":1}',
      '{"version":1,"blocks":"x"}',
      '{"version":1,"blocks":[null]}',
      '{"version":1,"blocks":[{"id":1}]}',
      "x".repeat(LAYOUT_LIMITS.bytes + 10),
      "[".repeat(100_000),
      JSON.stringify({ version: 1, blocks: [{ id: "abcdef", type: "Shell", props: {} }] }),
    ];
    for (const input of inputs) {
      expect(() => parseLayout(input)).not.toThrow();
      expect(parseLayout(input)).toBeNull();
    }
  });
  it("parses a valid document", () => {
    const parsed = parseLayout(JSON.stringify(doc(section(block("Heading", { text: "A" })))));
    expect(parsed?.blocks).toHaveLength(1);
  });
});

describe("XSS in rich text", () => {
  const evil =
    '<p onclick="x()">hi</p><script>alert(1)</script><img src=x onerror=alert(2)>' +
    '<a href="javascript:alert(3)">link</a><iframe src="https://evil.example"></iframe>' +
    '<a href="https://ok.example" onmouseover="y()">ok</a>';
  const rich = (html: string) => doc(section(block("RichText", { html })));
  const expectClean = (html: string) => {
    expect(html).not.toMatch(/<script|onerror|onclick|onmouseover|javascript:|<iframe|alert\(/i);
    expect(html).toContain("hi");
    expect(html).toContain("https://ok.example");
  };
  const htmlOf = (d: LayoutDoc) => String(d.blocks[0]?.children?.[0]?.props.html);

  it("layoutDocSchema and validateLayoutInput sanitize", () => {
    expectClean(htmlOf(layoutDocSchema.parse(rich(evil))));
    expectClean(htmlOf(validateLayoutInput(rich(evil))));
    expectClean(htmlOf(validateLayoutInput(JSON.stringify(rich(evil)))));
  });

  it("sanitizeLayoutDoc cleans a document that skipped validation, and is idempotent", () => {
    const raw = rich(evil) as unknown as LayoutDoc;
    const once = sanitizeLayoutDoc(raw);
    expectClean(htmlOf(once));
    expect(sanitizeLayoutDoc(once)).toEqual(once);
  });

  it("parseLayout sanitizes stored JSON", () => {
    const parsed = parseLayout(JSON.stringify(rich(evil)));
    expect(parsed).not.toBeNull();
    expectClean(htmlOf(parsed!));
  });
});
