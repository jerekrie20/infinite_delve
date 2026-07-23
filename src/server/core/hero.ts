// Hero progression logic for the idle looter — PURE (no Redis import, so tests
// and tools can drive it directly). The canonical hero lives in Redis under
// `hero:{userId}`; ALL I/O goes through heroStore.ts's `updateHero` CAS loop,
// which hands these functions a loaded hero to mutate. On app-open the server
// auto-collects offline idle gains (since `lastSeenAt`); active runs are
// banked via applyRun. Reward values are server-computed from the shared wave
// formula, so the client is never trusted on amounts.

import type { GearItem, GearSlot, Hero, RunOutcome } from '../../shared/delve';
import { computeIdle, runReward, type IdleGains } from '../../shared/waves';
import { TUNING } from '../../shared/content/tuning';
import { sellValue } from '../../shared/content/items';
import type { StoredHero } from './heroSchema';
import {
  bankHaul as bankHaulState,
  deriveStats,
  equipItem as equipItemState,
  sellItem as sellItemState,
  unequipSlot as unequipSlotState,
} from '../../shared/content/gear';
import { unlockedAbilities } from '../../shared/content/actives';

// The persisted shape + versioned migrations live in heroSchema.ts (pure,
// fixture-tested). Re-exported so route/tool code has one import site.
export { STORED_HERO_VERSION, migrateStoredHero, newStoredHero } from './heroSchema';
export type { StoredHero } from './heroSchema';

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

/** XP needed to advance *from* the given level (rising curve). */
export const xpToNext = (level: number): number =>
  Math.round(TUNING.hero.xpCurveBase * Math.pow(level, TUNING.hero.xpCurveExp));

/** Recompute maxHp from class + level + gear (shared derive), then clamp hp.
 *  Exported for the heroStore load path (fresh reads recompute before mutate). */
export function recompute(h: StoredHero): void {
  h.maxHp = deriveStats(h.class, h.level, h.equipped).maxHp;
  if (h.hp > h.maxHp) h.hp = h.maxHp;
}

/** Shape a StoredHero into the client-facing Hero (adds derived stats). */
export function toHero(h: StoredHero): Hero {
  const d = deriveStats(h.class, h.level, h.equipped);
  const maxMana = TUNING.hero.baseMana + TUNING.hero.manaPerLevel * (h.level - 1);
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
    critMultiplier: d.critMultiplier,
    lifesteal: d.lifestealPct,
    dodge: d.dodgeChance,
    hpRegen: d.hpRegen,
    goldFind: d.goldFindPct,
    mana: maxMana, // mana resets to full on read (between runs)
    maxMana,
    abilities: unlockedAbilities(h.class, h.level),
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

