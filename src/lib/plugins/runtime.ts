import { z } from "zod";
import { prisma } from "@/lib/db";
import { CMS_VERSION, compareSemver, settingDefinitionSchema } from "@/lib/themes/contract";
import { PLUGINS } from "@plugins";
import { getPluginSettings } from "@/lib/plugins/settings";
import type {
  ActionMap,
  ActionName,
  FilterMap,
  FilterName,
  HookEnv,
  PluginApi,
  PluginDefinition,
  PluginStatus,
} from "@/lib/plugins/types";

/**
 * Loads plugins from plugins/index.ts, checks them, and runs their hooks.
 * Every hook call is isolated: an exception is recorded and the hook is skipped, so a broken plugin
 * cannot stop a page from rendering or a post from being saved.
 */

const FILTER_NAMES: readonly FilterName[] = [
  "post.beforeSave",
  "post.detail",
  "sitemap.entries",
  "admin.nav",
];
const ACTION_NAMES: readonly ActionName[] = ["post.saved"];

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const definitionSchema = z.object({
  id: z.string().regex(ID).min(2).max(40),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(300),
  author: z.string().max(100),
  minimumCmsVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  settings: z.array(settingDefinitionSchema).max(30).optional(),
});

type Handler = {
  pluginId: string;
  priority: number;
  order: number;
  run: (value: never, env: HookEnv) => unknown;
};
type Loaded = {
  def: PluginDefinition;
  state: PluginStatus["state"];
  message: string | null;
};

/** Plugins to load. Production uses the project list; tests can substitute their own. */
let source: PluginDefinition[] = PLUGINS;

const plugins = new Map<string, Loaded>();
const enabled = new Map<string, boolean>();
const filters = new Map<string, Handler[]>();
const actions = new Map<string, Handler[]>();
let order = 0;
let ready: Promise<void> | null = null;

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 200);
}

/** Problems with a definition, as text for the admin. An empty list means it can be loaded. */
export function checkDefinition(def: unknown): string[] {
  const parsed = definitionSchema.safeParse(def);
  if (!parsed.success) {
    return parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "definition"}: ${i.message}`);
  }
  if (typeof (def as PluginDefinition).activate !== "function")
    return ["activate must be a function"];
  return [];
}

function makeApi(pluginId: string): PluginApi {
  return {
    addFilter(name, handler, priority = 10) {
      if (!FILTER_NAMES.includes(name)) throw new Error(`Unknown filter: ${String(name)}`);
      const list = filters.get(name) ?? [];
      list.push({ pluginId, priority, order: order++, run: handler as Handler["run"] });
      filters.set(name, list);
    },
    addAction(name, handler, priority = 10) {
      if (!ACTION_NAMES.includes(name)) throw new Error(`Unknown action: ${String(name)}`);
      const list = actions.get(name) ?? [];
      list.push({ pluginId, priority, order: order++, run: handler as Handler["run"] });
      actions.set(name, list);
    },
  };
}

function handlersFor(map: Map<string, Handler[]>, name: string): Handler[] {
  return [...(map.get(name) ?? [])].sort((a, b) => a.priority - b.priority || a.order - b.order);
}

function envFor(def: PluginDefinition): HookEnv {
  return {
    pluginId: def.id,
    settings: () => getPluginSettings(def.id, def.settings ?? []),
  };
}

async function load(): Promise<void> {
  const rows = await prisma.plugin.findMany();
  const known = new Set<string>();
  for (const def of source) {
    const problems = checkDefinition(def);
    const id =
      typeof (def as PluginDefinition).id === "string" ? (def as PluginDefinition).id : "unknown";
    if (problems.length > 0) {
      plugins.set(id, { def, state: "error", message: problems.join("; ") });
      continue;
    }
    if (known.has(def.id)) {
      plugins.set(def.id, { def, state: "error", message: "Duplicate plugin id" });
      continue;
    }
    known.add(def.id);
    if (compareSemver(def.minimumCmsVersion, CMS_VERSION) > 0) {
      plugins.set(def.id, {
        def,
        state: "incompatible",
        message: `Requires CMS ${def.minimumCmsVersion} or newer`,
      });
      continue;
    }
    const row = await prisma.plugin.upsert({
      where: { id: def.id },
      create: { id: def.id, name: def.name, version: def.version, enabled: false },
      update: { name: def.name, version: def.version },
    });
    enabled.set(def.id, row.enabled);
    try {
      def.activate(makeApi(def.id));
      plugins.set(def.id, { def, state: "active", message: null });
    } catch (error) {
      plugins.set(def.id, { def, state: "error", message: errorText(error) });
    }
  }
  // Rows for plugins that were removed from the repository stay in the database but are not loaded.
  for (const row of rows) if (!known.has(row.id)) enabled.set(row.id, false);
}

/** Loads all plugins once per process. Safe to call from every request. */
export function ensurePlugins(): Promise<void> {
  ready ??= load();
  return ready;
}

/** Test helper: forgets everything and loads the given plugins (or the project list) next time. */
export function resetPluginRuntimeForTests(list: PluginDefinition[] = PLUGINS) {
  source = list;
  ready = null;
  plugins.clear();
  enabled.clear();
  filters.clear();
  actions.clear();
  order = 0;
}

function isRunnable(pluginId: string): boolean {
  return plugins.get(pluginId)?.state === "active" && enabled.get(pluginId) === true;
}

function report(pluginId: string, hook: string, error: unknown) {
  const loaded = plugins.get(pluginId);
  if (loaded) loaded.message = `${hook}: ${errorText(error)}`;
  console.error(`[plugin:${pluginId}] ${hook} failed: ${errorText(error)}`);
}

/** Runs every enabled filter for a hook point, in priority order. */
export async function applyFilter<K extends FilterName>(
  name: K,
  value: FilterMap[K]
): Promise<FilterMap[K]> {
  await ensurePlugins();
  let current = value;
  for (const handler of handlersFor(filters, name)) {
    if (!isRunnable(handler.pluginId)) continue;
    const def = plugins.get(handler.pluginId)!.def;
    try {
      const next = await (
        handler.run as (v: FilterMap[K], e: HookEnv) => FilterMap[K] | Promise<FilterMap[K]>
      )(current, envFor(def));
      if (next !== undefined) current = next;
    } catch (error) {
      report(handler.pluginId, name, error);
    }
  }
  return current;
}

/** Runs every enabled action for an event. Errors are recorded and never reach the caller. */
export async function runAction<K extends ActionName>(
  name: K,
  payload: ActionMap[K]
): Promise<void> {
  await ensurePlugins();
  for (const handler of handlersFor(actions, name)) {
    if (!isRunnable(handler.pluginId)) continue;
    const def = plugins.get(handler.pluginId)!.def;
    try {
      await (handler.run as (p: ActionMap[K], e: HookEnv) => unknown)(payload, envFor(def));
    } catch (error) {
      report(handler.pluginId, name, error);
    }
  }
}

/** Everything the admin needs to show: the plugins, their state, and their settings. */
export async function listPlugins(): Promise<PluginStatus[]> {
  await ensurePlugins();
  return [...plugins.values()]
    .map(({ def, state, message }) => ({
      id: def.id,
      name: def.name,
      version: def.version,
      description: def.description,
      author: def.author,
      settings: def.settings ?? [],
      state,
      enabled: enabled.get(def.id) === true && state === "active",
      message,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Turns a plugin on or off. Only plugins that loaded successfully can be turned on. */
export async function setPluginEnabled(pluginId: string, on: boolean): Promise<void> {
  await ensurePlugins();
  const loaded = plugins.get(pluginId);
  if (!loaded) throw new Error("That plugin is not installed.");
  if (on && loaded.state !== "active")
    throw new Error("This plugin cannot be turned on: " + (loaded.message ?? loaded.state));
  await prisma.plugin.update({ where: { id: pluginId }, data: { enabled: on } });
  enabled.set(pluginId, on);
}

/** Definition of a loaded plugin, for the settings form. */
export async function getPluginDefinition(pluginId: string): Promise<PluginDefinition | null> {
  await ensurePlugins();
  return plugins.get(pluginId)?.def ?? null;
}
