// Per-sub, per-day meta state in Redis: the "deepest delve today" leaderboard
// and the co-op frontier aggregate, plus closing a day into a report snapshot.
//
// Devvit scopes Redis keys per app installation (i.e. per subreddit), so the
// day key alone is enough to keep subs separate — no sub token in the key.
//
// Functions take a `RedisLike` client so the aggregate logic is unit-testable
// against an in-memory fake (tsx); the routes pass the real `redis` singleton.
// v0 trusts the client on `depthReached` (anti-cheat deferred, per scope).

import {
  DAILY_CONFIG,
  dailySeed,
  dayKey,
  dayNumber,
  frontierGoal,
  frontierPct,
  type DailyResponse,
  type FrontierSnapshot,
  type FrontierView,
  type LeaderRow,
} from '../../shared/daily';

/** The minimal Redis surface this module uses. The real `@devvit/web/server`
 *  `redis` satisfies it structurally; the test provides a fake. */
export interface RedisLike {
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zRange(
    key: string,
    start: number,
    stop: number,
    options?: { reverse?: boolean; by: 'score' | 'lex' | 'rank' }
  ): Promise<{ member: string; score: number }[]>;
  zCard(key: string): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { expiration?: Date }): Promise<string>;
  expire(key: string, seconds: number): Promise<void>;
}

// ---- Keys -----------------------------------------------------------------

const lbKey = (key: string): string => `delve:lb:${key}`;
const frontierKey = (key: string): string => `delve:frontier:${key}`;
const reportKey = (key: string): string => `delve:report:${key}`;
const reportLatestKey = (): string => `delve:report:latest`;

/** Depth is the only client-supplied value; clamp it hard. */
const sanitizeDepth = (depth: number): number =>
  Number.isFinite(depth) ? Math.max(0, Math.min(Math.floor(depth), 100000)) : 0;

const isRealUser = (username: string): boolean =>
  !!username && username !== 'anonymous';

// ---- Read helpers ---------------------------------------------------------

/** Top-N rows (deepest first) from a day's leaderboard sorted set. */
async function readTop(redis: RedisLike, key: string): Promise<LeaderRow[]> {
  const entries = await redis.zRange(lbKey(key), 0, DAILY_CONFIG.topN - 1, {
    reverse: true,
    by: 'rank',
  });
  return entries.map((e, i) => ({
    rank: i + 1,
    username: e.member,
    depth: Math.round(e.score),
  }));
}

/** Assemble the frontier view (depths/runs from the hash, delvers from the
 *  board's cardinality, goal/pct derived). */
async function readFrontier(redis: RedisLike, key: string): Promise<FrontierView> {
  const [fields, delvers] = await Promise.all([
    redis.hGetAll(frontierKey(key)),
    redis.zCard(lbKey(key)),
  ]);
  const depths = Number(fields?.depths ?? 0) || 0;
  const runs = Number(fields?.runs ?? 0) || 0;
  const goal = frontierGoal(delvers);
  return { depths, runs, delvers, goal, pct: frontierPct(depths, goal) };
}

/** Convert a player's ascending rank (0 = lowest score) into a descending
 *  display rank (1 = deepest). */
function displayRank(ascRank: number, delvers: number): number {
  return Math.max(1, delvers - ascRank);
}

// ---- Public API -----------------------------------------------------------

/**
 * Record one finished run into today's board + frontier. Called for BOTH
 * outcomes — a depth reached is a depth reached, whether banked or died on.
 * Leaderboard keeps each player's *max* depth; the frontier sums every run's
 * depth (celebratory "we explored N together"). No-op for anonymous users.
 */
export async function recordRun(
  redis: RedisLike,
  username: string,
  depthReached: number,
  nowMs: number
): Promise<void> {
  if (!isRealUser(username)) return;
  const depth = sanitizeDepth(depthReached);
  if (depth <= 0) return;

  const key = dayKey(nowMs);

  // Leaderboard: keep the player's deepest of the day.
  const existing = await redis.zScore(lbKey(key), username);
  if (existing === undefined || existing === null || depth > Number(existing)) {
    await redis.zAdd(lbKey(key), { member: username, score: depth });
  }
  await redis.expire(lbKey(key), DAILY_CONFIG.dayTtlSeconds);

  // Frontier: every run contributes its depth to the shared total.
  await redis.hIncrBy(frontierKey(key), 'depths', depth);
  await redis.hIncrBy(frontierKey(key), 'runs', 1);
  await redis.expire(frontierKey(key), DAILY_CONFIG.dayTtlSeconds);
}

/** Build the Daily-panel payload for `username` in `subreddit` right now. */
export async function readDaily(
  redis: RedisLike,
  subreddit: string,
  username: string,
  nowMs: number
): Promise<DailyResponse> {
  const key = dayKey(nowMs);

  const [top, frontier, lastReportRaw] = await Promise.all([
    readTop(redis, key),
    readFrontier(redis, key),
    redis.get(reportLatestKey()),
  ]);

  let me: LeaderRow | null = null;
  if (isRealUser(username)) {
    const myDepth = await redis.zScore(lbKey(key), username);
    if (myDepth !== undefined && myDepth !== null) {
      const ascRank = await redis.zRank(lbKey(key), username);
      const rank =
        ascRank === undefined || ascRank === null
          ? frontier.delvers
          : displayRank(ascRank, frontier.delvers);
      me = { rank, username, depth: Math.round(Number(myDepth)) };
    }
  }

  let lastReport: FrontierSnapshot | null = null;
  if (lastReportRaw) {
    try {
      lastReport = JSON.parse(lastReportRaw) as FrontierSnapshot;
    } catch {
      lastReport = null;
    }
  }

  return {
    dayKey: key,
    dayNumber: dayNumber(key),
    seed: dailySeed(subreddit, key),
    frontier,
    leaderboard: { top, me, totalPlayers: frontier.delvers },
    lastReport,
  };
}

/**
 * Close `key`'s day into a report snapshot: read the final board + frontier,
 * decide goal hit/miss, persist it as both `report:{key}` and `report:latest`,
 * and return it for the report post. Idempotent (re-running just re-snapshots).
 */
export async function closeDay(
  redis: RedisLike,
  key: string,
  nowMs: number
): Promise<FrontierSnapshot> {
  const [top, frontier] = await Promise.all([
    readTop(redis, key),
    readFrontier(redis, key),
  ]);

  const snapshot: FrontierSnapshot = {
    dayKey: key,
    dayNumber: dayNumber(key),
    frontier,
    goalHit: frontier.depths >= frontier.goal,
    top,
    closedAt: nowMs,
  };

  const json = JSON.stringify(snapshot);
  const expiration = new Date(nowMs + DAILY_CONFIG.snapshotTtlSeconds * 1000);
  await redis.set(reportKey(key), json, { expiration });
  await redis.set(reportLatestKey(), json);
  return snapshot;
}
