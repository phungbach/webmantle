import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MEDIA_DIR } from "@/lib/env";
import { RESIZABLE_TYPES, serveFile } from "../serve-file";

export const dynamic = "force-dynamic";

/** Public media is served by database id only. The stored filename is generated and never user supplied. */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) return new NextResponse("Not found", { status: 404 });
  const file = path.join(MEDIA_DIR, path.basename(media.filename));
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
  return serveFile({
    req,
    file,
    contentType: media.mimeType,
    resizable: RESIZABLE_TYPES.has(media.mimeType),
    // A media id never changes content, so the response can be cached for good.
    cacheControl: "public, max-age=31536000, immutable",
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
