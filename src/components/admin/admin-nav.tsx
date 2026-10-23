"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartLine,
  FileText,
  History,
  ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  Newspaper,
  PaintRoller,
  Palette,
  Plug,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import { Icon } from "@/components/admin/icon";

// Icons are chosen by name: the layout is a server component and cannot pass components to this one.
const ICONS = {
  dashboard: LayoutDashboard,
  analytics: ChartLine,
  posts: Newspaper,
  pages: FileText,
  taxonomy: Tags,
  media: ImageIcon,
  themes: Palette,
  appearance: PaintRoller,
  blogStyle: LayoutTemplate,
  plugins: Plug,
  settings: Settings,
  users: Users,
  audit: History,
  link: Link2,
} as const;

export type AdminIconName = keyof typeof ICONS;

export type AdminNavItem = { href: string; label: string; icon: AdminIconName };
export type AdminNavGroup = {
  id: string;
  label: string | null;
  items: AdminNavItem[];
};

/**
 * Sidebar from the Figma design: groups of related pages, each under a small heading that is always
 * visible. The current page is marked. No JavaScript needed apart from reading the path.
 */
export function AdminNav({ groups, label }: { groups: AdminNavGroup[]; label: string }) {
  const pathname = usePathname();
  // Appearance, blog style and plugins now live in the settings hub; their old URLs count as Settings.
  const SETTINGS_PATHS = [
    "/admin/settings",
    "/admin/appearance",
    "/admin/blog-style",
    "/admin/plugins",
  ];
  const isActive = (href: string) =>
    (href === "/admin/settings" &&
      SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) ||
    pathname === href ||
    (href !== "/admin" && pathname.startsWith(`${href}/`));

  return (
    <nav aria-label={label} className="px-3 pb-3 md:pb-0">
      {groups.map((group) => (
        <div key={group.id} className={group.label ? "mt-5 first:mt-0" : ""}>
          {group.label ? (
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const current = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-control px-3 py-2 text-sm ${
                      current
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-2 hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    <Icon icon={ICONS[item.icon]} className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
