"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Pages that are not part of the public site are never reported.
const SKIP = [
  "/admin",
  "/login",
  "/api",
  "/preview",
  "/design-preview",
  "/media",
  "/theme-assets",
  "/language",
  "/site-icon",
];

/**
 * Tells the server that a public page was opened. Only the path and, for the first page of a visit,
 * the referring address are sent. No cookie or local storage is used.
 */
export function TrackView() {
  const pathname = usePathname();
  const firstPage = useRef(true);

  useEffect(() => {
    const internal = !firstPage.current;
    firstPage.current = false;
    if (SKIP.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return;

    const body = JSON.stringify({
      path: pathname,
      referrer: internal ? "" : document.referrer,
      internal,
    });
    try {
      if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" })))
        return;
    } catch {
      // fall through to fetch
    }
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
