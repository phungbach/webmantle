import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR } from "@/lib/env";

export const ALLOWED_WIDTHS = [320, 480, 640, 800, 1024, 1280, 1600] as const;
const CACHE_DIR = path.join(DATA_DIR, "cache", "images");
const WEBP_QUALITY = 78;
const MAX_INPUT_PIXELS = 40e6;

export type ImageFormat = "webp" | "original";
export type ImageVariant = {
  /** Encoded image bytes, or an absolute file path when the original is served untouched. */
  buffer?: Buffer;
  path?: string;
  contentType: string;
  etag: string;
};

const ORIGINAL_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/** Reads ?w= and ?format= and ignores anything invalid. */
export function parseImageParams(searchParams: URLSearchParams): {
  width?: number;
  format: ImageFormat;
} {
  const raw = Number.parseInt(searchParams.get("w") ?? "", 10);
  const width = Number.isFinite(raw) && raw > 0 && raw <= 10_000 ? raw : undefined;
  const format = searchParams.get("format") === "original" ? "original" : "webp";
  return { ...(width ? { width } : {}), format };
}

/** "base?w=320 320w, base?w=480 480w, ..." for an <img srcset>. */
export function imageSrcSet(baseUrl: string, widths: readonly number[] = ALLOWED_WIDTHS): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return widths.map((w) => `${baseUrl}${sep}w=${w} ${w}w`).join(", ");
}

/** Smallest whitelisted width that is >= the request, capped at the largest allowed. */
function snapWidth(requested: number): number {
  return ALLOWED_WIDTHS.find((w) => w >= requested) ?? ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1]!;
}

async function original(file: string, key: string): Promise<ImageVariant> {
  const contentType =
    ORIGINAL_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  return { path: file, contentType, etag: `"${key}"` };
}

/**
 * Returns a resized WebP of an image, cached on disk under data/cache/images. The caller must have
 * validated that `sourcePath` is a file it is allowed to serve. Animated images are returned as is.
 */
export async function getImageVariant(
  sourcePath: string,
  opts: { width?: number; format?: ImageFormat } = {}
): Promise<ImageVariant> {
  if (
    !path.isAbsolute(sourcePath) ||
    sourcePath.split(/[\\/]/).includes("..") ||
    sourcePath.includes("\0")
  )
    throw new Error("Invalid image path.");
  const stat = await fs.stat(sourcePath);
  if (!stat.isFile()) throw new Error("Invalid image path.");

  const format = opts.format ?? "webp";
  const requested = opts.width && opts.width > 0 ? snapWidth(opts.width) : undefined;
  const base = `${sourcePath}|${stat.mtimeMs}|${stat.size}`;
  const originalKey = crypto.createHash("sha1").update(`${base}|original`).digest("hex");
  if (format === "original") return original(sourcePath, originalKey);

  const image = sharp(sourcePath, { limitInputPixels: MAX_INPUT_PIXELS, animated: true });
  const meta = await image.metadata();
  if ((meta.pages ?? 1) > 1) return original(sourcePath, originalKey);

  // Never upscale: if the original is not wider than the target, keep its width.
  const targetWidth = requested && meta.width && meta.width > requested ? requested : undefined;
  const key = crypto
    .createHash("sha1")
    .update(`${base}|${targetWidth ?? "full"}|webp`)
    .digest("hex");
  const etag = `"${key}"`;
  const cacheFile = path.join(CACHE_DIR, `${key}.webp`);

  try {
    return { buffer: await fs.readFile(cacheFile), contentType: "image/webp", etag };
  } catch {
    // Not cached yet.
  }

  const buffer = await sharp(sourcePath, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // apply EXIF orientation; metadata is dropped because withMetadata is not called
    .resize(targetWidth ? { width: targetWidth, withoutEnlargement: true } : {})
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const tmp = path.join(
      CACHE_DIR,
      `${key}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`
    );
    await fs.writeFile(tmp, buffer);
    await fs.rename(tmp, cacheFile);
  } catch {
    // A cache failure only costs time on the next request.
  }
  return { buffer, contentType: "image/webp", etag };
}
