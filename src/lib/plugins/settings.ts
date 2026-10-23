import { prisma } from "@/lib/db";
import { coerceSettingValue, resolveSettings } from "@/lib/themes/settings";
import { ThemeError } from "@/lib/themes/errors";
import type { SettingDefinition } from "@/lib/themes/contract";
import type { PluginSettingsValues } from "@/lib/plugins/types";

/** Settings of one plugin, with defaults applied and invalid stored values replaced by defaults. */
export async function getPluginSettings(
  pluginId: string,
  schema: SettingDefinition[]
): Promise<PluginSettingsValues> {
  if (schema.length === 0) return {};
  const rows = await prisma.pluginSetting.findMany({ where: { pluginId } });
  return resolveSettings(schema, new Map(rows.map((r) => [r.key, r.value])));
}

/** Saves settings for one plugin. Unknown keys and invalid values are refused. */
export async function savePluginSettings(
  pluginId: string,
  schema: SettingDefinition[],
  input: Record<string, unknown>
) {
  const byKey = new Map(schema.map((d) => [d.key, d]));
  const rows: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const def = byKey.get(key);
    if (!def) throw new ThemeError("bad-setting", `Unknown setting: ${key}`);
    rows.push({ key, value: String(coerceSettingValue(def, raw)) });
  }
  await prisma.$transaction(
    rows.map((row) =>
      prisma.pluginSetting.upsert({
        where: { pluginId_key: { pluginId, key: row.key } },
        create: { pluginId, key: row.key, value: row.value },
        update: { value: row.value },
      })
    )
  );
}
