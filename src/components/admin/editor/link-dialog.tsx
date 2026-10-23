"use client";

import { useEffect, useRef, useState } from "react";
import { isSafeLinkUrl } from "@/components/admin/editor/safe-url";

export type LinkDialogLabels = {
  title: string;
  address: string;
  addressHint: string;
  newTab: string;
  save: string;
  remove: string;
  cancel: string;
  invalidUrl: string;
};

/**
 * Modal dialog for adding or editing a link. Uses the native <dialog> element, so Escape closes it
 * and focus stays inside while it is open.
 *
 * This dialog is rendered inside the page form, so it must not contain a <form> of its own: a submit
 * event would bubble up and submit the whole page. Saving is therefore a click handler.
 */
export function LinkDialog({
  open,
  initialHref,
  initialNewTab,
  labels,
  onSave,
  onRemove,
  onClose,
}: {
  open: boolean;
  initialHref: string;
  initialNewTab: boolean;
  labels: LinkDialogLabels;
  onSave: (href: string, newTab: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [href, setHref] = useState(initialHref);
  const [newTab, setNewTab] = useState(initialNewTab);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const save = () => {
    if (!isSafeLinkUrl(href)) {
      setError(labels.invalidUrl);
      return;
    }
    onSave(href.trim(), newTab);
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="cms-link-dialog-title"
      onClose={onClose}
      className="w-full max-w-md rounded-lg border border-line p-0 shadow-xl backdrop:bg-ink/40"
    >
      <div className="space-y-4 p-5">
        <h2 id="cms-link-dialog-title" className="text-lg font-semibold">
          {labels.title}
        </h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-2">{labels.address}</span>
          <input
            autoFocus
            type="text"
            value={href}
            onChange={(e) => {
              setHref(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            placeholder="https://"
            aria-describedby="cms-link-hint"
            aria-invalid={error ? true : undefined}
            className="w-full rounded-control border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <span id="cms-link-hint" className="mt-1 block text-xs text-ink-3">
            {labels.addressHint}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} />
          {labels.newTab}
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger-600">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-control px-3 py-2 text-sm text-danger-600 hover:bg-danger-50"
          >
            {labels.remove}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-control border border-line-strong px-3.5 py-2 text-sm font-medium hover:bg-subtle"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-control bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {labels.save}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
