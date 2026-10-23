"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const QUERY = "(max-width: 860px)";

/**
 * Wraps a header's <nav>. On small screens (CSS keyed on data-mobile-nav="ready" on the header) the
 * nav becomes a drop-down panel opened by a toggle button. Without JavaScript the header is not
 * marked ready, so the nav stays visible exactly as the theme draws it.
 */
export function MobileNav({
  label,
  openLabel,
  closeLabel,
  children,
}: {
  label: string;
  openLabel: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // Mark the header so the mobile CSS applies only once this component is running.
  useEffect(() => {
    const header = button.current?.closest("header");
    header?.setAttribute("data-mobile-nav", "ready");
    return () => header?.removeAttribute("data-mobile-nav");
  }, []);

  // Close after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (nav.current?.contains(target) || button.current?.contains(target))) return;
      setOpen(false);
    };
    const media = window.matchMedia(QUERY);
    const onChange = () => {
      if (!media.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    media.addEventListener("change", onChange);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      media.removeEventListener("change", onChange);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="cms-mobile-nav__toggle"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <nav
        ref={nav}
        id={id}
        className="cms-header__nav"
        aria-label={label}
        data-open={open ? "true" : "false"}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {children}
      </nav>
    </>
  );
}
