import { describe, expect, it } from "vitest";
import { MENU_ROWS, menuSchema, menuToRows, rowsToMenu } from "@/lib/menu";

describe("rowsToMenu", () => {
  it("nests child rows under the top-level row above them", () => {
    const menu = rowsToMenu([
      { label: "Dịch vụ", href: "/pages/dich-vu", child: false },
      { label: "VPS", href: "/pages/vps", child: true },
      { label: "Hosting", href: "/pages/hosting", child: true },
      { label: "Liên hệ", href: "/pages/lien-he", child: false },
    ]);
    expect(menu).toEqual([
      {
        label: "Dịch vụ",
        href: "/pages/dich-vu",
        children: [
          { label: "VPS", href: "/pages/vps" },
          { label: "Hosting", href: "/pages/hosting" },
        ],
      },
      { label: "Liên hệ", href: "/pages/lien-he", children: [] },
    ]);
  });

  it("skips empty rows and treats an orphan child as a top-level item", () => {
    const menu = rowsToMenu([
      { label: "", href: "", child: false },
      { label: "Blog", href: "/", child: true },
    ]);
    expect(menu).toEqual([{ label: "Blog", href: "/", children: [] }]);
  });

  it("keeps the saved shape valid for the stored menu", () => {
    const menu = rowsToMenu([{ label: "Trang chủ", href: "/", child: false }]);
    expect(menuSchema.safeParse(menu).success).toBe(true);
  });
});

describe("menu validation", () => {
  it("refuses javascript: and protocol-relative links", () => {
    expect(
      menuSchema.safeParse([{ label: "X", href: "javascript:alert(1)", children: [] }]).success
    ).toBe(false);
    expect(
      menuSchema.safeParse([{ label: "X", href: "//evil.example", children: [] }]).success
    ).toBe(false);
  });

  it("refuses a link without a name", () => {
    expect(menuSchema.safeParse([{ label: "  ", href: "/", children: [] }]).success).toBe(false);
  });
});

describe("menuToRows", () => {
  it("flattens the tree and adds spare empty rows, within the editor limit", () => {
    const rows = menuToRows(
      [{ label: "A", href: "/a", children: [{ label: "B", href: "/b" }] }],
      2
    );
    expect(rows).toEqual([
      { label: "A", href: "/a", child: false },
      { label: "B", href: "/b", child: true },
      { label: "", href: "", child: false },
      { label: "", href: "", child: false },
    ]);
    expect(menuToRows([], 100)).toHaveLength(MENU_ROWS);
  });
});
