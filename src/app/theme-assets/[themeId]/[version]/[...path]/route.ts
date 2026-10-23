import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALLOWED_ASSET_EXTENSIONS } from "@/lib/themes/contract";
import { isInside } from "@/lib/themes/install";
import { serveFile } from "@/app/media/serve-file";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
};

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Serves theme stylesheets and assets from the private themes directory.
 * Only styles.css and files under assets/ with allow-listed extensions are served.
 * theme.json, templates, and anything else in the theme folder are never exposed.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ themeId: string; version: string; path: string[] }> }
) {
  const { themeId, version, path: segments } = await context.params;
  if (
    !SEGMENT.test(themeId) ||
    !SEGMENT.test(version) ||
    segments.some((s) => !SEGMENT.test(s) || s.startsWith("."))
  ) {
    return new NextResponse("Not found", { status: 404 });
  }
  const relative = segments.join("/");
  const allowed =
    relative === "styles.css" ||
    (relative.startsWith("assets/") &&
      ALLOWED_ASSET_EXTENSIONS.some((ext) => relative.endsWith(ext)));
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const theme = await prisma.theme.findUnique({
    where: { id: themeId },
    select: { path: true, version: true },
  });
  // "current" means whichever version is installed. Posts that ship with a theme point at it, so the
  // address keeps working after the theme is updated.
  const isCurrent = version === "current";
  if (!theme || (!isCurrent && theme.version !== version))
    return new NextResponse("Not found", { status: 404 });

  const file = path.resolve(theme.path, relative);
  if (!isInside(theme.path, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(file).toLowerCase();
  return serveFile({
    req,
    file,
    contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
    resizable: relative.startsWith("assets/") && [".jpg", ".jpeg", ".png", ".webp"].includes(ext),
    // Versioned URLs can be cached forever. A new theme version gets a new URL.
    cacheControl: isCurrent
      ? "public, max-age=300, stale-while-revalidate=86400"
      : "public, max-age=31536000, immutable",
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'",
    },
  });
}
