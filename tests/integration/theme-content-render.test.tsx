import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { ThemePage } from "@/components/theme/theme-page";
import { contentFor, getInstalledTheme, loadBundle } from "@/lib/themes/registry";
import { getThemeSettings } from "@/lib/themes/settings";
import { installThemeDirectory } from "@/lib/themes/install";
import { publishContent, saveContentKey } from "@/lib/themes/content-overrides";
import { ROOT, createUser, installBuiltIns, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

type User = Awaited<ReturnType<typeof createUser>>;
let admin: User;
const EC = "english-center";

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
  await installThemeDirectory(path.join(ROOT, "themes", EC), null);
});

async function renderHome(edit = false) {
  const row = (await getInstalledTheme(EC))!;
  const bundle = loadBundle(EC, row.path);
  const values = await getThemeSettings(EC, bundle.manifest.settingsSchema);
  const element = await ThemePage({
    bundle,
    values,
    ctx: {
      site: {
        title: "Trung tâm",
        description: "",
        url: "http://localhost",
        locale: "vi",
        logoUrl: null,
      } as never,
      view: { kind: "home", posts: [], total: 0, title: "Home" } as never,
      preview: false,
      edit,
    } as never,
  });
  return renderToStaticMarkup(element);
}

const baseHero = async () => {
  const bundle = loadBundle(EC, (await getInstalledTheme(EC))!.path);
  return contentFor(bundle, "vi").hero as Record<string, unknown>;
};

async function publishHero(patch: Record<string, unknown>) {
  await saveContentKey(admin, EC, "vi", "hero", { ...(await baseHero()), ...patch });
  await publishContent(admin, EC, "vi");
}

describe("theme content overrides on the public site", () => {
  it("renders the published text, button link and library image", async () => {
    const media = await prisma.media.create({
      data: { filename: "m.png", mimeType: "image/png", byteSize: 1, width: 10, height: 10 },
    });
    await publishHero({
      title: "Tiêu đề do quản trị viên sửa",
      primaryLabel: "Nút mới",
      primaryHref: "/pages/lien-he-moi",
      image: `media/${media.id}`,
    });
    const html = await renderHome();
    expect(html).toContain("Tiêu đề do quản trị viên sửa");
    expect(html).toContain("Nút mới");
    expect(html).toContain('href="/pages/lien-he-moi"');
    expect(html).toContain(`/media/${media.id}`);
    expect(html).not.toContain("Học tiếng Anh đúng trình độ");
  });

  it("a draft does not show on the public site, but does in edit mode; output is otherwise unchanged", async () => {
    const baseline = await renderHome();
    expect(baseline).toContain("Học tiếng Anh đúng trình độ");
    await saveContentKey(admin, EC, "vi", "hero", { ...(await baseHero()), title: "Only a draft" });
    expect(await renderHome()).toBe(baseline);
    expect(await renderHome(true)).toContain("Only a draft");
    expect(await renderHome(true)).not.toContain("Học tiếng Anh đúng trình độ");
  });

  it("resetting the block brings back exactly the original output", async () => {
    const baseline = await renderHome();
    await publishHero({ title: "Temporary" });
    expect(await renderHome()).not.toBe(baseline);
    await saveContentKey(admin, EC, "vi", "hero", null);
    await publishContent(admin, EC, "vi");
    expect(await renderHome()).toBe(baseline);
  });

  it("renders markup in override strings as escaped text", async () => {
    await publishHero({
      title: `<script>alert(1)</script> "><img src=x onerror=alert(2)>`,
      text: "<b>bold?</b>",
    });
    const html = await renderHome();
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/<script>alert\(1\)/);
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).toContain("&lt;b&gt;bold?&lt;/b&gt;");
  });

  it("a stored override that bypassed validation (javascript: link) is dropped, not rendered", async () => {
    const hero = { ...(await baseHero()), primaryHref: "javascript:alert(1)", title: "Evil hero" };
    await prisma.siteSetting.create({
      data: { key: `themecontent.${EC}.vi`, value: JSON.stringify({ hero }) },
    });
    const html = await renderHome();
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Evil hero");
  });

  it("a deleted library image does not break rendering", async () => {
    const media = await prisma.media.create({
      data: { filename: "gone.png", mimeType: "image/png", byteSize: 1 },
    });
    await publishHero({ image: `media/${media.id}`, title: "Has image" });
    await prisma.media.delete({ where: { id: media.id } });
    const html = await renderHome();
    expect(html).toContain("Has image");
  });

  it("overrides of one language do not leak into another", async () => {
    await publishHero({ title: "Vietnamese only" });
    const row = (await getInstalledTheme(EC))!;
    const bundle = loadBundle(EC, row.path);
    const element = await ThemePage({
      bundle,
      values: await getThemeSettings(EC, bundle.manifest.settingsSchema),
      ctx: {
        site: { title: "S", description: "", url: "http://localhost", locale: "en", logoUrl: null } as never,
        view: { kind: "home", posts: [], total: 0, title: "Home" } as never,
        preview: false,
      } as never,
    });
    expect(renderToStaticMarkup(element)).not.toContain("Vietnamese only");
  });
});
