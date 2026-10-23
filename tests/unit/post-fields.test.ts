import { describe, expect, it } from "vitest";
import { parseFields, pickFields, serializeFields } from "@/lib/content/fields";
import { collectTagRequests } from "@/lib/themes/tag-posts";

describe("post fields", () => {
  it("keeps only known keys with text values", () => {
    expect(pickFields({ type: " Nhà phố ", area: "", price: 5, other: "x" })).toEqual({
      type: "Nhà phố",
    });
    expect(pickFields(null)).toEqual({});
    expect(pickFields(["a"])).toEqual({});
  });
  it("round-trips and stays empty when there is nothing to store", () => {
    expect(serializeFields({ area: "96 m²" })).toBe('{"area":"96 m²"}');
    expect(parseFields(serializeFields({ area: "96 m²", price: "1 tỷ" }))).toEqual({
      area: "96 m²",
      price: "1 tỷ",
    });
    expect(serializeFields({ type: "  " })).toBe("");
    expect(parseFields("")).toEqual({});
    expect(parseFields("not json")).toEqual({});
  });
  it("cuts a value at 120 characters", () => {
    expect(pickFields({ area: "x".repeat(300) }).area).toHaveLength(120);
  });
});

describe("collectTagRequests", () => {
  it("finds tag blocks anywhere in the tree and keeps the largest limit", () => {
    const tree = {
      component: "Shell",
      children: [
        { component: "CourseList", props: { source: "courses", tag: "congtrinh", limit: 3 } },
        {
          component: "Section",
          children: [
            { component: "CourseList", props: { source: "projects", tag: "congtrinh", limit: 24 } },
          ],
        },
        { component: "CourseList", props: { source: "courses" } },
        { component: "PostList", props: { tag: "ignored" } },
      ],
    } as never;
    expect(collectTagRequests(tree)).toEqual([{ tag: "congtrinh", limit: 24 }]);
  });
});
