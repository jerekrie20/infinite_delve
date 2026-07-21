// Single source of truth for every gameplay NUMBER. Game systems read from
// TUNING; the balance sandbox (tools/) clones + mutates it to preview outcomes.
// Pure data — no logic, no imports. Per-class base stats live in classes.ts;
// this holds the global rules + curves.

export interface HeroTuning {
  /** Hard level ceiling. */
  levelCap: number;
  /** xpToNext(level) = xpCurveBase * level ^ xpCurveExp. */
  xpCurveBase: number;
  xpCurveExp: number;
  /** Base mana at level 1. */
  baseMana: number;
  /** Extra mana per level. */
  manaPerLevel: number;
  /** Fraction of max mana regenerated per second (0.04 = 4%/s). */
  manaRegenPct: number;
}

export interface MonsterTuning {
  baseHp: number;
  hpPerDepth: number;
  baseAttack: number;
  attackPerDepth: number;
  baseXp: number;
  xpPerDepth: number;
  baseGold: number;
  goldPerDepth: number;
  /** Base chance (0..1) a non-boss spawn is elite. */
  eliteChance: number;
  /** Extra elite chance per depth (additive). */
  eliteChancePerDepth: number;
  /** Multipliers by rarity tier for stats and rewards. */
  eliteHpMult: number;
  eliteAtkMult: number;
  eliteRewardMult: number;
  bossHpMult: number;
  bossAtkMult: number;
  bossRewardMult: number;
  /** Budget for rolling passive stat values. */
  passiveBudgetBase: number;
  passiveBudgetPerDepth: number;
}

export interface CombatTuning {
  /** Ms between auto-attack exchanges. */
  attackIntervalMs: number;
  /** Base crit probability, 0..1, before gear's critChance% stat adds on top. */
  critChance: number;
  /** Crit damage multiplier. */
  critMultiplier: number;
  /** Damage jitter, ± this fraction (0.1 = ±10%). */
  damageVariance: number;
  /** Fraction of maxHp the hero heals after each kill — lets runs breathe so
   *  the wall is a deep soft cap, not an instant depth-3 death. */
  healOnKillPct: number;
}

export interface IdleTuning {
  /** Offline gains stop accruing after this (the daily check-in cap). */
  maxIdleSeconds: number;
  /** Idle pace: passively clears ~one monster this often. */
  secondsPerKill: number;
}

export interface ItemTuning {
  /** Per-kill chance a monster drops gear, 0..1. */
  dropChance: number;
  /** Multiplies dropChance on swarm (spike) kills. */
  swarmDropMult: number;
  /** Stat budget of a common item at depth 0 (before depth + rarity scaling). */
  budgetBase: number;
  /** Extra stat budget per depth. */
  budgetPerDepth: number;
  /** Fraction of full budget each rolled affix gets (primary gets the full budget). */
  affixBudgetFrac: number;
  /** Base chance an item drops as a UNIQUE, 0..1, at depth 0. */
  uniqueChance: number;
  /** Extra unique chance per depth (additive). Capped by uniqueChanceCap. */
  uniqueChancePerDepth: number;
  /** Ceiling for unique chance after depth scaling. */
  uniqueChanceCap: number;
  /** Base chance a set-MEMBER base drops as a set item, 0..1, at depth 0. */
  setChance: number;
  /** Extra set chance per depth (additive). Capped by setChanceCap. */
  setChancePerDepth: number;
  /** Ceiling for set chance after depth scaling. */
  setChanceCap: number;
  /** Fraction of an item's combat value returned as gold when sold. */
  sellValueMult: number;
}

export interface Tuning {
  hero: HeroTuning;
  monster: MonsterTuning;
  combat: CombatTuning;
  idle: IdleTuning;
  items: ItemTuning;
}

/** The live values. Treated as read-only at runtime; the sandbox works on a clone. */
export const TUNING: Tuning = {
  hero: {
    levelCap: 100,
    xpCurveBase: 20,
    xpCurveExp: 1.5,
    baseMana: 50,
    manaPerLevel: 5,
    manaRegenPct: 0.04,
  },
  monster: {
    // Gentle HP/attack scaling so a fixed-attack fresh hero reaches ~depth 10;
    // gear/levels push the wall deeper (rewards — gold/xp — kept at v0 pace).
    // Sim-tuned (candidate D); refine in the balance sandbox.
    baseHp: 7,
    hpPerDepth: 2.2,
    baseAttack: 2,
    attackPerDepth: 0.5,
    baseXp: 4,
    xpPerDepth: 2,
    baseGold: 3,
    goldPerDepth: 2,
    // Monster rarity system
    eliteChance: 0.05,
    eliteChancePerDepth: 0.001,
    eliteHpMult: 3.5,
    eliteAtkMult: 1.5,
    eliteRewardMult: 4.0,
    bossHpMult: 10.0,
    bossAtkMult: 2.5,
    bossRewardMult: 12.0,
    passiveBudgetBase: 4,
    passiveBudgetPerDepth: 0.3,
  },
  combat: {
    attackIntervalMs: 2000,
    critChance: 0.05,
    critMultiplier: 1.5,
    damageVariance: 0.1,
    healOnKillPct: 0.45,
  },
  idle: {
    maxIdleSeconds: 8 * 60 * 60,
    secondsPerKill: 60,
  },
  items: {
    dropChance: 0.2,
    swarmDropMult: 2,
    budgetBase: 3,
    budgetPerDepth: 0.8,
    affixBudgetFrac: 0.5,
    // Uniques: 1% base, +0.02%/depth → ~3% by depth 100, capped at 5%
    uniqueChance: 0.01,
    uniqueChancePerDepth: 0.0002,
    uniqueChanceCap: 0.05,
    // Sets: 5% base, +0.05%/depth → ~10% by depth 100, capped at 15%
    setChance: 0.05,
    setChancePerDepth: 0.0005,
    setChanceCap: 0.15,
    sellValueMult: 0.5,
  },
};
