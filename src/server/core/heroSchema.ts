// The PERSISTED hero shape + its versioned migration table (DATA_SCHEMA.md is
// normative — the version ledger there and STORED_HERO_VERSION here move
// together). PURE: no redis import, no Date.now() — time enters as an explicit
// `nowMs` so every migration is deterministic and tsx-testable with fixtures.
// The one thing you must not break: a migration NEVER drops unknown fields
// (forward compatibility) and NEVER throws on old-but-valid saves — bricking a
// save is worse than any bug a migration fixes.

import type { GearItem, GearSlot, HeroClass } from '../../shared/delve';
import { classDef } from '../../shared/content/classes';

/** Current write version. Bump WITH a new MIGRATIONS step + a fixture test +
 *  the DATA_SCHEMA.md ledger row — never alone. */
export const STORED_HERO_VERSION = 2;

/** Persisted subset (Redis `hero:{userId}`). Derived combat stats are
 *  recomputed on read, never stored. */
export interface StoredHero {
  /** Schema version this blob was written at (see DATA_SCHEMA.md ledger). */
  v: number;
  class: HeroClass;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** Deepest depth ever banked; drives the idle rate. */
  bestDepth: number;
  /** Epoch ms of last interaction; offline idle accrues from here. */
  lastSeenAt: number;
  stash: GearItem[];
  equipped: Partial<Record<GearSlot, GearItem>>;
}

export function newStoredHero(nowMs: number): StoredHero {
  const maxHp = classDef('squire').baseMaxHp;
  return {
    v: STORED_HERO_VERSION,
    class: 'squire',
    level: 1,
    xp: 0,
    hp: maxHp,
    maxHp,
    gold: 0,
    bestDepth: 1,
    lastSeenAt: nowMs,
    stash: [],
    equipped: {},
  };
}

/** FACTORY RESET, in place — the self-service "start fresh" (SECURITY_PERF).
 *  Unlike migration, unknown fields do NOT survive: the player asked for a
 *  clean slate, so every key is dropped before the fresh hero is written in.
 *  Pure + replay-safe (ignores the input entirely) — valid as an updateHero
 *  mutator. The Record cast is the delete-unknown-keys boundary, same class
 *  of exception as the sanitize cast. */
export function resetStoredHero(hero: StoredHero, nowMs: number): void {
  const blob = hero as unknown as Record<string, unknown>;
  for (const key of Object.keys(blob)) delete blob[key];
  Object.assign(hero, newStoredHero(nowMs));
}

// ---- GearItem migration: old keys → lean keys (part of v1 → v2) -------------

/** Migrate a single item from the old stored shape (`name`, `rarity`, `stats`)
 *  to the lean shape (`r`, `s`, name rebuilt on read). Idempotent — items
 *  already in the new shape pass through unchanged. Casts happen AFTER the
 *  structural checks (the sanctioned sanitize-boundary exception). */
function migrateItem(raw: Record<string, unknown>): GearItem | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.slot !== 'string') return null;
  // Old key `rarity` → new key `r`; new key wins if both present.
  const r = (raw.r ?? raw.rarity ?? 'common') as GearItem['r'];
  // Old key `stats` → new key `s`; new key wins if both present.
  const s = (raw.s ?? raw.stats ?? {}) as GearItem['s'];
  // Old stat `critChance` → `increasedCritPct` (crit rework: additive → PoE model).
  // Old items with +crit become "+% increased crit chance" so they still work.
  const so = s as Record<string, number | undefined>;
  if (so.critChance != null && so.increasedCritPct == null) {
    so.increasedCritPct = so.critChance;
    delete so.critChance;
  }
  return {
    id: raw.id as string,
    slot: raw.slot as GearSlot,
    r,
    base: (raw.base as string) ?? 'blade',
    ...(raw.set ? { set: raw.set as string } : {}),
    ...(raw.unique ? { unique: raw.unique as string } : {}),
    s,
  };
}

function migrateGearArray(arr: unknown): GearItem[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((it) => migrateItem(it as Record<string, unknown>)).filter(Boolean) as GearItem[];
}

function migrateGearRecord(obj: unknown): Partial<Record<GearSlot, GearItem>> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Partial<Record<GearSlot, GearItem>> = {};
  for (const [slot, raw] of Object.entries(obj as Record<string, unknown>)) {
    const item = migrateItem(raw as Record<string, unknown>);
    if (item) out[slot as GearSlot] = item;
  }
  return out;
}

// ---- Version step table -----------------------------------------------------

type MigrationStep = (blob: Record<string, unknown>, nowMs: number) => Record<string, unknown>;

/** v1 (implicit — no `v` field): original StoredHero. Consolidates the old
 *  key-sniffing: back-fill fields added after launch, lean gear keys. */
const migrateV1toV2: MigrationStep = (blob, nowMs) => {
  const out = { ...blob };
  if (typeof out.bestDepth !== 'number') out.bestDepth = 1;
  if (typeof out.lastSeenAt !== 'number') out.lastSeenAt = nowMs;
  out.stash = migrateGearArray(out.stash);
  out.equipped = migrateGearRecord(out.equipped);
  return out;
};

/** Keyed by the version a step migrates FROM (vN → vN+1). */
const MIGRATIONS: Record<number, MigrationStep> = {
  1: migrateV1toV2,
};

/** Bring a parsed `hero:{userId}` blob up to STORED_HERO_VERSION. Spread-copies
 *  so unknown top-level fields survive (forward compatibility); a blob from a
 *  NEWER version passes through untouched (never downgrade a save). Caller
 *  recomputes derived fields (maxHp) after — migration only reshapes. */
export function migrateStoredHero(raw: Record<string, unknown>, nowMs: number): StoredHero {
  let blob: Record<string, unknown> = { ...raw };
  let version = typeof blob.v === 'number' ? blob.v : 1;
  while (version < STORED_HERO_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`StoredHero migration missing for v${version}`);
    blob = step(blob, nowMs);
    version += 1;
    blob.v = version;
  }
  // Sanitize boundary: the step table has normalized the shape (or the blob is
  // from a newer schema we must not touch) — cast after validation.
  return blob as unknown as StoredHero;
}
