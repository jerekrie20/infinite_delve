// Shared types for Delve: hero state, gear, and the request/response shapes for
// the game endpoints. Kept pure (no server/client imports) so both the TS
// server and the Phaser client speak the same contract.

import type { IdleGains } from './waves';

// ---- Hero & gear ----------------------------------------------------------

export type HeroClass = 'squire';

export type GearSlot =
  | 'head'
  | 'body'
  | 'hand1'
  | 'hand2'
  | 'legs'
  | 'feet'
  | 'ring1'
  | 'ring2'
  | 'amulet';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Flat stat bonuses a piece of gear grants while equipped. */
export interface GearStats {
  attack?: number;
  maxHp?: number;
  /** Percent damage reduction, 0..100. */
  defensePct?: number;
}

export interface GearItem {
  id: string;
  name: string;
  slot: GearSlot;
  rarity: Rarity;
  stats: GearStats;
}

/** Persisted hero state (Redis `hero:{userId}`), enriched with derived combat
 * stats (attack/defense/xpToNext) when returned to the client. */
export interface Hero {
  class: HeroClass;
  level: number;
  xp: number;
  /** XP required to reach the next level (derived). */
  xpToNext: number;
  hp: number;
  maxHp: number;
  /** Derived: base + per-level + equipped bonuses. */
  attack: number;
  /** Derived percent damage reduction, 0..100. */
  defense: number;
  gold: number;
  /** Deepest depth ever banked (via extract). Drives the idle income rate. */
  bestDepth: number;
  stash: GearItem[];
  equipped: Partial<Record<GearSlot, GearItem>>;
}

// ---- Delve map ------------------------------------------------------------

export type Biome = 'meadow';

/** Terrain kinds, stored as ints in `DelveMap.tiles` (row-major) for a compact
 * payload the GameMaker client can index directly. */
export const Terrain = {
  Grass: 0,
  Tree: 1,
  Water: 2,
  Hill: 3,
} as const;
export type TerrainKind = (typeof Terrain)[keyof typeof Terrain];

/** Grass and Hill are walkable; Tree and Water block movement. */
export const isWalkable = (t: number): boolean =>
  t === Terrain.Grass || t === Terrain.Hill;

export interface Point {
  x: number;
  y: number;
}

export type MonsterKind = 'grunt' | 'swarm';

export interface Monster {
  id: string;
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
  attack: number;
  /** Percent damage reduction, 0..100. */
  defense: number;
  /** Reward granted to the hero when this monster is defeated. */
  xp: number;
  gold: number;
}

export interface LootSpot {
  id: string;
  x: number;
  y: number;
  gold: number;
  /** A gear drop, if this spot rolled one. */
  item?: GearItem;
}

/** Purely cosmetic ground clutter — never blocks movement, never referenced by
 * id. The client draws these once and forgets them (no server round-trip). */
export type DecorKind = 'rock' | 'bush' | 'flowers' | 'log' | 'mushrooms';

export interface DecorSpot {
  x: number;
  y: number;
  kind: DecorKind;
}

export interface DelveMap {
  seed: number;
  /** How deep this delve is; scales monster stats & population. v0 = 1. */
  depth: number;
  biome: Biome;
  width: number;
  height: number;
  /** Row-major `TerrainKind` values, length width*height. */
  tiles: number[];
  /**
   * Row-major elevation level per tile, 0..3, same indexing as `tiles`.
   * Orthogonal to `tiles`: `tiles[i]` is *what the ground is made of*,
   * `heights[i]` is *how high it stands*. The isometric renderer lifts a tile
   * by `heights[i] * LEVEL_PX` screen pixels and draws cliff faces where a tile
   * is taller than a neighbor. A grass tile can sit at any height.
   */
  heights: number[];
  /** Where the hero starts. */
  spawn: Point;
  /** The one extract point; reach it to bank the run. */
  extract: Point;
  monsters: Monster[];
  loot: LootSpot[];
  /** Non-blocking ground clutter scattered on open grass for visual variety. */
  decor: DecorSpot[];
}

/**
 * Two adjacent walkable tiles are connected only if the elevation step between
 * them is at most this. A step of 1 (16px) is a climbable stair; a step of 2+
 * is an impassable cliff you must route around. Must match the client's
 * movement rule so the server's connectivity guarantee holds in-game.
 */
export const MAX_CLIMBABLE_STEP = 1;

// ---- Endpoint contracts ---------------------------------------------------

export interface HeroResponse {
  hero: Hero;
  /** Offline gains auto-collected since the player was last seen (idle looter).
   *  Present on the app-open call so the client can show "Welcome back, +N". */
  idle?: IdleGains;
}

export type RunOutcome = 'extracted' | 'died';

/** Client reports the end of an active run. The server recomputes the reward
 *  from `depthReached` (never trusts a client gold total) and, on extract,
 *  banks it + raises bestDepth. */
export interface RunResultRequest {
  outcome: RunOutcome;
  /** How many depths the hero cleared this run (1 = first monster killed). */
  depthReached: number;
}

export interface RunResultResponse {
  hero: Hero;
  outcome: RunOutcome;
  gained: {
    gold: number;
    xp: number;
    levelsGained: number;
    /** New best depth after this run (unchanged on death). */
    bestDepth: number;
  };
}

export interface DelveStartRequest {
  /** Optional: push deeper (endless is deferred; v0 defaults to 1). */
  depth?: number;
}

export interface DelveStartResponse {
  delve: DelveMap;
  hero: Hero;
}

export type DelveOutcome = 'extracted' | 'died';

export interface DelveResultRequest {
  /** Monster ids the client reports as defeated this run. */
  killed: string[];
  /** Loot-spot ids the client reports as collected this run. */
  lootGrabbed: string[];
  depth: number;
  outcome: DelveOutcome;
}

export interface DelveResultResponse {
  hero: Hero;
  outcome: DelveOutcome;
  /** What was banked (all zero/empty on death). */
  gained: {
    xp: number;
    gold: number;
    items: GearItem[];
    levelsGained: number;
  };
}
