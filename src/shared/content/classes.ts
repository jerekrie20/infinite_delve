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
  /** Client texture key for this class's sprite. */
  sprite: string;
}

export const CLASSES: Record<HeroClass, ClassDef> = {
  squire: {
    id: 'squire',
    name: 'Squire',
    baseMaxHp: 40,
    hpPerLevel: 8,
    baseAttack: 6,
    attackPerLevel: 1,
    sprite: 'hero',
  },
};

/** Convenience lookup with a safe fallback to the squire. */
export function classDef(id: HeroClass): ClassDef {
  return CLASSES[id] ?? CLASSES.squire;
}
