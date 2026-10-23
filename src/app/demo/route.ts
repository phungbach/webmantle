import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { clientIpFrom } from "@/lib/auth/client-ip";
import { createSession, getCurrentUser, setSessionCookie } from "@/lib/auth/session";
import { audit, requestMeta } from "@/lib/audit";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

const DEMO_LIMIT = 20;
const DEMO_WINDOW_MS = 60 * 60 * 1000;

/**
 * "View demo" link: signs the visitor in to the read-only demo account and opens /admin.
 *
 * It is off unless DEMO_PUBLIC_LOGIN=true, and it only ever signs in the account named by DEMO_EMAIL
 * when that account has the "viewer" role (no write permission), never an administrator or editor.
 * Someone who is already signed in keeps their own session. Sign-ins are limited per address.
 */
export async function GET() {
  if (process.env.DEMO_PUBLIC_LOGIN !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }
  const to = (path: string) => NextResponse.redirect(new URL(path, SITE_URL), { status: 303 });

  const current = await getCurrentUser();
  if (current) return to("/admin");

  const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const demo = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!demo || demo.role !== "viewer") return to("/login");

  const ip = clientIpFrom(await headers());
  if (!hitRateLimit(`demo:${ip}`, DEMO_LIMIT, DEMO_WINDOW_MS).allowed) return to("/login");

  const session = await createSession(demo.id);
  await setSessionCookie(session.token, session.expiresAt);
  await audit({
    actorId: demo.id,
    action: "auth.login",
    targetType: "user",
    targetId: demo.id,
    detail: { demo: true },
    ...(await requestMeta()),
  });
  const response = to("/admin");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
