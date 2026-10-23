import { prisma } from "@/lib/db";
import { ThemeError } from "@/lib/themes/errors";
import type { SettingDefinition, SettingValue } from "@/lib/themes/contract";

const COLOR = /^#[0-9a-fA-F]{6}$/;
const CSS_SAFE = /^[#A-Za-z0-9 ,.%()'"+\-/]+$/;
const FORBIDDEN_CSS = /url\(|expression\(|@import|javascript:/i;

/** Validates one setting value against its definition. Returns the normalized value or throws. */
export function coerceSettingValue(def: SettingDefinition, raw: unknown): SettingValue {
  switch (def.type) {
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      if (raw === "true" || raw === "on") return true;
      if (raw === "false" || raw === "off" || raw === "") return false;
      break;
    }
    case "color": {
      if (typeof raw === "string" && COLOR.test(raw)) return raw.toLowerCase();
      break;
    }
    case "select": {
      if (typeof raw === "string" && def.options?.includes(raw)) return raw;
      break;
    }
    case "text": {
      if (typeof raw === "string") {
        const max = def.maxLength ?? 120;
        const value = raw.trim();
        if (value.length > max) break;
        // Text that feeds a CSS custom property must use the same safe character set as tokens.
        if (def.cssVariable && (!CSS_SAFE.test(value) || FORBIDDEN_CSS.test(value))) break;
        return value;
      }
      break;
    }
  }
  throw new ThemeError("bad-setting", `Invalid value for setting "${def.label}"`);
}

/** Merges stored values over defaults. Stored values that no longer validate fall back to the default. */
export function resolveSettings(
  schema: SettingDefinition[],
  stored: Map<string, string>
): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const def of schema) {
    const raw = stored.get(def.key);
    let value: SettingValue = def.default;
    if (raw !== undefined) {
      try {
        value = coerceSettingValue(def, raw);
      } catch {
        value = def.default;
      }
    }
    out[def.key] = value;
  }
  return out;
}

export async function getThemeSettings(themeId: string, schema: SettingDefinition[]) {
  const rows = await prisma.themeSetting.findMany({ where: { themeId } });
  return resolveSettings(schema, new Map(rows.map((r) => [r.key, r.value])));
}

/**
 * Saves settings for ONE theme. Keys that are not in the theme's schema are rejected.
 * Writes only rows scoped to themeId, so other themes' settings are never touched.
 */
export async function saveThemeSettings(
  themeId: string,
  schema: SettingDefinition[],
  input: Record<string, unknown>
) {
  const byKey = new Map(schema.map((d) => [d.key, d]));
  const rows: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const def = byKey.get(key);
    if (!def) throw new ThemeError("bad-setting", `Unknown setting: ${key}`);
    const value = coerceSettingValue(def, raw);
    rows.push({ key, value: String(value) });
  }

  await prisma.$transaction(
    rows.map((row) =>
      prisma.themeSetting.upsert({
        where: { themeId_key: { themeId, key: row.key } },
        create: { themeId, key: row.key, value: row.value },
        update: { value: row.value },
      })
    )
  );
}

/** Builds the :root block from design tokens and settings. Every value was validated already. */
export function buildThemeCss(
  tokens: Record<string, string>,
  schema: SettingDefinition[],
  values: Record<string, SettingValue>
): string {
  const declarations: string[] = [];
  for (const [key, value] of Object.entries(tokens)) declarations.push(`--${key}: ${value};`);
  for (const def of schema) {
    const value = values[def.key];
    if (def.cssVariable && typeof value === "string")
      declarations.push(`${def.cssVariable}: ${value};`);
  }
  return `:root{${declarations.join("")}}`;
}
