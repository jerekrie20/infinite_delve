// SET bonuses as data. A set OWNS its items directly (`items: SetItemDef[]`),
// each with slot + primary + pool. When a set drop is rolled, pick() from those
// items; they drop at the set's rarity, colored green. DeriveStats runs a set
// pass that counts equipped members per set and adds every bonus whose threshold
// is met. Pure data + StatId/Rarity from the shared vocabulary.

import type { GearSlot, Rarity } from '../delve';
import type { StatId } from './stats';

export interface SetBonus {
  pieces: number;
  stat: StatId;
  val: number;
}

/** A single item owned by a set — a mini-base with its own slot, primary, and pool. */
export interface SetItemDef {
  id: string;
  name: string;
  slot: GearSlot;
  primary: StatId;
  pool: StatId[];
}

export interface SetDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** The items that drop as part of this set (each is a self-contained base). */
  items: SetItemDef[];
  bonuses: SetBonus[];
  sprite?: string;
  /** Legacy: old format used `members: baseId[]`. Still supported for migration. */
  members?: string[];
}

export const SETS: Record<string, SetDef> = {
  warden: {
    id: 'warden',
    name: "Warden's Vigil",
    rarity: 'rare',
    items: [
      { id: 'wv_armor',  name: 'Warden Plate',    slot: 'body',   primary: 'maxHp',       pool: ['maxHpPct', 'defensePct', 'increasedCritPct'] },
      { id: 'wv_helm',   name: 'Warden Crown',     slot: 'head',   primary: 'maxHp',       pool: ['maxHpPct', 'defensePct', 'attack'] },
      { id: 'wv_boots',  name: 'Warden Greaves',   slot: 'feet',   primary: 'defensePct',  pool: ['maxHp', 'maxHpPct', 'dodgeChance'] },
      { id: 'wv_amulet', name: 'Warden Pendant',   slot: 'amulet', primary: 'maxHp',       pool: ['attackPct', 'maxHpPct', 'increasedCritPct', 'hpRegen'] },
    ],
    bonuses: [
      { pieces: 2, stat: 'defensePct', val: 4 },
      { pieces: 4, stat: 'maxHp', val: 40 },
    ],
  },
  raider: {
    id: 'raider',
    name: "Raider's Edge",
    rarity: 'epic',
    items: [
      { id: 're_blade', name: 'Raider Blade',  slot: 'hand1', primary: 'attack', pool: ['attackPct', 'increasedCritPct', 'lifestealPct', 'baseCritChance'] },
      { id: 're_ring',  name: 'Raider Ring',   slot: 'ring1', primary: 'attack', pool: ['attackPct', 'increasedCritPct', 'lifestealPct', 'goldFindPct'] },
    ],
    bonuses: [{ pieces: 2, stat: 'attack', val: 8 }],
  },
};

/** Reverse index item id → set id, derived from every set's `items`. Also supports
 *  legacy `members` (base IDs) for migration from old-format saves. */
export const SET_BY_ITEM: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const s of Object.values(SETS)) {
    for (const itm of s.items) m[itm.id] = s.id;
    // Legacy base-id members → map those too so old saves still work.
    if (s.members) for (const base of s.members) m[base] = s.id;
  }
  return m;
})();

/** Which set an item belongs to, if any (maps item's base + set-item ids). */
export const SET_BY_BASE = SET_BY_ITEM;

export const setDef = (id: string | undefined): SetDef | undefined => (id ? SETS[id] : undefined);
