import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";

// The actions read the session cookie of the current request; the tests supply it.
let token = "";
const cookieStore = {
  get: (name: string) => (name === SESSION_COOKIE && token ? { value: token } : undefined),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const ACTIONS_DIR = path.resolve(__dirname, "..", "..", "src", "app", "admin", "actions");

/** Everything a read-only account could use to change data or reach more privilege. */
async function snapshot() {
  const [users, settings, posts, pages, categories, tags, media, plugins, themes] =
    await Promise.all([
      prisma.user.findMany({
        orderBy: { email: "asc" },
        select: { email: true, role: true, passwordHash: true },
      }),
      prisma.siteSetting.findMany({ orderBy: { key: "asc" }, select: { key: true, value: true } }),
      prisma.post.count(),
      prisma.page.count(),
      prisma.category.count(),
      prisma.tag.count(),
      prisma.media.count(),
      prisma.plugin.findMany({ select: { id: true, enabled: true } }),
      prisma.theme.findMany({ select: { id: true, version: true } }),
    ]);
  return JSON.stringify({
    users,
    settings,
    posts,
    pages,
    categories,
    tags,
    media,
    plugins,
    themes,
  });
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

/** Calls an action the way a hostile client would, ignoring redirects and thrown errors. */
async function attack(run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    return error;
  }
}

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  token = "";
});

describe("every Server Action checks a permission", () => {
  // Sign-in, sign-out and changing your own password are the only actions that are not permissions.
  const SELF_SERVICE = new Set(["loginAction", "logoutAction", "changePasswordAction"]);

  it("each exported action calls requirePermission, directly or through its run() helper", () => {
    const files = fs.readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts") && f !== "shared.ts");
    const unguarded: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
      if (!source.startsWith('"use server"')) continue;
      const usesRunHelper =
        /async function run\(/.test(source) && /requirePermission\(/.test(source);
      const parts = source.split(/\nexport async function /).slice(1);
      for (const part of parts) {
        const name = part.slice(0, part.indexOf("("));
        if (SELF_SERVICE.has(name)) continue;
        const body = part.slice(0, 3000);
        const guarded =
          /requirePermission\(|assertPermission\(/.test(body) ||
          (usesRunHelper && /return run\(/.test(body));
        if (!guarded) unguarded.push(`${file}:${name}`);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it("the password action refuses the demo account", () => {
    const source = fs.readFileSync(path.join(ACTIONS_DIR, "account.ts"), "utf8");
    expect(source).toMatch(/role === "viewer"/);
  });
});

describe("a signed-in demo (viewer) account cannot change anything or gain privilege", () => {
  it("is refused by every write action and leaves the database untouched", async () => {
    const admin = await createUser("admin");
    const viewer = await createUser("viewer");
    token = (await createSession(viewer.id)).token;
    const before = await snapshot();

    const content = await import("@/app/admin/actions/content");
    const themes = await import("@/app/admin/actions/themes");
    const appearance = await import("@/app/admin/actions/appearance");
    const blogStyle = await import("@/app/admin/actions/blog-style");
    const seo = await import("@/app/admin/actions/seo");
    const plugins = await import("@/app/admin/actions/plugins");
    const account = await import("@/app/admin/actions/account");
    const builder = await import("@/app/admin/actions/builder");
    const themeContent = await import("@/app/admin/actions/theme-content");

    const attempts: [string, () => Promise<unknown>][] = [
      // The escalation paths: make an admin, delete an admin, change someone's password or role.
      [
        "create admin",
        () =>
          content.createUserAction(
            form({
              name: "Evil",
              email: "evil@example.com",
              role: "admin",
              password: "Passw0rd!Passw0rd!x",
            })
          ),
      ],
      ["delete admin", () => content.deleteUserAction(form({ id: admin.id }))],
      [
        "change own password",
        () =>
          account.changePasswordAction(
            form({
              currentPassword: "correct horse battery",
              newPassword: "another-long-password-1",
              confirmPassword: "another-long-password-1",
            })
          ),
      ],
      [
        "site settings",
        () => content.saveSiteSettingsAction(form({ siteTitle: "PWNED", siteDescription: "x" })),
      ],
      ["appearance", () => appearance.saveAppearanceAction(form({ palette: "red" }))],
      ["menu", () => appearance.saveMenuAction(form({ items: "[]" }))],
      ["logo", () => appearance.removeLogoAction()],
      ["blog style", () => blogStyle.saveBlogStyleAction(form({}))],
      ["seo", () => seo.saveSeoSettingsAction(form({ homeTitle: "PWNED" }))],
      [
        "save post",
        () =>
          content.savePostAction(
            form({ title: "ATTACK", slug: "attack", body: "<p>x</p>", status: "published" })
          ),
      ],
      [
        "save page",
        () =>
          content.savePageAction(
            form({ title: "ATTACK", slug: "attack", body: "<p>x</p>", status: "published" })
          ),
      ],
      ["category", () => content.saveCategoryAction(form({ name: "ATTACK" }))],
      ["tag", () => content.saveTagAction(form({ name: "ATTACK" }))],
      ["delete media", () => content.deleteMediaAction(form({ id: "x" }))],
      ["upload media", () => content.uploadMediaAction(form({ altText: "x" }))],
      ["activate theme", () => themes.activateThemeAction(form({ themeId: "starter" }))],
      ["uninstall theme", () => themes.uninstallThemeAction(form({ themeId: "starter" }))],
      ["theme settings", () => themes.saveThemeSettingsAction(form({ themeId: "default" }))],
      ["rollback theme", () => themes.rollbackThemeAction()],
      ["toggle plugin", () => plugins.togglePluginAction(form({ pluginId: "admin-links" }))],
      [
        "plugin settings",
        () => plugins.savePluginSettingsAction(form({ pluginId: "admin-links" })),
      ],
      ["designer draft (home)", () => builder.saveDraftAction({ kind: "home" }, "{}")],
      ["designer publish (home)", () => builder.publishAction({ kind: "home" })],
      ["designer reset (page)", () => builder.resetAction({ kind: "page", id: "x" })],
      [
        "theme text save",
        () => themeContent.saveContentKeyAction("hero", JSON.stringify({ title: "PWNED" })),
      ],
      ["theme text publish", () => themeContent.publishContentAction()],
    ];

    for (const [label, run] of attempts) {
      await attack(run);
      expect(await snapshot(), `after "${label}"`).toBe(before);
    }
    const roles = await prisma.user.findMany({ select: { email: true, role: true } });
    expect(roles.filter((u) => u.role === "admin").map((u) => u.email)).toEqual([admin.email]);
  });

  it("the same calls do work for an administrator, so the checks above prove something", async () => {
    const admin = await createUser("admin");
    token = (await createSession(admin.id)).token;
    const content = await import("@/app/admin/actions/content");
    const before = await snapshot();
    await attack(() =>
      content.createUserAction(
        form({
          name: "New",
          email: "new-editor@example.com",
          role: "editor",
          password: "Passw0rd!Passw0rd!x",
        })
      )
    );
    expect(await snapshot()).not.toBe(before);
    expect(
      await prisma.user.findUnique({ where: { email: "new-editor@example.com" } })
    ).not.toBeNull();
  });
});
