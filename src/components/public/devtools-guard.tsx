"use client";

import { useEffect } from "react";

/**
 * Light deterrent: stops the keyboard shortcuts that open developer tools (F12, Ctrl/Cmd+Shift+I/J/C,
 * Ctrl/Cmd+U) on the public site. It does not protect content: anyone can open developer tools
 * from the browser menu, and the HTML is always delivered to the visitor.
 */
export function DevtoolsGuard() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const blocked =
        event.key === "F12" ||
        (mod && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        (mod && !event.shiftKey && key === "u");
      if (blocked) event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
