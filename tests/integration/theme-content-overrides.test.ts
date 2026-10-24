import path from "node:path";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { MEDIA_DIR } from "@/lib/env";
import { deleteMedia, mediaUsage } from "@/lib/media";
import {
  discardContentDraft,
  getContentEditState,
  loadContentOverrides,
  publishContent,
  saveContentKey,
} from "@/lib/themes/content-overrides";
import { contentFor, loadThemeById } from "@/lib/themes/registry";
import { installThemeDirectory } from "@/lib/themes/install";
import {
  discardContentAction,
  publishContentAction,
  saveContentKeyAction,
} from "@/app/admin/actions/theme-content";
import { ROOT, createUser, installBuiltIns, resetDatabase } from "../helpers/db";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string },
  locale: "vi",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: state.locale }),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/auth/session", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/session")>();
  const { can } = await import("@/lib/auth/permissions");
  return {
    ...actual,
    requirePermission: async (permission: Parameters<typeof can>[1]) => {
      if (!state.user) throw new actual.UnauthorizedError();
      if (!can(state.user.role, permission)) throw new actual.ForbiddenError();
      return { ...state.user, email: "x@example.com", name: "X" };
    },
  };
});

type User = Awaited<ReturnType<typeof createUser>>;
let admin: User;
let editor: User;
let author: User;
const EC = "english-center";
const HS = "hien-studio";

async function setActive(id: string) {
  await prisma.siteSetting.upsert({
    where: { key: "activeThemeId" },
    create: { key: "activeThemeId", value: id },
    update: { value: id },
  });
}

async function base(themeId: string, locale = "vi") {
  return contentFor(await loadThemeById(themeId), locale) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
  editor = await createUser("editor");
  author = await createUser("author");
  await installThemeDirectory(path.join(ROOT, "themes", EC), null);
  await installThemeDirectory(path.join(ROOT, "themes", HS), null);
  await setActive(EC);
  state.user = { id: admin.id, role: "admin" };
  state.locale = "vi";
});
afterEach(() => vi.clearAllMocks());

const settingRows = () =>
  prisma.siteSetting.findMany({ where: { key: { startsWith: "themecontent." } } });

describe("saveContentKey: accepted values from the real themes", () => {
  it("english-center hero, courses, footer and nav", async () => {
    const b = await base(EC);
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: "Tiêu đề mới" });
    await saveContentKey(admin, EC, "vi", "courses", b.courses.slice(0, 2));
    await saveContentKey(admin, EC, "vi", "footer", b.footer);
    await saveContentKey(admin, EC, "vi", "nav", b.nav);
    const state1 = await getContentEditState(EC, "vi");
    expect(state1.draftKeys).toEqual(["courses", "footer", "hero", "nav"]);
  });

  it("hien-studio hero in both languages", async () => {
    for (const locale of ["vi", "en"]) {
      const b = await base(HS, locale);
      await saveContentKey(admin, HS, locale, "hero", { ...b.hero, title: `T ${locale}` });
    }
    expect((await getContentEditState(HS, "en")).draftKeys).toEqual(["hero"]);
  });
});

describe("saveContentKey: rejected values", () => {
  it("wrong types, unknown keys and bad key names", async () => {
    const b = await base(EC);
    await expect(saveContentKey(admin, EC, "vi", "hero", "a string")).rejects.toThrow();
    await expect(saveContentKey(admin, EC, "vi", "hero", [1, 2])).rejects.toThrow();
    await expect(saveContentKey(admin, EC, "vi", "courses", { not: "a list" })).rejects.toThrow();
    await expect(
      saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: 5 })
    ).rejects.toThrow();
    await expect(saveContentKey(admin, EC, "vi", "nonexistentblock", { a: 1 })).rejects.toThrow(
      /unknown/i
    );
    for (const key of ["Bad-key", "__proto__", "constructor", "a".repeat(60), "", "UPPER"]) {
      await expect(saveContentKey(admin, EC, "vi", key, { a: 1 }), key).rejects.toThrow();
    }
    expect(await settingRows()).toEqual([]);
  });

  it("too-long strings and bad targets", async () => {
    const b = await base(EC);
    await expect(
      saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: "x".repeat(121) })
    ).rejects.toThrow();
    await expect(saveContentKey(admin, "no such theme", "vi", "hero", b.hero)).rejects.toThrow();
    await expect(saveContentKey(admin, EC, "viet", "hero", b.hero)).rejects.toThrow();
    await expect(saveContentKey(admin, EC, "V1", "hero", b.hero)).rejects.toThrow();
    await expect(saveContentKey(admin, "nope", "vi", "hero", b.hero)).rejects.toThrow();
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>1</script>",
    "//evil.example.com",
    "/path with space",
    "/a\\b",
    "/a\u0001b",
    "/a\nb",
    "https://exa mple.com",
    "mailto:a@b.c",
    "ftp://example.com",
    "relative/path",
  ])("hero href %j is refused (primary, secondary, nav, footer)", async (bad) => {
    const b = await base(EC);
    await expect(
      saveContentKey(admin, EC, "vi", "hero", { ...b.hero, primaryHref: bad })
    ).rejects.toThrow();
    await expect(
      saveContentKey(admin, EC, "vi", "hero", { ...b.hero, secondaryHref: bad })
    ).rejects.toThrow();
    await expect(
      saveContentKey(admin, EC, "vi", "nav", [{ label: "x", href: bad }])
    ).rejects.toThrow();
    await expect(
      saveContentKey(admin, EC, "vi", "footer", {
        ...b.footer,
        columns: [{ title: "c", links: [{ label: "l", href: bad }] }],
      })
    ).rejects.toThrow();
    expect(await settingRows()).toEqual([]);
  });

  it("good hrefs pass", async () => {
    const b = await base(EC);
    for (const ok of ["/", "/pages/x?y=1#z", "https://example.com/a", "http://example.com"])
      await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, primaryHref: ok });
  });
});

describe("saveContentKey: images", () => {
  it("media/<id> is accepted only when the media exists; assets/ files still work", async () => {
    const b = await base(EC);
    const media = await prisma.media.create({
      data: { filename: "x.png", mimeType: "image/png", byteSize: 1 },
    });
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, image: `media/${media.id}` });
    await expect(
      saveContentKey(admin, EC, "vi", "hero", { ...b.hero, image: "media/doesnotexist1234" })
    ).rejects.toThrow(/no longer exists/i);
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, image: "assets/hero.jpg" });
    await expect(
      saveContentKey(admin, EC, "vi", "hero", { ...b.hero, image: "../../etc/passwd" })
    ).rejects.toThrow();
    await expect(
      saveContentKey(admin, EC, "vi", "hero", { ...b.hero, image: "media/ab" })
    ).rejects.toThrow();
  });

  it("media inside lists (course images) is checked too", async () => {
    const b = await base(EC);
    const courses = structuredClone(b.courses) as Record<string, unknown>[];
    courses[0] = { ...courses[0], image: "media/doesnotexist1234" };
    await expect(saveContentKey(admin, EC, "vi", "courses", courses)).rejects.toThrow(
      /no longer exists/i
    );
  });
});

describe("limits", () => {
  it("refuses a draft with more than 60 edited blocks", async () => {
    const b = await base(EC);
    const full = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`a${i}`, { n: i }]));
    await prisma.siteSetting.create({
      data: { key: `themecontent.${EC}.vi.draft`, value: JSON.stringify(full) },
    });
    await expect(saveContentKey(admin, EC, "vi", "hero", b.hero)).rejects.toThrow(/too many/i);
  });

  it("an oversize or corrupt stored layer is ignored, not fatal", async () => {
    await prisma.siteSetting.createMany({
      data: [
        { key: `themecontent.${EC}.vi`, value: "x".repeat(210 * 1024) },
        { key: `themecontent.${EC}.vi.draft`, value: "{broken" },
        { key: `themecontent.${HS}.vi`, value: "[1,2]" },
        {
          key: `themecontent.${HS}.en`,
          value: '{"hero":{"title":"ok"},"Bad-key":1,"__proto__":2}',
        },
      ],
    });
    expect(await loadContentOverrides(EC, "vi")).toEqual({});
    expect(await loadContentOverrides(EC, "vi", { draft: true })).toEqual({});
    expect(await loadContentOverrides(HS, "vi")).toEqual({});
    expect(await loadContentOverrides(HS, "en")).toEqual({ hero: { title: "ok" } });
    expect(await loadContentOverrides("../evil", "vi")).toEqual({});
    expect(await loadContentOverrides(EC, "english")).toEqual({});
  });
});

describe("permissions", () => {
  it("only settings:manage may save, publish or discard", async () => {
    const b = await base(EC);
    for (const user of [editor, author]) {
      await expect(saveContentKey(user, EC, "vi", "hero", b.hero)).rejects.toThrow();
      await expect(publishContent(user, EC, "vi")).rejects.toThrow();
      await expect(discardContentDraft(user, EC, "vi")).rejects.toThrow();
    }
    expect(await settingRows()).toEqual([]);
    expect(
      await prisma.auditLog.count({ where: { action: { startsWith: "theme-content." } } })
    ).toBe(0);
  });
});

describe("draft, publish, discard, reset", () => {
  it("draft is a layer on top of published; publish moves it; discard clears it", async () => {
    const b = await base(EC);
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: "Draft title" });
    expect(await loadContentOverrides(EC, "vi")).toEqual({});
    expect((await loadContentOverrides(EC, "vi", { draft: true })).hero).toMatchObject({
      title: "Draft title",
    });

    await publishContent(admin, EC, "vi");
    expect((await loadContentOverrides(EC, "vi")).hero).toMatchObject({ title: "Draft title" });
    const afterPublish = await getContentEditState(EC, "vi");
    expect(afterPublish.draftKeys).toEqual([]);
    expect(afterPublish.publishedKeys).toEqual(["hero"]);
    expect(await prisma.siteSetting.count({ where: { key: `themecontent.${EC}.vi.draft` } })).toBe(
      0
    );

    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: "Newer draft" });
    expect((await loadContentOverrides(EC, "vi")).hero).toMatchObject({ title: "Draft title" });
    expect((await loadContentOverrides(EC, "vi", { draft: true })).hero).toMatchObject({
      title: "Newer draft",
    });
    await discardContentDraft(admin, EC, "vi");
    expect((await loadContentOverrides(EC, "vi", { draft: true })).hero).toMatchObject({
      title: "Draft title",
    });
    expect((await getContentEditState(EC, "vi")).draftKeys).toEqual([]);
  });

  it("publishing an empty draft is a validation error", async () => {
    await expect(publishContent(admin, EC, "vi")).rejects.toThrow(/no changes/i);
  });

  it("reset writes a tombstone; the draft view drops the key; publish removes it", async () => {
    const b = await base(EC);
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: "Custom" });
    await publishContent(admin, EC, "vi");
    await saveContentKey(admin, EC, "vi", "hero", null);
    const draftRow = await prisma.siteSetting.findUniqueOrThrow({
      where: { key: `themecontent.${EC}.vi.draft` },
    });
    expect(JSON.parse(draftRow.value)).toEqual({ hero: { __reset: true } });
    expect(await loadContentOverrides(EC, "vi", { draft: true })).toEqual({});
    expect((await loadContentOverrides(EC, "vi")).hero).toBeDefined();
    await publishContent(admin, EC, "vi");
    expect(await loadContentOverrides(EC, "vi")).toEqual({});
    expect(await settingRows()).toEqual([]);
  });

  it("keeps languages and themes apart", async () => {
    const hsVi = await base(HS, "vi");
    const hsEn = await base(HS, "en");
    const ec = await base(EC);
    await saveContentKey(admin, HS, "vi", "hero", { ...hsVi.hero, title: "VI hero" });
    await saveContentKey(admin, HS, "en", "hero", { ...hsEn.hero, title: "EN hero" });
    await saveContentKey(admin, EC, "vi", "hero", { ...ec.hero, title: "EC hero" });
    await publishContent(admin, HS, "vi");
    expect((await loadContentOverrides(HS, "vi")).hero).toMatchObject({ title: "VI hero" });
    expect(await loadContentOverrides(HS, "en")).toEqual({});
    expect((await loadContentOverrides(HS, "en", { draft: true })).hero).toMatchObject({
      title: "EN hero",
    });
    expect(await loadContentOverrides(EC, "vi")).toEqual({});
    // Switching the active theme does not disturb anything.
    await setActive(HS);
    await setActive(EC);
    expect((await loadContentOverrides(HS, "vi")).hero).toMatchObject({ title: "VI hero" });
    expect((await loadContentOverrides(EC, "vi", { draft: true })).hero).toMatchObject({
      title: "EC hero",
    });
  });
});

describe("audit", () => {
  it("writes theme-content.* rows with key and locale only, never the values", async () => {
    const b = await base(EC);
    const secret = "SECRET-TITLE-VALUE";
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: secret });
    await saveContentKey(admin, EC, "vi", "hero", null);
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: secret });
    await publishContent(admin, EC, "vi");
    await saveContentKey(admin, EC, "vi", "hero", { ...b.hero, title: `${secret}2` });
    await discardContentDraft(admin, EC, "vi");
    const rows = await prisma.auditLog.findMany({
      where: { action: { startsWith: "theme-content." } },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((r) => r.action)).toEqual([
      "theme-content.save",
      "theme-content.save",
      "theme-content.save",
      "theme-content.publish",
      "theme-content.save",
      "theme-content.discard",
    ]);
    expect(JSON.parse(rows[0]!.detail)).toEqual({ key: "hero", locale: "vi" });
    expect(JSON.parse(rows[5]!.detail)).toEqual({ locale: "vi" });
    for (const r of rows) {
      expect(r.detail).not.toContain(secret);
      expect(r).toMatchObject({ targetType: "theme", targetId: EC, actorId: admin.id });
    }
  });
});

describe("server actions", () => {
  const json = (v: unknown) => JSON.stringify(v);

  it("resolve theme and language on the server", async () => {
    const ec = await base(EC);
    state.locale = "vi";
    expect(
      await saveContentKeyAction("hero", json({ ...ec.hero, title: "From action" }))
    ).toMatchObject({ ok: true });
    expect((await getContentEditState(EC, "vi")).draftKeys).toEqual(["hero"]);
    // Switch the active theme and language: the same action now writes there instead.
    await setActive(HS);
    state.locale = "en";
    const hs = await base(HS, "en");
    expect(await saveContentKeyAction("hero", json({ ...hs.hero, title: "HS en" }))).toMatchObject({
      ok: true,
    });
    expect((await getContentEditState(HS, "en")).draftKeys).toEqual(["hero"]);
    expect((await getContentEditState(EC, "en")).draftKeys).toEqual([]);
    expect(await publishContentAction()).toMatchObject({ ok: true });
    expect((await loadContentOverrides(HS, "en")).hero).toMatchObject({ title: "HS en" });
    expect(await loadContentOverrides(EC, "vi")).toEqual({});
    expect(await saveContentKeyAction("hero", json({ ...hs.hero, title: "x" }))).toMatchObject({
      ok: true,
    });
    expect(await discardContentAction()).toMatchObject({ ok: true });
    expect((await getContentEditState(HS, "en")).draftKeys).toEqual([]);
  });

  it("return {ok:false,message} and never throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ec = await base(EC);
    const cases = [
      saveContentKeyAction("hero", "not json"),
      saveContentKeyAction("hero", "null"),
      saveContentKeyAction("hero", json("string")),
      saveContentKeyAction("hero", "x".repeat(210 * 1024)),
      saveContentKeyAction("nonexistent", json({})),
      saveContentKeyAction("Bad-key", json({})),
      saveContentKeyAction("hero", json({ ...ec.hero, primaryHref: "javascript:alert(1)" })),
      publishContentAction(), // no draft
    ];
    for (const r of await Promise.all(cases)) {
      expect(r).toMatchObject({ ok: false, message: expect.any(String) });
      expect((r as { message: string }).message.length).toBeGreaterThan(0);
    }
    expect(await settingRows()).toEqual([]);
  });

  it("refuses editors, authors and anonymous callers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ec = await base(EC);
    for (const user of [
      { id: editor.id, role: "editor" },
      { id: author.id, role: "author" },
      null,
    ]) {
      state.user = user;
      expect(await saveContentKeyAction("hero", json(ec.hero))).toMatchObject({ ok: false });
      expect(await publishContentAction()).toMatchObject({ ok: false });
      expect(await discardContentAction()).toMatchObject({ ok: false });
    }
    expect(await settingRows()).toEqual([]);
  });
});

describe("deleteMedia guard", () => {
  async function newMedia() {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const filename = `${Math.random().toString(36).slice(2)}.png`;
    fs.writeFileSync(path.join(MEDIA_DIR, filename), "x");
    return prisma.media.create({ data: { filename, mimeType: "image/png", byteSize: 1 } });
  }
  const exists = async (id: string) => (await prisma.media.findUnique({ where: { id } })) !== null;

  it("an unused image deletes", async () => {
    const m = await newMedia();
    await deleteMedia(admin, m.id);
    expect(await exists(m.id)).toBe(false);
  });

  it("blocks deleting an image used by a post", async () => {
    const m = await newMedia();
    await prisma.post.create({
      data: { slug: "p", title: "P", authorId: admin.id, featuredImage: m.id },
    });
    await expect(deleteMedia(admin, m.id)).rejects.toThrow(/post/i);
    expect(await exists(m.id)).toBe(true);
  });

  it("blocks deleting an image used by a page layout, its draft, or the home layout", async () => {
    const page = await prisma.page.create({
      data: { slug: "pg", title: "Pg", body: "", status: "published", authorId: admin.id },
    });
    const a = await newMedia();
    await prisma.page.update({ where: { id: page.id }, data: { layout: `{"mediaId":"${a.id}"}` } });
    await expect(deleteMedia(admin, a.id)).rejects.toThrow(/page layout/i);
    const b = await newMedia();
    await prisma.page.update({
      where: { id: page.id },
      data: { layoutDraft: `{"mediaId":"${b.id}"}` },
    });
    await expect(deleteMedia(admin, b.id)).rejects.toThrow(/page layout/i);
    const c = await newMedia();
    await prisma.siteSetting.create({ data: { key: "builder.home.layout", value: `x ${c.id} y` } });
    await expect(deleteMedia(admin, c.id)).rejects.toThrow(/home page/i);
    const d = await newMedia();
    await prisma.siteSetting.create({
      data: { key: "builder.home.layoutDraft", value: `x ${d.id}` },
    });
    await expect(deleteMedia(admin, d.id)).rejects.toThrow(/home page/i);
    for (const m of [a, b, c, d]) expect(await exists(m.id)).toBe(true);
  });

  it("blocks deleting an image used by theme content, published or draft", async () => {
    const ec = await base(EC);
    const pub = await newMedia();
    await saveContentKey(admin, EC, "vi", "hero", { ...ec.hero, image: `media/${pub.id}` });
    await expect(deleteMedia(admin, pub.id)).rejects.toThrow(/theme content/i); // draft
    await publishContent(admin, EC, "vi");
    await expect(deleteMedia(admin, pub.id)).rejects.toThrow(/theme content/i); // published
    // Resetting the block frees the image again.
    await saveContentKey(admin, EC, "vi", "hero", null);
    await publishContent(admin, EC, "vi");
    await deleteMedia(admin, pub.id);
    expect(await exists(pub.id)).toBe(false);
  });

  it("an unrelated image still deletes while others are in use; usage lists are accurate", async () => {
    const used = await newMedia();
    const free = await newMedia();
    await prisma.post.create({
      data: { slug: "q", title: "Q", authorId: admin.id, socialImage: used.id },
    });
    expect(await mediaUsage(used.id)).toEqual(["1 post(s)"]);
    expect(await mediaUsage(free.id)).toEqual([]);
    await deleteMedia(admin, free.id);
    expect(await exists(free.id)).toBe(false);
    expect(await exists(used.id)).toBe(true);
  });

  it("blocks the logo and the share image", async () => {
    const m = await newMedia();
    await prisma.siteSetting.create({ data: { key: "logoMediaId", value: m.id } });
    await expect(deleteMedia(admin, m.id)).rejects.toThrow(/logo|site settings/i);
  });
});
