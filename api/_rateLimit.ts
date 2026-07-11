import type { VercelRequest, VercelResponse } from "@vercel/node";

// A best-effort, in-memory fixed-window rate limiter keyed by route + client IP.
// It exists to blunt brute-force employee-ID discovery against the public status
// and clock routes and password-style guessing against admin login.
//
// Caveats: the window is per process. In the self-hosted Docker container (one
// long-lived process) this is authoritative; on Vercel each warm instance keeps
// its own counters, so the effective ceiling scales with the number of live
// instances. That is acceptable for slowing brute force, not for hard quotas.

const WINDOW_MS = 60 * 60 * 1000; // one hour

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();

// Drop expired buckets no more than once per window so the map can't grow
// without bound as new IPs appear.
function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (value) return value.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// Records one request against the `name` bucket for the caller's IP. Returns
// true when the request is within `limit` per hour. When the limit is exceeded
// it sends a 429 (with Retry-After) and returns false, mirroring requireAdmin's
// "false means the response is already handled" contract.
export function rateLimit(
  req: VercelRequest,
  res: VercelResponse,
  name: string,
  limit: number
): boolean {
  const now = Date.now();
  sweep(now);

  const key = `${name}:${clientIp(req)}`;
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count++;

  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many requests" });
    return false;
  }
  return true;
}
