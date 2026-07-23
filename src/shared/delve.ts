// Shared types for Delve: hero state, gear, and the request/response shapes for
// the game endpoints. Kept pure (no server/client imports) so both the TS
// server and the Phaser client speak the same contract.

import type { IdleGains } from './waves';
import type { StatId } from './content/stats';

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
  | 'amulet'
  | 'belt';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type MonsterRarity = 'normal' | 'elite' | 'boss';

/** One combat exchange for the summary tab. */
export interface CombatTurn {
  depth: number;
  heroAction: string;
  heroDmg: number;
  heroCrit: boolean;
  monsterAction: string;
  monsterDmg: number;
  monsterCrit: boolean;
}

/** Stat bonuses a piece of gear grants while equipped — a sparse map over the
 *  stat registry (only the stats this item rolled are present). */
export type GearStats = Partial<Record<StatId, number>>;

/** A gear item that dropped or is worn. The stored shape uses short keys (`r`,
 *  `s`) because every hero carries up to ~36 items in Redis and the bytes saved
 *  per key add up at scale. `name` is NOT stored — rebuild it via `itemName()`
 *  (content/items.ts). */
export interface GearItem {
  id: string;
  /** Gear slot this item occupies (kept — cheap, used everywhere). */
  slot: GearSlot;
  /** Rarity tier (short key `r` in JSON). */
  r: Rarity;
  /** Base-item id this rolled from (content/items.ts BASES) — drives name + slot. */
  base: string;
  /** Set id this item belongs to (content/sets.ts), if any — colors it + counts
   *  toward set bonuses. Stamped from set membership at roll/sanitize time. */
  set?: string;
  /** Unique-item id (content/uniques.ts), if this is a unique — colors it gold. */
  unique?: string;
  /** One-to-many stat bonuses (primary + rarity-many affixes; sparse map).
   *  Short key `s` in JSON. */
  s: GearStats;
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
  /** Derived total crit chance, whole percent (PoE: base × (1 + increased/100)). */
  critChance: number;
  /** Derived crit damage multiplier (1.5 base, gear can push to ~2.5). */
  critMultiplier: number;
  /** Derived total lifesteal, whole percent of damage dealt (gear/set). */
  lifesteal: number;
  /** Derived dodge chance, whole percent. */
  dodge: number;
  /** Derived HP regen per second. */
  hpRegen: number;
  /** Derived bonus gold from kills, whole percent. */
  goldFind: number;
  /** Current mana (spent on active abilities). */
  mana: number;
  /** Derived max mana (class base + per-level). */
  maxMana: number;
  /** Active ability ids unlocked by this hero's class + level. */
  abilities: string[];
  gold: number;
  /** Deepest depth ever banked (via extract). Drives the idle income rate. */
  bestDepth: number;
  stash: GearItem[];
  equipped: Partial<Record<GearSlot, GearItem>>;
}

// ---- Monsters -------------------------------------------------------------

/** Behavioral archetype of a monster template (drives combat flavor + drop
 *  rules, e.g. swarms drop more). Canonical here; re-exported by
 *  content/monsters.ts and waves.ts. */
export type MonsterKind = 'grunt' | 'swarm' | 'brute' | 'caster';

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
  /** Gear found this run (unbanked). Banked on extract, discarded on death.
   *  Server sanitizes/clamps it (v0 trusts the client on drops). */
  haul?: GearItem[];
  /** Client-generated id for this run (≤64 chars). The server awards each
   *  runId at most once and replays the stored summary to duplicates — this
   *  is what makes the client's failed-post retry queue safe. */
  runId?: string;
}

export interface RunResultResponse {
  hero: Hero;
  outcome: RunOutcome;
  /** True when this runId was already banked — `gained` is the ORIGINAL
   *  summary (replayed), nothing was awarded twice. */
  duplicate?: boolean;
  gained: {
    gold: number;
    xp: number;
    levelsGained: number;
    /** New best depth after this run (unchanged on death). */
    bestDepth: number;
    /** Gear items added to the hero this run (extract only). */
    itemsBanked: number;
    /** How many of those auto-equipped (beat the current slot item). */
    itemsEquipped: number;
  };
}

/** Manual gear management from the review panel: equip a stash item OR unequip
 *  a slot (exactly one of the two). */
export interface EquipRequest {
  /** Stash item id to equip. */
  itemId?: string;
  /** Slot to unequip back to the stash. */
  unequip?: GearSlot;
}

export interface EquipResponse {
  hero: Hero;
}

/** Sell a stash item for gold. */
export interface SellRequest {
  itemId: string;
}

export interface SellResponse {
  hero: Hero;
  /** Gold received (0 if the item wasn't in the stash). */
  goldGained: number;
}

