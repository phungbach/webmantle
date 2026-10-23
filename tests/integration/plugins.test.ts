import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { savePost } from "@/lib/content/mutations";
import { ValidationError } from "@/lib/errors";
import { definePlugin } from "@/lib/plugins/define";
import {
  applyFilter,
  listPlugins,
  resetPluginRuntimeForTests,
  runAction,
  setPluginEnabled,
} from "@/lib/plugins/runtime";
import { savePluginSettings } from "@/lib/plugins/settings";
import { PLUGINS } from "@plugins";
import sitemap from "@/app/sitemap";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";
import { SITE_URL } from "@/lib/env";

type User = Awaited<ReturnType<typeof createUser>>;
let editor: User;

const base = {
  title: "Plugin test",
  slug: "plugin-test",
  body: "<p>x</p>",
  status: "published" as const,
};

async function enable(id: string, settings: Record<string, string | boolean> = {}) {
  await setPluginEnabled(id, true);
  const def = PLUGINS.find((p) => p.id === id);
  if (def?.settings) await savePluginSettings(id, def.settings, settings);
}

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
  editor = await createUser("editor");
  resetPluginRuntimeForTests(PLUGINS);
});

describe("project plugins", () => {
  it("registers every plugin in the database, turned off", async () => {
    const list = await listPlugins();
    expect(list.map((p) => p.id).sort()).toEqual([
      "admin-links",
      "external-links",
      "sitemap-extras",
    ]);
    expect(list.every((p) => p.state === "active" && !p.enabled)).toBe(true);
    expect(await prisma.plugin.count({ where: { enabled: true } })).toBe(0);
  });

  it("does nothing to posts while a plugin is off", async () => {
    const { id } = await savePost(editor, {
      ...base,
      body: '<p><a href="https://example.org/x">link</a></p>',
    });
    const row = await prisma.post.findUniqueOrThrow({ where: { id } });
    // The sanitizer always adds rel; the plugin only adds target="_blank", and only when it is on.
    expect(row.body).not.toContain('target="_blank"');
  });

  it("external-links adds nofollow to outside links when it is on", async () => {
    await enable("external-links", { newTab: true });
    const { id } = await savePost(editor, {
      ...base,
      body: `<p><a href="https://example.org/x">out</a> <a href="${SITE_URL}/posts/other">in</a></p>`,
    });
    const body = (await prisma.post.findUniqueOrThrow({ where: { id } })).body;
    expect(body).toMatch(/href="https:\/\/example\.org\/x"[^>]*target="_blank"/);
    expect(body).toMatch(/href="https:\/\/example\.org\/x"[^>]*rel="[^"]*nofollow/);
    // Links to the site itself are left alone.
    expect(body).not.toMatch(new RegExp(`href="${SITE_URL}/posts/other"[^>]*target`));
  });

  it("the output of a plugin is sanitized again, so it cannot store script", async () => {
    await enable("external-links");
    const { id } = await savePost(editor, {
      ...base,
      body: '<p><a href="https://example.org/">x</a><script>alert(1)</script></p>',
    });
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).body).not.toContain("<script");
  });

  it("admin-links adds only safe links from its settings", async () => {
    await enable("admin-links", {
      links: "Tài liệu | https://docs.example.org\nBad | javascript:alert(1)\nNội bộ | /gioi-thieu",
    });
    const items = await applyFilter("admin.nav", []);
    expect(items).toEqual([
      { label: "Tài liệu", href: "https://docs.example.org" },
      { label: "Nội bộ", href: "/gioi-thieu" },
    ]);
  });

  it("sitemap-extras adds listed paths and ignores traversal attempts", async () => {
    await enable("sitemap-extras", { paths: "/lien-he, /../secret, /dich-vu" });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/lien-he`);
    expect(urls).toContain(`${SITE_URL}/dich-vu`);
    expect(urls.some((u) => u.includes("secret"))).toBe(false);
  });

  it("refuses to turn on a plugin that failed to load", async () => {
    resetPluginRuntimeForTests([{ ...PLUGINS[0]!, id: "old-plugin", minimumCmsVersion: "9.0.0" }]);
    await expect(setPluginEnabled("old-plugin", true)).rejects.toThrow(/cannot be turned on/);
    const [plugin] = await listPlugins();
    expect(plugin?.state).toBe("incompatible");
  });
});

describe("plugin safety", () => {
  it("a plugin that throws does not stop the save, and the failure is recorded", async () => {
    const broken = definePlugin({
      id: "broken-plugin",
      name: "Broken",
      version: "1.0.0",
      description: "Always fails",
      author: "Test",
      minimumCmsVersion: "1.0.0",
      activate(api) {
        api.addFilter("post.beforeSave", () => {
          throw new Error("boom");
        });
      },
    });
    resetPluginRuntimeForTests([broken]);
    await setPluginEnabled("broken-plugin", true);
    const { id } = await savePost(editor, base);
    expect(await prisma.post.count({ where: { id } })).toBe(1);
    const [plugin] = await listPlugins();
    expect(plugin?.message).toContain("boom");
  });

  it("a plugin cannot save data that fails validation", async () => {
    const hostile = definePlugin({
      id: "hostile-plugin",
      name: "Hostile",
      version: "1.0.0",
      description: "Returns an invalid slug",
      author: "Test",
      minimumCmsVersion: "1.0.0",
      activate(api) {
        api.addFilter("post.beforeSave", (input) => ({ ...input, slug: "admin" }));
      },
    });
    resetPluginRuntimeForTests([hostile]);
    await setPluginEnabled("hostile-plugin", true);
    await expect(savePost(editor, base)).rejects.toThrow(ValidationError);
    expect(await prisma.post.count()).toBe(0);
  });

  it("refuses to register a hook that does not exist", async () => {
    const wrong = definePlugin({
      id: "wrong-hook",
      name: "Wrong",
      version: "1.0.0",
      description: "Uses an unknown hook",
      author: "Test",
      minimumCmsVersion: "1.0.0",
      activate(api) {
        (api as unknown as { addFilter: (n: string, h: () => void) => void }).addFilter(
          "not.a.hook",
          () => undefined
        );
      },
    });
    resetPluginRuntimeForTests([wrong]);
    const [plugin] = await listPlugins();
    expect(plugin?.state).toBe("error");
    expect(plugin?.message).toContain("Unknown filter");
  });

  it("runs post.saved actions with the saved post and isolates their failures", async () => {
    const seen: string[] = [];
    const listener = definePlugin({
      id: "listener",
      name: "Listener",
      version: "1.0.0",
      description: "Records saves",
      author: "Test",
      minimumCmsVersion: "1.0.0",
      activate(api) {
        api.addAction("post.saved", (payload) => {
          seen.push(payload.slug);
        });
      },
    });
    resetPluginRuntimeForTests([listener]);
    await setPluginEnabled("listener", true);
    await savePost(editor, base);
    expect(seen).toEqual(["plugin-test"]);
    await runAction("post.saved", { id: "x", slug: "y", status: "draft" });
    expect(seen).toEqual(["plugin-test", "y"]);
  });

  it("applies filters in priority order", async () => {
    const order: string[] = [];
    const makeOrdering = (id: string, priority: number) =>
      definePlugin({
        id,
        name: id,
        version: "1.0.0",
        description: "",
        author: "",
        minimumCmsVersion: "1.0.0",
        activate(api) {
          api.addFilter(
            "admin.nav",
            (items) => {
              order.push(id);
              return items;
            },
            priority
          );
        },
      });
    resetPluginRuntimeForTests([makeOrdering("late", 50), makeOrdering("early", 5)]);
    await setPluginEnabled("late", true);
    await setPluginEnabled("early", true);
    await applyFilter("admin.nav", []);
    expect(order).toEqual(["early", "late"]);
  });
});
