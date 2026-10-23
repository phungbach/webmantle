import fs from "node:fs";
import { Readable } from "node:stream";
import { getImageVariant, parseImageParams, type ImageVariant } from "@/lib/media-variants";

export const RESIZABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function wantsWebp(req: Request): boolean {
  return (req.headers.get("accept") ?? "").includes("image/webp");
}

function etagMatches(req: Request, etag: string): boolean {
  const header = req.headers.get("if-none-match");
  if (!header) return false;
  const bare = (v: string) => v.trim().replace(/^W\//, "");
  return header.split(",").some((v) => v.trim() === "*" || bare(v) === bare(etag));
}

type Options = {
  req: Request;
  file: string;
  contentType: string;
  cacheControl: string;
  headers: Record<string, string>;
  /** Allow ?w= resizing (only for jpg/png/webp sources). */
  resizable: boolean;
};

/** Serves a file, or a resized WebP variant of it, with ETag/304 handling. */
export async function serveFile(opts: Options): Promise<Response> {
  const { req, file, contentType, cacheControl, resizable } = opts;
  const baseHeaders: Record<string, string> = {
    ...opts.headers,
    "Cache-Control": cacheControl,
  };
  const params = parseImageParams(new URL(req.url).searchParams);
  let variant: ImageVariant | null = null;
  if (resizable && params.width) {
    const negotiated = params.format === "webp" && wantsWebp(req);
    baseHeaders["Vary"] = "Accept";
    try {
      variant = await getImageVariant(file, {
        width: params.width,
        format: negotiated ? "webp" : "original",
      });
    } catch {
      variant = null; // fall back to the original file
    }
  }

  if (variant) {
    if (etagMatches(req, variant.etag)) {
      return new Response(null, { status: 304, headers: { ...baseHeaders, ETag: variant.etag } });
    }
    const headers = { ...baseHeaders, "Content-Type": variant.contentType, ETag: variant.etag };
    if (variant.buffer) {
      return new Response(new Uint8Array(variant.buffer), { headers });
    }
    if (variant.path) return stream(variant.path, headers);
  }

  const stat = await fs.promises.stat(file);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = { ...baseHeaders, "Content-Type": contentType, ETag: etag };
  if (etagMatches(req, etag)) return new Response(null, { status: 304, headers });
  return stream(file, headers);
}

async function stream(file: string, headers: Record<string, string>): Promise<Response> {
  const stat = await fs.promises.stat(file);
  const body = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(stat.size) } });
}
