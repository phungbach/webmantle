"use client";

import { useEffect, useState } from "react";

// Appears after the visitor has scrolled down a screen and returns to the top of the page. It uses the
// theme's accent colour, scrolls smoothly unless the device asks for less motion, and is a real button
// so it works with the keyboard and screen readers.
const STYLE = `
.cms-to-top{position:fixed;right:1.25rem;bottom:1.25rem;z-index:45;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:3rem;height:3rem;padding:0;border:0;border-radius:50%;background:var(--color-accent,#3b5bdb);color:#fff;box-shadow:0 10px 24px -6px rgba(15,23,42,.45);cursor:pointer;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(12px) scale(.9);transition:opacity .22s ease,transform .22s ease,visibility 0s linear .22s}
.cms-to-top[data-visible="true"]{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .22s ease,transform .22s ease,visibility 0s}
.cms-to-top:hover{filter:brightness(1.1)}
.cms-to-top:focus-visible{outline:3px solid #fff;outline-offset:-6px;box-shadow:0 0 0 3px var(--color-accent,#3b5bdb)}
.cms-to-top svg{width:1.25rem;height:1.25rem;transition:transform .2s ease}
.cms-to-top:hover svg{transform:translateY(-2px)}
@media (prefers-reduced-motion:reduce){.cms-to-top,.cms-to-top svg{transition:none}}
@media print{.cms-to-top{display:none}}
`;

export function BackToTop({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > Math.max(400, window.innerHeight * 0.6));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  function toTop() {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <button
        type="button"
        className="cms-to-top"
        data-visible={visible}
        aria-label={label}
        title={label}
        tabIndex={visible ? 0 : -1}
        onClick={toTop}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </button>
    </>
  );
}
