import Link from "next/link";
import { listPlugins } from "@/lib/plugins/runtime";
import { queryParam } from "@/lib/http";
import { listHref, pick } from "@/lib/admin/list";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import {
  Badge,
  Button,
  DataTable,
  FilterTabs,
  Flash,
  SearchBox,
  Toolbar,
  cellClass,
  rowClass,
} from "@/components/admin/ui";
import { PanelHeading } from "@/components/admin/settings/panel-heading";
import { togglePluginAction } from "@/app/admin/actions/plugins";

const FILTERS = ["on", "off", "issue"] as const;

export async function PluginsPanel({ params }: { params: Record<string, string | undefined> }) {
  const T = tr(await getLocale());
  const q = queryParam(params.q).toLowerCase();
  const filter = pick(params.filter, FILTERS);
  const plugins = await listPlugins();

  const kindOf = (p: (typeof plugins)[number]): (typeof FILTERS)[number] =>
    p.state !== "active" ? "issue" : p.enabled ? "on" : "off";
  const searched = plugins.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  );
  const visible = searched.filter((p) => !filter || kindOf(p) === filter);
  const countOf = (kind: (typeof FILTERS)[number]) =>
    searched.filter((p) => kindOf(p) === kind).length;
  const tab = (label: string, value: string, count: number) => ({
    label,
    count,
    href: listHref("/admin/settings", { tab: "plugins", q, filter: value }),
    active: filter === value,
  });

  const statusLabel = (state: string, enabled: boolean) =>
    state === "incompatible"
      ? T("plugins.incompatible")
      : state === "error"
        ? T("plugins.error")
        : enabled
          ? T("plugins.on")
          : T("plugins.off");

  return (
    <>
      <PanelHeading title={T("admin.nav.plugins")} />
      <Flash ok={params.ok} error={params.error} />
      <Toolbar>
        <FilterTabs
          label={T("common.status")}
          tabs={[
            tab(T("ui.all"), "", searched.length),
            tab(T("plugins.tabOn"), "on", countOf("on")),
            tab(T("plugins.tabOff"), "off", countOf("off")),
            tab(T("plugins.tabIssue"), "issue", countOf("issue")),
          ]}
        />
        <SearchBox
          placeholder={T("plugins.searchHint")}
          defaultValue={q}
          hidden={{ tab: "plugins", filter }}
        />
      </Toolbar>
      <DataTable
        title={T("plugins.listTitle")}
        head={[
          T("plugins.nameColumn"),
          T("common.status"),
          T("plugins.version"),
          T("plugins.author"),
          { label: "", className: "w-48" },
        ]}
        empty={visible.length === 0 ? T("plugins.none") : undefined}
      >
        {visible.map((plugin) => {
          const kind = kindOf(plugin);
          return (
            <tr key={plugin.id} className={rowClass}>
              <td className={cellClass}>
                <div className="font-medium">{plugin.name}</div>
                {plugin.description ? (
                  <div className="max-w-md text-xs text-ink-3">{plugin.description}</div>
                ) : null}
                {plugin.message ? (
                  <div className="text-xs text-danger-600">
                    {T("plugins.lastMessage", { message: plugin.message })}
                  </div>
                ) : null}
              </td>
              <td className={cellClass}>
                <Badge tone={kind === "on" ? "success" : kind === "off" ? "warning" : "danger"}>
                  {statusLabel(plugin.state, plugin.enabled)}
                </Badge>
              </td>
              <td className={`${cellClass} text-ink-2`}>{plugin.version}</td>
              <td className={`${cellClass} text-ink-3`}>{plugin.author || "—"}</td>
              <td className={cellClass}>
                <div className="flex items-center justify-end gap-3">
                  {plugin.settings.length > 0 ? (
                    <Link
                      href={`/admin/plugins/${encodeURIComponent(plugin.id)}`}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      {T("plugins.settings")}
                    </Link>
                  ) : null}
                  {plugin.state === "active" ? (
                    <form action={togglePluginAction}>
                      <input type="hidden" name="pluginId" value={plugin.id} />
                      <input type="hidden" name="enabled" value={plugin.enabled ? "0" : "1"} />
                      <Button variant={plugin.enabled ? "secondary" : "primary"}>
                        {plugin.enabled ? T("plugins.disable") : T("plugins.enable")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
