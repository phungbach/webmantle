/**
 * Whether a reverse proxy that sets x-forwarded-for sits in front of the app. Off by default:
 * the header is controlled by the client, so trusting it lets anyone dodge a rate limit.
 */
export function trustProxy(): boolean {
  return process.env.TRUST_PROXY === "true";
}

/**
 * Address used as a rate-limit key. With TRUST_PROXY=true this is the first x-forwarded-for hop
 * (the proxy must overwrite the header); otherwise every client shares the constant "direct".
 */
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  if (!trustProxy()) return "direct";
  const first = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  return first ? first.slice(0, 64) : "direct";
}
