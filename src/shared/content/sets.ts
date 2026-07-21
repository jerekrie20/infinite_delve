// SET bonuses as data. A set is DEFINED BY its member base items (`members`);
// wearing enough members grants extra derived stats. Set items drop as their own
// quality tier (their `rarity`) and render in the set color, not the normal
// common→legendary roll. deriveStats runs a set pass that counts equipped members
// per set and adds every bonus whose threshold is met. Pure data + StatId/Rarity
// from the shared vocabulary. The base→set link (SET_BY_BASE) is derived here.

import type { Rarity } from '../delve';
import type { StatId } from './stats';

export interface SetBonus {
  /** Equipped members of this set required to activate this bonus. */
  pieces: number;
  stat: StatId;
  /** Flat amount added to the derived stat when active. */
  val: number;
}

export interface SetDef {
  id: string;
  name: string;
  /** The set's quality tier — drives its members' drop tier + stat budget. Members
   *  present in the set color regardless, but roll their stats at this rarity. */
  rarity: Rarity;
  /** Base ids that belong to this set (a base is in at most one set). */
  members: string[];
  /** Threshold bonuses (keep ascending by `pieces`); every met one applies. */
  bonuses: SetBonus[];
  /** Optional custom sprite key for the whole set (overrides tier art). */
  sprite?: string;
}

/** The live sets. Membership lives here now (not on the base rows). */
export const SETS: Record<string, SetDef> = {
  warden: {
    id: 'warden',
    name: "Warden's Vigil",
    rarity: 'rare',
    members: ['armor', 'helm', 'boots', 'amulet'],
    bonuses: [
      { pieces: 2, stat: 'defensePct', val: 4 },
      { pieces: 4, stat: 'maxHp', val: 40 },
    ],
  },
  raider: {
    id: 'raider',
    name: "Raider's Edge",
    rarity: 'epic',
    members: ['blade', 'ring'],
    bonuses: [{ pieces: 2, stat: 'attack', val: 8 }],
  },
};

/** Reverse index base id → set id, derived from every set's `members`. */
export const SET_BY_BASE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const s of Object.values(SETS)) for (const base of s.members) m[base] = s.id;
  return m;
})();

/** Look up a set def by id (undefined if unknown). */
export const setDef = (id: string | undefined): SetDef | undefined => (id ? SETS[id] : undefined);
