import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canView } from "@/lib/auth/permissions";
import { listPlugins } from "@/lib/plugins/runtime";
import { getPluginSettings } from "@/lib/plugins/settings";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import { Button, Card, Field, Flash } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { savePluginSettingsAction } from "@/app/admin/actions/plugins";

export const dynamic = "force-dynamic";

export default async function PluginSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !canView(user.role, "plugins:manage")) redirect("/admin");
  const { id } = await params;
  const flash = await searchParams;
  const T = tr(await getLocale());
  const plugin = (await listPlugins()).find((p) => p.id === id);
  if (!plugin) notFound();
  const values = await getPluginSettings(id, plugin.settings);

  return (
    <>
      <Link
        href="/admin/settings?tab=plugins"
        className="mb-3 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        {T("settings.backToPlugins")}
      </Link>
      <PageHeader
        title={`${plugin.name} · ${T("plugins.settings")}`}
        description={plugin.description}
      />
      <Flash ok={flash.ok} error={flash.error} />
      {plugin.settings.length === 0 ? (
        <Card>{T("plugins.noSettings")}</Card>
      ) : (
        <Card className="max-w-xl">
          <form action={savePluginSettingsAction} className="space-y-5">
            <input type="hidden" name="pluginId" value={id} />
            {plugin.settings.map((def) => {
              const current = values[def.key];
              if (def.type === "boolean") {
                return (
                  <label key={def.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={def.key} defaultChecked={current === true} />{" "}
                    {def.label}
                  </label>
                );
              }
              if (def.type === "select") {
                return (
                  <label key={def.key} className="block">
                    <span className="mb-1 block text-sm font-medium text-ink-2">{def.label}</span>
                    <select
                      name={def.key}
                      defaultValue={String(current)}
                      className="w-full rounded-control border border-line-strong px-3 py-2 text-sm"
                    >
                      {def.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (def.type === "text" && (def.maxLength ?? 0) > 120) {
                return (
                  <label key={def.key} className="block">
                    <span className="mb-1 block text-sm font-medium text-ink-2">{def.label}</span>
                    <textarea
                      name={def.key}
                      defaultValue={String(current)}
                      rows={5}
                      maxLength={def.maxLength}
                      className="w-full rounded-control border border-line-strong px-3 py-2 font-mono text-sm"
                    />
                  </label>
                );
              }
              return (
                <Field
                  key={def.key}
                  label={def.label}
                  name={def.key}
                  defaultValue={String(current)}
                  maxLength={def.maxLength ?? 120}
                />
              );
            })}
            <Button>{T("plugins.save")}</Button>
          </form>
        </Card>
      )}
    </>
  );
}
