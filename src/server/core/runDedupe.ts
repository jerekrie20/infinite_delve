// Run-result idempotency. The client stamps every run with a `runId`; the
// server awards a runId AT MOST ONCE and replays the stored summary to any
// duplicate submission (network retry, queued offline run, double-fire).
// First-wins is claimed via INCR (the Devvit `set` NX return is opaque, so a
// counter is the detectable atomic). This is what makes the client's
// queue-and-retry safe: a retry can NEVER double-award. The client's retry
// horizon (24h) must stay BELOW these keys' TTL (48h) — if you shrink the TTL,
// shrink the client queue's max age first.

import type { RunGained } from './hero';

/** The minimal Redis surface used here (see frontier.ts for the pattern). */
export interface RunDedupeRedisLike {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { expiration?: Date }): Promise<string>;
  incrBy(key: string, value: number): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

/** ⚙ Must exceed the client retry horizon (runQueue MAX_AGE, 24h). */
export const RUN_DEDUPE_TTL_SECONDS = 48 * 3600;

export const runSeenKey = (userId: string, runId: string): string =>
  `run:seen:${userId}:${runId}`;
export const runDoneKey = (userId: string, runId: string): string =>
  `run:done:${userId}:${runId}`;

/** The stored summary of an already-completed run, or null if unseen/pending. */
export async function findCompletedRun(
  client: RunDedupeRedisLike,
  userId: string,
  runId: string
): Promise<RunGained | null> {
  const raw = await client.get(runDoneKey(userId, runId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunGained;
  } catch {
    return null; // unreadable summary → treat as pending (zeroed duplicate)
  }
}

/** Atomically claim first-wins on a runId. True = this request awards the run;
 *  false = another request already did (or is mid-flight) — duplicate path. */
export async function beginRun(
  client: RunDedupeRedisLike,
  userId: string,
  runId: string
): Promise<boolean> {
  const count = await client.incrBy(runSeenKey(userId, runId), 1);
  if (count === 1) {
    await client.expire(runSeenKey(userId, runId), RUN_DEDUPE_TTL_SECONDS);
    return true;
  }
  return false;
}

/** Persist the awarded summary so duplicates can replay it. */
export async function completeRun(
  client: RunDedupeRedisLike,
  userId: string,
  runId: string,
  gained: RunGained,
  nowMs: number
): Promise<void> {
  const expiration = new Date(nowMs + RUN_DEDUPE_TTL_SECONDS * 1000);
  await client.set(runDoneKey(userId, runId), JSON.stringify(gained), { expiration });
}
