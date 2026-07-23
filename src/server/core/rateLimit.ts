// Per-user fixed-window rate limiting on Redis counters (SECURITY_PERF ⚙
// table — that doc is the source of truth for the limits; this mirrors it).
// Ops policy, not gameplay: these numbers do NOT live in TUNING. Takes a
// `RateLimitRedisLike` so the window math is unit-testable against the fake.
// The one thing you must not break: a denied request must have written NOTHING
// but the counter — the client retries the same action later.

/** The minimal Redis surface used here (see frontier.ts for the pattern). */
export interface RateLimitRedisLike {
  incrBy(key: string, value: number): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

/** Per-endpoint limits, mirroring SECURITY_PERF ("run/result ≤1 per 30s ⚙,
 *  equip/sell ≤5/s"). Hero read stays unlimited ("hero read cheap"). */
export const RATE_LIMITS = {
  runResult: { limit: 1, windowSeconds: 30 },
  equip: { limit: 5, windowSeconds: 1 },
  sell: { limit: 5, windowSeconds: 1 },
} as const;

const rateLimitKey = (bucket: string, userId: string, window: number): string =>
  `rl:${bucket}:${userId}:${window}`;

/**
 * Count this request against `bucket`'s fixed window; true = allowed.
 * Window id = floor(now / windowSeconds), so keys rotate naturally; each key
 * expires at 2× its window (first hit sets it) so stale counters vanish.
 */
export async function consumeRateLimit(
  client: RateLimitRedisLike,
  bucket: string,
  userId: string,
  limit: number,
  windowSeconds: number,
  nowMs: number
): Promise<boolean> {
  const window = Math.floor(nowMs / 1000 / windowSeconds);
  const key = rateLimitKey(bucket, userId, window);
  const count = await client.incrBy(key, 1);
  if (count === 1) await client.expire(key, windowSeconds * 2);
  return count <= limit;
}
