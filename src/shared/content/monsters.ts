// Monster ARCHETYPES as data. An idle looter has a handful of archetypes +
// procedural depth scaling (not hundreds of hand-authored rows), so this is a
// small table you edit directly. Stats come from TUNING.monster scaled by depth
// and the archetype's statMult; combat.ts / waves.ts read this, never hardcode.

export type MonsterKind = 'grunt' | 'swarm';

export interface MonsterArchetype {
  id: string;
  name: string;
  kind: MonsterKind;
  /** Client texture key (loaded in LaneScene.preload). */
  sprite: string;
  /** Multiplies the depth-scaled base stats from TUNING.monster. */
  statMult: number;
  /** Spawns on depths divisible by this. 0 = the default/fallback archetype.
   *  Higher everyN wins when several match (a spike overrides the default). */
  everyN: number;
}

/** The roster. Add a new archetype (e.g. a boss every 10th) by adding a row. */
export const MONSTERS: MonsterArchetype[] = [
  { id: 'goblin', name: 'Goblin', kind: 'grunt', sprite: 'goblin', statMult: 1, everyN: 0 },
  { id: 'rat', name: 'Giant Rat', kind: 'swarm', sprite: 'rat', statMult: 1.3, everyN: 5 },
];

/** Which archetype spawns at a depth: the most-specific periodic rule (largest
 *  everyN dividing depth) wins; otherwise the default (everyN 0). */
export function archetypeForDepth(depth: number): MonsterArchetype {
  const d = Math.max(1, Math.floor(depth));
  let best: MonsterArchetype | undefined;
  for (const a of MONSTERS) {
    if (a.everyN > 0 && d % a.everyN === 0 && (!best || a.everyN > best.everyN)) {
      best = a;
    }
  }
  return best ?? MONSTERS.find((a) => a.everyN === 0) ?? MONSTERS[0]!;
}
