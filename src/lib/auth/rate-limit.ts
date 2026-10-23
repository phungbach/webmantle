// Fixed-window limiter kept in memory. It is per process: when running several Node
// processes behind a load balancer, move the counters to the database or a shared store.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const MAX_BUCKETS = 10_000;
const SWEEP_EVERY = 500;
let calls = 0;

/** Drops expired buckets; if still over the cap, evicts the oldest-inserted ones. */
function sweep(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  let excess = buckets.size - MAX_BUCKETS;
  if (excess <= 0) return;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (--excess <= 0) break;
  }
}

export function hitRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (++calls % SWEEP_EVERY === 0 || buckets.size >= MAX_BUCKETS) sweep(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  current.count += 1;
  const allowed = current.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((current.resetAt - now) / 1000),
  };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** Reads a counter without incrementing it. */
export function peekRateLimit(key: string, limit: number, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: current.count < limit,
    retryAfterSeconds: current.count < limit ? 0 : Math.ceil((current.resetAt - now) / 1000),
  };
}
