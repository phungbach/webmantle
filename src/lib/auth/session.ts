import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { can, type Permission } from "@/lib/auth/permissions";

export const SESSION_COOKIE = "cms_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CurrentUser = { id: string; email: string; name: string; role: string };

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Creates a session row and returns the raw token. Only the hash is stored. */
export async function createSession(userId: string, now = Date.now()) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function findUserBySessionToken(
  token: string,
  now = new Date()
): Promise<CurrentUser | null> {
  if (!token || token.length > 128) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session || session.expiresAt <= now) return null;
  return session.user;
}

export async function destroySessionByToken(token: string) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Reads the current user from the request cookie. Returns null for anonymous visitors. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findUserBySessionToken(token);
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = "UnauthorizedError";
  }
}

/** Server-side authorization. Call this in every Server Action and Route Handler that mutates data. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!can(user.role, permission)) throw new ForbiddenError();
  return user;
}

export function assertPermission(user: CurrentUser, permission: Permission) {
  if (!can(user.role, permission)) throw new ForbiddenError();
}
