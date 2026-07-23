// Active ABILITY registry — data-driven skill definitions shared by client,
// engine, and server. Same pattern as stats.ts: one row = one ability; the
// class-kits catalog (game_design/mechanics/01-classes/class-kits.md) is the
// design source for every number here.
//
// D30 shape: slot 1 is the BASIC ATTACK (basic: true — no mana, no cooldown,
// fires on the attack-speed timer); slots 2-5 are mana abilities fired by the
// rotation (shared/combat/rotation.ts) or manual taps. Statuses an ability
// applies are preset references (shared/combat/statuses.ts) — never bespoke
// buff logic here.

import type { StatusId, ModQuantity } from '../combat/statuses';

// ---- Ability definition -------------------------------------------------------

/** Who a hit lands on within the enemy pack (D32) — never tap-targeting. */
export type Targeting = 'front' | 'all' | 'back' | 'random';

export interface AbilityStatus {
  id: StatusId;
  /** Applied to 'target' (the hit enemy/enemies) or 'self' (hero buffs). */
  side: 'target' | 'self';
  /** Override the preset's default magnitude (signed for mods). */
  magnitude?: number;
  durationMs?: number;
  /** statMod only: the quantity the ad-hoc modifier shifts. */
  modTarget?: ModQuantity;
}

export interface ActiveDef {
  id: string;
  name: string;
  /** Emoji icon shown on the skill button (until real art lands). */
  icon: string;
  /** Which of the 5 loadout slots this ability belongs to (D24). */
  slot: number;
  /** Slot-1 attack style: no mana, no cooldown, fires on the attack timer. */
  basic?: boolean;
  manaCost: number;
  /** Cooldown in ms (0 for basics). */
  cooldownMs: number;
  /** Multiplier on the hero's ATK for damage-dealing abilities/styles. */
  damageMult?: number;
  /** Where the damage lands in the pack (default 'front'). */
  targeting?: Targeting;
  /** Statuses this ability applies when it resolves. */
  statuses?: AbilityStatus[];
  /** Flavor / tooltip shown on long-press. */
  description: string;
}

// ---- Unlock table -------------------------------------------------------------

export interface AbilityUnlock {
  abilityId: string;
  classId: string;
  level: number;
}

// ---- The registry (Squire option-1 column; more rows land with Phase 3) -------

export const ACTIVES: Record<string, ActiveDef> = {
  slam: {
    id: 'slam',
    name: 'Slam',
    icon: '💥',
    slot: 1,
    basic: true,
    manaCost: 0,
    cooldownMs: 0,
    damageMult: 1.15,
    targeting: 'front',
    description: 'Your attack style: a heavy overhead strike dealing 115% weapon damage.',
  },
  fortify: {
    id: 'fortify',
    name: 'Fortify',
    icon: '🛡️',
    slot: 2,
    manaCost: 25,
    cooldownMs: 20000,
    statuses: [{ id: 'fortify', side: 'self', magnitude: -50, durationMs: 3000 }],
    description: 'Raise your guard, reducing all incoming damage by 50% for 3 seconds.',
  },
};

/** Unlock table: class → ability ids + level requirements, in unlock order. */
export const CLASS_ABILITIES: Record<string, AbilityUnlock[]> = {
  squire: [
    { abilityId: 'slam', classId: 'squire', level: 1 },
    { abilityId: 'fortify', classId: 'squire', level: 5 },
  ],
};

/** Which abilities a class has unlocked at a given level. */
export function unlockedAbilities(classId: string, level: number): string[] {
  const list = CLASS_ABILITIES[classId];
  if (!list) return [];
  return list.filter((u) => level >= u.level).map((u) => u.abilityId);
}
