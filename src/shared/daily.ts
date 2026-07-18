// Shared, deterministic meta-loop math: the daily seed everyone in a sub shares,
// the per-sub daily leaderboard shape, and the co-op "frontier" aggregate.
// Pure functions + plain types only (no server/client imports) so the TS server
// and the Phaser client agree on the contract. All time enters as an explicit
// epoch-ms argument, so every function here is deterministic and tsx-testable.

// ---- Tuning (all cheap to change) -----------------------------------------

export const DAILY_CONFIG = {
  /** Day 1 of the current season. `dayNumber` counts UTC days from here. */
  seasonStartDayKey: '2026-07-18',
  /** Floor for a day's shared goal, before per-delver scaling. */
  frontierBaseGoal: 500,
  /** The shared goal grows by this many depths per delver who showed up, so a
   *  busy day is a bigger "we did this together" bar than a quiet one. */
  frontierPerDelver: 100,
  /** How many delvers the leaderboard returns. */
  topN: 10,
  /** Leaderboard + frontier keys self-expire after this (seconds). */
  dayTtlSeconds: 3 * 24 * 60 * 60,
  /** Closed-day report snapshots are kept this long (seconds). */
  snapshotTtlSeconds: 14 * 24 * 60 * 60,
} as const;

/** Flavor name for the milestone the sub is racing toward this season. */
export const FRONTIER_MILESTONE = 'the Sunken Vault';

// ---- Day keys -------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC calendar day as `YYYY-MM-DD` — the id everyone in a sub shares for a day. */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Whole UTC days from the epoch for a `YYYY-MM-DD` key. */
function keyToEpochDay(key: string): number {
  return Math.floor(Date.parse(`${key}T00:00:00Z`) / MS_PER_DAY);
}

/** The calendar day before `key` (what the scheduler closes + reports on). */
export function previousDayKey(key: string): string {
  return dayKey((keyToEpochDay(key) - 1) * MS_PER_DAY);
}

/** 1-based day index within the season (Day 1 = seasonStartDayKey). */
export function dayNumber(key: string): number {
  return keyToEpochDay(key) - keyToEpochDay(DAILY_CONFIG.seasonStartDayKey) + 1;
}

// ---- Daily seed -----------------------------------------------------------

/** xmur3-style string hash → uint32. Deterministic across server + client. */
function hash32(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The one seed all delvers in `subreddit` share on `dayKey`. Same sub + same
 *  day → same challenge; different subs/days diverge. */
export function dailySeed(subreddit: string, key: string): number {
  return hash32(`${subreddit.toLowerCase()}:${key}`);
}

// ---- Frontier (co-op aggregate) -------------------------------------------

/** The shared goal for a day, scaled by how many delvers took part. */
export function frontierGoal(delvers: number): number {
  return Math.max(
    DAILY_CONFIG.frontierBaseGoal,
    Math.max(0, Math.ceil(delvers)) * DAILY_CONFIG.frontierPerDelver
  );
}

/** Progress toward the goal, clamped to 0..100 (integer percent). */
export function frontierPct(depths: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((depths / goal) * 100)));
}

// ---- Shared types (endpoint + snapshot contracts) -------------------------

/** One row of the "deepest delve today" board. */
export interface LeaderRow {
  rank: number;
  username: string;
  depth: number;
}

/** The co-op frontier bar for a day. */
export interface FrontierView {
  /** Total depths the sub has cleared today (sum across all runs). */
  depths: number;
  /** Today's target (scales with delver count). */
  goal: number;
  /** Total runs logged today. */
  runs: number;
  /** Distinct delvers who logged a run today (= leaderboard size). */
  delvers: number;
  /** depths/goal as an integer percent, 0..100. */
  pct: number;
}

/** Snapshot saved when a day closes — powers the report post + the client's
 *  "yesterday" view. */
export interface FrontierSnapshot {
  dayKey: string;
  dayNumber: number;
  frontier: FrontierView;
  /** Whether the sub reached the day's goal. */
  goalHit: boolean;
  /** Top delvers of the closed day. */
  top: LeaderRow[];
  /** Epoch ms the day was closed. */
  closedAt: number;
}

/** Response for `POST /api/daily` — the client's Daily panel. */
export interface DailyResponse {
  dayKey: string;
  dayNumber: number;
  /** Today's shared challenge seed. */
  seed: number;
  frontier: FrontierView;
  leaderboard: {
    top: LeaderRow[];
    /** The requesting player's row, or null if they haven't logged a run today. */
    me: LeaderRow | null;
    totalPlayers: number;
  };
  /** The most recent closed-day report, if any (shown as "yesterday"). */
  lastReport: FrontierSnapshot | null;
}
