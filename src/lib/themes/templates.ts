import { ValidationError } from "@/lib/errors";
import { resolveActiveTheme, customTemplatesFor } from "@/lib/themes/registry";
import type { CustomTemplateKind } from "@/lib/themes/contract";

export type TemplateOption = { id: string; label: string; description: string };

/** Custom templates the active theme offers for a kind of page. Empty when the theme cannot be loaded. */
export async function availableCustomTemplates(
  kind: CustomTemplateKind
): Promise<TemplateOption[]> {
  try {
    const { bundle } = await resolveActiveTheme();
    return customTemplatesFor(bundle, kind);
  } catch {
    return [];
  }
}

/**
 * Editors may only choose a template the active theme really offers. An empty value means the default.
 * Choosing an unavailable template is refused, so content never points at a layout that is not there.
 */
export async function assertTemplateAvailable(templateId: string, kind: CustomTemplateKind) {
  if (!templateId) return;
  const options = await availableCustomTemplates(kind);
  if (!options.some((o) => o.id === templateId)) {
    throw new ValidationError(
      `The active theme does not offer the template “${templateId}” for this content. Choose another template or the default.`,
      { template: "Not available in the active theme" }
    );
  }
}
