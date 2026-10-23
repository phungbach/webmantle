"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getPluginDefinition, setPluginEnabled } from "@/lib/plugins/runtime";
import { savePluginSettings } from "@/lib/plugins/settings";
import { attempt, backWith, formString, tm } from "@/app/admin/actions/shared";

const PLUGINS = "/admin/plugins";
const PLUGINS_TAB = "/admin/settings?tab=plugins";

/** Turns a plugin on or off. The id must be a plugin that is in the project. */
export async function togglePluginAction(formData: FormData) {
  const user = await requirePermission("plugins:manage");
  const id = formString(formData, "pluginId");
  const on = formString(formData, "enabled") === "1";
  const result = await attempt("plugin-toggle", async () => {
    await setPluginEnabled(id, on);
    await audit({
      actorId: user.id,
      action: on ? "plugin.enable" : "plugin.disable",
      targetType: "plugin",
      targetId: id,
    });
  });
  revalidatePath("/", "layout");
  if (!result.ok) backWith(PLUGINS_TAB, "error", result.message);
  backWith(PLUGINS_TAB, "ok", await tm("plugins.toggled", { name: id }));
}

/** Saves a plugin's settings. Only keys declared by that plugin are accepted. */
export async function savePluginSettingsAction(formData: FormData) {
  const user = await requirePermission("plugins:manage");
  const id = formString(formData, "pluginId");
  const def = await getPluginDefinition(id);
  if (!def) backWith(PLUGINS_TAB, "error", await tm("flash.validationFailed"));
  const schema = def.settings ?? [];
  const input: Record<string, unknown> = {};
  for (const setting of schema) {
    input[setting.key] =
      setting.type === "boolean"
        ? formData.get(setting.key) === "on"
        : formString(formData, setting.key);
  }
  const result = await attempt("plugin-settings", async () => {
    await savePluginSettings(id, schema, input);
    await audit({
      actorId: user.id,
      action: "plugin.settings",
      targetType: "plugin",
      targetId: id,
      detail: { keys: Object.keys(input) },
    });
  });
  revalidatePath("/", "layout");
  if (!result.ok) backWith(`${PLUGINS}/${encodeURIComponent(id)}`, "error", result.message);
  backWith(
    `${PLUGINS}/${encodeURIComponent(id)}`,
    "ok",
    await tm("plugins.settingsSaved", { name: def.name })
  );
}
