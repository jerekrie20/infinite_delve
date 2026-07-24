// Playable CLASSES as data. Per-class base stats live here (different classes
// scale differently); global hero rules (level cap, xp curve, defense cap) live
// in TUNING.hero. hero.ts derives a hero's maxHp/attack from CLASSES[class] +
// level + equipped gear. Add a class by adding a row (and its HeroClass id).

import type { HeroClass } from '../delve';

export interface ClassDef {
  id: HeroClass;
  name: string;
  /** HP at level 1. */
  baseMaxHp: number;
  /** HP gained per level. */
  hpPerLevel: number;
  /** Attack at level 1. */
  baseAttack: number;
  /** Attack gained per level. */
  attackPerLevel: number;
  /** Base attack interval in ms (class-kits table: Squire 2.0s · Archer 1.5s ·
   *  Apprentice 3.0s). Effective interval = this ÷ (1 + attackSpeedPct/100). */
  attackIntervalMs: number;
  /** Mana at level 1 (deriveStats seeds maxMana from this — see gear.ts). */
  baseMana: number;
  /** Mana gained per level. */
  manaPerLevel: number;
  /** Client texture key for this class's sprite. NOTE: combat hardcodes the
   *  'hero' texture today; per-class + grim-glow regen is the Phase 3 art pass
   *  (asset-manifest) — these keys are the intended targets, unused until then. */
  sprite: string;
}

// Per-class base stats from the class-kits catalog (game_design/mechanics/
// 01-classes/class-kits.md — "Chain overviews" table). Squire = frontline
// bruiser (slow, tanky), Archer = fast precise hunter, Apprentice = slow heavy
// caster (highest ATK, most mana, longest beat).
export const CLASSES: Record<HeroClass, ClassDef> = {
  squire: {
    id: 'squire',
    name: 'Squire',
    baseMaxHp: 40,
    hpPerLevel: 8,
    baseAttack: 6,
    attackPerLevel: 1,
    attackIntervalMs: 2000,
    baseMana: 50,
    manaPerLevel: 5,
    sprite: 'hero',
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    baseMaxHp: 30,
    hpPerLevel: 6,
    baseAttack: 5,
    attackPerLevel: 0.8,
    attackIntervalMs: 1500,
    baseMana: 40,
    manaPerLevel: 4,
    sprite: 'archer',
  },
  apprentice: {
    id: 'apprentice',
    name: 'Apprentice',
    baseMaxHp: 26,
    hpPerLevel: 5,
    baseAttack: 8,
    attackPerLevel: 1.4,
    attackIntervalMs: 3000,
    baseMana: 80,
    manaPerLevel: 8,
    sprite: 'apprentice',
  },
};

/** Convenience lookup with a safe fallback to the squire. */
export function classDef(id: HeroClass): ClassDef {
  return CLASSES[id] ?? CLASSES.squire;
}
