import type {
  EquipResponse,
  GearItem,
  GearSlot,
  Hero,
  HeroResponse,
  RunOutcome,
  RunResultResponse,
  SellResponse,
} from '../shared/delve';
import type { DailyResponse } from '../shared/daily';

/** Used when the API isn't reachable (local vite preview, before Devvit
 *  playtest). Lets the client render + play standalone with local-only state. */
const MOCK_HERO: Hero = {
  class: 'squire',
  level: 1,
  xp: 0,
  xpToNext: 20,
  hp: 40,
  maxHp: 40,
  attack: 6,
  defense: 5,
  critChance: 5,
  critMultiplier: 1.5,
  lifesteal: 0,
  dodge: 0,
  hpRegen: 0,
  goldFind: 0,
  mana: 50,
  maxMana: 50,
  abilities: ['slam'],
  gold: 0,
  bestDepth: 1,
  stash: [],
  equipped: {},
};

/** App-open: get the hero and any auto-collected offline idle gains. */
export async function fetchHero(): Promise<HeroResponse> {
  try {
    const res = await fetch('/api/hero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as HeroResponse;
  } catch (err) {
    console.warn('[delve] /api/hero unavailable — mock hero (local preview)', err);
    return { hero: { ...MOCK_HERO } };
  }
}

/** Sample data so the Daily panel looks alive in local vite preview (no server). */
const MOCK_DAILY: DailyResponse = {
  dayKey: 'preview',
  dayNumber: 1,
  seed: 12345,
  frontier: { depths: 372, goal: 500, runs: 24, delvers: 6, pct: 74 },
  leaderboard: {
    top: [
      { rank: 1, username: 'shaft_king', depth: 18 },
      { rank: 2, username: 'you_preview', depth: 15 },
      { rank: 3, username: 'delver_bob', depth: 12 },
      { rank: 4, username: 'mole_person', depth: 9 },
    ],
    me: { rank: 2, username: 'you_preview', depth: 15 },
    totalPlayers: 6,
  },
  lastReport: null,
};

/** Daily panel: today's shared seed + co-op frontier + "deepest delve today". */
export async function fetchDaily(): Promise<DailyResponse> {
  try {
    const res = await fetch('/api/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DailyResponse;
  } catch (err) {
    console.warn('[delve] /api/daily unavailable — mock daily (local preview)', err);
    return structuredClone(MOCK_DAILY);
  }
}

/** Equip a stash item, or unequip a slot (exactly one). Returns the updated
 *  hero, or null if the API is unreachable (client applies the change locally). */
export async function postEquip(
  itemId?: string,
  unequip?: GearSlot
): Promise<EquipResponse | null> {
  try {
    const res = await fetch('/api/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, unequip }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as EquipResponse;
  } catch (err) {
    console.warn('[delve] /api/equip unavailable — local only', err);
    return null;
  }
}

/** Sell a stash item for gold. Returns the updated hero + gold gained, or null
 *  if the API is unreachable (client applies the sale locally). */
export async function postSell(itemId: string): Promise<SellResponse | null> {
  try {
    const res = await fetch('/api/sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SellResponse;
  } catch (err) {
    console.warn('[delve] /api/sell unavailable — local only', err);
    return null;
  }
}

/** Factory-reset the hero to a fresh L1 squire. Returns the fresh hero, or
 *  null on failure — the caller must NOT fake a reset locally (the server
 *  copy would still be the old hero and win at next load). */
export async function postResetHero(): Promise<HeroResponse | null> {
  try {
    const res = await fetch('/api/hero/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as HeroResponse;
  } catch (err) {
    console.warn('[delve] /api/hero/reset failed', err);
    return null;
  }
}

/** How a run submission ended. 'retryable' (network down, 429 rate-limited,
 *  5xx) means the caller should QUEUE the run and re-post it later with the
 *  same runId — the server dedupes, so a retry never double-awards.
 *  'rejected' means the server said no and retrying won't help. */
export type PostRunResult =
  | { status: 'ok'; resp: RunResultResponse }
  | { status: 'retryable' }
  | { status: 'rejected' };

/** Bank an active run. `runId` is the client-generated idempotency id — pass
 *  the SAME one on every retry of the same run. */
export async function postRunResult(
  outcome: RunOutcome,
  depthReached: number,
  haul: GearItem[] = [],
  runId?: string
): Promise<PostRunResult> {
  try {
    const res = await fetch('/api/run/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, depthReached, haul, runId }),
    });
    if (res.ok) return { status: 'ok', resp: (await res.json()) as RunResultResponse };
    if (res.status === 429 || res.status >= 500) {
      console.warn(`[delve] /api/run/result ${res.status} — queued for retry`);
      return { status: 'retryable' };
    }
    console.warn(`[delve] /api/run/result rejected (HTTP ${res.status})`);
    return { status: 'rejected' };
  } catch (err) {
    console.warn('[delve] /api/run/result unreachable — queued for retry', err);
    return { status: 'retryable' };
  }
}
