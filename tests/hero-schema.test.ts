// StoredHero versioned migration (heroSchema.ts) against v1 fixtures — the
// DATA_SCHEMA rule set: explicit steps, unknown fields preserved, idempotent,
// never downgrade.

import { assert, check, describe } from './helpers';
import {
  STORED_HERO_VERSION,
  migrateStoredHero,
  newStoredHero,
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
