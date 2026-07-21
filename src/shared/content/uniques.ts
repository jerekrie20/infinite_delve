// UNIQUE items as data — named, hand-designed pieces with signature stat lines
// that roll within TIGHT bands (so two of the same unique differ a little), a
// custom sprite, and their own drop weight. They enter the loot table as weighted
// entries (see rollGear); a unique renders gold. Pure data — the roll math + drop
// selection live in items.ts. `base` names which base's slot/family it emulates
// (for sanitize + tier fallbacks); `stats` maps a stat id to a [min,max] band.

import type { GearSlot, Rarity } from '../delve';
import type { StatId } from './stats';

export interface UniqueItem {
  id: string;
  name: string;
  slot: GearSlot;
  /** The base family this unique emulates (drives slot validation + name/tier). */
  base: string;
  /** Quality tier for scaling/display context (renders gold via `unique`). */
  rarity: Rarity;
  /** Signature lines, each rolled in its [min,max] band (inclusive, whole nums). */
  stats: Partial<Record<StatId, [number, number]>>;
  /** Relative drop weight among uniques (0 = not from combat drops yet). */
  dropWeight: number;
  /** Set this unique also counts toward, if any. */
  set?: string;
  /** Custom sprite key. */
  sprite?: string;
}

/** The live uniques. Authored by hand / the gear editor; bundled at build time. */
export const UNIQUES: UniqueItem[] = [
  {
    id: 'gutripper',
    name: 'Gutripper',
    slot: 'hand1',
    base: 'blade',
    rarity: 'legendary',
    stats: { attack: [55, 70], increasedCritPct: [30, 55], lifestealPct: [8, 14] },
    dropWeight: 1,
  },
  {
    id: 'aegis_heart',
    name: 'Aegis Heart',
    slot: 'amulet',
    base: 'amulet',
    rarity: 'legendary',
    stats: { maxHp: [120, 160], maxHpPct: [10, 16], defensePct: [6, 10] },
    dropWeight: 1,
  },
];

/** Fast lookup by unique id. */
export const UNIQUE_BY_ID: Record<string, UniqueItem> = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));
