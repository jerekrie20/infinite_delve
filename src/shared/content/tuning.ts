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
  /** Ceiling for elite chance after depth scaling (FORMULAS "cap 40%"). */
  eliteChanceCap: number;
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
  /** Compound scaling: depth past this threshold applies exponential growth ⚙. */
  compoundThreshold: number;
  /** HP compound exponent: hp *= compoundHpExp^max(0, d−threshold) (FORMULAS 1.035). */
  compoundHpExp: number;
  /** ATK compound exponent (FORMULAS 1.03). */
  compoundAtkExp: number;
  /** Gold/XP compound exponent (FORMULAS 1.02 — rewards grow slower than stats). */
  compoundRewardExp: number;
  /** Mini-boss extra passive tier beyond elite (D6: forced elevated elite). */
  miniBossExtraPassiveTier: number;
}

export interface CombatTuning {
  /** Fixed combat-clock step in ms (FORMULAS "Combat clock", D32). */
  tickMs: number;
  /** Hard cap on total attackSpeedPct (FORMULAS: +50 ⚙). */
  attackSpeedCapPct: number;
  /** Absolute floor on any effective attack interval (FORMULAS: 1.0s). */
  minAttackIntervalMs: number;
  /** Extra pack budget per enemy beyond the first (FORMULAS floor budget:
   *  total = floorBudget × (1 + this × (n−1))). */
  packBonusPerExtra: number;
  /** Base crit probability, 0..1, before gear's critChance% stat adds on top. */
  critChance: number;
  /** Crit damage multiplier. */
  critMultiplier: number;
  /** Damage jitter, ± this fraction (0.05 = ±5%, D35). */
  damageVariance: number;
  /** Fraction of maxHp the hero heals after each kill — lets runs breathe so
   *  the wall is a deep soft cap, not an instant depth-3 death. */
  healOnKillPct: number;
}

export interface StatusTuning {
  /** Statuses tick (DoT, regen, duration) on this sub-clock, ms. */
  tickMs: number;
  /** Max active statuses per side; applications beyond it are dropped. */
  capPerSide: number;
  /** Shield pool ceiling as a fraction of owner maxHp (0.5 = 50%). */
  shieldCapPctMaxHp: number;
  /** Bosses' innate resist vs STUN only, whole percent. */
  bossStunResistPct: number;
  /** Each successful stun within this window halves the next stun's duration. */
  stunHalvingWindowMs: number;
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

export interface PlausibilityTuning {
  /** Absolute ceiling on any reported depth (grief stop, not balance). */
  hardDepthCap: number;
  /** Depth a level-1 hero with no gear could plausibly reach. */
  depthBase: number;
  /** Extra plausible depth per hero level past 1. */
  depthPerLevel: number;
  /** Equipped gearScore points per extra plausible depth. */
  gearScorePerDepth: number;
  /** Fastest believable clear pace — one depth per this many seconds. */
  minSecondsPerFloor: number;
}

export interface Tuning {
  hero: HeroTuning;
  monster: MonsterTuning;
  combat: CombatTuning;
  statuses: StatusTuning;
  idle: IdleTuning;
  items: ItemTuning;
  plausibility: PlausibilityTuning;
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
    eliteChanceCap: 0.4,
    eliteHpMult: 3.5,
    eliteAtkMult: 1.5,
    eliteRewardMult: 4.0,
    bossHpMult: 10.0,
    bossAtkMult: 2.5,
    bossRewardMult: 12.0,
    passiveBudgetBase: 4,
    passiveBudgetPerDepth: 0.3,
    // Compound scaling past depth 30 (FORMULAS monster section)
    compoundThreshold: 30,
    compoundHpExp: 1.035,
    compoundAtkExp: 1.03,
    compoundRewardExp: 1.02,
    // Mini-boss: one extra passive tier beyond elite
    miniBossExtraPassiveTier: 1,
  },
  combat: {
    tickMs: 100,
    attackSpeedCapPct: 50,
    minAttackIntervalMs: 1000,
    packBonusPerExtra: 0.15,
    critChance: 0.05,
    critMultiplier: 1.5,
    damageVariance: 0.05,
    healOnKillPct: 0.45,
  },
  statuses: {
    tickMs: 1000,
    capPerSide: 8,
    shieldCapPctMaxHp: 0.5,
    bossStunResistPct: 40,
    stunHalvingWindowMs: 10000,
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
  plausibility: {
    // Deliberately 2-3× generous vs the real wall (~depth 10 fresh): this
    // stops depth-100000 leaderboard grief, not subtle cheating — replay
    // verification (Phase 7) is the real anti-cheat. FORMULAS "Anti-cheat
    // depth plausibility" bullet mirrors these ⚙ values.
    hardDepthCap: 2000,
    depthBase: 15,
    depthPerLevel: 3,
    gearScorePerDepth: 10,
    minSecondsPerFloor: 2,
  },
};
