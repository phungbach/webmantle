"use client";

import { useEffect, useRef, useState } from "react";
import { useDesigner } from "./context";

export type Device = "desktop" | "tablet" | "mobile";
/** CSS width of the page inside the frame: a real desktop width, so the theme's media queries match. */
export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

/**
 * The page in an iframe (edit mode). Talks to edit-bridge.tsx inside the frame with postMessage;
 * origin and source are checked on every incoming message.
 */
export function PreviewFrame({
  src,
  device,
  reloadKey,
  selectedId,
  scrollRequest,
  onSelect,
  themeSelected,
  onThemeSelect,
  onThemeEdit,
  applied,
  onZoom,
}: {
  src: string;
  device: Device;
  /** Changes after each saved draft; the frame reloads and keeps its scroll position. */
  reloadKey: number;
  selectedId: string | null;
  scrollRequest: { id: string; n: number } | null;
  onSelect: (id: string) => void;
  /** Dotted path of the selected theme content element, if any. */
  themeSelected: string | null;
  onThemeSelect: (sel: { path: string; kind: string; hrefPath?: string }) => void;
  onThemeEdit: (path: string, value: string) => void;
  /** Text to show in the frame right away, before the reload that follows a save. */
  applied: { path: string; value: string; n: number } | null;
  /** Reports the effective zoom (1 = 100%) when the frame is scaled down to fit. */
  onZoom?: (zoom: number) => void;
}) {
  const { T } = useDesigner();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const scrollY = useRef(0);
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const deviceWidth = DEVICE_WIDTH[device];
  // Scale the page down to fit, never up; the frame itself keeps its real CSS width.
  const scale = box.w > 0 ? Math.min(1, box.w / deviceWidth) : 1;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  useEffect(() => {
    onZoomRef.current?.(scale);
  }, [scale]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth - 24, h: el.clientHeight - 24 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const themeRef = useRef(themeSelected);
  themeRef.current = themeSelected;

  const post = (message: Record<string, unknown>) =>
    frame.current?.contentWindow?.postMessage(message, window.location.origin);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as {
        type?: string;
        bid?: string;
        path?: string;
        kind?: string;
        hrefPath?: string;
        value?: unknown;
      } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "builder:ready") {
        setReady(true);
        frame.current?.contentWindow?.scrollTo(0, scrollY.current);
        if (themeRef.current) post({ type: "theme:selected", path: themeRef.current });
        else post({ type: "builder:selected", bid: selectedRef.current ?? "" });
      } else if (data.type === "builder:select" && typeof data.bid === "string") {
        onSelect(data.bid);
      } else if (data.type === "theme:select" && typeof data.path === "string") {
        onThemeSelect({ path: data.path, kind: data.kind ?? "text", hrefPath: data.hrefPath });
      } else if (
        data.type === "theme:edit" &&
        typeof data.path === "string" &&
        typeof data.value === "string"
      ) {
        onThemeEdit(data.path, data.value);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelect, onThemeSelect, onThemeEdit]);

  // Reload after a save, remembering where the visitor was.
  const lastKey = useRef(reloadKey);
  useEffect(() => {
    if (lastKey.current === reloadKey) return;
    lastKey.current = reloadKey;
    const win = frame.current?.contentWindow;
    if (!win) return;
    scrollY.current = win.scrollY;
    setReady(false);
    win.location.reload();
  }, [reloadKey]);

  // The frame may finish loading before this component has hydrated (or the bridge before the frame
  // has), so a ready message can be missed. Keep saying hello until the bridge answers.
  useEffect(() => {
    if (ready) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      post({ type: "builder:hello" });
      if (tries > 40) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [ready, reloadKey]);

  useEffect(() => {
    // A block and a theme element are never selected together.
    if (themeSelected) post({ type: "theme:selected", path: themeSelected });
    else post({ type: "builder:selected", bid: selectedId ?? "" });
  }, [selectedId, themeSelected]);

  useEffect(() => {
    if (applied) post({ type: "theme:applied", path: applied.path, value: applied.value });
  }, [applied]);

  useEffect(() => {
    if (scrollRequest) post({ type: "builder:scrollTo", bid: scrollRequest.id });
  }, [scrollRequest]);

  return (
    <div
      ref={area}
      className="relative flex min-h-0 flex-1 justify-center overflow-hidden bg-subtle p-3"
    >
      <FrameBox scale={scale} deviceWidth={deviceWidth} box={box}>
        {!ready ? (
          <div
            className="absolute inset-0 z-10 flex animate-pulse flex-col gap-4 bg-white p-6"
            role="status"
            aria-label={T("builder.loadingPreview")}
          >
            <div className="h-10 rounded-control bg-subtle" />
            <div className="h-40 rounded-control bg-subtle" />
            <div className="h-6 w-2/3 rounded-control bg-subtle" />
            <div className="h-6 w-1/2 rounded-control bg-subtle" />
          </div>
        ) : null}
        <iframe
          ref={frame}
          src={src}
          title={T("builder.canvas")}
          className="border-0"
          style={{
            width: deviceWidth,
            height: scale > 0 ? box.h / scale : "100%",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </FrameBox>
    </div>
  );
}

function FrameBox({
  scale,
  deviceWidth,
  box,
  children,
}: {
  scale: number;
  deviceWidth: number;
  box: { w: number; h: number };
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-control border border-line-strong bg-white shadow-sm"
      style={{ width: deviceWidth * scale, height: Math.max(0, box.h) }}
    >
      {children}
    </div>
  );
}
