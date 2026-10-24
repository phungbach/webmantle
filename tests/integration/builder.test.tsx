import path from "node:path";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { ThemeFrame } from "@/components/theme/theme-frame";
import { composeLayout } from "@/lib/builder/compose";
import { parseLayout, type LayoutDoc } from "@/lib/builder/schema";
import {
  discardDraft,
  getLayoutState,
  getPublishedLayout,
  publishDraft,
  resetToTheme,
  saveDraft,
  type LayoutTarget,
} from "@/lib/builder/store";
import {
  discardDraftAction,
  publishAction,
  resetAction,
  saveDraftAction,
} from "@/app/admin/actions/builder";
import { installThemeDirectory } from "@/lib/themes/install";
import { getInstalledTheme, loadBundle } from "@/lib/themes/registry";
import { getThemeSettings } from "@/lib/themes/settings";
import { ROOT, createUser, installBuiltIns, resetDatabase } from "../helpers/db";
import type { LayoutNode } from "@/lib/themes/contract";

const state = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate, revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "en" }), set: () => {}, delete: () => {} }),
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
let pageId: string;
let pageSlug: string;

let seq = 0;
const bid = () => `blk${String(++seq).padStart(6, "0")}`;
const section = (...children: unknown[]) => ({ id: bid(), type: "Section", props: {}, children });
const heading = (text: string) => ({ id: bid(), type: "Heading", props: { text } });
const doc = (...blocks: unknown[]) => ({ version: 1, blocks });
const page = (): LayoutTarget => ({ kind: "page", id: pageId });
const HOME: LayoutTarget = { kind: "home" };

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  admin = await createUser("admin");
  editor = await createUser("editor");
  author = await createUser("author");
  const row = await prisma.page.create({
    data: {
      slug: "about-us",
      title: "About us",
      body: "<p>Theme body</p>",
      status: "published",
      authorId: admin.id,
    },
  });
  pageId = row.id;
  pageSlug = row.slug;
  state.user = { id: admin.id, role: "admin" };
  revalidate.mockClear();
});
afterEach(() => vi.clearAllMocks());

const pageRow = () => prisma.page.findUniqueOrThrow({ where: { id: pageId } });
const auditActions = async () =>
  (
    await prisma.auditLog.findMany({
      where: { action: { startsWith: "builder." } },
      orderBy: { createdAt: "asc" },
    })
  ).map((a) => a.action);

describe("store: draft, publish, discard, reset", () => {
  it("keeps draft and published separate", async () => {
    await saveDraft(admin, page(), doc(section(heading("Draft only"))));
    expect((await pageRow()).layout).toBe("");
    expect(JSON.parse((await pageRow()).layoutDraft).blocks).toHaveLength(1);
    expect(await getPublishedLayout(page())).toBeNull();
    const state1 = await getLayoutState(page());
    expect(state1.published).toBeNull();
    expect(state1.draft?.blocks).toHaveLength(1);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("publish moves the draft to published, clears the draft and revalidates", async () => {
    await saveDraft(admin, page(), doc(section(heading("Live"))));
    await publishDraft(admin, page());
    const row = await pageRow();
    expect(row.layoutDraft).toBe("");
    expect(parseLayout(row.layout)?.blocks).toHaveLength(1);
    expect(revalidate).toHaveBeenCalledWith("/");
    expect(revalidate).toHaveBeenCalledWith(`/pages/${pageSlug}`);
    expect((await getPublishedLayout(page()))?.blocks[0]?.children?.[0]?.props.text).toBe("Live");
  });

  it("publishing without a draft is refused", async () => {
    await expect(publishDraft(admin, page())).rejects.toThrow(/no valid draft/i);
  });

  it("a new draft does not touch the published layout; discard keeps it", async () => {
    await saveDraft(admin, page(), doc(section(heading("v1"))));
    await publishDraft(admin, page());
    await saveDraft(admin, page(), doc(section(heading("v2"))));
    const s = await getLayoutState(page());
    expect(s.published?.blocks[0]?.children?.[0]?.props.text).toBe("v1");
    expect(s.draft?.blocks[0]?.children?.[0]?.props.text).toBe("v2");
    await discardDraft(admin, page());
    const after = await getLayoutState(page());
    expect(after.draft).toBeNull();
    expect(after.published).not.toBeNull();
  });

  it("reset clears both and revalidates", async () => {
    await saveDraft(admin, page(), doc(section(heading("a"))));
    await publishDraft(admin, page());
    await saveDraft(admin, page(), doc(section(heading("b"))));
    revalidate.mockClear();
    await resetToTheme(admin, page());
    const row = await pageRow();
    expect(row.layout).toBe("");
    expect(row.layoutDraft).toBe("");
    expect(revalidate).toHaveBeenCalledWith(`/pages/${pageSlug}`);
  });

  it("works the same for the home page (site settings)", async () => {
    await saveDraft(admin, HOME, doc(section(heading("Home!"))));
    expect(await getPublishedLayout(HOME)).toBeNull();
    await publishDraft(admin, HOME);
    expect((await getPublishedLayout(HOME))?.blocks).toHaveLength(1);
    expect((await getLayoutState(HOME)).draft).toBeNull();
    expect(revalidate).toHaveBeenCalledWith("/");
    await resetToTheme(admin, HOME);
    expect(await getPublishedLayout(HOME)).toBeNull();
    expect(await prisma.siteSetting.count({ where: { key: { startsWith: "builder." } } })).toBe(0);
  });

  it("rejects unknown media, oversize and invalid documents", async () => {
    const withImage = doc(
      section({ id: bid(), type: "Image", props: { mediaId: "doesnotexist1234" } })
    );
    await expect(saveDraft(admin, page(), withImage)).rejects.toThrow(/no longer exists/i);
    const media = await prisma.media.create({
      data: { filename: "m.png", mimeType: "image/png", byteSize: 1 },
    });
    await saveDraft(
      admin,
      page(),
      doc(section({ id: bid(), type: "Image", props: { mediaId: media.id } }))
    );
    await expect(saveDraft(admin, page(), "x".repeat(300 * 1024))).rejects.toThrow(/too large/i);
    await expect(saveDraft(admin, page(), doc(section(section())))).rejects.toThrow();
    await expect(saveDraft(admin, { kind: "page", id: "nope" }, doc())).rejects.toThrow(
      /does not exist/i
    );
  });

  it("a stored draft that became invalid cannot be published", async () => {
    await prisma.page.update({ where: { id: pageId }, data: { layoutDraft: "{broken" } });
    await expect(publishDraft(admin, page())).rejects.toThrow(/no valid draft/i);
  });
});

describe("store: permissions", () => {
  it("pages need content:write-any; home needs settings:manage", async () => {
    await expect(saveDraft(editor, page(), doc())).resolves.toBeTruthy();
    await expect(saveDraft(author, page(), doc())).rejects.toThrow();
    await expect(saveDraft(editor, HOME, doc())).rejects.toThrow();
    await expect(saveDraft(author, HOME, doc())).rejects.toThrow();
    await expect(publishDraft(author, page())).rejects.toThrow();
    await expect(discardDraft(author, page())).rejects.toThrow();
    await expect(resetToTheme(editor, HOME)).rejects.toThrow();
  });
});

describe("store: audit", () => {
  it("writes builder.* rows without document content", async () => {
    const secret = "SECRET-HEADING-TEXT";
    await saveDraft(admin, page(), doc(section(heading(secret))));
    await publishDraft(admin, page());
    await saveDraft(admin, page(), doc(section(heading(secret))));
    await discardDraft(admin, page());
    await resetToTheme(admin, page());
    await saveDraft(admin, HOME, doc());
    expect(await auditActions()).toEqual([
      "builder.draft",
      "builder.publish",
      "builder.draft",
      "builder.discard",
      "builder.reset",
      "builder.draft",
    ]);
    const rows = await prisma.auditLog.findMany({
      where: { action: { startsWith: "builder." } },
      orderBy: { createdAt: "asc" },
    });
    for (const r of rows) {
      expect(r.detail).not.toContain(secret);
      expect(r.detail).not.toContain('blocks":[');
      expect(r.actorId).toBe(admin.id);
    }
    expect(rows[0]).toMatchObject({ targetType: "page", targetId: pageId });
    expect(rows[5]).toMatchObject({ targetType: "setting", targetId: "home" });
  });
});

describe("server actions", () => {
  const json = (d: unknown) => JSON.stringify(d);

  it("save, publish, discard and reset return ok results", async () => {
    const saved = await saveDraftAction(page(), json(doc(section(heading("A"), heading("B")))));
    expect(saved).toMatchObject({ ok: true, blocks: 3 });
    expect(await publishAction(page())).toMatchObject({ ok: true });
    expect(await saveDraftAction(page(), json(doc()))).toMatchObject({ ok: true });
    expect(await discardDraftAction(page())).toMatchObject({ ok: true });
    expect(await resetAction(page())).toMatchObject({ ok: true });
    expect((await pageRow()).layout).toBe("");
  });

  it("returns {ok:false,message} instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cases: Promise<unknown>[] = [
      saveDraftAction(page(), "not json"),
      saveDraftAction(page(), json(doc(section(section())))),
      saveDraftAction(page(), "x".repeat(300 * 1024)),
      saveDraftAction({ kind: "page", id: "missing" }, json(doc())),
      saveDraftAction({ kind: "bogus" } as never, json(doc())),
      saveDraftAction({ kind: "page", id: "" }, json(doc())),
      publishAction(page()),
    ];
    for (const r of await Promise.all(cases)) {
      expect(r).toMatchObject({ ok: false, message: expect.any(String) });
      expect((r as { message: string }).message.length).toBeGreaterThan(0);
    }
  });

  it("enforces the permission matrix", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = json(doc());
    state.user = { id: editor.id, role: "editor" };
    expect(await saveDraftAction(page(), ok)).toMatchObject({ ok: true });
    expect(await saveDraftAction(HOME, ok)).toMatchObject({ ok: false });
    state.user = { id: author.id, role: "author" };
    expect(await saveDraftAction(page(), ok)).toMatchObject({ ok: false });
    expect(await publishAction(page())).toMatchObject({ ok: false });
    expect(await resetAction(HOME)).toMatchObject({ ok: false });
    state.user = null;
    expect(await saveDraftAction(page(), ok)).toMatchObject({ ok: false });
    expect(await discardDraftAction(page())).toMatchObject({ ok: false });
    // Refused calls write nothing.
    expect(await auditActions()).toEqual(["builder.draft"]);
  });
});

async function bundleFor(id: string) {
  if (!(await getInstalledTheme(id)))
    await installThemeDirectory(path.join(ROOT, "themes", id), null);
  const row = (await getInstalledTheme(id))!;
  return loadBundle(id, row.path);
}

const names = (node: LayoutNode): string[] => [
  node.component,
  ...(node.children ?? []).flatMap(names),
];

describe("composeLayout", () => {
  const layout: LayoutDoc = parseLayout(
    JSON.stringify(
      doc(section(heading("Inside section")), heading("Loose heading"), {
        id: bid(),
        type: "Divider",
        props: {},
      })
    )
  )!;

  it.each(["hien-studio", "english-center"])(
    "%s: keeps the theme header, footer and Shell for pages and home",
    async (themeId) => {
      const bundle = await bundleFor(themeId);
      for (const kind of ["page", "home"] as const) {
        const root = composeLayout(bundle, kind, layout);
        expect(root.component).toBe("Shell");
        expect(root.children?.[0]?.component).toBe("SiteHeader");
        expect(root.children?.at(-1)?.component).toBe("SiteFooter");
        const body = root.children!.slice(1, -1);
        // One real section plus two loose blocks wrapped in their own sections.
        expect(body.map((n) => n.component)).toEqual(["Section", "Section", "Section"]);
        expect(body[0]?.children?.[0]?.component).toBe("Heading");
        expect(body[1]?.props).toMatchObject({ width: "content", tone: "plain" });
        expect(body[1]?.children?.[0]?.props).toMatchObject({ text: "Loose heading" });
        expect(names(root)).not.toContain("PageBody");
      }
    }
  );

  it("adds block ids only with editIds, never on wrapper sections", async () => {
    const bundle = await bundleFor("hien-studio");
    const off = composeLayout(bundle, "page", layout);
    expect(JSON.stringify(off)).not.toContain('"bid"');
    const on = composeLayout(bundle, "page", layout, { editIds: true });
    const body = on.children!.slice(1, -1);
    expect(body[0]?.bid).toBe(layout.blocks[0]?.id);
    expect(body[0]?.children?.[0]?.bid).toBe(layout.blocks[0]?.children?.[0]?.id);
    expect(body[1]?.bid).toBeUndefined();
    expect(body[1]?.children?.[0]?.bid).toBe(layout.blocks[1]?.id);
  });

  it("sanitizes a document that skipped validation", async () => {
    const bundle = await bundleFor("english-center");
    const raw = {
      version: 1,
      blocks: [
        { id: "abcdef1", type: "RichText", props: { html: "<p>ok</p><script>alert(1)</script>" } },
      ],
    } as unknown as LayoutDoc;
    expect(JSON.stringify(composeLayout(bundle, "page", raw))).not.toContain("script");
  });
});

describe("rendering", () => {
  async function renderDoc(d: unknown, kind: "page" | "home" = "page") {
    const bundle = await bundleFor("hien-studio");
    const values = await getThemeSettings("hien-studio", bundle.manifest.settingsSchema);
    const parsed = parseLayout(JSON.stringify(d))!;
    return renderToStaticMarkup(
      <ThemeFrame
        bundle={bundle}
        values={values}
        ctx={{
          site: {
            title: "Site",
            description: "",
            url: "http://localhost",
            locale: "en",
            logoUrl: null,
          } as never,
          view: { kind, title: "T", layoutOverride: composeLayout(bundle, kind, parsed) } as never,
          preview: false,
        }}
      />
    );
  }

  it("renders the blocks of a layout for pages and home", async () => {
    for (const kind of ["page", "home"] as const) {
      const html = await renderDoc(doc(section(heading("Designer heading"))), kind);
      expect(html).toContain("Designer heading");
      expect(html).not.toContain("Theme body");
    }
  });

  it("RichText XSS from a stored document never reaches the HTML", async () => {
    const evil = {
      version: 1,
      blocks: [
        {
          id: "abcdef1",
          type: "Section",
          props: {},
          children: [
            {
              id: "abcdef2",
              type: "RichText",
              props: {
                html: '<p>safe text</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">x</a><iframe src="//evil"></iframe>',
              },
            },
          ],
        },
      ],
    };
    // The raw JSON is written straight to the column, bypassing the save path.
    await prisma.page.update({ where: { id: pageId }, data: { layout: JSON.stringify(evil) } });
    const stored = (await getPublishedLayout(page()))!;
    const bundle = await bundleFor("hien-studio");
    const html = renderToStaticMarkup(
      <ThemeFrame
        bundle={bundle}
        values={await getThemeSettings("hien-studio", bundle.manifest.settingsSchema)}
        ctx={{
          site: {
            title: "Site",
            description: "",
            url: "http://localhost",
            locale: "en",
            logoUrl: null,
          } as never,
          view: {
            kind: "page",
            title: "T",
            layoutOverride: composeLayout(bundle, "page", stored),
          } as never,
          preview: false,
        }}
      />
    );
    expect(html).toContain("safe text");
    expect(html).not.toMatch(/<script|onerror|javascript:|<iframe|alert\(/i);
  });

  it("Image without mediaId renders nothing; a new-tab Button gets noopener noreferrer", async () => {
    const html = await renderDoc(
      doc(
        section(
          {
            id: bid(),
            type: "Image",
            props: { alt: "UNIQUE-ALT-XYZ", caption: "UNIQUE-CAPTION-XYZ" },
          },
          {
            id: bid(),
            type: "Button",
            props: { label: "Go there", href: "https://example.com/x", newTab: true },
          }
        )
      )
    );
    expect(html).not.toContain("UNIQUE-ALT-XYZ");
    expect(html).not.toContain("UNIQUE-CAPTION-XYZ");
    const anchor = /<a[^>]*>[^<]*(?:<[^>]+>)*\s*Go there/.exec(html)?.[0] ?? "";
    const tag = /<a[^>]*href="https:\/\/example\.com\/x"[^>]*>/.exec(html)?.[0] ?? "";
    expect(anchor || tag).toBeTruthy();
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain("noopener");
    expect(tag).toContain("noreferrer");
  });

  it("the public page route uses the layout only after publishing", async () => {
    const { default: StaticPage } = await import("@/app/pages/[slug]/page");
    const props = { params: Promise.resolve({ slug: pageSlug }) };
    const override = async () => {
      const el = (await StaticPage(props)) as ReactElement<{
        ctx: { view: { layoutOverride?: LayoutNode } };
      }>;
      return el.props.ctx.view.layoutOverride;
    };
    expect(await override()).toBeUndefined();
    await saveDraft(admin, page(), doc(section(heading("Published bit"))));
    expect(await override()).toBeUndefined(); // draft is not public
    await publishDraft(admin, page());
    const node = await override();
    expect(JSON.stringify(node)).toContain("Published bit");
    await resetToTheme(admin, page());
    expect(await override()).toBeUndefined();
  });

  it("the home route uses the layout only after publishing", async () => {
    const { default: HomePage } = await import("@/app/page");
    const find = (
      node: ReactNode
    ): ReactElement<{ ctx?: { view: { layoutOverride?: LayoutNode } } }> | null => {
      if (Array.isArray(node)) {
        for (const n of node) {
          const f = find(n);
          if (f) return f;
        }
        return null;
      }
      if (!node || typeof node !== "object" || !("props" in node)) return null;
      const el = node as ReactElement<{
        ctx?: { view: { layoutOverride?: LayoutNode } };
        children?: ReactNode;
      }>;
      if (el.props.ctx) return el;
      return find(el.props.children);
    };
    const override = async () =>
      find(await HomePage({ searchParams: Promise.resolve({}) }))?.props.ctx?.view.layoutOverride;
    expect(await override()).toBeUndefined();
    await saveDraft(admin, HOME, doc(section(heading("Home published"))));
    await publishDraft(admin, HOME);
    expect(JSON.stringify(await override())).toContain("Home published");
  });
});
