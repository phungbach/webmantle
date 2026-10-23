import { cache } from "react";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission, type CurrentUser } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import { validateContentKey } from "@/lib/themes/content-schemas";
import { contentFor, loadThemeById } from "@/lib/themes/registry";

/**
 * Edits an administrator makes to a theme's content (texts, buttons, pictures). The theme's own
 * content.json stays untouched; whole top-level blocks are replaced per theme and language and
 * stored as SiteSetting JSON:
 *   themecontent.<themeId>.<locale>          published
 *   themecontent.<themeId>.<locale>.draft    changes since the last publish; a value of
 *                                            {"__reset": true} means "back to the theme default"
 */

export const MAX_OVERRIDE_BYTES = 200 * 1024;
export const MAX_OVERRIDE_KEYS = 60;
const KEY = /^[a-z][A-Za-z0-9]{0,40}$/;
const THEME_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCALE = /^[a-z]{2}$/;
const TOMBSTONE = "__reset";

type Layer = Record<string, unknown>;

const settingKey = (themeId: string, locale: string, draft: boolean) =>
  `themecontent.${themeId}.${locale}${draft ? ".draft" : ""}`;

const isTombstone = (value: unknown) =>
  typeof value === "object" && value !== null && (value as Layer)[TOMBSTONE] === true;

/** Parses a stored layer; bad JSON, an oversize value or invalid keys give an empty / filtered layer. */
function parseLayer(raw: string | undefined): Layer {
  if (!raw || raw.length > MAX_OVERRIDE_BYTES) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([k]) => KEY.test(k)));
  } catch {
    return {};
  }
}

/** Removes properties that point to a media picture that no longer exists (it then renders nothing). */
function stripRefs(value: unknown, existing: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => stripRefs(v, existing));
  if (value && typeof value === "object") {
    const out: Layer = {};
    for (const [k, v] of Object.entries(value)) {
      const m = typeof v === "string" ? /^media\/([a-z0-9]{10,40})$/.exec(v) : null;
      if (m && !existing.has(m[1]!)) continue;
      out[k] = stripRefs(v, existing);
    }
    return out;
  }
  return value;
}

async function dropMissingMedia(layer: Layer): Promise<Layer> {
  const ids = [...collectMediaRefs(layer)];
  if (ids.length === 0) return layer;
  const found = await prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length === ids.length) return layer;
  return stripRefs(layer, new Set(found.map((m) => m.id))) as Layer;
}

/** Puts overrides over a theme's content: each key is replaced as a whole. Pure. */
export function applyContentOverrides(
  content: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...content };
  for (const [key, value] of Object.entries(overrides)) {
    if (KEY.test(key)) result[key] = value;
  }
  return result;
}

const readLayers = cache(async (themeId: string, locale: string) => {
  if (!THEME_ID.test(themeId) || !LOCALE.test(locale)) return { published: {}, draft: {} };
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [settingKey(themeId, locale, false), settingKey(themeId, locale, true)] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    published: await dropMissingMedia(parseLayer(map.get(settingKey(themeId, locale, false)))),
    draft: await dropMissingMedia(parseLayer(map.get(settingKey(themeId, locale, true)))),
  };
});

/** Published overrides, with the draft layer on top when `draft` is true. One read per request. */
export async function loadContentOverrides(
  themeId: string,
  locale: string,
  opts: { draft?: boolean } = {}
): Promise<Record<string, unknown>> {
  const { published, draft } = await readLayers(themeId, locale);
  if (!opts.draft) return { ...published };
  const result: Layer = { ...published };
  for (const [key, value] of Object.entries(draft)) {
    if (isTombstone(value)) delete result[key];
    else result[key] = value;
  }
  return result;
}

export async function getContentEditState(
  themeId: string,
  locale: string
): Promise<{ published: Record<string, unknown>; draftKeys: string[]; publishedKeys: string[] }> {
  const { published, draft } = await readLayers(themeId, locale);
  return {
    published: { ...published },
    draftKeys: Object.keys(draft).sort(),
    publishedKeys: Object.keys(published).sort(),
  };
}

/** The blocks present in the theme's own content for a language. */
export async function listContentKeys(themeId: string, locale: string): Promise<string[]> {
  const bundle = await loadThemeById(themeId);
  return Object.keys(contentFor(bundle, locale)).sort();
}

function assertTarget(themeId: string, locale: string) {
  if (!THEME_ID.test(themeId) || !LOCALE.test(locale))
    throw new ValidationError("Unknown theme or language.");
}

/** All "media/<id>" strings inside a value. */
function collectMediaRefs(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const m = /^media\/([a-z0-9]{10,40})$/.exec(value);
    if (m) out.add(m[1]!);
  } else if (Array.isArray(value)) value.forEach((v) => collectMediaRefs(v, out));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collectMediaRefs(v, out));
  return out;
}

async function assertValue(key: string, value: unknown) {
  const problems = validateContentKey(key, value);
  if (problems.length > 0) throw new ValidationError(problems[0]!);
  const ids = [...collectMediaRefs(value)];
  if (ids.length > 0) {
    const count = await prisma.media.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new ValidationError("An image used here no longer exists.");
  }
}

async function writeLayer(themeId: string, locale: string, draft: boolean, layer: Layer) {
  const key = settingKey(themeId, locale, draft);
  if (Object.keys(layer).length === 0) {
    await prisma.siteSetting.deleteMany({ where: { key } });
    return;
  }
  const value = JSON.stringify(layer);
  if (value.length > MAX_OVERRIDE_BYTES) throw new ValidationError("The content is too large.");
  await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/**
 * Stores one block in the draft layer. `value` null resets the block to the theme's default
 * (a tombstone in the draft; publishing removes the block from the published layer).
 */
export async function saveContentKey(
  user: CurrentUser,
  themeId: string,
  locale: string,
  key: string,
  value: unknown | null
): Promise<void> {
  assertPermission(user, "settings:manage");
  assertTarget(themeId, locale);
  if (!KEY.test(key)) throw new ValidationError("Unknown content block.");
  const base = contentFor(await loadThemeById(themeId), locale);
  if (!(key in base)) throw new ValidationError("Unknown content block.");
  if (value !== null) await assertValue(key, value);

  const { draft } = await readLayers(themeId, locale);
  const next: Layer = { ...draft, [key]: value === null ? { [TOMBSTONE]: true } : value };
  if (Object.keys(next).length > MAX_OVERRIDE_KEYS)
    throw new ValidationError("Too many edited blocks.");
  await writeLayer(themeId, locale, true, next);
  await audit({
    actorId: user.id,
    action: "theme-content.save",
    targetType: "theme",
    targetId: themeId,
    detail: { key, locale },
  });
}

/** Moves the draft layer into the published layer. */
export async function publishContent(user: CurrentUser, themeId: string, locale: string) {
  assertPermission(user, "settings:manage");
  assertTarget(themeId, locale);
  // Read fresh: the per-request cache may predate edits made in this request.
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [settingKey(themeId, locale, false), settingKey(themeId, locale, true)] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const published = parseLayer(map.get(settingKey(themeId, locale, false)));
  const draft = parseLayer(map.get(settingKey(themeId, locale, true)));
  if (Object.keys(draft).length === 0)
    throw new ValidationError("There are no changes to publish.");
  const next: Layer = { ...published };
  for (const [key, value] of Object.entries(draft)) {
    if (isTombstone(value)) delete next[key];
    else {
      await assertValue(key, value);
      next[key] = value;
    }
  }
  if (Object.keys(next).length > MAX_OVERRIDE_KEYS)
    throw new ValidationError("Too many edited blocks.");
  await writeLayer(themeId, locale, false, next);
  await writeLayer(themeId, locale, true, {});
  await audit({
    actorId: user.id,
    action: "theme-content.publish",
    targetType: "theme",
    targetId: themeId,
    detail: { locale, keys: Object.keys(draft).sort() },
  });
  revalidatePath("/", "layout");
}

/** Throws the draft layer away; the published layer stays. */
export async function discardContentDraft(user: CurrentUser, themeId: string, locale: string) {
  assertPermission(user, "settings:manage");
  assertTarget(themeId, locale);
  await writeLayer(themeId, locale, true, {});
  await audit({
    actorId: user.id,
    action: "theme-content.discard",
    targetType: "theme",
    targetId: themeId,
    detail: { locale },
  });
}
