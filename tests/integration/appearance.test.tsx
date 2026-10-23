import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MEDIA_DIR } from "@/lib/env";
import { getAppearance, getSiteBranding, saveAppearance, setLogoMedia } from "@/lib/appearance";
import { ValidationError } from "@/lib/errors";
import { ThemeFrame } from "@/components/theme/theme-frame";
import { getSiteMenu, saveSiteMenu } from "@/lib/menu";
import { loadBundle, getInstalledTheme } from "@/lib/themes/registry";
import { getThemeSettings } from "@/lib/themes/settings";
import { GET as siteIcon } from "@/app/site-icon/route";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  await createUser("admin");
});

async function renderHome(site: Record<string, unknown>) {
  // Same source the public pages use: the saved appearance and the logo address.
  const branding = await getSiteBranding();
  const row = (await getInstalledTheme("default"))!;
  const bundle = loadBundle("default", row.path);
  const values = await getThemeSettings("default", bundle.manifest.settingsSchema);
  return renderToStaticMarkup(
    <ThemeFrame
      bundle={bundle}
      values={values}
      ctx={{
        site: {
          title: "Shop",
          description: "",
          url: "http://localhost",
          locale: "vi",
          logoUrl: branding.logoUrl,
          appearance: branding.appearance,
          ...site,
        } as never,
        view: { kind: "home", posts: [], total: 0 },
        preview: false,
      }}
    />
  );
}

describe("saved appearance", () => {
  it("starts from the defaults", async () => {
    expect(await getAppearance()).toEqual({
      palette: "theme",
      h1Mode: "theme",
      h1Color: "#111827",
      season: "off",
      motion: "on",
      blockDevtools: false,
      logoMediaId: "",
    });
  });

  it("keeps the motion choice and refuses unknown values", async () => {
    const base = {
      palette: "theme",
      h1Mode: "theme",
      h1Color: "#111827",
      season: "off",
      blockDevtools: false,
    };
    await saveAppearance({ ...base, motion: "off" });
    expect((await getAppearance()).motion).toBe("off");
    await expect(saveAppearance({ ...base, motion: "wild" })).rejects.toThrow();
  });

  it("stores and reads back what the admin saved", async () => {
    await saveAppearance({
      palette: "orange",
      h1Mode: "custom",
      h1Color: "#00AA11",
      season: "winter",
      blockDevtools: true,
    });
    expect(await getAppearance()).toMatchObject({
      palette: "orange",
      h1Mode: "custom",
      h1Color: "#00aa11",
      season: "winter",
      blockDevtools: true,
    });
  });

  it("refuses invalid values and keeps the previous ones", async () => {
    await saveAppearance({
      palette: "green",
      h1Mode: "theme",
      h1Color: "#111827",
      season: "off",
      blockDevtools: false,
    });
    await expect(
      saveAppearance({
        palette: "javascript:x",
        h1Mode: "theme",
        h1Color: "#111827",
        season: "off",
        blockDevtools: false,
      })
    ).rejects.toThrow(ValidationError);
    expect((await getAppearance()).palette).toBe("green");
  });

  it("replaces a stored value that is no longer allowed with the default", async () => {
    await prisma.siteSetting.create({ data: { key: "season", value: "monsoon" } });
    await prisma.siteSetting.create({ data: { key: "h1Color", value: "red;}" } });
    const a = await getAppearance();
    expect(a.season).toBe("off");
    expect(a.h1Color).toBe("#111827");
  });
});

describe("logo and favicon", () => {
  it("has no logo until one is set, and then serves it as the tab icon", async () => {
    expect((await getSiteBranding()).logoUrl).toBeNull();
    expect((await siteIcon()).status).toBe(404);

    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const png = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(512, 16);
    png.writeUInt32BE(512, 20);
    const filename = `${"a".repeat(32)}.png`;
    fs.writeFileSync(path.join(MEDIA_DIR, filename), png);
    const media = await prisma.media.create({
      data: {
        filename,
        mimeType: "image/png",
        byteSize: png.length,
        width: 512,
        height: 512,
        uploadedById: null,
      },
    });
    await setLogoMedia(media.id);

    expect((await getSiteBranding()).logoUrl).toBe(`/media/${media.id}`);
    const icon = await siteIcon();
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect(icon.headers.get("cache-control")).toBe("no-cache");
    expect((await getSiteBranding()).logoId).toBe(media.id);
  });

  it("ignores a logo id that does not match any file", async () => {
    await prisma.siteSetting.create({ data: { key: "logoMediaId", value: "abcdefghijklmnop" } });
    expect((await getSiteBranding()).logoUrl).toBeNull();
  });
});

describe("public pages use the appearance", () => {
  it("overrides the accent colour and places the logo in the header", async () => {
    await saveAppearance({
      palette: "green",
      h1Mode: "theme",
      h1Color: "#111827",
      season: "off",
      blockDevtools: false,
    });
    await prisma.siteSetting.create({ data: { key: "logoMediaId", value: "logo1234567890" } });
    await prisma.media.create({
      data: {
        id: "logo1234567890",
        filename: "logo.png",
        mimeType: "image/png",
        byteSize: 1,
        uploadedById: null,
      },
    });
    const html = await renderHome({});
    expect(html).toContain("--color-accent:#059669");
    expect(html).toContain('class="cms-header__logo"');
    expect(html).toContain('src="/media/logo1234567890"');
  });

  it("adds the seasonal layer only when a season is chosen", async () => {
    expect(await renderHome({})).not.toContain("cms-season");
    await saveAppearance({
      palette: "theme",
      h1Mode: "theme",
      h1Color: "#111827",
      season: "spring",
      blockDevtools: false,
    });
    expect(await renderHome({})).toContain("cms-season--spring");
  });

  it("keeps the theme's own colours when the palette is 'theme'", async () => {
    const html = await renderHome({});
    expect(html).not.toContain("--color-accent:#");
  });
});

describe("main menu", () => {
  it("replaces the theme's links with the saved menu, with children in a dropdown", async () => {
    await saveSiteMenu([
      {
        label: "Dịch vụ",
        href: "/pages/dich-vu",
        children: [{ label: "VPS", href: "/pages/vps" }],
      },
      { label: "Liên hệ", href: "/pages/lien-he", children: [] },
    ]);
    const html = await renderHome({ menu: await getSiteMenu() });
    expect(html).toContain('class="cms-custom-menu"');
    expect(html).toContain('href="/pages/vps"');
    expect(html).toContain('href="/pages/lien-he"');
    expect(html).not.toContain("nav.search");
  });

  it("keeps the theme's own links when no menu is saved", async () => {
    const html = await renderHome({ menu: await getSiteMenu() });
    expect(html).not.toContain('class="cms-custom-menu"');
  });
});

describe("blog style", () => {
  it("adds its stylesheet to public pages once a style is saved", async () => {
    const { saveBlogStyle } = await import("@/lib/blog-style");
    expect(await renderHome({})).not.toContain("data-blog-style");
    await saveBlogStyle({
      listLayout: "grid",
      cardStyle: "theme",
      cardRadius: 12,
      showImages: true,
      showExcerpts: true,
      titleSize: "theme",
      listWidth: "theme",
      articleWidth: "theme",
      bodySize: "theme",
    });
    const { getBlogStyle } = await import("@/lib/blog-style");
    const html = await renderHome({ blogStyle: await getBlogStyle() });
    expect(html).toContain('data-blog-style="true"');
    expect(html).toContain("repeat(2,minmax(0,1fr))");
  });
});
