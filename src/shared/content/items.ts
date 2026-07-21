// Procedural GEAR generation + comparison. An idle looter drops items from
// TEMPLATES (rarity tiers × slots) scaled by depth, not hand-authored rows.
// Rarity/slot/stat tables live here (structural); the hot knobs (drop rate,
// stat budget) live in TUNING.items so the balance sandbox can tune them.
// Pure — takes an Rng so the client rolls live and it stays testable.

import type { GearItem, GearSlot, GearStats, Rarity } from '../delve';
import { TUNING } from './tuning';
import { STATS, STAT_IDS, isImplemented, type StatId } from './stats';
import { SET_BY_BASE, SETS, type SetItemDef } from './sets';
import { UNIQUES, UNIQUE_BY_ID, type UniqueItem } from './uniques';

/** Flat index of every set-item across all sets, for `pick()` during set drops. */
interface SetDropEntry { set: string; rarity: Rarity; item: SetItemDef }
const ALL_SET_ITEMS: SetDropEntry[] = (() => {
  const out: SetDropEntry[] = [];
  for (const s of Object.values(SETS)) {
    for (const itm of s.items) out.push({ set: s.id, rarity: s.rarity, item: itm });
  }
  return out;
})();

/** Fast lookup of set-item ids for name rebuild. */
const SET_ITEM_BY_ID: Record<string, SetItemDef> = Object.fromEntries(
  ALL_SET_ITEMS.map((e) => [e.item.id, e.item])
);

/** A 0..1 random source (defaults to Math.random; tests pass a seeded one). */
export type Rng = () => number;

interface RarityTier {
  id: Rarity;
  name: string;
  /** Base draw weight (before depth boost). */
  weight: number;
  /** Multiplies an item's stat budget. */
  statMult: number;
}

/** Ordered common→legendary; index drives the depth boost (rarer = boosted more). */
export const RARITIES: RarityTier[] = [
  { id: 'common', name: 'Common', weight: 100, statMult: 1.0 },
  { id: 'uncommon', name: 'Uncommon', weight: 42, statMult: 1.4 },
  { id: 'rare', name: 'Rare', weight: 16, statMult: 1.9 },
  { id: 'epic', name: 'Epic', weight: 5, statMult: 2.6 },
  { id: 'legendary', name: 'Legendary', weight: 1.2, statMult: 3.6 },
];

/** Rarity tier by id (for set-quality drops that roll at their set's tier). */
export const RARITY_BY_ID: Record<Rarity, RarityTier> = Object.fromEntries(
  RARITIES.map((r) => [r.id, r])
) as Record<Rarity, RarityTier>;

/** Rebuild the display name from the item's data (NO stored `name` field — saves
 *  bytes in Redis across ~36 items per hero). Uniques carry their own title;
 *  set items use the set-item def name; everything else is "{Rarity} {Base}". */
export function itemName(it: GearItem): string {
  if (it.unique) {
    const u = UNIQUE_BY_ID[it.unique];
    if (u) return u.name;
  }
  // Set items have their own display name (e.g. "Warden Plate").
  const si = SET_ITEM_BY_ID[it.base];
  if (si) return si.name;
  const rarityName = RARITY_BY_ID[it.r]?.name ?? it.r;
  const baseName = BASE_BY_ID[it.base]?.name ?? it.base;
  return `${rarityName} ${baseName}`;
}

/** A base item: one per drop slot. `primary` always rolls (scaled by full
 *  budget); `pool` is the affix menu rarity draws extra stats from. Keep `pool`
 *  disjoint from `primary` so affixes never duplicate the primary line. Set
 *  membership now lives on the SET (content/sets.ts `members`), not here. */
export interface BaseItem {
  id: string;
  /** Display base name ("Blade" → "Rare Blade"). */
  name: string;
  slot: GearSlot;
  /** The always-present headline stat. */
  primary: StatId;
  /** Affix menu; rarity decides how many are drawn (no dupes). */
  pool: StatId[];
}

/** The base items that drop in v2 (a readable subset of the 9 GearSlots).
 *  Weapons/jewelry pools carry the offensive behavioral stats (crit/lifesteal);
 *  armor rolls crit only — so a legendary weapon can reach 5 stat lines. */
export const BASES: BaseItem[] = [
  { id: 'blade', name: 'Blade', slot: 'hand1', primary: 'attack',
    pool: ['attackPct', 'maxHp', 'increasedCritPct', 'lifestealPct', 'baseCritChance', 'critMultiplier'] },
  { id: 'shield', name: 'Shield', slot: 'hand2', primary: 'defensePct',
    pool: ['maxHp', 'maxHpPct', 'blockChance', 'blockAmount', 'thornsPct', 'hpRegen', 'damageReductionPct'] },
  { id: 'armor', name: 'Armor', slot: 'body', primary: 'maxHp',
    pool: ['maxHpPct', 'defensePct', 'increasedCritPct', 'thornsPct', 'hpRegen'] },
  { id: 'helm', name: 'Helm', slot: 'head', primary: 'maxHp',
    pool: ['maxHpPct', 'defensePct', 'attack', 'increasedCritPct', 'hpRegen'] },
  { id: 'greaves', name: 'Greaves', slot: 'legs', primary: 'maxHp',
    pool: ['maxHpPct', 'defensePct', 'dodgeChance', 'hpRegen', 'hpRegenPct', 'damageReductionPct'] },
  { id: 'boots', name: 'Boots', slot: 'feet', primary: 'defensePct',
    pool: ['maxHp', 'maxHpPct', 'dodgeChance', 'hpRegen', 'goldFindPct'] },
  { id: 'belt', name: 'Belt', slot: 'belt', primary: 'maxHp',
    pool: ['hpRegen', 'hpRegenPct', 'goldFindPct', 'healOnKillPct', 'maxHpPct', 'dodgeChance'] },
  { id: 'ring', name: 'Ring', slot: 'ring1', primary: 'attack',
    pool: ['attackPct', 'increasedCritPct', 'lifestealPct', 'maxHp', 'baseCritChance', 'critMultiplier', 'goldFindPct'] },
  { id: 'band', name: 'Band', slot: 'ring2', primary: 'attack',
    pool: ['attackPct', 'increasedCritPct', 'lifestealPct', 'baseCritChance', 'critMultiplier', 'goldFindPct'] },
  { id: 'amulet', name: 'Amulet', slot: 'amulet', primary: 'maxHp',
    pool: ['attackPct', 'maxHpPct', 'increasedCritPct', 'lifestealPct', 'hpRegen', 'goldFindPct', 'damageReductionPct'] },
];

/** Fast lookups by id / slot (base drives set membership + name rebuild). */
export const BASE_BY_ID: Record<string, BaseItem> = Object.fromEntries(BASES.map((b) => [b.id, b]));
const BASE_BY_SLOT: Partial<Record<GearSlot, BaseItem>> = Object.fromEntries(BASES.map((b) => [b.slot, b]));

/** How many affixes each rarity rolls from the base pool (capped at pool size). */
export const AFFIXES_BY_RARITY: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const pick = <T>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)]!;

/** Draw up to n distinct items from arr (no replacement), seeded by rng. */
function pickN<T>(arr: T[], n: number, rng: Rng): T[] {
  const copy = [...arr];
  const out: T[] = [];
  const count = Math.min(n, copy.length);
  for (let i = 0; i < count; i++) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]!);
  return out;
}

/** Deeper runs bias toward rarer tiers (weightᵢ × boost^tierIndex). */
function rollRarity(depth: number, rng: Rng): RarityTier {
  const boost = 1 + Math.min(Math.max(depth, 0), 200) / 100; // 1.0 → 3.0
  const weighted = RARITIES.map((r, i) => ({ r, w: r.weight * Math.pow(boost, i) }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let roll = rng() * total;
  for (const x of weighted) {
    roll -= x.w;
    if (roll <= 0) return x.r;
  }
  return weighted[weighted.length - 1]!.r;
}

/** Convert a stat budget into whole points of one FLAT stat (min 1). */
const statValue = (budget: number, stat: StatId): number =>
  Math.max(1, Math.round(budget * STATS[stat].perBudget));

/** Roll a PCT stat's value: a band [min,max] scaled by rarity, capped at its max.
 *  Percentage multipliers stay in a fixed design band (they don't scale with
 *  depth — flat power does; percentages just multiply it). */
function pctValue(stat: StatId, rarityMult: number, rng: Rng): number {
  const def = STATS[stat];
  const [lo, hi] = def.band ?? [1, 1];
  const v = Math.max(1, Math.round((lo + rng() * (hi - lo)) * rarityMult));
  return def.max !== undefined ? Math.min(v, def.max) : v;
}

/** Roll one affix stat's contribution, honoring its combine op. */
const affixValue = (stat: StatId, budget: number, rarityMult: number, rng: Rng): number =>
  STATS[stat].op === 'pct' ? pctValue(stat, rarityMult, rng) : statValue(budget, stat);

const newId = (rng: Rng): string => `itm_${Math.floor(rng() * 1e12).toString(36)}`;

/** Whole number in an inclusive [min,max] band, seeded. */
const bandRoll = (lo: number, hi: number, rng: Rng): number => Math.round(lo + rng() * (hi - lo));

const droppableUniques = UNIQUES.filter((u) => u.dropWeight > 0);

/** Unique chance at a given depth: base + depth × perDepth, capped. */
function uniqueChanceAt(depth: number): number {
  const it = TUNING.items;
  return Math.min(it.uniqueChance + Math.max(0, depth) * it.uniqueChancePerDepth, it.uniqueChanceCap);
}

/** Set chance at a given depth: base + depth × perDepth, capped. */
function setChanceAt(depth: number): number {
  const it = TUNING.items;
  return Math.min(it.setChance + Math.max(0, depth) * it.setChancePerDepth, it.setChanceCap);
}

/** Roll a unique item (each signature line within its band), or null if this drop
 *  isn't a unique. Uniques are a weighted entry in the loot table — chance scales
 *  with depth, then a drop-weighted pick among the eligible uniques. */
function maybeRollUnique(depth: number, rng: Rng): GearItem | null {
  if (droppableUniques.length === 0 || rng() > uniqueChanceAt(depth)) return null;
  const total = droppableUniques.reduce((s, u) => s + u.dropWeight, 0);
  let roll = rng() * total;
  let chosen: UniqueItem = droppableUniques[droppableUniques.length - 1]!;
  for (const u of droppableUniques) {
    roll -= u.dropWeight;
    if (roll <= 0) { chosen = u; break; }
  }
  const stats: GearStats = {};
  for (const id of STAT_IDS) {
    const band = chosen.stats[id];
    if (band) stats[id] = bandRoll(band[0], band[1], rng);
  }
  return {
    id: newId(rng),
    slot: chosen.slot,
    r: chosen.rarity,
    base: chosen.base,
    unique: chosen.id,
    ...(chosen.set ? { set: chosen.set } : {}),
    s: stats,
  };
}

/** Generate one gear item for a given depth. Order: maybe a UNIQUE; else pick a
 *  base — if it's a SET member it drops at the set's quality tier (set-colored),
 *  otherwise a depth-weighted rarity. Then primary (full budget) + rarity-many
 *  affixes (flat affixes scale with depth, pct affixes roll a fixed band). Seeded,
 *  server-authoritative. Not-yet-implemented stats are skipped by the roller. */
export function rollGear(depth: number, rng: Rng = Math.random): GearItem {
  const d = Math.max(1, Math.floor(depth));
  const unique = maybeRollUnique(d, rng);
  if (unique) return unique;

  const it = TUNING.items;

  // Set drop: pick from all set-items across all sets (depth-scaled chance).
  if (ALL_SET_ITEMS.length && rng() < setChanceAt(d)) {
    const entry = pick(ALL_SET_ITEMS, rng);
    const sRarity = RARITY_BY_ID[entry.rarity];
    const sBudget = (it.budgetBase + d * it.budgetPerDepth) * sRarity.statMult;
    const stats: GearStats = { [entry.item.primary]: statValue(sBudget, entry.item.primary) };
    const sPool = entry.item.pool.filter(isImplemented);
    const sAffixes = pickN(sPool, AFFIXES_BY_RARITY[sRarity.id], rng);
    for (const stat of sAffixes) {
      stats[stat] = (stats[stat] ?? 0) + affixValue(stat, sBudget * it.affixBudgetFrac, sRarity.statMult, rng);
    }
    return {
      id: newId(rng),
      slot: entry.item.slot,
      r: sRarity.id,
      base: entry.item.id,
      set: entry.set,
      s: stats,
    };
  }

  // Generic drop: pick a base, roll rarity, generate.
  const base = pick(BASES, rng);
  const rarity = rollRarity(d, rng);
  const budget = (it.budgetBase + d * it.budgetPerDepth) * rarity.statMult;
  const stats: GearStats = { [base.primary]: statValue(budget, base.primary) };
  const pool = base.pool.filter(isImplemented);
  const affixes = pickN(pool, AFFIXES_BY_RARITY[rarity.id], rng);
  for (const stat of affixes) {
    stats[stat] = (stats[stat] ?? 0) + affixValue(stat, budget * it.affixBudgetFrac, rarity.statMult, rng);
  }
  const setId = SET_BY_BASE[base.id];
  return {
    id: newId(rng),
    slot: base.slot,
    r: rarity.id,
    base: base.id,
    ...(setId ? { set: setId } : {}),
    s: stats,
  };
}

/** Roll a possible drop for one kill; null if nothing dropped. */
export function rollDrop(depth: number, isSwarm: boolean, rng: Rng = Math.random): GearItem | null {
  const chance = TUNING.items.dropChance * (isSwarm ? TUNING.items.swarmDropMult : 1);
  if (rng() > chance) return null;
  return rollGear(depth, rng);
}

/** Scalar combat value of an item — used to decide auto-equip (higher = better).
 *  Sums every carried stat × its registry `value`, so new stats score for free. */
export function gearScore(item: GearItem): number {
  let score = 0;
  for (const id of STAT_IDS) score += (item.s[id] ?? 0) * STATS[id].value;
  return score;
}

/** Gold returned for selling an item — scales with its combat value. */
export function sellValue(item: GearItem): number {
  return Math.max(1, Math.round(gearScore(item) * TUNING.items.sellValueMult));
}

export const VALID_SLOTS: GearSlot[] = ['head', 'body', 'hand1', 'hand2', 'legs', 'feet', 'ring1', 'ring2', 'amulet', 'belt'];
const VALID_RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const safeId = (v: unknown): string =>
  typeof v === 'string' && v.length <= 40 ? v : `itm_${Math.floor(Math.random() * 1e12).toString(36)}`;

const clampStat = (v: unknown, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(Math.round(v), max)) : 0;

/** Validate + clamp ONE untrusted item (from a client-reported haul). Returns
 *  null if structurally invalid. v0 trusts the client on drops but bounds the
 *  values so a tampered client can't inject absurd stats. Set + rarity are
 *  RECOMPUTED from authoritative data (base→set index, unique def), never trusted. */
export function sanitizeGearItem(raw: unknown, depth: number): GearItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const slot = o.slot as GearSlot;
  if (!VALID_SLOTS.includes(slot)) return null;

  // --- Unique path: validate signature lines against the unique's own bands ---
  const uniq = typeof o.unique === 'string' ? UNIQUE_BY_ID[o.unique] : undefined;
  if (uniq && uniq.slot === slot) {
    const stats: GearStats = {};
    // Accept old key `stats` or new key `s` from client hauls.
    const rawStats = ((o.s ?? o.stats) ?? {}) as Record<string, unknown>;
    for (const id of STAT_IDS) {
      const band = uniq.stats[id];
      if (!band) continue;
      const v = clampStat(rawStats[id], Math.floor(band[1] * 1.25));
      if (v > 0) stats[id] = v;
    }
    if (STAT_IDS.every((id) => stats[id] === undefined)) return null;
    return {
      id: safeId(o.id),
      slot,
      r: uniq.rarity,
      base: uniq.base,
      unique: uniq.id,
      ...(uniq.set ? { set: uniq.set } : {}),
      s: stats,
    };
  }

  // --- Generic / set path ---
  // Accept old key `rarity` or new key `r` from client hauls.
  const claimedRarity = (o.r ?? o.rarity) as Rarity;
  if (!VALID_RARITIES.includes(claimedRarity)) return null;
  const d = Math.max(1, Math.floor(depth));
  // Generous ceiling: a legendary's budget at this depth with slack.
  const budgetCap = (TUNING.items.budgetBase + d * TUNING.items.budgetPerDepth) * 3.6 * 1.5;
  // Per-stat cap: a hard `max` if the stat has one (e.g. defense%/crit), else the
  // pct band ceiling (rarity + slack) or the depth budget via its perBudget rate.
  const stats: GearStats = {};
  const rawStats = ((o.s ?? o.stats) ?? {}) as Record<string, unknown>;
  for (const id of STAT_IDS) {
    const def = STATS[id];
    const uncapped =
      def.op === 'pct' ? (def.band?.[1] ?? 0) * 3.6 * 1.5 : budgetCap * def.perBudget;
    const cap = Math.floor(def.max ?? uncapped);
    const v = clampStat(rawStats[id], cap);
    if (v > 0) stats[id] = v;
  }
  if (STAT_IDS.every((id) => stats[id] === undefined)) return null;
  // Base: trust the claim only if it matches the slot (from bases OR set-items),
  // else the slot's canonical generic base. Set + rarity are then derived from
  // the authoritative data, never trusted from the client.
  const claimed = (BASE_BY_ID[o.base as string] ?? SET_ITEM_BY_ID[o.base as string]) as { slot: GearSlot; id: string } | undefined;
  const baseId = (claimed && claimed.slot === slot ? claimed.id : BASE_BY_SLOT[slot]?.id) ?? 'blade';
  const setId = SET_BY_BASE[baseId];
  const rarity = setId ? SETS[setId]!.rarity : claimedRarity;
  return {
    id: safeId(o.id),
    slot,
    r: rarity,
    base: baseId,
    ...(setId ? { set: setId } : {}),
    s: stats,
  };
}

/** Sanitize + bound a whole haul (drops invalid items, caps the count). */
export function sanitizeHaul(raw: unknown, depth: number, maxItems = 40): GearItem[] {
  if (!Array.isArray(raw)) return [];
  const out: GearItem[] = [];
  for (const r of raw.slice(0, maxItems)) {
    const item = sanitizeGearItem(r, depth);
    if (item) out.push(item);
  }
  return out;
}
