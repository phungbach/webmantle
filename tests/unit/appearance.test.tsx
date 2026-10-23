import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activeSeason,
  appearanceCss,
  APPEARANCE_DEFAULTS,
  appearanceSchema,
  seasonForMonth,
} from "@/lib/appearance";
import { SeasonOverlay } from "@/components/public/season-overlay";

describe("seasons", () => {
  it("maps months to seasons", () => {
    expect(seasonForMonth(3)).toBe("spring");
    expect(seasonForMonth(7)).toBe("summer");
    expect(seasonForMonth(10)).toBe("autumn");
    expect(seasonForMonth(1)).toBe("winter");
    expect(seasonForMonth(12)).toBe("winter");
  });

  it("uses the month only for automatic mode, and nothing when off", () => {
    const march = new Date("2026-03-15T00:00:00Z");
    expect(activeSeason("auto", march)).toBe("spring");
    expect(activeSeason("off", march)).toBeNull();
    expect(activeSeason("winter", march)).toBe("winter");
  });

  it("renders the same markup every time, so server and browser agree", () => {
    const a = renderToStaticMarkup(<SeasonOverlay season="winter" />);
    const b = renderToStaticMarkup(<SeasonOverlay season="winter" />);
    expect(a).toBe(b);
    expect(a).toContain('aria-hidden="true"');
    expect(a).toContain("prefers-reduced-motion");
  });
});

describe("colour overrides", () => {
  it("writes the accent of the chosen colour set", () => {
    expect(appearanceCss({ ...APPEARANCE_DEFAULTS, palette: "green" })).toContain(
      "--color-accent:#059669"
    );
  });

  it("writes no accent when the theme's own colours are kept", () => {
    expect(appearanceCss(APPEARANCE_DEFAULTS)).not.toContain("--color-accent:");
  });

  it("uses the chosen heading colour, or the default charcoal", () => {
    expect(
      appearanceCss({ ...APPEARANCE_DEFAULTS, h1Mode: "custom", h1Color: "#123abc" })
    ).toContain("color:#123abc");
    expect(appearanceCss({ ...APPEARANCE_DEFAULTS, h1Mode: "default" })).toContain("color:#111827");
    expect(appearanceCss(APPEARANCE_DEFAULTS)).toContain("var(--color-accent, currentColor)");
  });
});

describe("input validation", () => {
  it("accepts the values the form sends", () => {
    const ok = appearanceSchema.safeParse({
      palette: "red",
      h1Mode: "custom",
      h1Color: "#AABBCC",
      season: "autumn",
      blockDevtools: true,
    });
    expect(ok.success).toBe(true);
  });

  it("refuses anything outside the fixed lists, and colours that could break CSS", () => {
    const base = {
      palette: "red",
      h1Mode: "custom",
      h1Color: "#AABBCC",
      season: "autumn",
      blockDevtools: false,
    };
    expect(appearanceSchema.safeParse({ ...base, palette: "neon" }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...base, season: "monsoon" }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...base, h1Color: "red;}body{display:none" }).success).toBe(
      false
    );
    expect(appearanceSchema.safeParse({ ...base, h1Color: "#fff" }).success).toBe(false);
  });
});
