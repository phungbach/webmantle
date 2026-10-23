import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canView } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin/page-header";
import { GeneralPanel } from "@/components/admin/settings/general-panel";
import { AppearancePanel } from "@/components/admin/settings/appearance-panel";
import { BlogStylePanel } from "@/components/admin/settings/blog-style-panel";
import { SeoPanel } from "@/components/admin/settings/seo-panel";
import { PluginsPanel } from "@/components/admin/settings/plugins-panel";
import { listHref } from "@/lib/admin/list";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const TABS = ["general", "appearance", "blog-style", "seo", "plugins"] as const;
type Tab = (typeof TABS)[number];

/** Settings hub: one server-rendered panel per tab, chosen with ?tab=. Only the active tab loads data. */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  const raw = await searchParams;
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    params[key] = Array.isArray(value) ? value[0] : value;
  }
  const T = tr(await getLocale());

  const allowed = (tab: Tab) =>
    tab === "plugins"
      ? canView(user.role, "plugins:manage")
      : canView(user.role, "settings:manage");
  const available = TABS.filter(allowed);
  const first = available[0];
  if (!first) redirect("/admin");
  const requested = TABS.find((t) => t === params.tab);
  const active = requested && allowed(requested) ? requested : first;

  const labels: Record<Tab, string> = {
    general: T("settings.tabGeneral"),
    appearance: T("settings.tabAppearance"),
    "blog-style": T("settings.tabBlogStyle"),
    seo: T("settings.tabSeo"),
    plugins: T("settings.tabPlugins"),
  };
  // ok/error messages belong to the active tab; the other query values (q, filter) are tab specific.
  const panelParams = { ...params };
  delete panelParams.tab;

  return (
    <>
      <PageHeader title={T("admin.nav.settings")} />
      <div
        role="tablist"
        aria-label={T("settings.tabsLabel")}
        className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1"
      >
        {available.map((tab) => {
          const selected = tab === active;
          return (
            <Link
              key={tab}
              id={`settings-tab-${tab}`}
              role="tab"
              aria-selected={selected}
              aria-controls="settings-panel"
              tabIndex={selected ? 0 : -1}
              href={listHref("/admin/settings", { tab })}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                selected
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {labels[tab]}
            </Link>
          );
        })}
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${active}`}>
        {active === "general" ? <GeneralPanel role={user.role} params={panelParams} /> : null}
        {active === "appearance" ? <AppearancePanel params={panelParams} /> : null}
        {active === "blog-style" ? <BlogStylePanel params={panelParams} /> : null}
        {active === "seo" ? <SeoPanel params={panelParams} /> : null}
        {active === "plugins" ? <PluginsPanel params={panelParams} /> : null}
      </div>
    </>
  );
}
