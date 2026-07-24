// The STAT REGISTRY — the single, data-driven source of truth for every stat a
// hero or a piece of gear can carry. This is the "logic" half of the data/logic
// split: combine RULES + hook POINTS live here, written once. Adding a stat that
// reuses an existing op+target (flat/pct) or an existing hook+handler (behavioral)
// is one row + listing it in a pool — no engine code.
//
// Two classes of stat:
//   • STRUCTURAL (kind: 'flat') — feeds a DerivedId. The generic fold in
//     deriveStats does  derived = (base + Σflat) × (1 + Σpct/100)  per target.
//     Adding ATK%, HP%, or a new pct modifier requires ZERO engine changes.
//   • BEHAVIORAL (kind: 'behavioral') — declares a `hook` and `handler`.
//     LaneScene dispatches derived stats through the handler table at each hook
//     point. Adding "Thorns" = one registry row + one ~5-line handler function.
//
// CRIT uses a PoE-style two-stat model so it stays valuable deep into the game:
//   baseCritChance     (flat, rare)  — "+2% base crit" is a chase roll
//   increasedCritPct   (pct, common) — "% increased crit chance" on regular gear
//   critChance = min(baseCritChance × (1 + increasedCritPct/100), critCap)
//   critMultiplier     (flat)        — boosts the 1.5× default

/** Stats that can appear on gear / in pools (extend the union + add a row). */
export type StatId =
  // ── Core flat/pct ──────────────────────────────────────────────
  | 'attack'
  | 'attackPct'
  | 'maxHp'
  | 'maxHpPct'
  | 'defensePct'
  // ── Crit engine (PoE: base × increased%) ───────────────────────
  | 'baseCritChance'
  | 'increasedCritPct'
  | 'critMultiplier'
  // ── Defense layers ─────────────────────────────────────────────
  | 'damageReductionPct'
  // ── Offense (behavioral) ───────────────────────────────────────
  | 'lifestealPct'
  | 'manaLeechPct'
  | 'critDamageBurst'
  | 'doubleStrikeChance'
  | 'cleavePct'
  | 'executeThreshold'
  | 'poisonChance'
  | 'poisonDamage'
  | 'armorPierce'
  | 'accuracy'
  // ── Defense & sustain (behavioral) ─────────────────────────────
  | 'dodgeChance'
  | 'thornsPct'
  | 'blockChance'
  | 'blockAmount'
  | 'counterAttackPct'
  | 'blockHeal'
  | 'critHeal'
  | 'reviveChance'
  | 'shieldLeechPct'
  | 'statusResist'
  // ── Sustain (behavioral) ───────────────────────────────────────
  | 'healOnKillPct'
  | 'explodeOnKill'
  | 'hpRegen'
  | 'hpRegenPct'
  // ── Combat clock (structural — read by the attack timer) ───────
  | 'attackSpeedPct'
  // ── Caster (structural — read by ability dispatch / mana tick) ──
  | 'abilityPowerPct'
  | 'maxMana'
  | 'maxManaPct'
  | 'manaRegenPct'
  | 'cooldownReductionPct'
  // ── Status appliers (behavioral — apply catalog statuses) ──────
  | 'burnChance'
  | 'bleedChance'
  | 'slowOnHitPct'
  | 'shockChance'
  // ── Utility (behavioral) ───────────────────────────────────────
  | 'goldFindPct'
  | 'xpBonusPct'
  | 'itemDropChance'
  | 'rareEnemyChance'
  // ── Combat start (behavioral) ──────────────────────────────────
  | 'startingShield'
  | 'preemptiveStrike';

/** Derived combat quantities the engine outputs and combat reads. */
export type DerivedId =
  | 'attack'
  | 'maxHp'
  | 'defensePct'
  | 'baseCritChance'
  | 'increasedCritPct'
  | 'critMultiplier'
  | 'critChance'        // computed: baseCritChance × (1 + increasedCritPct/100), capped
  | 'damageReductionPct'
  | 'lifestealPct'
  | 'dodgeChance'
  | 'thornsPct'
  | 'hpRegen'
  | 'hpRegenPct'
  | 'goldFindPct'
  | 'healOnKillPct'
  // Behavioral stats flipped live for monster passives
  | 'doubleStrikeChance'
  | 'executeThreshold'
  | 'armorPierce'
  | 'counterAttackPct'
  | 'reviveChance'
  | 'critHeal'
  | 'explodeOnKill'
  | 'blockChance'
  // Combat v2 (Phase 1): clock read + status framework stats
  | 'attackSpeedPct'
  // Caster (Phase 3): structural reads at ability dispatch / mana tick
  | 'abilityPowerPct'
  | 'maxMana'
  | 'manaRegenPct'
  | 'cooldownReductionPct'
  | 'poisonChance'
  | 'poisonDamage'
  | 'cleavePct'
  | 'statusResist'
  | 'shieldLeechPct'
  | 'startingShield'
  | 'preemptiveStrike'
  | 'burnChance'
  | 'bleedChance'
  | 'slowOnHitPct'
  | 'shockChance';

export const DERIVED_IDS: DerivedId[] = [
  'attack', 'maxHp', 'defensePct',
  'baseCritChance', 'increasedCritPct', 'critMultiplier', 'critChance',
  'damageReductionPct',
  'lifestealPct', 'dodgeChance', 'thornsPct',
  'hpRegen', 'hpRegenPct',
  'goldFindPct', 'healOnKillPct',
  'doubleStrikeChance', 'executeThreshold', 'armorPierce',
  'counterAttackPct', 'reviveChance', 'critHeal', 'explodeOnKill',
  'blockChance',
  'attackSpeedPct',
  'abilityPowerPct', 'maxMana', 'manaRegenPct', 'cooldownReductionPct',
  'poisonChance', 'poisonDamage', 'cleavePct', 'statusResist',
  'shieldLeechPct', 'startingShield', 'preemptiveStrike',
  'burnChance', 'bleedChance', 'slowOnHitPct', 'shockChance',
];

/** Named combat hook points. A behavioral stat declares which one fires it.
 *  `onLethal` fires ONLY when a hit would kill its owner (revive lives there —
 *  probing revive via onTakeDamage re-fired dodge/block/thorns, the Phase 1
 *  audit bug). */
export type HookPoint =
  | 'onCombatStart'
  | 'onAttack'
  | 'onCrit'
  | 'onDealDamage'
  | 'onTakeDamage'
  | 'onLethal'
  | 'onKill'
  | 'perTick';

export interface StatDef {
  id: StatId;
  name: string;
  abbr: string;
  pct?: boolean;
  target: DerivedId;
  op: 'flat' | 'pct';
  perBudget: number;
  band?: [number, number];
  value: number;
  kind: 'flat' | 'behavioral';
  max?: number;
  implemented?: boolean;
  /** Which hook point fires this behavioral stat (if kind === 'behavioral'). */
  hook?: HookPoint;
  /** Which handler function name to call (must exist in handlers.ts table). */
  handler?: string;
}

/** The full catalog — 51 stats (46 + the Phase 3 caster five: abilityPowerPct,
 *  maxMana, maxManaPct, manaRegenPct, cooldownReductionPct). Order = display
 *  order in gear panel. */
export const STATS: Record<StatId, StatDef> = {
  // ═══════════════════════════════════════════════════════════════════
  // Core flat/pct (always live — the generic fold handles them)
  // ═══════════════════════════════════════════════════════════════════
  attack: {
    id: 'attack', name: 'Attack', abbr: 'ATK',
    target: 'attack', op: 'flat', perBudget: 1, value: 3, kind: 'flat',
  },
  attackPct: {
    id: 'attackPct', name: 'Attack %', abbr: 'ATK', pct: true,
    target: 'attack', op: 'pct', perBudget: 0.6, band: [5, 12],
    value: 4, kind: 'flat', max: 60,
  },
  maxHp: {
    id: 'maxHp', name: 'Health', abbr: 'HP',
    target: 'maxHp', op: 'flat', perBudget: 2.5, value: 1, kind: 'flat',
  },
  maxHpPct: {
    id: 'maxHpPct', name: 'Health %', abbr: 'HP', pct: true,
    target: 'maxHp', op: 'pct', perBudget: 0.6, band: [5, 12],
    value: 4, kind: 'flat', max: 60,
  },
  defensePct: {
    id: 'defensePct', name: 'Defense', abbr: 'DEF', pct: true,
    target: 'defensePct', op: 'flat', perBudget: 0.25, value: 4, kind: 'flat', max: 75,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Crit engine (PoE — base × increased%)
  // ═══════════════════════════════════════════════════════════════════
  baseCritChance: {
    id: 'baseCritChance', name: 'Base Crit', abbr: 'CRIT', pct: true,
    target: 'baseCritChance', op: 'flat', perBudget: 0.12, value: 8, kind: 'flat', max: 20,
  },
  increasedCritPct: {
    id: 'increasedCritPct', name: 'Inc Crit %', abbr: 'CRIT', pct: true,
    target: 'increasedCritPct', op: 'pct', perBudget: 0.5, band: [4, 10],
    value: 5, kind: 'flat', max: 200,
  },
  critMultiplier: {
    id: 'critMultiplier', name: 'Crit Multi', abbr: 'CRIT×',
    target: 'critMultiplier', op: 'flat', perBudget: 0.06,
    value: 10, kind: 'flat', max: 2.5,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Defense layers
  // ═══════════════════════════════════════════════════════════════════
  damageReductionPct: {
    id: 'damageReductionPct', name: 'Dmg Reduction', abbr: 'DR', pct: true,
    target: 'damageReductionPct', op: 'flat', perBudget: 0.2, value: 5, kind: 'flat', max: 50,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Offense — behavioral (onAttack / onCrit / onDealDamage)
  // ═══════════════════════════════════════════════════════════════════
  lifestealPct: {
    id: 'lifestealPct', name: 'Lifesteal', abbr: 'LIFE', pct: true,
    target: 'lifestealPct', op: 'flat', perBudget: 0.3, value: 5,
    kind: 'behavioral', max: 40, hook: 'onDealDamage', handler: 'healPercent',
  },
  manaLeechPct: {
    id: 'manaLeechPct', name: 'Mana Leech', abbr: 'MANA', pct: true,
    target: 'lifestealPct', op: 'flat', perBudget: 0.25, value: 4,
    kind: 'behavioral', max: 30, hook: 'onDealDamage', handler: 'manaPercent',
    implemented: false,
  },
  critDamageBurst: {
    id: 'critDamageBurst', name: 'Crit Burst', abbr: 'BURST', pct: true,
    target: 'attack', op: 'flat', perBudget: 0.3, value: 8,
    kind: 'behavioral', max: 60, hook: 'onCrit', handler: 'splashAoE',
    implemented: false,
  },
  doubleStrikeChance: {
    id: 'doubleStrikeChance', name: 'Double Strike', abbr: 'DBL', pct: true,
    target: 'doubleStrikeChance', op: 'flat', perBudget: 0.2, value: 8,
    kind: 'behavioral', max: 25, hook: 'onAttack', handler: 'doubleStrike',
  },
  cleavePct: {
    id: 'cleavePct', name: 'Cleave', abbr: 'CLV', pct: true,
    target: 'cleavePct', op: 'flat', perBudget: 0.3, value: 5,
    kind: 'behavioral', max: 40, hook: 'onDealDamage', handler: 'cleaveAoE',
  },
  executeThreshold: {
    id: 'executeThreshold', name: 'Execute', abbr: 'EXEC', pct: true,
    target: 'executeThreshold', op: 'flat', perBudget: 0.15, value: 8,
    kind: 'behavioral', max: 20, hook: 'onAttack', handler: 'executeKill',
  },
  poisonChance: {
    id: 'poisonChance', name: 'Poison Chance', abbr: 'PSN', pct: true,
    target: 'poisonChance', op: 'flat', perBudget: 0.2, value: 6,
    kind: 'behavioral', max: 30, hook: 'onAttack', handler: 'applyPoison',
  },
  // Structural read, not a hook dispatch: the Poison status magnitude calc
  // reads the derived total (+X% more poison damage) — stats-catalog Part A.
  poisonDamage: {
    id: 'poisonDamage', name: 'Poison Dmg', abbr: 'PSN', pct: true,
    target: 'poisonDamage', op: 'flat', perBudget: 0.4, value: 4,
    kind: 'flat', max: 50,
  },
  armorPierce: {
    id: 'armorPierce', name: 'Armor Pierce', abbr: 'PIERCE', pct: true,
    target: 'armorPierce', op: 'flat', perBudget: 0.3, value: 5,
    kind: 'behavioral', max: 40, hook: 'onAttack', handler: 'ignoreDefense',
  },
  accuracy: {
    id: 'accuracy', name: 'Accuracy', abbr: 'ACC',
    target: 'attack', op: 'flat', perBudget: 0.5, value: 3, kind: 'behavioral',
    implemented: false,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Defense & sustain — behavioral (onTakeDamage / onCrit)
  // ═══════════════════════════════════════════════════════════════════
  dodgeChance: {
    id: 'dodgeChance', name: 'Dodge', abbr: 'DODGE', pct: true,
    target: 'dodgeChance', op: 'flat', perBudget: 0.2, value: 6,
    kind: 'behavioral', max: 40, hook: 'onTakeDamage', handler: 'dodgeRoll',
  },
  thornsPct: {
    id: 'thornsPct', name: 'Thorns', abbr: 'THRN', pct: true,
    target: 'thornsPct', op: 'flat', perBudget: 0.25, value: 5,
    kind: 'behavioral', max: 50, hook: 'onTakeDamage', handler: 'reflectPercent',
  },
  blockChance: {
    id: 'blockChance', name: 'Block Chance', abbr: 'BLOCK', pct: true,
    target: 'blockChance', op: 'flat', perBudget: 0.2, value: 5,
    kind: 'behavioral', max: 35, hook: 'onTakeDamage', handler: 'blockRoll',
  },
  blockAmount: {
    id: 'blockAmount', name: 'Block Amt', abbr: 'BLK',
    target: 'attack', op: 'flat', perBudget: 1.5, value: 4, kind: 'behavioral',
    max: 80, hook: 'onTakeDamage', handler: 'blockRoll',
    implemented: false,
  },
  counterAttackPct: {
    id: 'counterAttackPct', name: 'Counter Atk', abbr: 'CNTR', pct: true,
    target: 'counterAttackPct', op: 'flat', perBudget: 0.3, value: 6,
    kind: 'behavioral', max: 40, hook: 'onTakeDamage', handler: 'counterAttack',
  },
  blockHeal: {
    id: 'blockHeal', name: 'Block Heal', abbr: 'BLK+', pct: true,
    target: 'maxHp', op: 'flat', perBudget: 0.2, value: 5,
    kind: 'behavioral', max: 15, hook: 'onTakeDamage', handler: 'onBlockHeal',
    implemented: false,
  },
  critHeal: {
    id: 'critHeal', name: 'Crit Heal', abbr: 'CRIT+', pct: true,
    target: 'critHeal', op: 'flat', perBudget: 0.25, value: 6,
    kind: 'behavioral', max: 20, hook: 'onCrit', handler: 'critHealEffect',
  },
  reviveChance: {
    id: 'reviveChance', name: 'Revive', abbr: 'REV', pct: true,
    target: 'reviveChance', op: 'flat', perBudget: 0.08, value: 12,
    kind: 'behavioral', max: 10, hook: 'onLethal', handler: 'reviveRoll',
  },
  shieldLeechPct: {
    id: 'shieldLeechPct', name: 'Shield Leech', abbr: 'SHLD', pct: true,
    target: 'shieldLeechPct', op: 'flat', perBudget: 0.2, value: 6,
    kind: 'behavioral', max: 30, hook: 'onDealDamage', handler: 'shieldLeech',
  },
  // Structural read: the status framework rolls resist itself on every
  // application (status-effects.md resist model) — no hook dispatch.
  statusResist: {
    id: 'statusResist', name: 'Status Resist', abbr: 'RES', pct: true,
    target: 'statusResist', op: 'flat', perBudget: 0.3, value: 4,
    kind: 'flat', max: 40,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Sustain — behavioral (onKill / perTick)
  // ═══════════════════════════════════════════════════════════════════
  healOnKillPct: {
    id: 'healOnKillPct', name: 'Heal on Kill', abbr: 'HOK', pct: true,
    target: 'healOnKillPct', op: 'flat', perBudget: 0.3, value: 5,
    kind: 'behavioral', max: 50, hook: 'onKill', handler: 'healOnKill',
  },
  explodeOnKill: {
    id: 'explodeOnKill', name: 'Explode', abbr: 'XPLD', pct: true,
    target: 'explodeOnKill', op: 'flat', perBudget: 0.3, value: 6,
    kind: 'behavioral', max: 40, hook: 'onKill', handler: 'explodeAoE',
  },
  hpRegen: {
    id: 'hpRegen', name: 'HP Regen', abbr: 'HP/s',
    target: 'hpRegen', op: 'flat', perBudget: 0.6, value: 3, kind: 'behavioral',
    hook: 'perTick', handler: 'regenFlat',
  },
  hpRegenPct: {
    id: 'hpRegenPct', name: 'HP Regen %', abbr: 'HP%/s', pct: true,
    target: 'hpRegenPct', op: 'flat', perBudget: 0.12, value: 5,
    kind: 'behavioral', max: 10, hook: 'perTick', handler: 'regenPercent',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Utility — behavioral (onKill / perTick)
  // ═══════════════════════════════════════════════════════════════════
  goldFindPct: {
    id: 'goldFindPct', name: 'Gold Find', abbr: 'GOLD%', pct: true,
    target: 'goldFindPct', op: 'flat', perBudget: 0.3, value: 4,
    kind: 'behavioral', max: 100, hook: 'onKill', handler: 'bonusGold',
  },
  xpBonusPct: {
    id: 'xpBonusPct', name: 'XP Bonus', abbr: 'XP%', pct: true,
    target: 'attack', op: 'flat', perBudget: 0.25, value: 4,
    kind: 'behavioral', max: 100, hook: 'onKill', handler: 'bonusXp',
    implemented: false,
  },
  itemDropChance: {
    id: 'itemDropChance', name: 'Item Find', abbr: 'ITEM%', pct: true,
    target: 'attack', op: 'flat', perBudget: 0.12, value: 8,
    kind: 'behavioral', max: 50, hook: 'onKill', handler: 'bonusDrops',
    implemented: false,
  },
  rareEnemyChance: {
    id: 'rareEnemyChance', name: 'Rare Enemy', abbr: 'RARE%', pct: true,
    target: 'attack', op: 'flat', perBudget: 0.08, value: 10,
    kind: 'behavioral', max: 20, hook: 'perTick', handler: 'rareEnemyRoll',
    implemented: false,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Combat start — behavioral
  // ═══════════════════════════════════════════════════════════════════
  startingShield: {
    id: 'startingShield', name: 'Start Shield', abbr: 'SHLD', pct: true,
    target: 'startingShield', op: 'flat', perBudget: 0.25, value: 6,
    kind: 'behavioral', max: 30, hook: 'onCombatStart', handler: 'grantShield',
  },
  preemptiveStrike: {
    id: 'preemptiveStrike', name: 'Preemptive', abbr: 'PRE', pct: true,
    target: 'preemptiveStrike', op: 'flat', perBudget: 0.25, value: 7,
    kind: 'behavioral', max: 30, hook: 'onCombatStart', handler: 'preStrike',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Combat clock (structural — the attack timer reads the derived total)
  // ═══════════════════════════════════════════════════════════════════
  attackSpeedPct: {
    id: 'attackSpeedPct', name: 'Attack Speed', abbr: 'AS', pct: true,
    target: 'attackSpeedPct', op: 'flat', perBudget: 0.25, band: [3, 8],
    value: 5, kind: 'flat', max: 50,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Caster stats (structural reads — stats-catalog Part B). The ability
  // dispatch / mana tick read the derived total directly (same pattern as
  // attackSpeedPct); no hook handler. Apprentice-line itemization.
  // ═══════════════════════════════════════════════════════════════════
  abilityPowerPct: {
    id: 'abilityPowerPct', name: 'Ability Power', abbr: 'AP', pct: true,
    target: 'abilityPowerPct', op: 'flat', perBudget: 0.25, band: [4, 10],
    value: 5, kind: 'flat', max: 100,
  },
  maxMana: {
    id: 'maxMana', name: 'Max Mana', abbr: 'MANA',
    target: 'maxMana', op: 'flat', perBudget: 1.5, value: 1, kind: 'flat',
  },
  maxManaPct: {
    id: 'maxManaPct', name: 'Max Mana %', abbr: 'MANA', pct: true,
    target: 'maxMana', op: 'pct', perBudget: 0.6, band: [5, 12],
    value: 4, kind: 'flat', max: 60,
  },
  manaRegenPct: {
    id: 'manaRegenPct', name: 'Mana Regen', abbr: 'MP/s', pct: true,
    target: 'manaRegenPct', op: 'flat', perBudget: 0.4, band: [5, 15],
    value: 6, kind: 'flat', max: 100,
  },
  cooldownReductionPct: {
    id: 'cooldownReductionPct', name: 'Cooldown Reduction', abbr: 'CDR', pct: true,
    target: 'cooldownReductionPct', op: 'flat', perBudget: 0.25, band: [3, 8],
    value: 5, kind: 'flat', max: 40,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Status appliers (behavioral — Phase 1 status framework)
  // ═══════════════════════════════════════════════════════════════════
  burnChance: {
    id: 'burnChance', name: 'Burn Chance', abbr: 'BURN', pct: true,
    target: 'burnChance', op: 'flat', perBudget: 0.2, band: [4, 10], value: 6,
    kind: 'behavioral', max: 35, hook: 'onDealDamage', handler: 'applyBurn',
  },
  bleedChance: {
    id: 'bleedChance', name: 'Bleed Chance', abbr: 'BLD', pct: true,
    target: 'bleedChance', op: 'flat', perBudget: 0.25, band: [6, 14], value: 7,
    kind: 'behavioral', max: 50, hook: 'onCrit', handler: 'applyBleed',
  },
  slowOnHitPct: {
    id: 'slowOnHitPct', name: 'Slow on Hit', abbr: 'SLOW', pct: true,
    target: 'slowOnHitPct', op: 'flat', perBudget: 0.2, band: [4, 10], value: 6,
    kind: 'behavioral', max: 30, hook: 'onDealDamage', handler: 'applySlow',
  },
  shockChance: {
    id: 'shockChance', name: 'Shock Chance', abbr: 'SHK', pct: true,
    target: 'shockChance', op: 'flat', perBudget: 0.2, band: [4, 10], value: 6,
    kind: 'behavioral', max: 35, hook: 'onDealDamage', handler: 'applyShock',
  },
};

/** All stat ids, in registry order. */
export const STAT_IDS = Object.keys(STATS) as StatId[];

/** A stat is live unless explicitly flagged not-yet-implemented. The roller skips
 *  non-live stats so staged behavioral stats can be authored without landing on
 *  live items until a programmer wires the handler and flips `implemented: true`. */
export const isImplemented = (id: StatId): boolean => STATS[id].implemented !== false;

/** Per-derived hard caps. Only a SELF-TARGETING flat stat's `max` caps the
 *  derived TOTAL (it adds straight into its own accumulator); a stat feeding a
 *  FOREIGN target (e.g. blockHeal → maxHp) caps its own roll only — folding its
 *  max into the target's total was the root cause of the "every hero maxHp 15"
 *  bug. A PCT stat's `max` likewise caps its own rolled percentage. */
export const TARGET_MAX: Partial<Record<DerivedId, number>> = (() => {
  const m: Partial<Record<DerivedId, number>> = {};
  for (const def of Object.values(STATS)) {
    if (def.max === undefined || def.op !== 'flat') continue;
    if (def.id !== def.target) continue; // foreign-target max caps the roll, not the total
    const cur = m[def.target];
    m[def.target] = cur === undefined ? def.max : Math.min(cur, def.max);
  }
  // Crit cap: the COMPUTED critChance, not a stat's own max
  m.critChance = 75;
  return m;
})();

export type DerivedMap = Record<DerivedId, number>;

export function zeroDerived(): DerivedMap {
  const m = {} as DerivedMap;
  for (const id of DERIVED_IDS) m[id] = 0;
  return m;
}

/** Format a stat value for UI, e.g. "+5 ATK" or "+12% CRIT". */
export function formatStat(id: StatId, value: number): string {
  const def = STATS[id];
  return `+${value}${def.pct ? '%' : ''} ${def.abbr}`;
}
