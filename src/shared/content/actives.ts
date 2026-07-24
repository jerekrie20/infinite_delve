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
  /** Probability 0..1 the status applies (rider procs, e.g. Fire Bolt's 15%
   *  Burn). Omitted = always applies. */
  chance?: number;
  /** Multiply the preset's default magnitude — scales DoTs off the caster's
   *  attack without a hardcoded flat value (e.g. Pyroclasm's stronger Burn).
   *  Ignored when `magnitude` is set. */
  potencyMult?: number;
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
  /** Cooldown in ms (0 for basics). Effective cd = this × (1 − CDR/100). */
  cooldownMs: number;
  /** Multiplier on the hero's ATK for damage-dealing abilities/styles. */
  damageMult?: number;
  /** How many times the damage component repeats (default 1) — multi-hit
   *  abilities like Whirlwind (3×) and Volley (4×). */
  hits?: number;
  /** % of the target's defense this ability's hits ignore (armor pen — e.g.
   *  Piercing Shot 30, Void Lance 50). */
  defIgnorePct?: number;
  /** Hits always crit (Deadeye). */
  guaranteedCrit?: boolean;
  /** Grant the caster a Shield = this % of maxHp when cast (Shield Wall, Mana
   *  Shield, Aegis Oath). */
  shieldPctMaxHp?: number;
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

// ---- The registry (option-1 column for all 3 chains — class-kits.md) ----------
//
// Numbers mirror the class-kits catalog v1 (the design source). Slots 4-5 unlock
// at L25/L45; the promotion GATE those levels sit behind is Phase 5 — until then
// unlockedAbilities gates on level alone (the base behavior).

export const ACTIVES: Record<string, ActiveDef> = {
  // ── ⚔️ Squire ──────────────────────────────────────────────────
  slam: {
    id: 'slam', name: 'Slam', icon: '💥', slot: 1, basic: true,
    manaCost: 0, cooldownMs: 0, damageMult: 1.15, targeting: 'front',
    description: 'Your attack style: a heavy overhead strike dealing 115% weapon damage.',
  },
  fortify: {
    id: 'fortify', name: 'Fortify', icon: '🛡️', slot: 2,
    manaCost: 25, cooldownMs: 20000,
    statuses: [{ id: 'fortify', side: 'self', magnitude: -50, durationMs: 3000 }],
    description: 'Raise your guard, reducing all incoming damage by 50% for 3 seconds.',
  },
  tauntingShout: {
    id: 'tauntingShout', name: 'Taunting Shout', icon: '📢', slot: 3,
    manaCost: 15, cooldownMs: 12000,
    statuses: [{ id: 'weaken', side: 'target', magnitude: -20, durationMs: 5000 }],
    description: 'Bellow a challenge, weakening the enemy — their attack falls 20% for 5 seconds.',
  },
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', icon: '🌀', slot: 4,
    manaCost: 30, cooldownMs: 15000, damageMult: 0.9, hits: 3, targeting: 'front',
    description: 'Spin through the front line, landing 3 strikes of 90% weapon damage each.',
  },
  aegisOath: {
    id: 'aegisOath', name: 'Aegis Oath', icon: '🛡️', slot: 5,
    manaCost: 45, cooldownMs: 40000, shieldPctMaxHp: 40,
    statuses: [{ id: 'fortify', side: 'self', magnitude: -40, durationMs: 5000 }],
    description: 'Swear the oath: a Shield worth 40% of your max HP and 40% less damage taken for 5 seconds.',
  },

  // ── 🏹 Archer ──────────────────────────────────────────────────
  piercingShot: {
    id: 'piercingShot', name: 'Piercing Shot', icon: '🏹', slot: 1, basic: true,
    manaCost: 0, cooldownMs: 0, damageMult: 1.05, defIgnorePct: 30, targeting: 'front',
    description: 'Your attack style: a precise shot dealing 105% weapon damage that ignores 30% of armor.',
  },
  tumble: {
    id: 'tumble', name: 'Tumble', icon: '🤸', slot: 2,
    manaCost: 15, cooldownMs: 15000,
    statuses: [{ id: 'statMod', side: 'self', modTarget: 'dodgeChance', magnitude: 40, durationMs: 3000 }],
    description: 'Roll clear of danger, gaining +40% dodge for 3 seconds.',
  },
  huntersMark: {
    id: 'huntersMark', name: "Hunter's Mark", icon: '🎯', slot: 3,
    manaCost: 15, cooldownMs: 14000,
    statuses: [{ id: 'mark', side: 'target', magnitude: 25, durationMs: 6000 }],
    description: 'Mark the prey — it takes 25% more damage for 6 seconds.',
  },
  volley: {
    id: 'volley', name: 'Volley', icon: '🏹', slot: 4,
    manaCost: 28, cooldownMs: 15000, damageMult: 0.7, hits: 4, targeting: 'front',
    description: 'Loose a volley of 4 arrows, each dealing 70% weapon damage.',
  },
  deadeye: {
    id: 'deadeye', name: 'Deadeye', icon: '🎯', slot: 5,
    manaCost: 45, cooldownMs: 35000, damageMult: 5.0, guaranteedCrit: true, targeting: 'front',
    description: 'Take the perfect shot: 500% weapon damage, guaranteed to critically strike.',
  },

  // ── 🔮 Apprentice ──────────────────────────────────────────────
  fireBolt: {
    id: 'fireBolt', name: 'Fire Bolt', icon: '🔥', slot: 1, basic: true,
    manaCost: 0, cooldownMs: 0, damageMult: 1.15, targeting: 'front',
    statuses: [{ id: 'burn', side: 'target', chance: 0.15 }],
    description: 'Your attack style: a bolt of flame for 115% weapon damage with a 15% chance to Burn.',
  },
  manaShield: {
    id: 'manaShield', name: 'Mana Shield', icon: '🔮', slot: 2,
    manaCost: 25, cooldownMs: 20000, shieldPctMaxHp: 30,
    description: 'Weave a Shield worth 30% of your max HP.',
  },
  iceNova: {
    id: 'iceNova', name: 'Ice Nova', icon: '❄️', slot: 3,
    manaCost: 30, cooldownMs: 18000, damageMult: 1.0, targeting: 'front',
    statuses: [{ id: 'stun', side: 'target', durationMs: 2000 }],
    description: 'Erupt with frost for 100% weapon damage, stunning the enemy for 2 seconds.',
  },
  fireball: {
    id: 'fireball', name: 'Fireball', icon: '☄️', slot: 4,
    manaCost: 40, cooldownMs: 18000, damageMult: 3.5, targeting: 'front',
    statuses: [{ id: 'burn', side: 'target' }],
    description: 'Hurl a fireball for 350% weapon damage and set the enemy alight (Burn).',
  },
  pyroclasm: {
    id: 'pyroclasm', name: 'Pyroclasm', icon: '🌋', slot: 5,
    manaCost: 70, cooldownMs: 45000, damageMult: 7.0, targeting: 'front',
    statuses: [{ id: 'burn', side: 'target', potencyMult: 1.5, durationMs: 5000 }],
    description: 'Unleash cataclysmic fire for 700% weapon damage and a searing 5-second Burn.',
  },
};

/** Unlock table: class → ability ids + level requirements, in unlock order.
 *  Slot schedule (class-kits.md): 1 → L1 · 2 → L5 · 3 → L12 · 4 → L25 · 5 → L45. */
export const CLASS_ABILITIES: Record<string, AbilityUnlock[]> = {
  squire: [
    { abilityId: 'slam', classId: 'squire', level: 1 },
    { abilityId: 'fortify', classId: 'squire', level: 5 },
    { abilityId: 'tauntingShout', classId: 'squire', level: 12 },
    { abilityId: 'whirlwind', classId: 'squire', level: 25 },
    { abilityId: 'aegisOath', classId: 'squire', level: 45 },
  ],
  archer: [
    { abilityId: 'piercingShot', classId: 'archer', level: 1 },
    { abilityId: 'tumble', classId: 'archer', level: 5 },
    { abilityId: 'huntersMark', classId: 'archer', level: 12 },
    { abilityId: 'volley', classId: 'archer', level: 25 },
    { abilityId: 'deadeye', classId: 'archer', level: 45 },
  ],
  apprentice: [
    { abilityId: 'fireBolt', classId: 'apprentice', level: 1 },
    { abilityId: 'manaShield', classId: 'apprentice', level: 5 },
    { abilityId: 'iceNova', classId: 'apprentice', level: 12 },
    { abilityId: 'fireball', classId: 'apprentice', level: 25 },
    { abilityId: 'pyroclasm', classId: 'apprentice', level: 45 },
  ],
};

/** Which abilities a class has unlocked at a given level. */
export function unlockedAbilities(classId: string, level: number): string[] {
  const list = CLASS_ABILITIES[classId];
  if (!list) return [];
  return list.filter((u) => level >= u.level).map((u) => u.abilityId);
}
