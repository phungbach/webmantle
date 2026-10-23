import { describe, expect, it } from "vitest";
import { withHeadingIds } from "@/lib/content/headings";

describe("withHeadingIds", () => {
  it("gives headings safe, unique ids and lists the h2 ones", () => {
    const { html, headings } = withHeadingIds(
      "<p>x</p><h2>Óc chó: đẹp nhưng mềm</h2><h3>Chi tiết</h3><h2>Óc chó: đẹp nhưng mềm</h2>"
    );
    expect(headings).toEqual([
      { id: "oc-cho-dep-nhung-mem", text: "Óc chó: đẹp nhưng mềm" },
      { id: "oc-cho-dep-nhung-mem-2", text: "Óc chó: đẹp nhưng mềm" },
    ]);
    expect(html).toContain('<h2 id="oc-cho-dep-nhung-mem">');
    expect(html).toContain('<h3 id="chi-tiet">');
  });

  it("keeps markup inside headings, drops an existing id, and tolerates no headings", () => {
    const { html, headings } = withHeadingIds('<h2 id="x" class="a"><em>Một</em> hai</h2>');
    expect(headings[0]?.text).toBe("Một hai");
    expect(html).toBe('<h2 class="a" id="mot-hai"><em>Một</em> hai</h2>');
    expect(withHeadingIds("<p>chỉ đoạn văn</p>")).toEqual({
      html: "<p>chỉ đoạn văn</p>",
      headings: [],
    });
  });
});
