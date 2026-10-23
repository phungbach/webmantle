import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission, type CurrentUser } from "@/lib/auth/session";
import { MEDIA_DIR } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_MAX_DIMENSION = 6000;

type Detected = {
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
};

/**
 * Identifies an image from its first bytes. The browser-supplied MIME type and filename are ignored.
 * SVG is refused on purpose: it can contain script.
 */
export function detectImage(buf: Buffer): Detected {
  if (
    buf.length >= 24 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return {
      mimeType: "image/png",
      extension: "png",
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (
    buf.length >= 10 &&
    (buf.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buf.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return {
      mimeType: "image/gif",
      extension: "gif",
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp", width: null, height: null };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const dims = jpegDimensions(buf);
    return {
      mimeType: "image/jpeg",
      extension: "jpg",
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  }
  throw new ValidationError("Only PNG, JPEG, GIF and WebP images are allowed.");
}

function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1] ?? 0;
    const length = buf.readUInt16BE(i + 2);
    // SOF0..SOF3 carry the frame size.
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

export async function saveMedia(user: CurrentUser, buffer: Buffer, altText: string) {
  assertPermission(user, "media:upload");
  if (buffer.length === 0) throw new ValidationError("The file is empty.");
  if (buffer.length > MEDIA_MAX_BYTES) throw new ValidationError("Images must be 5 MB or smaller.");
  const info = detectImage(buffer);
  if ((info.width ?? 0) > MEDIA_MAX_DIMENSION || (info.height ?? 0) > MEDIA_MAX_DIMENSION) {
    throw new ValidationError(`Images may be at most ${MEDIA_MAX_DIMENSION} pixels on each side.`);
  }
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  // Generated name: random hex plus the detected extension. The original filename is never used on disk.
  const filename = `${crypto.randomBytes(16).toString("hex")}.${info.extension}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer, { flag: "wx", mode: 0o644 });
  const media = await prisma.media.create({
    data: {
      filename,
      mimeType: info.mimeType,
      byteSize: buffer.length,
      width: info.width,
      height: info.height,
      altText: altText.trim().slice(0, 300),
      uploadedById: user.id,
    },
  });
  await audit({
    actorId: user.id,
    action: "media.upload",
    targetType: "media",
    targetId: media.id,
    detail: { mimeType: info.mimeType, byteSize: buffer.length },
  });
  return media.id;
}

/**
 * Where an image is referenced, as short phrases ("2 post(s)"). Layouts and theme content store ids
 * inside JSON text; ids are random tokens, so a LIKE on the id is enough.
 */
export async function mediaUsage(id: string): Promise<string[]> {
  const like = `%${id.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [posts, pageLayouts, homeLayout, themeContent, siteSettings] = await Promise.all([
    prisma.post.count({ where: { OR: [{ featuredImage: id }, { socialImage: id }] } }),
    prisma.$queryRaw<{ n: bigint | number }[]>`
      SELECT COUNT(*) AS n FROM "Page"
      WHERE "layout" LIKE ${like} ESCAPE '\\' OR "layoutDraft" LIKE ${like} ESCAPE '\\'`,
    prisma.$queryRaw<{ n: bigint | number }[]>`
      SELECT COUNT(*) AS n FROM "SiteSetting"
      WHERE "key" IN ('builder.home.layout', 'builder.home.layoutDraft') AND "value" LIKE ${like} ESCAPE '\\'`,
    prisma.$queryRaw<{ n: bigint | number }[]>`
      SELECT COUNT(*) AS n FROM "SiteSetting"
      WHERE "key" LIKE 'themecontent.%' AND "value" LIKE ${like} ESCAPE '\\'`,
    prisma.siteSetting.count({
      where: { key: { in: ["logoMediaId", "seo.defaultOgImageId"] }, value: id },
    }),
  ]);
  const usage: string[] = [];
  if (posts > 0) usage.push(`${posts} post(s)`);
  const pages = Number(pageLayouts[0]?.n ?? 0);
  if (pages > 0) usage.push(`${pages} page layout(s)`);
  if (Number(homeLayout[0]?.n ?? 0) > 0) usage.push("the home page layout");
  if (Number(themeContent[0]?.n ?? 0) > 0) usage.push("theme content");
  if (siteSettings > 0) usage.push("the site settings (logo or share image)");
  return usage;
}

export async function deleteMedia(user: CurrentUser, id: string) {
  assertPermission(user, "media:upload");
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) return;
  const usage = await mediaUsage(id);
  if (usage.length > 0)
    throw new ValidationError(
      `This image is used by ${usage.join(", ")}. Remove it from there first.`
    );
  await prisma.media.delete({ where: { id } });
  fs.rmSync(path.join(MEDIA_DIR, path.basename(media.filename)), { force: true });
  await audit({ actorId: user.id, action: "media.delete", targetType: "media", targetId: id });
}
