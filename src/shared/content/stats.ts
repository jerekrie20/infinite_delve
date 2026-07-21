// The STAT REGISTRY — the single, data-driven source of truth for every stat a
// hero or a piece of gear can carry. This is the "logic" half of the data/logic
// split: the combine RULES live here (op + target), written once; adding a stat
// that reuses an existing rule is one row + listing it in a pool, no engine code.
//
// Two things a StatDef declares:
//   • target — which DERIVED number it feeds (attack, maxHp, …). Many stats can
//     target the same derived (e.g. `attack` flat and `attackPct` percent).
//   • op — HOW it folds in: `flat` (added) or `pct` (an additive % multiplier).
// deriveStats then computes  derived = (base + Σflat) × (1 + Σpct/100)  generically.
//
// BEHAVIORAL stats (crit, lifesteal, thorns…) still need a combat hook in
// LaneScene — `kind: 'behavioral'` marks them. Pure, fully-serializable data
// (literal caps) so the gear editor can author these rows too.

/** Stats that can appear on gear / in pools (extend the union + add a row). */
export type StatId =
  | 'attack'
  | 'attackPct'
  | 'maxHp'
  | 'maxHpPct'
  | 'defensePct'
  | 'critChance'
  | 'lifestealPct';

/** Derived combat quantities the engine outputs and combat reads. A stat's
 *  `target` is one of these (several stats may feed the same one). */
export type DerivedId = 'attack' | 'maxHp' | 'defensePct' | 'critChance' | 'lifestealPct';

export const DERIVED_IDS: DerivedId[] = ['attack', 'maxHp', 'defensePct', 'critChance', 'lifestealPct'];

export interface StatDef {
  id: StatId;
  /** Full display name ("Attack"). */
  name: string;
  /** Short UI suffix ("ATK"). */
  abbr: string;
  /** Show with a % sign in the UI (independent of how it combines). */
  pct?: boolean;
  /** Which derived quantity this stat feeds. */
  target: DerivedId;
  /** How it folds into `target`: `flat` (added) or `pct` (additive % multiplier). */
  op: 'flat' | 'pct';
  /** Points of this stat one unit of stat-budget buys (flat rolls only). */
  perBudget: number;
  /** Roll band [min,max] for pct rolls (common tier; scaled by rarity). */
  band?: [number, number];
  /** Rough combat value per point, for gearScore / auto-equip. */
  value: number;
  /** `flat` = pure number the engine folds; `behavioral` = also needs a LaneScene hook. */
  kind: 'flat' | 'behavioral';
  /** Hard cap: the per-item roll ceiling AND the derived-total clamp for `target`. */
  max?: number;
  /**
   * Whether the LOGIC for this stat exists yet. flat/pct stats are always live
   * (the generic fold handles them). A behavioral stat authored before its combat
   * hook is written sets this `false`: it's a valid registry row, but the roller
   * skips it so it never lands on a live item until a programmer wires the hook
   * and flips this true. Defaults to true when omitted.
   */
  implemented?: boolean;
}

/**
 * The live registry. Order is display order. `flat`/`pct` ops make percentage
 * stats (attackPct/maxHpPct) fully data-driven; behavioral stats (crit/lifesteal)
 * are wired through LaneScene's rollDamage / onMonsterDead — see `kind`.
 */
export const STATS: Record<StatId, StatDef> = {
  attack: { id: 'attack', name: 'Attack', abbr: 'ATK', target: 'attack', op: 'flat', perBudget: 1, value: 3, kind: 'flat' },
  attackPct: {
    id: 'attackPct', name: 'Attack %', abbr: 'ATK', pct: true, target: 'attack', op: 'pct',
    perBudget: 0.6, band: [5, 12], value: 4, kind: 'flat', max: 60,
  },
  maxHp: { id: 'maxHp', name: 'Health', abbr: 'HP', target: 'maxHp', op: 'flat', perBudget: 2.5, value: 1, kind: 'flat' },
  maxHpPct: {
    id: 'maxHpPct', name: 'Health %', abbr: 'HP', pct: true, target: 'maxHp', op: 'pct',
    perBudget: 0.6, band: [5, 12], value: 4, kind: 'flat', max: 60,
  },
  defensePct: {
    id: 'defensePct', name: 'Defense', abbr: 'DEF', pct: true, target: 'defensePct', op: 'flat',
    perBudget: 0.25, value: 4, kind: 'flat', max: 75,
  },
  critChance: {
    id: 'critChance', name: 'Crit Chance', abbr: 'CRIT', pct: true, target: 'critChance', op: 'flat',
    perBudget: 0.4, value: 6, kind: 'behavioral', max: 60,
  },
  lifestealPct: {
    id: 'lifestealPct', name: 'Lifesteal', abbr: 'LIFE', pct: true, target: 'lifestealPct', op: 'flat',
    perBudget: 0.3, value: 5, kind: 'behavioral', max: 40,
  },
};

/** All stat ids, in registry order. Loop this instead of naming keys. */
export const STAT_IDS = Object.keys(STATS) as StatId[];

/** A stat is live unless explicitly flagged not-yet-implemented (behavioral rows
 *  authored ahead of their combat hook). The roller skips non-live stats. */
export const isImplemented = (id: StatId): boolean => STATS[id].implemented !== false;

/** Per-derived hard caps. Only FLAT stats' `max` caps the derived TOTAL (they add
 *  straight into it); a PCT stat's `max` caps its own rolled percentage, not the
 *  target — so attackPct's cap never limits total attack. */
export const TARGET_MAX: Partial<Record<DerivedId, number>> = (() => {
  const m: Partial<Record<DerivedId, number>> = {};
  for (const def of Object.values(STATS)) {
    if (def.max === undefined || def.op !== 'flat') continue;
    const cur = m[def.target];
    m[def.target] = cur === undefined ? def.max : Math.min(cur, def.max);
  }
  return m;
})();

/** A full derived map (every derived id present), the shape deriveStats returns. */
export type DerivedMap = Record<DerivedId, number>;

/** A fresh all-zero derived map. */
export function zeroDerived(): DerivedMap {
  const m = {} as DerivedMap;
  for (const id of DERIVED_IDS) m[id] = 0;
  return m;
}

/** Format a stat value for UI, e.g. "+5 ATK" or "+12% ATK". */
export function formatStat(id: StatId, value: number): string {
  const def = STATS[id];
  return `+${value}${def.pct ? '%' : ''} ${def.abbr}`;
}
