import { describe, expect, it } from "vitest";
import { squareCrop } from "@/lib/logo-crop";

describe("logo square crop", () => {
  it("uses the largest centred square by default", () => {
    // A wide banner 1200 x 600: the square is 600 wide, centred horizontally.
    expect(squareCrop(1200, 600, 1, { x: 600, y: 300 })).toEqual({ sx: 300, sy: 0, side: 600 });
  });

  it("zooming in shrinks the square around the same centre", () => {
    expect(squareCrop(1000, 1000, 2, { x: 500, y: 500 })).toEqual({ sx: 250, sy: 250, side: 500 });
  });

  it("keeps the square inside the image when dragged to an edge", () => {
    const c = squareCrop(1200, 600, 1, { x: -500, y: 9999 });
    expect(c.sx).toBe(0);
    expect(c.sy).toBe(0);
    const far = squareCrop(1200, 600, 1, { x: 9999, y: 0 });
    expect(far.sx + far.side).toBeLessThanOrEqual(1200);
  });

  it("limits zoom to a sensible range", () => {
    expect(squareCrop(400, 400, 0.2, { x: 200, y: 200 }).side).toBe(400);
    expect(squareCrop(400, 400, 99, { x: 200, y: 200 }).side).toBe(100);
  });
});
