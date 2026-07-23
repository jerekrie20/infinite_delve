// rollGear determinism + sanitizeGearItem's clamp/reject/recompute boundary.

import { assert, check, describe } from './helpers';
import { createRng } from '../src/shared/rng';
import { gearScore, rollGear, sanitizeGearItem } from '../src/shared/content/items';
import { STATS, STAT_IDS } from '../src/shared/content/stats';

describe('items');

await check('rollGear: same seed → identical item (deep equal)', () => {
  const a = rollGear(12, createRng(42));
  const b = rollGear(12, createRng(42));
  assert.deepEqual(a, b);
});

await check('rollGear: different seeds diverge somewhere within 20 rolls', () => {
  const a = Array.from({ length: 20 }, (_, i) => rollGear(8, createRng(100 + i)));
  const ids = new Set(a.map((item) => `${item.base}:${item.r}`));
  assert.ok(ids.size > 1, 'expected varied drops across seeds');
});

await check('rollGear: rolled stats stay on implemented, valid stat ids', () => {
  for (let seed = 0; seed < 25; seed++) {
    const item = rollGear(15, createRng(seed));
    for (const id of Object.keys(item.s)) {
      assert.ok((STAT_IDS as string[]).includes(id), `unknown stat ${id}`);
    }
  }
});

await check('sanitizeGearItem: absurd claimed stat is clamped, not echoed', () => {
  const tampered = { id: 'itm_x', slot: 'hand1', r: 'common', base: 'blade', s: { attack: 999999 } };
  const clean = sanitizeGearItem(tampered, 5);
  assert.ok(clean, 'item should survive sanitize');
  assert.ok((clean.s.attack ?? 0) < 999999, 'attack must be clamped');
  assert.ok((clean.s.attack ?? 0) > 0, 'clamp should keep a sane value');
});

await check('sanitizeGearItem: invalid slot → null', () => {
  assert.equal(sanitizeGearItem({ id: 'x', slot: 'hat', r: 'common', base: 'blade', s: { attack: 3 } }, 5), null);
});

await check('sanitizeGearItem: non-object / empty stats → null', () => {
  assert.equal(sanitizeGearItem(null, 5), null);
  assert.equal(sanitizeGearItem('gear', 5), null);
  assert.equal(sanitizeGearItem({ id: 'x', slot: 'hand1', r: 'common', base: 'blade', s: {} }, 5), null);
});

await check('sanitizeGearItem: mismatched base falls back to the slot canonical base', () => {
  const clean = sanitizeGearItem({ id: 'x', slot: 'head', r: 'rare', base: 'blade', s: { maxHp: 5 } }, 5);
  assert.ok(clean);
  assert.equal(clean.base, 'helm');
});

await check('sanitizeGearItem: pct stats respect their registry max', () => {
  const pctStat = STAT_IDS.find((id) => STATS[id].op === 'pct' && STATS[id].max !== undefined);
  assert.ok(pctStat, 'registry should have a capped pct stat');
  const clean = sanitizeGearItem(
    { id: 'x', slot: 'hand1', r: 'legendary', base: 'blade', s: { attack: 1, [pctStat]: 99999 } },
    50
  );
  assert.ok(clean);
  assert.ok((clean.s[pctStat] ?? 0) <= (STATS[pctStat].max ?? Infinity));
});

await check('gearScore: strictly more stats → strictly higher score', () => {
  const small = gearScore({ id: 'a', slot: 'hand1', r: 'common', base: 'blade', s: { attack: 2 } });
  const big = gearScore({ id: 'b', slot: 'hand1', r: 'common', base: 'blade', s: { attack: 9 } });
  assert.ok(big > small);
});
