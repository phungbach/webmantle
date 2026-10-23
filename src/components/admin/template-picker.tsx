import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

// Lets an editor choose a layout the active theme offers for this kind of content.
// "Default" means the theme's standard layout, so content never depends on an optional template.
export async function TemplatePicker({
  templates,
  current,
}: {
  templates: { id: string; label: string; description: string }[];
  current?: string;
}) {
  const T = tr(await getLocale());
  const selected = templates.find((x) => x.id === current);
  const unavailable = !!current && !selected;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{T("posts.form.template")}</span>
      <select
        name="template"
        defaultValue={selected ? selected.id : ""}
        className="w-full rounded-control border border-line-strong px-3 py-2 text-sm"
      >
        <option value="">{T("posts.form.templateDefault")}</option>
        {templates.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-ink-3">
        {unavailable
          ? T("posts.form.templateUnavailable", { template: current ?? "" })
          : (selected?.description ?? (templates.length === 0 ? T("posts.form.templateNone") : ""))}
      </span>
    </label>
  );
}
