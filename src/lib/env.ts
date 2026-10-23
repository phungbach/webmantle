import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Paths are computed from the project root. None of these directories are under /public.
export const PROJECT_ROOT = process.cwd();
export const DATA_DIR = process.env.CMS_DATA_DIR
  ? path.resolve(process.env.CMS_DATA_DIR)
  : path.join(PROJECT_ROOT, "data");
export const THEMES_DIR = path.join(DATA_DIR, "themes");
export const THEME_BACKUP_DIR = path.join(DATA_DIR, "backups", "themes");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

/**
 * Public address of the site (canonical links, sitemap, feeds, share images). Must be an absolute
 * http(s) URL without a path. Production refuses to start with anything else.
 */
function parseSiteUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("SITE_URL must use http or https");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SITE_URL must be the site origin only, without a path or query");
  }
  return url.origin;
}

export const SITE_URL = parseSiteUrl(process.env.SITE_URL ?? "http://localhost:3000");

const SECRET_FILE = path.join(DATA_DIR, ".secret.key");
let cachedSecret: string | undefined;

/**
 * Secret used to sign preview tokens. Production must set PREVIEW_SECRET.
 * In development a random secret is generated once and stored in data/.secret.key.
 */
export function getSigningSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.PREVIEW_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("PREVIEW_SECRET must be set to at least 32 characters in production.");
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString("base64url"), { mode: 0o600 });
  }
  cachedSecret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  return cachedSecret;
}
