// The ONLY Redis I/O path for the hero blob. Every account write goes through
// `updateHero`: WATCH/MULTI/EXEC compare-and-set with mutation replay on
// conflict (DATA_SCHEMA "Concurrency") — this is what stops equip/sell/run
// racing each other into lost updates. Takes a `HeroRedisLike` client so the
// CAS loop is unit-testable against the in-memory fake; routes pass the real
// `redis` singleton. The one thing you must not break: mutators passed in MUST
// be pure functions of the hero they receive — a conflict REPLAYS them.

import { migrateStoredHero, newStoredHero, type StoredHero } from './heroSchema';
import { recompute } from './hero';

export const heroKey = (userId: string): string => `hero:${userId}`;

/** Conflict-retry budgets per endpoint, ordered run-result > hero > equip >
 *  sell (DATA_SCHEMA) — the writes that carry the most player value get the
 *  most patience under contention. */
export const CAS_ATTEMPTS = {
  runResult: 5,
  hero: 4,
  equip: 3,
  sell: 2,
} as const;

/** Thrown when every CAS attempt conflicted; routes answer 409 ("busy"). */
export class HeroConflictError extends Error {
  constructor(userId: string, attempts: number) {
    super(`hero write for ${userId} conflicted ${attempts} times`);
    this.name = 'HeroConflictError';
  }
}

/** The minimal transaction surface used here. The real Devvit `TxClientLike`
 *  satisfies it structurally; the test fake implements it. */
export interface HeroTxLike {
  multi(): Promise<void>;
  set(key: string, value: string): Promise<unknown>;
  /** Resolves to the command results array, or null/undefined if a watched key
   *  changed (standard Redis EXEC-nil conflict signal). */
  exec(): Promise<unknown>;
  unwatch(): Promise<unknown>;
}

/** The minimal client surface used here (see frontier.ts for the pattern). */
export interface HeroRedisLike {
  get(key: string): Promise<string | undefined>;
  watch(...keys: string[]): Promise<HeroTxLike>;
}

/** Read-only load (no create, no write) — for response paths that must not
 *  touch the blob, e.g. replaying a duplicate run result. Null if unsaved. */
export async function readHero(
  client: Pick<HeroRedisLike, 'get'>,
  userId: string,
  nowMs: number
): Promise<StoredHero | null> {
  const raw = await client.get(heroKey(userId));
  if (!raw) return null;
  const hero = migrateStoredHero(JSON.parse(raw) as Record<string, unknown>, nowMs);
  recompute(hero);
  return hero;
}

/**
 * Load → migrate → recompute → `mutate` → transactional save, retrying the
 * whole cycle (fresh read, mutation REPLAYED) while other writers win the
 * race. Returns the saved hero and the mutator's result. A parse failure on an
 * existing blob throws (route 500s) — never overwrite a save we can't read.
 */
export async function updateHero<T>(
  client: HeroRedisLike,
  userId: string,
  nowMs: number,
  mutate: (hero: StoredHero) => T,
  attempts: number
): Promise<{ hero: StoredHero; result: T }> {
  const key = heroKey(userId);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const tx = await client.watch(key);
    let hero: StoredHero;
    let result: T;
    try {
      const raw = await client.get(key);
      hero = raw
        ? migrateStoredHero(JSON.parse(raw) as Record<string, unknown>, nowMs)
        : newStoredHero(nowMs);
      recompute(hero); // keep derived maxHp consistent with current gear/level
      result = mutate(hero);
    } catch (error) {
      await tx.unwatch(); // release the watch before surfacing the real error
      throw error;
    }
    await tx.multi();
    await tx.set(key, JSON.stringify(hero));
    let execResult: unknown;
    try {
      execResult = await tx.exec();
    } catch {
      execResult = null; // some clients signal a watch conflict by throwing
    }
    if (Array.isArray(execResult)) return { hero, result };
    // Conflict: another writer touched the key between watch and exec — loop
    // re-reads the fresh blob and replays the mutation.
  }
  throw new HeroConflictError(userId, attempts);
}
