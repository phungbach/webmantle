import type { PluginDefinition } from "@/lib/plugins/types";

/** Declares a plugin with type checking. Validation happens when the server loads the plugin. */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}
