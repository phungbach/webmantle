import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { MobileNav } from "@/components/theme/mobile-nav";

describe("MobileNav server render", () => {
  it("contains the toggle button and the nav with its links", () => {
    const html = renderToStaticMarkup(
      <MobileNav label="Main menu" openLabel="Open menu" closeLabel="Close menu">
        <span>Home</span>
        <a href="/search">Search</a>
      </MobileNav>
    );
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Open menu"');
    const id = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/<nav[^>]*aria-label="Main menu"/);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("Search</a>");
  });

  it("uses the Vietnamese-style labels it is given", () => {
    const html = renderToStaticMarkup(
      <MobileNav label="Menu chính" openLabel="Mở menu" closeLabel="Đóng menu">
        <span>Trang chủ</span>
      </MobileNav>
    );
    expect(html).toContain('aria-label="Mở menu"');
  });
});
