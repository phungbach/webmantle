import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { ThemeError } from "@/lib/themes/errors";
import {
  templateFileSchema,
  type LayoutNode,
  type Manifest,
  type TemplateType,
} from "@/lib/themes/contract";
import { validateThemeDirectory } from "@/lib/themes/validate";

/**
 * The theme the site falls back to when the active one cannot be loaded. It is protected from
 * removal. Webcore by default; set CMS_FALLBACK_THEME_ID to use another installed theme.
 */
export const FALLBACK_THEME_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(
  process.env.CMS_FALLBACK_THEME_ID ?? ""
)
  ? process.env.CMS_FALLBACK_THEME_ID!
  : "webcore";

export type ThemeBundle = {
  id: string;
  version: string;
  path: string;
  manifest: Manifest;
  /** Core templates plus custom templates, keyed by template name. */
  templates: Record<string, LayoutNode>;
  stylesFile: string;
  /** Contents of content.json (marketing blocks), or an empty object when the theme has none. */
  content: Record<string, unknown>;
  /** Blocks for other languages (content.en.json), keyed by locale. They replace blocks of `content`. */
  contentByLocale: Record<string, Record<string, unknown>>;
  /** Modification time of every file the bundle was built from. Used to detect edits and deletions. */
  fingerprint: Record<string, number>;
};

// Bundles are cached per directory. A cached bundle is reused only while every file it was built
// from still exists with the same modification time, so a deleted stylesheet or an edited template
// is noticed on the next request instead of being served from memory.
const bundleCache = new Map<string, ThemeBundle>();

export function clearBundleCache() {
  bundleCache.clear();
}

function fingerprintOf(
  themePath: string,
  templates: string[],
  contentFiles: string[] = []
): Record<string, number> | null {
  const files = [
    "theme.json",
    "styles.css",
    ...templates.map((t) => `templates/${t}.json`),
    ...contentFiles,
  ];
  const out: Record<string, number> = {};
  for (const rel of files) {
    try {
      out[rel] = fs.statSync(path.join(themePath, rel)).mtimeMs;
    } catch {
      return null;
    }
  }
  return out;
}

function isUnchanged(bundle: ThemeBundle): boolean {
  return Object.entries(bundle.fingerprint).every(([rel, mtime]) => {
    try {
      return fs.statSync(path.join(bundle.path, rel)).mtimeMs === mtime;
    } catch {
      return false;
    }
  });
}

/** Loads and fully validates an installed theme directory into memory. Throws ThemeError on failure. */
export function loadBundle(themeId: string, themePath: string): ThemeBundle {
  const cached = bundleCache.get(themePath);
  if (cached && cached.id === themeId && isUnchanged(cached)) return cached;
  bundleCache.delete(themePath);

  const report = validateThemeDirectory(themePath);
  if (!report.ok || !report.manifest) {
    throw new ThemeError("invalid", `Theme "${themeId}" failed validation`, report);
  }
  if (report.manifest.id !== themeId) {
    throw new ThemeError("invalid", `Theme id mismatch for "${themeId}"`);
  }

  const names = [
    ...report.manifest.supportedTemplates,
    ...report.manifest.customTemplates.map((t) => t.id),
  ];
  const templates: ThemeBundle["templates"] = {};
  for (const name of names) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(themePath, "templates", `${name}.json`), "utf8")
    );
    templates[name] = templateFileSchema.parse(raw).root;
  }

  const contentFiles = fs
    .readdirSync(themePath)
    .filter((f) => f === "content.json" || /^content\.[a-z]{2}\.json$/.test(f));
  const fingerprint = fingerprintOf(themePath, names, contentFiles);
  if (!fingerprint) throw new ThemeError("invalid", `Theme "${themeId}" files are missing on disk`);

  const contentFile = path.join(themePath, "content.json");
  const content = fs.existsSync(contentFile)
    ? (JSON.parse(fs.readFileSync(contentFile, "utf8")) as Record<string, unknown>)
    : {};

  const contentByLocale: ThemeBundle["contentByLocale"] = {};
  for (const file of contentFiles) {
    const locale = /^content\.([a-z]{2})\.json$/.exec(file)?.[1];
    if (locale)
      contentByLocale[locale] = JSON.parse(fs.readFileSync(path.join(themePath, file), "utf8"));
  }

  const bundle: ThemeBundle = {
    id: themeId,
    content,
    contentByLocale,
    version: report.manifest.version,
    path: themePath,
    manifest: report.manifest,
    templates,
    stylesFile: path.join(themePath, "styles.css"),
    fingerprint,
  };
  bundleCache.set(themePath, bundle);
  return bundle;
}

/**
 * Layout for a page. A custom template is used only when the theme offers it for this kind of page.
 * Anything else (unknown name, wrong kind, removed file) silently uses the default template.
 */
export function templateFor(
  bundle: ThemeBundle,
  type: TemplateType,
  customTemplateId?: string
): LayoutNode {
  if (customTemplateId && isCustomTemplateAvailable(bundle, customTemplateId, type)) {
    return bundle.templates[customTemplateId]!;
  }
  const direct = bundle.templates[type];
  if (direct) return direct;
  // category has a fallback to archive; everything else is required and validated at install time.
  if (type === "category" && bundle.templates.archive) return bundle.templates.archive;
  throw new ThemeError("invalid", `Theme "${bundle.id}" has no "${type}" template`);
}

export function isCustomTemplateAvailable(
  bundle: ThemeBundle,
  customTemplateId: string,
  kind: string
): boolean {
  const definition = bundle.manifest.customTemplates.find((t) => t.id === customTemplateId);
  return Boolean(
    definition && definition.appliesTo.some((k) => k === kind) && bundle.templates[customTemplateId]
  );
}

/** Custom templates a theme offers for one kind of page, for the editor's template picker. */
export function customTemplatesFor(bundle: ThemeBundle, kind: "single-post" | "page") {
  return bundle.manifest.customTemplates
    .filter((t) => t.appliesTo.includes(kind))
    .map((t) => ({ id: t.id, label: t.label, description: t.description }));
}

export async function listInstalledThemes() {
  return prisma.theme.findMany({ orderBy: [{ name: "asc" }] });
}

export async function getInstalledTheme(id: string) {
  return prisma.theme.findUnique({ where: { id } });
}

/**
 * Resolves the active theme for public rendering. If the active theme cannot be loaded (files
 * removed or corrupted), the site falls back to the fallback theme (see FALLBACK_THEME_ID) rather than going down.
 */
export async function resolveActiveTheme(): Promise<{ bundle: ThemeBundle; fellBack: boolean }> {
  const settings = await getSiteSettings();
  const activeId = settings.activeThemeId ?? FALLBACK_THEME_ID;
  const active = await getInstalledTheme(activeId);
  if (active) {
    try {
      return { bundle: loadBundle(active.id, active.path), fellBack: false };
    } catch {
      // Fall through to the fallback below. The failure is visible in the admin theme list.
    }
  }
  const fallback = await getInstalledTheme(FALLBACK_THEME_ID);
  if (!fallback) throw new ThemeError("not-found", "No usable theme is installed.");
  return { bundle: loadBundle(fallback.id, fallback.path), fellBack: true };
}

export async function loadThemeById(id: string): Promise<ThemeBundle> {
  const theme = await getInstalledTheme(id);
  if (!theme) throw new ThemeError("not-found", `Theme "${id}" is not installed`);
  return loadBundle(theme.id, theme.path);
}

/** The theme's content for one language: content.json with the blocks of content.<locale>.json laid over it. */
export function contentFor(bundle: ThemeBundle, locale: string): Record<string, unknown> {
  const over = bundle.contentByLocale[locale];
  return over ? { ...bundle.content, ...over } : bundle.content;
}
