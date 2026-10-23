/** Parses a ?page= value. Anything invalid becomes page 1, and very large values are capped. */
export function pageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 10_000);
}

/** Returns the search term as a bounded string, or "" when absent. */
export function queryParam(raw: string | string[] | undefined, max = 100): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim().slice(0, max);
}

/** JSON error response in the API's standard shape: {error:{code,message}}. */
export function apiError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}
