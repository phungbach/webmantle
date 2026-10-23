import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../helpers/db";

const state = vi.hoisted(() => ({ role: "admin" as string | null }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "en" }), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/auth/session", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () =>
      state.role ? { id: "u", email: "u@example.com", name: "U", role: state.role } : null,
  };
});

type LegacyPage = (props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<unknown>;
type Node = ReactElement<Record<string, unknown>>;
function walk(node: ReactNode, visit: (el: Node) => void) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!node || typeof node !== "object" || !("props" in node)) return;
  const el = node as Node;
  visit(el);
  walk(el.props.children as ReactNode, visit);
}

async function render(query: Record<string, string | string[] | undefined>) {
  const { default: SettingsPage } = await import("@/app/admin/settings/page");
  const tree = await SettingsPage({ searchParams: Promise.resolve(query) });
  const tabs: { id: string; selected: boolean; href: string }[] = [];
  const panels: string[] = [];
  walk(tree, (el) => {
    if (el.props.role === "tab")
      tabs.push({
        id: String(el.props.id).replace("settings-tab-", ""),
        selected: el.props["aria-selected"] === true,
        href: String(el.props.href),
      });
    if (typeof el.type === "function" && /Panel$/.test(el.type.name)) panels.push(el.type.name);
  });
  return { tabs, panels };
}

async function redirectOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("REDIRECT:")) return m.slice("REDIRECT:".length);
    throw e;
  }
  return null;
}

beforeEach(async () => {
  await resetDatabase();
  state.role = "admin";
});
afterEach(() => vi.restoreAllMocks());

describe("settings hub page", () => {
  it("shows all five tabs to an admin and General by default", async () => {
    const { tabs, panels } = await render({});
    expect(tabs.map((t) => t.id)).toEqual(["general", "appearance", "blog-style", "seo", "plugins"]);
    expect(tabs.filter((t) => t.selected).map((t) => t.id)).toEqual(["general"]);
    expect(panels).toEqual(["GeneralPanel"]);
  });

  it.each([
    ["appearance", "AppearancePanel"],
    ["blog-style", "BlogStylePanel"],
    ["seo", "SeoPanel"],
    ["plugins", "PluginsPanel"],
    ["general", "GeneralPanel"],
  ])("?tab=%s renders only %s", async (tab, panel) => {
    const { tabs, panels } = await render({ tab });
    expect(tabs.find((t) => t.selected)?.id).toBe(tab);
    expect(panels).toEqual([panel]);
  });

  it("falls back to the first allowed tab for an unknown tab value", async () => {
    for (const tab of ["nope", "", "__proto__", ["plugins", "x"] as string[]]) {
      const { tabs, panels } = await render({ tab });
      if (Array.isArray(tab)) expect(tabs.find((t) => t.selected)?.id).toBe("plugins");
      else {
        expect(tabs.find((t) => t.selected)?.id).toBe("general");
        expect(panels).toEqual(["GeneralPanel"]);
      }
    }
  });

  it("tab links are plain ?tab= URLs", async () => {
    const { tabs } = await render({});
    for (const t of tabs) expect(t.href).toBe(`/admin/settings?tab=${t.id}`);
  });

  it("redirects roles without settings or plugin permission to /admin", async () => {
    for (const role of ["editor", "author", "unknown-role"]) {
      state.role = role;
      expect(await redirectOf(() => render({}))).toBe("/admin");
      expect(await redirectOf(() => render({ tab: "plugins" }))).toBe("/admin");
    }
  });

  it("redirects anonymous visitors to /admin", async () => {
    state.role = null;
    expect(await redirectOf(() => render({}))).toBe("/admin");
  });
});

describe("old settings URLs", () => {
  const cases: [string, string][] = [
    ["appearance", "appearance"],
    ["blog-style", "blog-style"],
    ["plugins", "plugins"],
  ];
  async function legacy(dir: string, query: Record<string, string | string[] | undefined>) {
    const loaders: Record<string, () => Promise<{ default: LegacyPage }>> = {
      appearance: () => import("@/app/admin/appearance/page"),
      "blog-style": () => import("@/app/admin/blog-style/page"),
      plugins: () => import("@/app/admin/plugins/page"),
    };
    const mod = await loaders[dir]!();
    return redirectOf(() => mod.default({ searchParams: Promise.resolve(query) }));
  }

  it.each(cases)("/admin/%s redirects to the matching tab", async (dir, tab) => {
    expect(await legacy(dir, {})).toBe(`/admin/settings?tab=${tab}`);
  });

  it.each(cases)("/admin/%s keeps ok and error messages", async (dir, tab) => {
    const url = await legacy(dir, { ok: "Saved & done", error: "Bad <thing>" });
    const parsed = new URL(url!, "http://x");
    expect(parsed.pathname).toBe("/admin/settings");
    expect(parsed.searchParams.get("tab")).toBe(tab);
    expect(parsed.searchParams.get("ok")).toBe("Saved & done");
    expect(parsed.searchParams.get("error")).toBe("Bad <thing>");
  });

  it("does not let a query value override the tab or inject other params", async () => {
    const url = await legacy("appearance", { tab: "plugins", evil: "1", ok: ["a", "b"] });
    const parsed = new URL(url!, "http://x");
    expect(parsed.searchParams.get("tab")).toBe("appearance");
    expect(parsed.searchParams.get("evil")).toBeNull();
    expect(parsed.searchParams.get("ok")).toBe("a");
  });
});

describe("where the logo card lives", () => {
  function names(tree: ReactNode): string[] {
    const found: string[] = [];
    walk(tree, (el) => {
      if (typeof el.type === "function") found.push(el.type.name);
    });
    return found;
  }

  it("is on the General tab and not on the Appearance tab", async () => {
    const { GeneralPanel } = await import("@/components/admin/settings/general-panel");
    const { AppearancePanel } = await import("@/components/admin/settings/appearance-panel");
    const general = names(await GeneralPanel({ role: "admin", params: {} }));
    const appearance = names(await AppearancePanel({ params: {} }));
    expect(general).toContain("LogoUploader");
    expect(appearance).not.toContain("LogoUploader");
  });
});
