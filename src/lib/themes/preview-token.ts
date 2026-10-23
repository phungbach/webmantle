import crypto from "node:crypto";
import { getSigningSecret } from "@/lib/env";

// A preview token only grants read access to rendering one theme for a few minutes.
// It is not an admin credential: it cannot change settings, activate themes or read data.
export const PREVIEW_TTL_MS = 10 * 60 * 1000;

type PreviewPayload = { themeId: string; exp: number };

function sign(body: string): string {
  return crypto.createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
}

export function createPreviewToken(themeId: string, now = Date.now()): string {
  const payload: PreviewPayload = { themeId, exp: now + PREVIEW_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyPreviewToken(
  token: string | undefined,
  now = Date.now()
): PreviewPayload | null {
  if (!token || token.length > 1024) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewPayload;
    if (typeof payload.themeId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
