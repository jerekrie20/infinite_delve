// Monster TEMPLATES as data. Each template defines a creature type with base
// stats, a passive pool, and a depth range where it appears. The spawn engine
// (waves.ts) scales stats by depth + rarity, rolls passives, and picks which
// template appears at each depth — so adding a new monster is one row here
// + one pool entry in passives.ts.
//
// Bosses are templates with a bossInterval; they override the normal spawn at
// every Nth depth within their range. Elites are rolled probabilistically on
// non-boss depths and draw extra stats from the template's passive pool.

import type { MonsterKind } from '../delve';

export type { MonsterKind };

/** Per-kind base attack intervals ⚙ (roster.md pack-composition table is
 *  normative). A template may override with its own `intervalMs`; bosses use
 *  their kind's interval. Effective = interval ÷ (1 + attackSpeedPct/100). */
export const KIND_INTERVAL_MS: Record<MonsterKind, number> = {
  grunt: 2000,
  swarm: 1400,
  brute: 2600,
  caster: 3200,
};

/** Attack interval for a template: its override, else its kind's default. */
export function templateIntervalMs(t: MonsterTemplate): number {
  return t.intervalMs ?? KIND_INTERVAL_MS[t.kind];
}

export interface MonsterTemplate {
  id: string;
  name: string;
  sprite: string;          // client texture key, loaded in LaneScene.preload
  kind: MonsterKind;       // 'grunt' | 'swarm' | 'brute' | 'caster'
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
  };
  /** Multiplier on depth-scaled stats (same role as old statMult). */
  statMult: number;
  /** Which passive pool this template draws from (passives.ts). */
  passivePool: string;
  /** First depth this template can appear. */
  depthMin: number;
  /** Last depth this template can appear (undefined = forever). */
  depthMax?: number;
  /** If set, this template is the boss for the given pool theme. */
  bossOf?: string;
  /** Boss spawns every N depths (must be set when bossOf is set). */
  bossInterval?: number;
  /** Attack interval override in ms (default: KIND_INTERVAL_MS[kind]). */
  intervalMs?: number;
}

// ---- The roster ---------------------------------------------------------------

export const TEMPLATES: MonsterTemplate[] = [
  // Depths 1-9: Goblin Camp
  {
    id: 'goblin_scout', name: 'Goblin Scout', sprite: 'goblin',
    kind: 'grunt', baseStats: { hp: 8, attack: 4, defense: 0 },
    statMult: 1.0, passivePool: 'goblinoid',
    depthMin: 1, depthMax: 9,
  },
  {
    id: 'goblin_brute', name: 'Goblin Brute', sprite: 'goblin',
    kind: 'brute', baseStats: { hp: 20, attack: 6, defense: 2 },
    statMult: 1.3, passivePool: 'brute',
    depthMin: 1, depthMax: 9,
  },
  {
    id: 'goblin_chief', name: 'Goblin Chieftain', sprite: 'goblin',
    kind: 'brute', baseStats: { hp: 40, attack: 8, defense: 3 },
    statMult: 1.5, passivePool: 'goblinoid',
    depthMin: 1, depthMax: 9, bossOf: 'goblinoid', bossInterval: 5,
  },

  // Depths 10-19: Crypt
  {
    id: 'skeleton', name: 'Skeleton', sprite: 'goblin', // TODO: skeleton sprite
    kind: 'grunt', baseStats: { hp: 12, attack: 5, defense: 1 },
    statMult: 1.1, passivePool: 'undead',
    depthMin: 10, depthMax: 19,
  },
  {
    id: 'skeleton_capt', name: 'Skeleton Captain', sprite: 'goblin', // TODO
    kind: 'brute', baseStats: { hp: 25, attack: 7, defense: 3 },
    statMult: 1.4, passivePool: 'undead',
    depthMin: 10, depthMax: 19,
  },
  {
    id: 'necromancer', name: 'Necromancer', sprite: 'goblin', // TODO: caster sprite
    kind: 'caster', baseStats: { hp: 50, attack: 10, defense: 4 },
    statMult: 1.6, passivePool: 'undead',
    depthMin: 10, depthMax: 19, bossOf: 'undead', bossInterval: 10,
  },

  // Depths 20-29: Warrens
  {
    id: 'giant_rat', name: 'Giant Rat', sprite: 'rat',
    kind: 'swarm', baseStats: { hp: 6, attack: 3, defense: 0 },
    statMult: 1.3, passivePool: 'swarm',
    depthMin: 20, depthMax: 29,
  },
  {
    id: 'broodmother', name: 'Broodmother', sprite: 'rat',
    kind: 'swarm', baseStats: { hp: 60, attack: 12, defense: 5 },
    statMult: 1.7, passivePool: 'swarm',
    depthMin: 20, depthMax: 29, bossOf: 'swarm', bossInterval: 10,
  },

  // Depths 30+: Deep (fewer templates — procedural scaling carries the weight)
  {
    id: 'wraith', name: 'Wraith', sprite: 'goblin', // TODO: wraith sprite
    kind: 'caster', baseStats: { hp: 16, attack: 7, defense: 2 },
    statMult: 1.2, passivePool: 'undead',
    depthMin: 30,
  },
];

// ---- Spawn selection -----------------------------------------------------------

/** All templates active at a given depth, sorted by kind priority. */
export function templatesForDepth(depth: number): MonsterTemplate[] {
  const d = Math.max(1, Math.floor(depth));
  return TEMPLATES.filter((t) => t.depthMin <= d && (t.depthMax === undefined || d <= t.depthMax));
}

/** True if this depth is a boss floor for any template in range. */
export function isBossDepth(depth: number): boolean {
  const d = Math.max(1, Math.floor(depth));
  for (const t of TEMPLATES) {
    if (!t.bossInterval || !t.bossOf) continue;
    if (d >= t.depthMin && (t.depthMax === undefined || d <= t.depthMax)) {
      if (d % t.bossInterval === 0) return true;
    }
  }
  return false;
}

/** Return the boss template for this depth, if one is scheduled. */
export function bossForDepth(depth: number): MonsterTemplate | undefined {
  const d = Math.max(1, Math.floor(depth));
  for (const t of TEMPLATES) {
    if (!t.bossInterval || !t.bossOf) continue;
    if (d >= t.depthMin && (t.depthMax === undefined || d <= t.depthMax)) {
      if (d % t.bossInterval === 0) return t;
    }
  }
  return undefined;
}
