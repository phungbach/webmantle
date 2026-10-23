import { describe, expect, it } from "vitest";
import { MOTION_CSS } from "@/lib/motion";

describe("site-wide motion css", () => {
  it("only animates for visitors who have not asked for reduced motion", () => {
    // Every rule is inside a reduced-motion guard: removing the guard leaves no rule outside it.
    const outside = MOTION_CSS.replace(
      /@media \(prefers-reduced-motion:no-preference\)\{[\s\S]*$/m,
      ""
    );
    expect(outside.trim()).toBe("");
    expect(MOTION_CSS).toContain("@media (prefers-reduced-motion:no-preference)");
  });

  it("keeps scroll-driven effects behind a feature check and uses no script or external address", () => {
    expect(MOTION_CSS).toContain("@supports (animation-timeline:view())");
    expect(MOTION_CSS).not.toMatch(/url\(|@import|<script|javascript:/i);
  });

  it("reveals with the translate property so a theme's hover transform still works", () => {
    expect(MOTION_CSS).toMatch(/@keyframes cms-reveal\{from\{opacity:0;translate:/);
  });
});
