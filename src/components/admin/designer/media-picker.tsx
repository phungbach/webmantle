"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useDesigner } from "./context";

/** Modal grid of library images. Uses <dialog>, which traps focus and closes on Escape. */
export function MediaPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string, alt: string) => void;
}) {
  const { T, media } = useDesigner();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="media-picker-title"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-card border border-line bg-white p-0 shadow-xl backdrop:bg-ink/40"
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id="media-picker-title" className="text-base font-semibold text-ink">
              {T("builder.pickImage")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={T("builder.close")}
              className="flex h-9 w-9 items-center justify-center rounded text-ink-2 hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-5">
            {media.length === 0 ? (
              <p className="text-sm text-ink-2">{T("builder.noImages")}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {media.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onPick(m.id, m.alt)}
                      className="block w-full overflow-hidden rounded-control border border-line text-left hover:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- CMS media route */}
                      <img
                        src={`/media/${m.id}?w=320`}
                        alt={m.alt}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <span className="block truncate px-2 py-1 text-xs text-ink-2">
                        {m.alt || m.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm">
              <a
                href="/admin/media"
                target="_blank"
                rel="noopener"
                className="font-medium text-brand-600 hover:underline"
              >
                {T("builder.uploadImages")}
              </a>
            </p>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
