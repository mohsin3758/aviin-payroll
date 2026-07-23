// Simple in-memory fixed-window rate limiter. Fine for a single-instance dev/small deployment;
// a multi-instance production deployment would need a shared store (Redis) instead.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  existing.count += 1;
  return { allowed: true, remaining: maxRequests - existing.count };
}

// Periodic cleanup so the map doesn't grow unbounded in a long-running server.
// Runs in both the Node and Edge (middleware) runtimes, so avoid Node-only Timer APIs like unref().
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60_000);
if (typeof (cleanupTimer as unknown as { unref?: () => void }).unref === "function") {
  (cleanupTimer as unknown as { unref: () => void }).unref();
}
