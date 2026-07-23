// Failed-run retry queue. When /api/run/result is unreachable (or 429s), the
// run is persisted here and re-posted with the SAME runId on next boot — the
// server's runId dedupe makes a retry safe (never double-awards). Pure over a
// StorageLike so it's tsx-testable; callers pass window.localStorage. The one
// thing you must not break: MAX_AGE_MS must stay BELOW the server's
// RUN_DEDUPE_TTL_SECONDS (48h) — a retry that outlives its dedupe key could
// double-award.

import type { GearItem, RunOutcome } from '../shared/delve';

/** The subset of Storage this module uses (localStorage satisfies it). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** One unsynced run, exactly the payload /api/run/result expects + queue age. */
export interface PendingRun {
  runId: string;
  outcome: RunOutcome;
  depthReached: number;
  haul: GearItem[];
  queuedAt: number;
}

/** Outcome classification the poster reports back to the flush loop. */
export type PostRunStatus = 'ok' | 'retryable' | 'rejected';

const QUEUE_KEY = 'delve:pending-runs:v1';
/** Oldest entries are dropped past this many queued runs. */
export const MAX_QUEUE = 20;
/** Retry horizon — must stay below the server dedupe TTL (48h). */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Client-side run id; the server dedupes on it. */
export function newRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `run_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function isPendingRun(raw: unknown): raw is PendingRun {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.runId === 'string' &&
    o.runId.length >= 1 &&
    o.runId.length <= 64 &&
    (o.outcome === 'extracted' || o.outcome === 'died') &&
    typeof o.depthReached === 'number' &&
    Array.isArray(o.haul) &&
    typeof o.queuedAt === 'number'
  );
}

/** The queue, oldest first — malformed and stale entries silently pruned. */
export function readQueue(storage: StorageLike, nowMs: number): PendingRun[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return []; // corrupted storage must never crash boot
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isPendingRun).filter((run) => nowMs - run.queuedAt <= MAX_AGE_MS);
}

function writeQueue(storage: StorageLike, queue: PendingRun[]): void {
  try {
    if (queue.length === 0) storage.removeItem(QUEUE_KEY);
    else storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full/unavailable — the run stays local-only, as before Phase 0.
  }
}

/** Wipe the queue (hero factory reset — pending runs belong to the old hero;
 *  re-posting them would re-award progress the player just chose to destroy). */
export function clearQueue(storage: StorageLike): void {
  writeQueue(storage, []);
}

/** Append a failed run; the oldest entries are dropped past MAX_QUEUE. */
export function enqueueRun(storage: StorageLike, run: PendingRun): void {
  const queue = readQueue(storage, run.queuedAt);
  queue.push(run);
  writeQueue(storage, queue.slice(-MAX_QUEUE));
}

/**
 * Re-post queued runs oldest-first. 'ok' and 'rejected' (server said no —
 * retrying won't help) leave the queue; 'retryable' STOPS the flush and keeps
 * the remainder for next time (respects the server's rate-limit window).
 */
export async function flushQueue(
  storage: StorageLike,
  nowMs: number,
  post: (run: PendingRun) => Promise<PostRunStatus>
): Promise<{ recovered: number; remaining: number }> {
  const queue = readQueue(storage, nowMs);
  let recovered = 0;
  while (queue.length > 0) {
    const status = await post(queue[0]!);
    if (status === 'retryable') break;
    if (status === 'ok') recovered++;
    queue.shift();
  }
  writeQueue(storage, queue);
  return { recovered, remaining: queue.length };
}
