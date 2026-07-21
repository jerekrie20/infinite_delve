// Pure gear-state operations + hero stat derivation, shared by the server
// (hero.ts, authoritative) and the client (offline preview banking + live
// power-growth). No I/O. Operates on a minimal GearState so both StoredHero and
// the client Hero satisfy it.

import type { GearItem, GearSlot, HeroClass } from '../delve';
import { classDef } from './classes';
import { STATS, STAT_IDS, DERIVED_IDS, TARGET_MAX, zeroDerived, type DerivedMap } from './stats';
import { SETS } from './sets';
import { TUNING } from './tuning';
import { gearScore } from './items';

/** Anything that carries gear: a stash + the equipped slots. */
export interface GearState {
  stash: GearItem[];
  equipped: Partial<Record<GearSlot, GearItem>>;
}

/** Max stored stash size; weakest items are dropped when banking overflows. */
export const STASH_CAP = 30;

/** Bank a run's haul: auto-equip anything that beats the current slot item
 *  (best-first, so the strongest wins and displaced items go to stash), the
 *  rest to stash. Trims the stash to the cap. Returns how many auto-equipped. */
export function bankHaul(state: GearState, haul: GearItem[]): number {
  let equippedCount = 0;
  const ordered = [...haul].sort((a, b) => gearScore(b) - gearScore(a));
  for (const item of ordered) {
    const current = state.equipped[item.slot];
    if (!current || gearScore(item) > gearScore(current)) {
      state.equipped[item.slot] = item;
      if (current) state.stash.push(current);
      equippedCount++;
    } else {
      state.stash.push(item);
    }
  }
  if (state.stash.length > STASH_CAP) {
    state.stash.sort((a, b) => gearScore(b) - gearScore(a));
    state.stash.length = STASH_CAP;
  }
  return equippedCount;
}

/** Equip a stash item by id; the displaced slot item returns to stash. */
export function equipItem(state: GearState, itemId: string): boolean {
  const idx = state.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return false;
  const [item] = state.stash.splice(idx, 1);
  const current = state.equipped[item!.slot];
  state.equipped[item!.slot] = item!;
  if (current) state.stash.push(current);
  return true;
}

/** Unequip the item in a slot back to the stash. */
export function unequipSlot(state: GearState, slot: GearSlot): boolean {
  const current = state.equipped[slot];
  if (!current) return false;
  delete state.equipped[slot];
  state.stash.push(current);
  return true;
}

/** Remove a stash item by id and return it (caller converts it to gold). Null
 *  if the id isn't in the stash. */
export function sellItem(state: GearState, itemId: string): GearItem | null {
  const idx = state.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  const [item] = state.stash.splice(idx, 1);
  return item ?? null;
}

/** Full derived combat map (attack/maxHp/defensePct/critChance/lifestealPct).
 *  hero.ts reads the named ones; the combat hooks read the behavioral ones. */
export type DerivedStats = DerivedMap;

/** Derive combat stats from class + level + equipped gear via the generic
 *  modifier fold: every stat declares a `target` and an `op` (flat | pct), so
 *  derived = (base + Σflat) × (1 + Σpct/100), clamped by the target's cap.
 *
 *  CRIT uses a PoE-style two-stat model so it stays valuable deep into the game:
 *    baseCritChance     (flat, rare)  — seeded from TUNING, boosted by gear
 *    increasedCritPct   (pct, common) — % increased crit, multiplied in after fold
 *    critChance = min(baseCritChance × (1 + increasedCritPct/100), cap)
 *
 *  Behavioral stats (lifesteal, dodge, thorns, regen…) use op:'flat' so they
 *  accumulate into their derived target via the fold without special-casing.
 *  Caller clamps current hp against the returned maxHp. */
export function deriveStats(
  classId: HeroClass,
  level: number,
  equipped: Partial<Record<GearSlot, GearItem>>
): DerivedStats {
  const cls = classDef(classId);
  const flat = zeroDerived();
  const pct = zeroDerived();

  // Base values seed the flat accumulators.
  flat.attack = cls.baseAttack + cls.attackPerLevel * (level - 1);
  flat.maxHp = cls.baseMaxHp + cls.hpPerLevel * (level - 1);
  flat.baseCritChance = TUNING.combat.critChance * 100; // innate 5% base crit
  flat.critMultiplier = TUNING.combat.critMultiplier;   // innate 1.5× multiplier
  flat.healOnKillPct = Math.round(TUNING.combat.healOnKillPct * 100); // innate 45% heal

  const add = (statId: string, val: number): void => {
    const def = STATS[statId as keyof typeof STATS];
    if (!def || !val) return;
    (def.op === 'pct' ? pct : flat)[def.target] += val;
  };

  const setCounts: Record<string, number> = {};
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    for (const id of STAT_IDS) add(id, item.s[id] ?? 0);
    if (item.set) setCounts[item.set] = (setCounts[item.set] ?? 0) + 1;
  }
  // Set-bonus pass: every set whose piece-threshold is met folds in its stats.
  for (const [setId, count] of Object.entries(setCounts)) {
    const def = SETS[setId];
    if (!def) continue;
    for (const b of def.bonuses) if (count >= b.pieces) add(b.stat, b.val);
  }

  // Combine flat × pct per target, round, clamp to the target's hard cap.
  const out = zeroDerived();
  for (const t of DERIVED_IDS) {
    if (t === 'critChance') continue; // computed below
    let val = Math.round(flat[t] * (1 + pct[t] / 100));
    const cap = TARGET_MAX[t];
    if (cap !== undefined) val = Math.min(val, cap);
    out[t] = val;
  }

  // Crit: PoE-style — base × (1 + increased%) then clamp.
  const baseCrit = out.baseCritChance;
  const increasedCrit = out.increasedCritPct;
  const critCap = TARGET_MAX.critChance ?? 75;
  out.critChance = Math.min(Math.round(baseCrit * (1 + increasedCrit / 100)), critCap);

  return out;
}

/** Active set bonuses for an equipped loadout, for the gear panel: each set with
 *  ≥2 pieces, its equipped count, and which bonus thresholds are currently live. */
export function activeSets(
  equipped: Partial<Record<GearSlot, GearItem>>
): Array<{ id: string; name: string; count: number; bonuses: Array<{ pieces: number; text: string; active: boolean }> }> {
  const counts: Record<string, number> = {};
  for (const item of Object.values(equipped)) {
    if (item?.set) counts[item.set] = (counts[item.set] ?? 0) + 1;
  }
  const out: ReturnType<typeof activeSets> = [];
  for (const [id, count] of Object.entries(counts)) {
    const def = SETS[id];
    if (!def || count < 2) continue;
    out.push({
      id,
      name: def.name,
      count,
      bonuses: def.bonuses.map((b) => ({
        pieces: b.pieces,
        text: `${b.pieces}-pc: +${b.val}${STATS[b.stat].pct ? '%' : ''} ${STATS[b.stat].abbr}`,
        active: count >= b.pieces,
      })),
    });
  }
  return out;
}
