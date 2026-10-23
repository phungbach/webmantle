import crypto from "node:crypto";

// Pure helpers for recording page views. Nothing here touches the database.

const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|pagespeed|preview|curl|wget|python|java\/|go-http|okhttp|monitor|uptime|pingdom|axios|node-fetch/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length < 10 || BOT.test(userAgent);
}

export type Source = "direct" | "search" | "social" | "referral" | "internal";

const SEARCH_HOSTS = [
  "google",
  "bing.com",
  "duckduckgo.com",
  "yahoo.",
  "coccoc.com",
  "baidu.com",
  "yandex.",
  "ecosia.org",
];
const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "t.co",
  "twitter.com",
  "x.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "zalo.me",
  "reddit.com",
  "pinterest.",
];

// A needle with a dot inside ("t.co") must match the whole host or a subdomain of it. Only a bare name
// ("google") or a name ending in a dot ("yahoo.") may appear anywhere in the host, to cover country sites.
const hostMatches = (host: string, needle: string) => {
  const loose = !needle.includes(".") || needle.endsWith(".");
  return loose ? host.includes(needle) : host === needle || host.endsWith(`.${needle}`);
};

/** Where a visit came from. `internal` marks a move between pages of this site, not a new visit. */
export function classifySource(
  referrer: string | null | undefined,
  siteHosts: string[],
  internal = false
): Source {
  if (internal) return "internal";
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "direct";
  }
  if (
    siteHosts.some(
      (h) =>
        h
          .toLowerCase()
          .replace(/^www\./, "")
          .split(":")[0] === host
    )
  ) {
    return "internal";
  }
  if (SEARCH_HOSTS.some((needle) => hostMatches(host, needle))) return "search";
  if (SOCIAL_HOSTS.some((needle) => hostMatches(host, needle))) return "social";
  return "referral";
}

export type TrackTarget =
  | { kind: "home"; path: "/" }
  | { kind: "posts"; path: "/posts" }
  | { kind: "post"; path: string; slug: string }
  | { kind: "page"; path: string; slug: string };

/** Accepts only public content paths. Anything else (admin, api, files) is not counted. */
export function parseTrackPath(raw: unknown): TrackTarget | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200 || !raw.startsWith("/")) {
    return null;
  }
  const path = raw.split(/[?#]/)[0] ?? "";
  if (path === "/") return { kind: "home", path: "/" };
  const parts = path.replace(/\/$/, "").split("/").slice(1);
  if (parts.length === 1 && parts[0] === "posts") return { kind: "posts", path: "/posts" };
  if (parts.length === 2 && (parts[0] === "posts" || parts[0] === "pages")) {
    let slug: string;
    try {
      slug = decodeURIComponent(parts[1] ?? "");
    } catch {
      return null;
    }
    if (!slug || slug.length > 100 || /[\s/\\]/.test(slug)) return null;
    return parts[0] === "posts"
      ? { kind: "post", path: `/posts/${slug}`, slug }
      : { kind: "page", path: `/pages/${slug}`, slug };
  }
  return null;
}

/** Day key used both for the visitor hash and for grouping, always UTC. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Anonymous visitor id. It mixes the address and browser with a server secret and the date, so it
 * can tell two visitors apart on one day but changes every day and cannot be turned back into an IP.
 */
export function visitorHash(secret: string, ip: string, userAgent: string, day: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${day}|${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 24);
}
