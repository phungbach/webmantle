import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Sets the visitor's language and sends them back to the page they came from.
 * Only same-site referrers are followed, so this cannot be used to redirect visitors elsewhere.
 */
export async function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get("lang");
  if (!isLocale(lang)) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });

  const h = await headers();
  const referer = h.get("referer");
  let back = "/";
  if (referer) {
    try {
      const url = new URL(referer);
      const site = new URL(SITE_URL);
      if (url.host === site.host || url.host === new URL(request.url).host) {
        back = `${url.pathname}${url.search}`;
      }
    } catch {
      back = "/";
    }
  }

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.redirect(new URL(back, request.url), { status: 303 });
}
