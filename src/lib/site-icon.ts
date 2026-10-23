import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppearance } from "@/lib/appearance";
import { MEDIA_DIR } from "@/lib/env";

/** Serves the logo as the browser tab icon. Without a logo the browser falls back to its default. */
export async function siteIconResponse(): Promise<Response> {
  const { logoMediaId } = await getAppearance();
  if (!logoMediaId) return new NextResponse("Not found", { status: 404 });
  const media = await prisma.media.findUnique({ where: { id: logoMediaId } });
  if (!media) return new NextResponse("Not found", { status: 404 });
  const file = path.join(MEDIA_DIR, path.basename(media.filename));
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(fs.readFileSync(file), {
    headers: {
      "Content-Type": media.mimeType,
      // Revalidate on every request. The versioned address in the page changes with the logo.
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
