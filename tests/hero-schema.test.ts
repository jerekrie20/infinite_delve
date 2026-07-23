// StoredHero versioned migration (heroSchema.ts) against v1 fixtures — the
// DATA_SCHEMA rule set: explicit steps, unknown fields preserved, idempotent,
// never downgrade.

import { assert, check, describe } from './helpers';
import {
  STORED_HERO_VERSION,
  migrateStoredHero,
  newStoredHero,
  resetStoredHero,
} from '../src/server/core/heroSchema';

describe('hero-schema');

const NOW = Date.parse('2026-07-22T12:00:00Z');

/** A real pre-versioning save: no `v`, old gear keys, missing back-fill fields,
 *  plus an unknown field a future hotfix might have written. */
const V1_FIXTURE = {
  class: 'squire',
  level: 4,
  xp: 55,
  hp: 60,
  maxHp: 72,
  gold: 321,
  stash: [
    { id: 'itm_old1', slot: 'hand1', base: 'blade', rarity: 'rare', stats: { attack: 9, critChance: 12 } },
    { id: 'itm_ok2', slot: 'head', base: 'helm', r: 'common', s: { maxHp: 4 } },
    { notAnItem: true }, // structurally invalid → dropped
  ],
  equipped: {
    body: { id: 'itm_old3', slot: 'body', base: 'armor', rarity: 'epic', stats: { maxHp: 20 } },
  },
  futureFlag: true,
};

await check('v1 fixture migrates to the current version with lean gear keys', () => {
  const h = migrateStoredHero({ ...V1_FIXTURE }, NOW);
  assert.equal(h.v, STORED_HERO_VERSION);
  assert.equal(h.stash.length, 2); // invalid item dropped
  const old = h.stash.find((i) => i.id === 'itm_old1');
  assert.ok(old);
  assert.equal(old.r, 'rare');
  assert.equal(old.s.increasedCritPct, 12); // critChance renamed
  assert.equal(old.s.attack, 9);
  assert.ok(!('critChance' in old.s), 'old stat key removed');
  assert.ok(!('rarity' in old), 'old rarity key removed');
  assert.equal(h.equipped.body?.r, 'epic');
});

await check('v1 back-fills bestDepth and lastSeenAt from the passed clock', () => {
  const h = migrateStoredHero({ ...V1_FIXTURE }, NOW);
  assert.equal(h.bestDepth, 1);
  assert.equal(h.lastSeenAt, NOW);
});

await check('unknown top-level fields are preserved (forward compatibility)', () => {
  const h = migrateStoredHero({ ...V1_FIXTURE }, NOW);
  assert.equal((h as unknown as Record<string, unknown>).futureFlag, true);
});

await check('migration is idempotent: migrate(migrate(x)) ≡ migrate(x)', () => {
  const once = migrateStoredHero({ ...V1_FIXTURE }, NOW);
  const twice = migrateStoredHero(JSON.parse(JSON.stringify(once)), NOW);
  assert.deepEqual(twice, once);
});

await check('a blob from a NEWER version passes through untouched', () => {
  const future = { v: STORED_HERO_VERSION + 5, class: 'squire', shinyNewField: [1, 2, 3] };
  const h = migrateStoredHero({ ...future }, NOW);
  assert.equal(h.v, STORED_HERO_VERSION + 5);
  assert.deepEqual((h as unknown as Record<string, unknown>).shinyNewField, [1, 2, 3]);
});

await check('newStoredHero writes the current version and a full-health squire', () => {
  const h = newStoredHero(NOW);
  assert.equal(h.v, STORED_HERO_VERSION);
  assert.equal(h.class, 'squire');
  assert.equal(h.hp, h.maxHp);
  assert.equal(h.maxHp, 40);
  assert.equal(h.lastSeenAt, NOW);
});

await check('resetStoredHero: a leveled, geared hero becomes a fresh L1 squire', () => {
  const h = newStoredHero(NOW - 9999);
  h.level = 30;
  h.xp = 5000;
  h.gold = 123456;
  h.bestDepth = 42;
  h.stash = [{ id: 'itm_x', slot: 'hand1', r: 'epic', base: 'blade', s: { attack: 20 } }];
  h.equipped = { head: { id: 'itm_y', slot: 'head', r: 'rare', base: 'helm', s: { maxHp: 9 } } };
  resetStoredHero(h, NOW);
  assert.deepEqual(h, newStoredHero(NOW));
});

await check('resetStoredHero drops unknown fields (clean slate, unlike migration)', () => {
  const h = newStoredHero(NOW);
  (h as unknown as Record<string, unknown>).legacyExperiment = { big: true };
  resetStoredHero(h, NOW);
  assert.equal('legacyExperiment' in h, false);
});

await check('resetStoredHero is replay-safe: ignores input, same nowMs → same hero', () => {
  const a = newStoredHero(NOW);
  a.gold = 777;
  resetStoredHero(a, NOW);
  const b = newStoredHero(NOW);
  b.level = 50;
  resetStoredHero(b, NOW);
  assert.deepEqual(a, b);
});

// ── Phase 2: v2 → v3 migration + checkpoints ──────────────────────────

/** A real v2 hero blob (current production shape, from before the v3 bump). */
const V2_FIXTURE = {
  v: 2,
  class: 'squire',
  level: 12,
  xp: 340,
  hp: 128,
  maxHp: 128,
  gold: 5500,
  bestDepth: 15,
  lastSeenAt: NOW - 86400000, // 1 day ago
  stash: [
    { id: 'itm_a', slot: 'hand1', r: 'rare', base: 'blade', s: { attack: 15 } },
  ],
  equipped: {
    hand1: { id: 'itm_a', slot: 'hand1', r: 'rare', base: 'blade', s: { attack: 15 } },
    body: { id: 'itm_b', slot: 'body', r: 'uncommon', base: 'armor', s: { maxHp: 22 } },
  },
  futureFlag: 'keep me',
};

await check('v2 fixture migrates to v3 with checkpoints and per-class state', () => {
  const h = migrateStoredHero({ ...V2_FIXTURE }, NOW);
  assert.equal(h.v, 3);
  // Existing v2 fields preserved.
  assert.equal(h.class, 'squire');
  assert.equal(h.level, 12);
  assert.equal(h.gold, 5500);
  assert.equal(h.bestDepth, 15);
  // New v3 fields.
  assert.deepEqual(h.checkpoints, [1]);
  assert.deepEqual(h.automation, { tiers: 0 });
  assert.equal(h.activeClass, 'squire');
  assert.ok(h.classes?.squire, 'squire class entry must exist');
  assert.equal(h.classes.squire.level, 12);
  assert.equal(h.classes.squire.xp, 340);
  assert.equal(h.classes.squire.stage, 0);
  assert.equal(h.classes.squire.equipped.hand1?.id, 'itm_a');
  assert.equal(h.classes.squire.equipped.body?.id, 'itm_b');
  assert.deepEqual(h.classes.squire.rotation, []);
  assert.deepEqual(h.masteries, []);
  assert.equal(h.stashPages, 1);
  assert.deepEqual(h.cosmetics, []);
  assert.deepEqual(h.essences, [0, 0, 0, 0, 0]);
  // Forward compat preserved.
  assert.equal((h as unknown as Record<string, unknown>).futureFlag, 'keep me');
});

await check('v2→v3 migration is idempotent', () => {
  const once = migrateStoredHero({ ...V2_FIXTURE }, NOW);
  const twice = migrateStoredHero(JSON.parse(JSON.stringify(once)), NOW);
  assert.deepEqual(twice, once);
});

await check('newStoredHero v3 has checkpoints starting at [1]', () => {
  const h = newStoredHero(NOW);
  assert.equal(h.v, 3);
  assert.deepEqual(h.checkpoints, [1]);
  assert.ok(h.classes.squire?.loadout[1] === 'slam');
  assert.ok(h.classes.squire?.loadout[2] === 'fortify');
});

await check('newStoredHero: reset drops to v3 shape, not v2', () => {
  const h = newStoredHero(NOW);
  h.checkpoints = [1, 11, 21];
  h.gold = 99;
  resetStoredHero(h, NOW);
  assert.equal(h.v, 3);
  assert.deepEqual(h.checkpoints, [1]); // reset wipes progress
  assert.equal(h.gold, 0);
});
