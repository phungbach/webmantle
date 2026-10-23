import type { MetadataRoute } from "next";
import type { SettingDefinition, SettingValue } from "@/lib/themes/contract";
import type { PostInput } from "@/lib/validation/schemas";
import type { PostDetail } from "@/lib/content/queries";

/**
 * Plugin API, version 1. A plugin is a trusted developer package in the repository (plugins/<id>).
 * It registers handlers for named hook points. A hook point is either:
 *   - a FILTER: receives a value, returns the (possibly changed) value; or
 *   - an ACTION: receives an event; its result is ignored.
 * Handlers never receive database clients. They only see the value of their hook point and their
 * own settings. Failing handlers are logged and skipped; the page or the save still completes.
 */

export type PluginSettingsValues = Record<string, SettingValue>;

export type AdminNavItem = { href: string; label: string };

/** Filter hook points and the value each one carries. */
export type FilterMap = {
  /** Post data after validation and before it is saved. The result is validated again. */
  "post.beforeSave": PostInput;
  /** A published post before it is rendered. bodyHtml is sanitized again after this filter. */
  "post.detail": PostDetail;
  /** Entries of /sitemap.xml. */
  "sitemap.entries": MetadataRoute.Sitemap;
  /** Extra items added to the admin sidebar. Only internal paths and http(s) links are shown. */
  "admin.nav": AdminNavItem[];
};

/** Action hook points: events after something happened. */
export type ActionMap = {
  "post.saved": { id: string; slug: string; status: string };
};

export type FilterName = keyof FilterMap;
export type ActionName = keyof ActionMap;

export type HookEnv = {
  pluginId: string;
  /** Current settings of this plugin, with defaults applied. */
  settings: () => Promise<PluginSettingsValues>;
};

export type FilterHandler<K extends FilterName> = (
  value: FilterMap[K],
  env: HookEnv
) => FilterMap[K] | Promise<FilterMap[K]>;

export type ActionHandler<K extends ActionName> = (
  payload: ActionMap[K],
  env: HookEnv
) => void | Promise<void>;

export type PluginApi = {
  addFilter<K extends FilterName>(name: K, handler: FilterHandler<K>, priority?: number): void;
  addAction<K extends ActionName>(name: K, handler: ActionHandler<K>, priority?: number): void;
};

export type PluginDefinition = {
  /** Lowercase letters, digits and dashes. Unique across the project. */
  id: string;
  name: string;
  /** Semantic version, for example 1.0.0. */
  version: string;
  description: string;
  author: string;
  /** The plugin is not loaded on a CMS older than this version. */
  minimumCmsVersion: string;
  /** Settings shown in the admin. Same types as theme settings (text, boolean, select, color). */
  settings?: SettingDefinition[];
  /** Registers hook handlers. Keep it fast: it runs once when the server starts. */
  activate: (api: PluginApi) => void;
};

export type PluginStatus = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  settings: SettingDefinition[];
  /** active: loaded and usable. incompatible or error: not loaded, see message. */
  state: "active" | "incompatible" | "error";
  enabled: boolean;
  message: string | null;
};
