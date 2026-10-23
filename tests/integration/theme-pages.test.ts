import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DATA_DIR } from "@/lib/env";
import { activateTheme, uninstallTheme } from "@/lib/themes/activate";
import { installThemeDirectory } from "@/lib/themes/install";
import { ROOT, createUser, installBuiltIns, resetDatabase, themeDir } from "../helpers/db";

const THEME = "hien-studio";
let admin: { id: string };

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
});

const themePages = () =>
  prisma.page.findMany({ where: { themeId: THEME }, orderBy: { slug: "asc" } });
const shipped = JSON.parse(
  fs.readFileSync(path.join(ROOT, "themes", THEME, "pages.json"), "utf8")
) as { slug: string }[];

describe("static pages that ship with a theme", () => {
  it("creates them hidden when the theme is installed but not active", async () => {
    await installThemeDirectory(themeDir(THEME), admin.id);
    const rows = await themePages();
    expect(rows).toHaveLength(shipped.length);
    for (const row of rows) {
      expect(row.status).toBe("draft");
      expect(row.slug.endsWith(`--${THEME}`)).toBe(true);
    }
    expect(
      await prisma.page.findFirst({ where: { slug: "cong-trinh", status: "published" } })
    ).toBeNull();
  });

  it("publishes them on activation and hides them when another theme is activated", async () => {
    await installThemeDirectory(themeDir(THEME), admin.id);
    await activateTheme(THEME, admin.id);
    for (const { slug } of shipped) {
      const row = await prisma.page.findUnique({ where: { slug } });
      expect(row?.status).toBe("published");
      expect(row?.themeId).toBe(THEME);
    }
    await activateTheme("starter", admin.id);
    for (const { slug } of shipped) {
      expect(await prisma.page.findUnique({ where: { slug } })).toBeNull();
    }
    const hidden = await themePages();
    expect(hidden).toHaveLength(shipped.length);
    expect(hidden.every((row) => row.status === "draft")).toBe(true);
    await activateTheme(THEME, admin.id);
    expect((await prisma.page.findUnique({ where: { slug: shipped[0]!.slug } }))?.status).toBe(
      "published"
    );
  });

  it("deletes them when the theme is uninstalled", async () => {
    await installThemeDirectory(themeDir(THEME), admin.id);
    await activateTheme(THEME, admin.id);
    await activateTheme("starter", admin.id);
    await activateTheme("default", admin.id); // clears starter as the rollback target
    await uninstallTheme(THEME, admin.id);
    expect(await themePages()).toHaveLength(0);
  });

  it("keeps an editor's text when the theme is updated, and never touches the editor's own pages", async () => {
    await prisma.page.create({
      data: {
        slug: "lien-he",
        title: "Của tôi",
        body: "<p>giữ</p>",
        status: "published",
        authorId: admin.id,
      },
    });
    await installThemeDirectory(themeDir(THEME), admin.id);
    await activateTheme(THEME, admin.id);
    const own = await prisma.page.findUnique({ where: { slug: "lien-he" } });
    expect(own?.themeId).toBeNull();
    expect(own?.title).toBe("Của tôi");
    const row = await prisma.page.findUnique({ where: { slug: "cong-trinh" } });
    await prisma.page.update({ where: { id: row!.id }, data: { title: "Đã sửa" } });
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "hien-"));
    fs.cpSync(themeDir(THEME), copy, { recursive: true });
    const manifestPath = path.join(copy, "theme.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.version = "9.0.0";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await installThemeDirectory(copy, admin.id);
    expect((await prisma.page.findUnique({ where: { id: row!.id } }))?.title).toBe("Đã sửa");
  });

  it("rejects a pages.json with a bad slug or an unknown template", async () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "hien-"));
    fs.cpSync(themeDir(THEME), copy, { recursive: true });
    fs.writeFileSync(
      path.join(copy, "pages.json"),
      JSON.stringify([
        { slug: "Bad Slug", title: "x" },
        { slug: "ok-page", title: "y", template: "no-such-template" },
      ])
    );
    await expect(installThemeDirectory(copy, admin.id)).rejects.toMatchObject({ code: "invalid" });
  });

  it("also deletes pages made before themes shipped pages, when they use the theme's own template", async () => {
    await installThemeDirectory(themeDir(THEME), admin.id);
    await prisma.page.deleteMany({ where: { themeId: THEME } });
    await prisma.page.createMany({
      data: [
        {
          slug: "bao-gia",
          title: "Cũ",
          status: "published",
          template: "pricing",
          authorId: admin.id,
        },
        {
          slug: "ve-chung-toi",
          title: "Của tôi",
          status: "published",
          template: "",
          authorId: admin.id,
        },
      ],
    });
    await uninstallTheme(THEME, admin.id);
    expect(await prisma.page.findUnique({ where: { slug: "bao-gia" } })).toBeNull();
    expect(await prisma.page.findUnique({ where: { slug: "ve-chung-toi" } })).not.toBeNull();
    expect(fs.existsSync(path.join(DATA_DIR, "themes", THEME))).toBe(false);
  });
});
