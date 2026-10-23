"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { hitRateLimit, peekRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import {
  clearSessionCookie,
  createSession,
  destroySessionByToken,
  getCurrentUser,
  setSessionCookie,
  SESSION_COOKIE,
} from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/schemas";
import { clientIpFrom } from "@/lib/auth/client-ip";
import { audit, requestMeta } from "@/lib/audit";
import { cookies, headers } from "next/headers";
import { formString, tm } from "@/app/admin/actions/shared";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const EMAIL_FAILURE_LIMIT = 10;

async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success)
    redirect(`/login?error=${encodeURIComponent(await tm("login.invalidInput"))}`);

  const { email, password } = parsed.data;
  const limitKey = `login:${email}:${await clientIp()}`;
  const limit = hitRateLimit(limitKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  // Second limit by email alone: counts failures only, so it also holds when the address is spoofed.
  const emailKey = `login-email:${email.toLowerCase()}`;
  const emailLimit = peekRateLimit(emailKey, EMAIL_FAILURE_LIMIT);
  if (!limit.allowed || !emailLimit.allowed) {
    const wait = Math.max(limit.retryAfterSeconds, emailLimit.retryAfterSeconds);
    redirect(
      `/login?error=${encodeURIComponent(await tm("login.tooMany", { minutes: Math.ceil(wait / 60) }))}`
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    hitRateLimit(emailKey, EMAIL_FAILURE_LIMIT, LOGIN_WINDOW_MS);
    await audit({
      actorId: null,
      action: "auth.login-failed",
      targetType: "user",
      targetId: email,
      ...(await requestMeta()),
    });
    redirect(`/login?error=${encodeURIComponent(await tm("login.invalidCredentials"))}`);
  }

  resetRateLimit(limitKey);
  resetRateLimit(emailKey);
  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);
  await audit({
    actorId: user.id,
    action: "auth.login",
    targetType: "user",
    targetId: user.id,
    ...(await requestMeta()),
  });
  redirect("/admin");
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const user = await getCurrentUser();
  if (token) await destroySessionByToken(token);
  await clearSessionCookie();
  if (user)
    await audit({
      actorId: user.id,
      action: "auth.logout",
      targetType: "user",
      targetId: user.id,
      ...(await requestMeta()),
    });
  redirect("/login");
}
