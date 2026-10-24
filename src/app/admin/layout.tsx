import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canView } from "@/lib/auth/permissions";
import { getSiteSettings } from "@/lib/settings";
import { getSiteBranding } from "@/lib/appearance";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import { applyFilter } from "@/lib/plugins/runtime";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminNav, type AdminIconName, type AdminNavGroup } from "@/components/admin/admin-nav";
import { Eye } from "lucide-react";
import { Icon } from "@/components/admin/icon";

export const dynamic = "force-dynamic";

// Admin pages are never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Every admin page sits under this layout. The check here is only for navigation and redirects.
// Each Server Action and Route Handler enforces its own permission check again.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  const locale = await getLocale();
  const T = tr(locale);
  const [site, branding] = await Promise.all([getSiteSettings(), getSiteBranding()]);

  const item = (href: string, label: string, icon: AdminIconName, allowed: boolean) =>
    allowed ? { href, label, icon } : null;
  const present = <T extends object>(list: (T | null)[]): T[] =>
    list.filter((x): x is T => x !== null);

  // Two-level menu. Each group holds pages that belong together; a group with nothing the user may
  // open is left out. The labels are translated here; the pages check their own permissions too.
  const groups: AdminNavGroup[] = [
    {
      id: "home",
      label: null,
      items: [
        { href: "/admin", label: T("admin.nav.dashboard"), icon: "dashboard" },
        { href: "/admin/analytics", label: T("admin.nav.analytics"), icon: "analytics" },
      ],
    },
    {
      id: "content",
      label: T("admin.group.content"),
      items: present([
        item("/admin/posts", T("admin.nav.posts"), "posts", true),
        item(
          "/admin/pages",
          T("admin.nav.pages"),
          "pages",
          canView(user.role, "content:write-any")
        ),
        item(
          "/admin/categories",
          T("admin.nav.taxonomy"),
          "taxonomy",
          canView(user.role, "taxonomy:manage")
        ),
        item("/admin/media", T("admin.nav.media"), "media", true),
      ]),
    },
    {
      id: "appearance",
      label: T("admin.group.appearance"),
      items: present([
        item("/admin/themes", T("admin.nav.themes"), "themes", canView(user.role, "themes:manage")),
      ]),
    },
    {
      id: "system",
      label: T("admin.group.system"),
      items: present([
        item(
          "/admin/settings",
          T("admin.nav.settings"),
          "settings",
          canView(user.role, "settings:manage") || canView(user.role, "plugins:manage")
        ),
        item("/admin/users", T("admin.nav.users"), "users", canView(user.role, "users:manage")),
        item("/admin/audit", T("admin.nav.audit"), "audit", canView(user.role, "audit:read")),
      ]),
    },
  ];

  // Items added by plugins. Only internal paths and http(s) links are accepted.
  const pluginItems = (await applyFilter("admin.nav", []))
    .filter(
      (entry) =>
        (entry.href.startsWith("/") && !entry.href.startsWith("//")) ||
        /^https?:\/\//.test(entry.href)
    )
    .map((entry) => ({ href: entry.href, label: entry.label, icon: "link" as const }));
  if (pluginItems.length > 0) {
    groups.push({
      id: "extras",
      label: T("admin.group.extras"),
      items: pluginItems,
    });
  }
  // Empty groups are dropped; the dashboard group has no heading.
  const visibleGroups = groups.filter((g) => g.items.length > 0);

  const brand = (
    <Link
      href="/admin"
      className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold text-ink"
    >
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt=""
          className="h-7 w-7 shrink-0 rounded-control object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-brand-600 text-sm font-semibold text-white"
        >
          {site.siteTitle.trim().charAt(0).toUpperCase() || "W"}
        </span>
      )}
      <span className="truncate">{site.siteTitle}</span>
    </Link>
  );

  return (
    <div className="admin-shell min-h-screen md:flex">
      <AdminSidebar
        brand={brand}
        labels={{ open: T("admin.menu.open"), close: T("admin.menu.close") }}
        footer={
          <Link href="/" className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
            <Icon icon={Eye} className="h-3.5 w-3.5" />
            {T("admin.viewSite")}
          </Link>
        }
      >
        <AdminNav groups={visibleGroups} label={T("admin.brand")} />
      </AdminSidebar>
      <main
        className="min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6 md:px-10 md:pt-8"
        data-readonly={user.role === "viewer" ? "true" : undefined}
      >
        {user.role === "viewer" ? (
          <p
            role="status"
            className="mb-5 rounded-control border border-warning-600/30 bg-warning-50 px-4 py-2 text-sm text-warning-600"
          >
            {T("admin.readonly")}
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
