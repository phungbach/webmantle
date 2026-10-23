import { recordPageView } from "@/lib/analytics/record";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { clientIpFrom } from "@/lib/auth/client-ip";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

/** The Origin must be the configured site; localhost is also accepted outside production. */
function isOwnOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.host === new URL(SITE_URL).host) return true;
  return (
    process.env.NODE_ENV !== "production" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  );
}

const noContent = () => new Response(null, { status: 204 });

// Receives the small beacon sent by the public pages. It never fails loudly: a visitor's page must
// not be affected by analytics, so every refusal is a quiet 204 except an obviously foreign origin.
export async function POST(request: Request) {
  const headers = request.headers;
  // Respect "Do Not Track" and "Global Privacy Control".
  if (headers.get("dnt") === "1" || headers.get("sec-gpc") === "1") return noContent();
  // Signed-in staff are not visitors.
  if ((headers.get("cookie") ?? "").includes(`${SESSION_COOKIE}=`)) return noContent();

  // Only the site itself may send beacons. Compare against the configured public address.
  const host = headers.get("host") ?? "";
  const origin = headers.get("origin");
  if (origin) {
    if (!isOwnOrigin(origin)) return new Response(null, { status: 403 });
  } else {
    const fetchSite = headers.get("sec-fetch-site");
    if (fetchSite !== "same-origin" && fetchSite !== "same-site") return noContent();
  }

  const ip = clientIpFrom(headers);
  const userAgent = headers.get("user-agent") ?? "";
  // Without a trusted proxy every visitor shares the "direct" key, so the budget is larger.
  const budget = ip === "direct" ? 600 : 60;
  if (!hitRateLimit(`track:${ip}:${userAgent.slice(0, 40)}`, budget, 60_000).allowed)
    return noContent();

  const text = await request.text();
  if (text.length > 2000) return new Response(null, { status: 413 });
  let body: { path?: unknown; referrer?: unknown; internal?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }

  try {
    await recordPageView({
      path: body.path,
      referrer: body.referrer,
      internal: body.internal === true,
      // Only feeds the daily visitor hash (not a security decision), so the raw header is acceptable.
      ip: (headers.get("x-forwarded-for") ?? "unknown").split(",")[0]?.trim() || "unknown",
      userAgent,
      requestHost: host,
    });
  } catch (error) {
    console.error("[analytics]", error instanceof Error ? error.message : error);
  }
  return noContent();
}
