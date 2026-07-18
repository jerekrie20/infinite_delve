// Hero persistence and progression for the idle looter. The canonical hero
// lives in Redis under `hero:{userId}`. On app-open the server auto-collects
// offline idle gains (since `lastSeenAt`); active runs are banked via applyRun.
// Reward values are server-computed from the shared wave formula, so the client
// is never trusted on amounts (v0 still trusts *depth reached*).

import { redis } from '@devvit/web/server';
import type { GearItem, GearSlot, Hero, HeroClass, RunOutcome } from '../../shared/delve';
import { computeIdle, runReward, type IdleGains } from '../../shared/waves';

/** Persisted subset (Redis). Derived combat stats are recomputed on read. */
export interface StoredHero {
  class: HeroClass;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** Deepest depth ever banked; drives the idle rate. */
  bestDepth: number;
  /** Epoch ms of last interaction; offline idle accrues from here. */
  lastSeenAt: number;
  stash: GearItem[];
  equipped: Partial<Record<GearSlot, GearItem>>;
}

export interface RunGained {
  gold: number;
  xp: number;
  levelsGained: number;
  bestDepth: number;
}

/** v0 hero tuning — Squire baseline (all cheap to tune in Step 4). */
export const HERO_CONFIG = {
  baseMaxHp: 30,
  hpPerLevel: 8,
  baseAttack: 6,
  attackPerLevel: 1,
  levelCap: 100,
  maxDefensePct: 75,
} as const;

export const heroKey = (userId: string): string => `hero:${userId}`;

/** XP needed to advance *from* the given level (rising curve, per FINALIZE #28). */
export const xpToNext = (level: number): number =>
  Math.round(20 * Math.pow(level, 1.5));

function newStoredHero(): StoredHero {
  const maxHp = HERO_CONFIG.baseMaxHp;
  return {
    class: 'squire',
    level: 1,
    xp: 0,
    hp: maxHp,
    maxHp,
    gold: 0,
    bestDepth: 1,
    lastSeenAt: Date.now(),
    stash: [],
    equipped: {},
  };
}

/** Derive maxHp / attack / defense from level + equipped gear, then clamp hp. */
function recompute(h: StoredHero): void {
  let maxHp = HERO_CONFIG.baseMaxHp + HERO_CONFIG.hpPerLevel * (h.level - 1);
  for (const item of Object.values(h.equipped)) {
    maxHp += item?.stats.maxHp ?? 0;
  }
  h.maxHp = maxHp;
  if (h.hp > maxHp) h.hp = maxHp;
}

function derivedAttack(h: StoredHero): number {
  let attack =
    HERO_CONFIG.baseAttack + HERO_CONFIG.attackPerLevel * (h.level - 1);
  for (const item of Object.values(h.equipped)) {
    attack += item?.stats.attack ?? 0;
  }
  return attack;
}

function derivedDefense(h: StoredHero): number {
  let def = 0;
  for (const item of Object.values(h.equipped)) {
    def += item?.stats.defensePct ?? 0;
  }
  return Math.min(def, HERO_CONFIG.maxDefensePct);
}

/** Shape a StoredHero into the client-facing Hero (adds derived stats). */
export function toHero(h: StoredHero): Hero {
  return {
    class: h.class,
    level: h.level,
    xp: h.xp,
    xpToNext: xpToNext(h.level),
    hp: h.hp,
    maxHp: h.maxHp,
    attack: derivedAttack(h),
    defense: derivedDefense(h),
    gold: h.gold,
    bestDepth: h.bestDepth,
    stash: h.stash,
    equipped: h.equipped,
  };
}

/** Add XP, applying rising-curve level-ups (capped). Returns levels gained. */
export function awardXp(h: StoredHero, xp: number): number {
  let gained = 0;
  h.xp += Math.max(0, Math.round(xp));
  while (h.level < HERO_CONFIG.levelCap && h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level += 1;
    gained += 1;
  }
  if (h.level >= HERO_CONFIG.levelCap) h.xp = 0;
  recompute(h);
  h.hp = h.maxHp; // heal to full on level-up / between runs
  return gained;
}

/** Offline idle: award gains accrued since `lastSeenAt`, then stamp now.
 *  Mutates the hero; returns the summary the client shows as "Welcome back". */
export function collectIdle(h: StoredHero): IdleGains {
  const now = Date.now();
  const elapsedSeconds = (now - h.lastSeenAt) / 1000;
  const gains = computeIdle(h.bestDepth, elapsedSeconds);
  h.gold += gains.gold;
  if (gains.xp > 0) awardXp(h, gains.xp); // may level; heals to full
  h.lastSeenAt = now;
  return gains;
}

/** Bank the outcome of an active run. Extract → award reward for depths cleared
 *  + raise bestDepth. Death → nothing banked, bestDepth unchanged, revive. */
export function applyRun(h: StoredHero, outcome: RunOutcome, depthReached: number): RunGained {
  const depth = Math.max(0, Math.floor(depthReached));
  h.lastSeenAt = Date.now();

  if (outcome !== 'extracted') {
    h.hp = h.maxHp; // hero persists; unbanked loot is the stake
    return { gold: 0, xp: 0, levelsGained: 0, bestDepth: h.bestDepth };
  }

  const reward = runReward(depth);
  h.gold += reward.gold;
  const levelsGained = awardXp(h, reward.xp); // heals to full
  if (depth > h.bestDepth) h.bestDepth = depth;
  return { gold: reward.gold, xp: reward.xp, levelsGained, bestDepth: h.bestDepth };
}

// ---- Redis I/O ------------------------------------------------------------

export async function getOrCreateHero(userId: string): Promise<StoredHero> {
  const raw = await redis.get(heroKey(userId));
  if (raw) {
    const h = JSON.parse(raw) as StoredHero;
    // Back-fill fields added after a hero was first stored.
    if (typeof h.bestDepth !== 'number') h.bestDepth = 1;
    if (typeof h.lastSeenAt !== 'number') h.lastSeenAt = Date.now();
    recompute(h); // keep derived maxHp consistent with current gear/level
    return h;
  }
  const h = newStoredHero();
  await saveHero(userId, h);
  return h;
}

export async function saveHero(userId: string, h: StoredHero): Promise<void> {
  await redis.set(heroKey(userId), JSON.stringify(h));
}
