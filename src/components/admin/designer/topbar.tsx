"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Maximize2,
  PanelLeft,
  PanelRight,
  Monitor,
  MoreHorizontal,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
} from "lucide-react";
import { useDesigner } from "./context";
import type { Device } from "./preview-frame";

export type SaveStatus = "saved" | "saving" | "unsaved" | "invalid" | "error";

const DEVICES: { id: Device; icon: typeof Monitor; key: string }[] = [
  { id: "desktop", icon: Monitor, key: "builder.desktop" },
  { id: "tablet", icon: Tablet, key: "builder.tablet" },
  { id: "mobile", icon: Smartphone, key: "builder.mobile" },
];

const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-40";

export function Topbar(props: {
  backHref: string;
  title: string;
  status: SaveStatus;
  liveState: "published" | "differs" | "none";
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onFocusMode: () => void;
  device: Device;
  zoom: number;
  onDevice: (d: Device) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPublish: () => void;
  canPublish: boolean;
  busy: boolean;
  liveHref: string;
  onDiscard: () => void;
  onReset: () => void;
  canDiscard: boolean;
  canReset: boolean;
  /** Small note under the status, e.g. that theme text edits are site-wide. */
  contentNote?: string;
}) {
  const { T } = useDesigner();
  const statusText: Record<SaveStatus, string> = {
    saved: T("builder.status.saved"),
    saving: T("builder.status.saving"),
    unsaved: T("builder.status.unsaved"),
    invalid: T("builder.status.invalid"),
    error: T("builder.status.error"),
  };
  const statusTone =
    props.status === "saved"
      ? "bg-success-50 text-success-600"
      : props.status === "saving" || props.status === "unsaved"
        ? "bg-warning-50 text-warning-600"
        : "bg-danger-50 text-danger-600";
  const liveText =
    props.liveState === "published"
      ? T("builder.status.published")
      : props.liveState === "differs"
        ? T("builder.status.differs")
        : T("builder.status.notPublished");

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-white px-3 py-2">
      <Link
        href={props.backHref}
        className={`${btn} text-ink-2 hover:bg-subtle`}
        aria-label={T("builder.back")}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{T("builder.back")}</span>
      </Link>
      <div className="flex items-center" role="group" aria-label={T("builder.panels")}>
        <button
          type="button"
          onClick={props.onToggleLeft}
          aria-pressed={props.leftOpen}
          aria-controls="designer-left-panel"
          aria-label={T("builder.togglePalette")}
          title={T("builder.togglePalette")}
          data-testid="designer-toggle-left"
          className={`${btn} px-2.5 ${props.leftOpen ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-subtle"}`}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={props.onToggleRight}
          aria-pressed={props.rightOpen}
          aria-controls="designer-inspector-panel"
          aria-label={T("builder.toggleInspector")}
          title={T("builder.toggleInspector")}
          data-testid="designer-toggle-right"
          className={`${btn} px-2.5 ${props.rightOpen ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-subtle"}`}
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={props.onFocusMode}
          aria-pressed={!props.leftOpen && !props.rightOpen}
          aria-label={T("builder.focusMode")}
          title={T("builder.focusMode")}
          data-testid="designer-focus-mode"
          className={`${btn} px-2.5 ${!props.leftOpen && !props.rightOpen ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-subtle"}`}
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-w-0 flex-1 basis-40">
        <h1 className="truncate text-base font-semibold text-ink">{props.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 text-xs">
          <span role="status" className={`rounded-full px-2 py-0.5 font-medium ${statusTone}`}>
            {statusText[props.status]}
          </span>
          <span className="text-ink-3">{liveText}</span>
        </p>
        {props.contentNote ? (
          <p className="hidden text-xs text-ink-3 xl:block">{props.contentNote}</p>
        ) : null}
      </div>

      <div className="flex items-center" role="group" aria-label={T("builder.device")}>
        {DEVICES.map(({ id, icon: IconC, key }) => (
          <button
            key={id}
            type="button"
            onClick={() => props.onDevice(id)}
            aria-pressed={props.device === id}
            aria-label={T(key)}
            title={T(key)}
            className={`${btn} px-2.5 ${props.device === id ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-subtle"}`}
          >
            <IconC className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <span className="ml-1 w-10 text-xs tabular-nums text-ink-3" aria-label={T("builder.zoom")}>
          {Math.round(props.zoom * 100)}%
        </span>
      </div>

      <div className="flex items-center">
        <button
          type="button"
          onClick={props.onUndo}
          disabled={!props.canUndo}
          aria-label={T("builder.undo")}
          title={`${T("builder.undo")} (Ctrl+Z)`}
          className={`${btn} px-2.5 text-ink-2 hover:bg-subtle`}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={props.onRedo}
          disabled={!props.canRedo}
          aria-label={T("builder.redo")}
          title={`${T("builder.redo")} (Ctrl+Shift+Z)`}
          className={`${btn} px-2.5 text-ink-2 hover:bg-subtle`}
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={props.liveHref}
          target="_blank"
          rel="noopener"
          className={`${btn} text-ink-2 hover:bg-subtle`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">{T("builder.openLive")}</span>
        </a>
        <button
          type="button"
          onClick={props.onSave}
          disabled={props.busy}
          className={`${btn} border border-line-strong bg-white text-ink hover:bg-subtle`}
        >
          {T("builder.saveDraft")}
        </button>
        <button
          type="button"
          onClick={props.onPublish}
          disabled={props.busy || !props.canPublish}
          className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}
        >
          {T("builder.publish")}
        </button>
        <details className="relative">
          <summary
            aria-label={T("builder.more")}
            className={`${btn} cursor-pointer list-none px-2.5 text-ink-2 hover:bg-subtle [&::-webkit-details-marker]:hidden`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-64 rounded-control border border-line bg-white p-1 shadow-lg">
            <button
              type="button"
              disabled={!props.canDiscard || props.busy}
              onClick={(e) => {
                e.currentTarget.closest("details")?.removeAttribute("open");
                props.onDiscard();
              }}
              className="block w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-subtle disabled:opacity-40"
            >
              {T("builder.discard")}
            </button>
            <button
              type="button"
              disabled={!props.canReset || props.busy}
              onClick={(e) => {
                e.currentTarget.closest("details")?.removeAttribute("open");
                props.onReset();
              }}
              className="block w-full rounded px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50 disabled:opacity-40"
            >
              {T("builder.reset")}
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
