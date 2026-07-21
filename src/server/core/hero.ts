// Hero persistence and progression for the idle looter. The canonical hero
// lives in Redis under `hero:{userId}`. On app-open the server auto-collects
// offline idle gains (since `lastSeenAt`); active runs are banked via applyRun.
// Reward values are server-computed from the shared wave formula, so the client
// is never trusted on amounts (v0 still trusts *depth reached*).

import { redis } from '@devvit/web/server';
import type { GearItem, GearSlot, Hero, HeroClass, RunOutcome } from '../../shared/delve';
import { computeIdle, runReward, type IdleGains } from '../../shared/waves';
import { TUNING } from '../../shared/content/tuning';
import { classDef } from '../../shared/content/classes';
import { sellValue } from '../../shared/content/items';
import {
  bankHaul as bankHaulState,
  deriveStats,
  equipItem as equipItemState,
  sellItem as sellItemState,
  unequipSlot as unequipSlotState,
} from '../../shared/content/gear';

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

// ---- GearItem migration: old keys → lean keys --------------------------------

/** Migrate a single item from the old stored shape (`name`, `rarity`, `stats`)
 *  to the lean v2 shape (`r`, `s`, name rebuilt on read). Idempotent — items
 *  already in the new shape pass through unchanged. */
function migrateItem(raw: Record<string, unknown>): GearItem | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.slot !== 'string') return null;
  // Old key `rarity` → new key `r`; new key wins if both present.
  const r = (raw.r ?? raw.rarity ?? 'common') as GearItem['r'];
  // Old key `stats` → new key `s`; new key wins if both present.
  const s = (raw.s ?? raw.stats ?? {}) as GearItem['s'];
  return {
    id: raw.id as string,
    slot: raw.slot as GearSlot,
    r,
    base: (raw.base as string) ?? 'blade',
    ...(raw.set ? { set: raw.set as string } : {}),
    ...(raw.unique ? { unique: raw.unique as string } : {}),
    s,
  };
}

function migrateGearArray(arr: unknown): GearItem[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((it) => migrateItem(it as Record<string, unknown>)).filter(Boolean) as GearItem[];
}

function migrateGearRecord(obj: unknown): Partial<Record<GearSlot, GearItem>> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Partial<Record<GearSlot, GearItem>> = {};
  for (const [slot, raw] of Object.entries(obj as Record<string, unknown>)) {
    const item = migrateItem(raw as Record<string, unknown>);
    if (item) out[slot as GearSlot] = item;
  }
  return out;
}

export interface RunGained {
  gold: number;
  xp: number;
  levelsGained: number;
  bestDepth: number;
  /** How many gear items the run's haul added to the hero (extract only). */
  itemsBanked: number;
  /** How many of those were auto-equipped (beat the current slot item). */
  itemsEquipped: number;
}

export const heroKey = (userId: string): string => `hero:${userId}`;

/** XP needed to advance *from* the given level (rising curve). */
export const xpToNext = (level: number): number =>
  Math.round(TUNING.hero.xpCurveBase * Math.pow(level, TUNING.hero.xpCurveExp));

function newStoredHero(): StoredHero {
  const maxHp = classDef('squire').baseMaxHp;
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

/** Recompute maxHp from class + level + gear (shared derive), then clamp hp. */
function recompute(h: StoredHero): void {
  h.maxHp = deriveStats(h.class, h.level, h.equipped).maxHp;
  if (h.hp > h.maxHp) h.hp = h.maxHp;
}

/** Shape a StoredHero into the client-facing Hero (adds derived stats). */
export function toHero(h: StoredHero): Hero {
  const d = deriveStats(h.class, h.level, h.equipped);
  return {
    class: h.class,
    level: h.level,
    xp: h.xp,
    xpToNext: xpToNext(h.level),
    hp: h.hp,
    maxHp: h.maxHp,
    attack: d.attack,
    defense: d.defensePct,
    critChance: d.critChance,
    lifesteal: d.lifestealPct,
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
  while (h.level < TUNING.hero.levelCap && h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level += 1;
    gained += 1;
  }
  if (h.level >= TUNING.hero.levelCap) h.xp = 0;
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

/** Equip a stash item by id (shared op) + recompute. False if id not in stash. */
export function equipItem(h: StoredHero, itemId: string): boolean {
  const ok = equipItemState(h, itemId);
  if (ok) recompute(h);
  return ok;
}

/** Unequip a slot back to the stash (shared op) + recompute. False if empty. */
export function unequipSlot(h: StoredHero, slot: GearSlot): boolean {
  const ok = unequipSlotState(h, slot);
  if (ok) recompute(h);
  return ok;
}

/** Sell a stash item for gold. Returns gold gained (0 if not in stash). No stat
 *  recompute needed — the stash doesn't affect derived stats. */
export function sellItem(h: StoredHero, itemId: string): number {
  const item = sellItemState(h, itemId);
  if (!item) return 0;
  const gold = sellValue(item);
  h.gold += gold;
  return gold;
}

/** Bank a run's gear haul (shared best-first auto-equip + stash) + recompute.
 *  Returns how many were auto-equipped. */
export function bankHaul(h: StoredHero, haul: GearItem[]): number {
  const equippedCount = bankHaulState(h, haul);
  recompute(h);
  return equippedCount;
}

/** Bank the outcome of an active run. Extract → award reward for depths cleared,
 *  bank the gear haul (auto-equip better), raise bestDepth. Death → nothing
 *  banked (the haul is the stake), bestDepth unchanged, revive. */
export function applyRun(
  h: StoredHero,
  outcome: RunOutcome,
  depthReached: number,
  haul: GearItem[] = []
): RunGained {
  const depth = Math.max(0, Math.floor(depthReached));
  h.lastSeenAt = Date.now();

  if (outcome !== 'extracted') {
    h.hp = h.maxHp; // hero persists; the unbanked haul is the stake
    return { gold: 0, xp: 0, levelsGained: 0, bestDepth: h.bestDepth, itemsBanked: 0, itemsEquipped: 0 };
  }

  const reward = runReward(depth);
  h.gold += reward.gold;
  const levelsGained = awardXp(h, reward.xp); // heals to full
  const itemsEquipped = bankHaul(h, haul); // may raise maxHp via gear
  h.hp = h.maxHp; // top off after gear changes
  if (depth > h.bestDepth) h.bestDepth = depth;
  return {
    gold: reward.gold,
    xp: reward.xp,
    levelsGained,
    bestDepth: h.bestDepth,
    itemsBanked: haul.length,
    itemsEquipped,
  };
}

// ---- Redis I/O ------------------------------------------------------------

export async function getOrCreateHero(userId: string): Promise<StoredHero> {
  const raw = await redis.get(heroKey(userId));
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Back-fill fields added after a hero was first stored.
    if (typeof parsed.bestDepth !== 'number') parsed.bestDepth = 1;
    if (typeof parsed.lastSeenAt !== 'number') parsed.lastSeenAt = Date.now();
    // Migrate old-format gear items (name/rarity/stats → r/s) to the lean v2 shape.
    parsed.stash = migrateGearArray(parsed.stash);
    parsed.equipped = migrateGearRecord(parsed.equipped);
    const h = parsed as unknown as StoredHero;
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
