// Passive POOLS — shared infrastructure for both monsters AND players.
// Each pool is a themed group of behavioral stats split into three tiers;
// an entity's "power level" (monster rarity, player class level, etc.)
// determines how many tiers and how many passives are drawn.
//
// Uses the SAME StatId vocabulary + handler dispatch as hero gear — a
// skeleton with thornsPct and a player with the same passive run the
// identical reflectPercent handler. Pure data — no engine imports.
//
// Pattern mirrors gear affix pools (items.ts): pickN() from flat StatId[]
// arrays, tier→count gating, affixValue() for scaling.

import type { MonsterRarity } from '../delve';
import { STATS, type StatId } from './stats';
import { type Rng, pickN, affixValue } from './items';

// ---- Tier + pool types --------------------------------------------------------

export type PassiveTier = 'tier1' | 'tier2' | 'tier3';

export interface PassivePool {
  id: string;
  tiers: Record<PassiveTier, StatId[]>;
}

// ---- The pools (monster themes + player classes) ------------------------------

export const PASSIVE_POOLS: Record<string, PassivePool> = {
  // ── Monster themes ─────────────────────────────────────────────────
  goblinoid: {
    id: 'goblinoid',
    tiers: {
      tier1: ['hpRegen'],
      tier2: ['doubleStrikeChance', 'counterAttackPct'],
      tier3: ['explodeOnKill'],
    },
  },
  undead: {
    id: 'undead',
    tiers: {
      tier1: ['hpRegen', 'thornsPct'],
      tier2: ['blockChance', 'lifestealPct'],
      tier3: ['reviveChance'],
    },
  },
  swarm: {
    id: 'swarm',
    tiers: {
      tier1: ['hpRegen', 'dodgeChance'],
      tier2: ['lifestealPct'],
      tier3: ['executeThreshold', 'explodeOnKill'],
    },
  },
  brute: {
    id: 'brute',
    tiers: {
      tier1: ['thornsPct'],
      tier2: ['blockChance', 'counterAttackPct'],
      tier3: ['doubleStrikeChance'],
    },
  },

  // ── Monster themes 31-60 (Phase 2 roster expansion) ───────────────
  deep: {
    id: 'deep',
    tiers: {
      tier1: ['dodgeChance'],
      tier2: ['lifestealPct', 'slowOnHitPct'],
      tier3: ['executeThreshold', 'statusResist'],
    },
  },
  volcanic: {
    id: 'volcanic',
    tiers: {
      tier1: ['thornsPct'],
      tier2: ['burnChance', 'counterAttackPct'],
      tier3: ['explodeOnKill', 'doubleStrikeChance'],
    },
  },
  abyss: {
    id: 'abyss',
    tiers: {
      tier1: ['statusResist', 'hpRegen'],
      tier2: ['startingShield', 'slowOnHitPct'],
      tier3: ['reviveChance', 'executeThreshold'],
    },
  },

  // ── Player class innate passives ───────────────────────────────────
  // (staged — rolls when the class system gains passive support)
  squire: {
    id: 'squire',
    tiers: {
      tier1: ['hpRegen'],
      tier2: ['thornsPct', 'dodgeChance'],
      tier3: ['counterAttackPct', 'blockChance'],
    },
  },
};

// ---- Entity gating rules ------------------------------------------------------

/** How many passives a monster rolls by rarity. */
export const MONSTER_RARITY_RULES: Record<MonsterRarity, { tiers: number; count: [number, number] }> = {
  normal: { tiers: 0, count: [0, 0] },
  elite:  { tiers: 2, count: [1, 2] },
  boss:   { tiers: 3, count: [2, 3] },
};

/** How many passives a player rolls by level bracket (future — staged). */
export const PLAYER_LEVEL_RULES: Record<string, { tiers: number; count: [number, number] }> = {
  '1-9':   { tiers: 0, count: [0, 0] },
  '10-19': { tiers: 1, count: [1, 1] },
  '20-29': { tiers: 2, count: [1, 2] },
  '30+':   { tiers: 3, count: [2, 3] },
};

// ---- Core roll function (entity-agnostic) -------------------------------------

/** Roll a passive value scaled for monsters. Flat stats use budget × perBudget
 *  (same as gear); pct stats derive their percentage from the budget so a boss
 *  at depth 20 rolls meaningful values (e.g. 15-30% doubleStrikeChance). */
function monsterPassiveValue(stat: StatId, budget: number, rng: Rng): number {
  const def = STATS[stat];
  if (def.pct) {
    // Map budget to a pct band: budget 4→~5-12%, budget 10→~12-25%, budget 16→~18-35%.
    const lo = Math.max(3, Math.round(budget * 1.2));
    const hi = Math.max(lo + 5, Math.round(budget * 2.5));
    const v = Math.max(1, Math.round(lo + rng() * (hi - lo)));
    return def.max !== undefined ? Math.min(v, def.max) : v;
  }
  return affixValue(stat, budget, 1, rng);
}

/** Roll passive stats from any pool with explicit gating. The core function —
 *  both monster and player paths call this. */
export function rollFromPool(
  poolId: string,
  tiers: number,
  countRange: [number, number],
  budget: number,
  rng: Rng,
): Partial<Record<StatId, number>> {
  const pool = PASSIVE_POOLS[poolId];
  if (!pool || tiers === 0) return {};

  // Merge eligible tiers into one flat candidate list.
  const tierOrder: PassiveTier[] = ['tier1', 'tier2', 'tier3'];
  const candidates: StatId[] = [];
  for (let i = 0; i < tiers; i++) {
    candidates.push(...pool.tiers[tierOrder[i]!]!);
  }

  // Random count within [min, max], capped at pool size.
  const [lo, hi] = countRange;
  const count = Math.min(lo + Math.floor(rng() * (hi - lo + 1)), candidates.length);
  if (count <= 0) return {};

  const picked = pickN(candidates, count, rng);
  const out: Partial<Record<StatId, number>> = {};
  for (const stat of picked) {
    out[stat] = monsterPassiveValue(stat, budget, rng);
  }
  return out;
}

// ---- Convenience wrappers -----------------------------------------------------

/** Roll passives for a monster spawn (uses MONSTER_RARITY_RULES). */
export function rollMonsterPassives(
  poolId: string,
  rarity: MonsterRarity,
  budget: number,
  rng: Rng,
): Partial<Record<StatId, number>> {
  const rule = MONSTER_RARITY_RULES[rarity];
  if (!rule || rule.tiers === 0) return {};
  return rollFromPool(poolId, rule.tiers, rule.count, budget, rng);
}

/** Roll innate passives for a player class at a given level (staged). */
export function rollPlayerPassives(
  poolId: string,
  level: number,
  budget: number,
  rng: Rng,
): Partial<Record<StatId, number>> {
  const bracket = level >= 30 ? '30+' : level >= 20 ? '20-29' : level >= 10 ? '10-19' : '1-9';
  const rule = PLAYER_LEVEL_RULES[bracket];
  if (!rule || rule.tiers === 0) return {};
  return rollFromPool(poolId, rule.tiers, rule.count, budget, rng);
}
