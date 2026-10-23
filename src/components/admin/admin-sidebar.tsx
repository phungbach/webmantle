"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Icon } from "@/components/admin/icon";

/**
 * Left menu of the admin. On wide screens it stays fixed to the viewport (the page scrolls, the menu
 * does not). On phones it becomes a drawer opened from a top bar; it closes after navigating,
 * on Escape and when the backdrop is tapped.
 */
export function AdminSidebar({
  brand,
  footer,
  labels,
  children,
}: {
  brand: React.ReactNode;
  footer: React.ReactNode;
  labels: { open: string; close: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Keep the page behind the drawer from scrolling.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  // The page designer is a full-window editor: no sidebar and no mobile bar on top of it.
  if (/^\/admin\/design(\/|$)|^\/admin\/pages\/[^/]+\/design\/?$/.test(pathname)) return null;

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 md:hidden">
        {brand}
        <button
          type="button"
          aria-label={labels.open}
          aria-expanded={open}
          aria-controls="admin-sidebar"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-control text-ink-2 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <Icon icon={Menu} className="h-5 w-5" />
        </button>
      </div>

      {open ? (
        <button
          type="button"
          aria-label={labels.close}
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
        />
      ) : null}

      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r border-line bg-white transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:w-[264px] md:shrink-0 md:translate-x-0 md:self-start ${
          open ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          {brand}
          <button
            type="button"
            aria-label={labels.close}
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:bg-subtle md:hidden"
          >
            <Icon icon={X} className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 pb-4">{children}</div>
        <div className="px-6 pb-5">{footer}</div>
      </aside>
    </>
  );
}
