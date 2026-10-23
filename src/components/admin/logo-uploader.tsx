"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadLogoAction } from "@/app/admin/actions/appearance";
import { squareCrop } from "@/lib/logo-crop";

const OUTPUT = 512;
const PREVIEW = 240;

/**
 * Logo picker. The image is cut to a 512×512 square in the browser. By default the centre is used;
 * the preview can be dragged and zoomed to choose another part before uploading.
 */
export function LogoUploader({
  labels,
  currentUrl,
}: {
  labels: {
    choose: string;
    none: string;
    upload: string;
    uploading: string;
    invalid: string;
    current: string;
    cropHint: string;
    zoom: string;
    outputSize: string;
  };
  currentUrl: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; side: number } | null>(null);
  const router = useRouter();
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const crop = bitmap ? squareCrop(bitmap.width, bitmap.height, zoom, center) : null;

  // Redraw the preview whenever the image or the crop changes.
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas || !bitmap || !crop) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, PREVIEW, PREVIEW);
  }, [bitmap, crop?.sx, crop?.sy, crop?.side]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release the previous image when a new one is chosen.
  useEffect(() => () => bitmap?.close(), [bitmap]);

  const choose = async (file: File | undefined) => {
    setMessage(null);
    if (!file) return setBitmap(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setBitmap(null);
      setMessage({ ok: false, text: labels.invalid });
      return;
    }
    const next = await createImageBitmap(file);
    setBitmap(next);
    setZoom(1);
    setCenter({ x: next.width / 2, y: next.height / 2 });
  };

  const upload = async () => {
    if (!bitmap || !crop) return;
    setBusy(true);
    setMessage(null);
    try {
      const out = document.createElement("canvas");
      out.width = OUTPUT;
      out.height = OUTPUT;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, OUTPUT, OUTPUT);
      const blob = await new Promise<Blob>((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png")
      );
      const data = new FormData();
      data.append("file", blob, "logo.png");
      const result = await uploadLogoAction(data);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setBitmap(null);
        if (input.current) input.current.value = "";
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: labels.invalid });
    } finally {
      setBusy(false);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!bitmap || !crop) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y, side: crop.side };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const scale = drag.current.side / PREVIEW;
    setCenter({
      x: drag.current.cx - (e.clientX - drag.current.x) * scale,
      y: drag.current.cy - (e.clientY - drag.current.y) * scale,
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-6">
        <div className="space-y-2">
          <p className="text-xs text-ink-3">{labels.current}</p>
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
            {currentUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo served by the CMS media route
              <img src={currentUrl} alt={labels.current} className="h-full w-full object-cover" />
            ) : (
              <span className="px-1 text-center text-xs text-ink-3">{labels.none}</span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-control bg-subtle px-3 py-2 text-sm font-medium hover:bg-subtle">
              {labels.choose}
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => choose(e.target.files?.[0])}
              />
            </label>
            <span className="text-sm text-ink-2">{bitmap ? labels.cropHint : labels.none}</span>
            <button
              type="button"
              onClick={upload}
              disabled={!bitmap || busy}
              className="rounded-control bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? labels.uploading : labels.upload}
            </button>
          </div>

          {bitmap ? (
            <div className="flex flex-wrap items-start gap-4">
              <canvas
                ref={preview}
                width={PREVIEW}
                height={PREVIEW}
                style={{ width: PREVIEW, height: PREVIEW, touchAction: "none", cursor: "grab" }}
                className="rounded-lg border border-line-strong bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%)] bg-[length:16px_16px]"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label={labels.cropHint}
              />
              <div className="space-y-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-ink-2">{labels.zoom}</span>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-48"
                  />
                </label>
                <p className="max-w-xs text-xs text-ink-3">{labels.cropHint}</p>
                <p className="text-xs text-ink-3">{labels.outputSize}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-success-600" : "text-danger-600"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
