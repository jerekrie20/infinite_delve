// deriveStats: class base seeding, gear folding, and hard caps.
// The maxHp-40 check is the regression assert for the old "fresh hero HP 15" bug.

import { assert, check, describe } from './helpers';
import { deriveStats } from '../src/shared/content/gear';
import { classDef } from '../src/shared/content/classes';
import type { GearItem } from '../src/shared/delve';

describe('gear-derive');

await check('fresh squire derives class base stats (maxHp 40 regression)', () => {
  const derived = deriveStats('squire', 1, {});
  assert.equal(derived.maxHp, 40);
  assert.equal(derived.attack, classDef('squire').baseAttack);
});

await check('levels add per-level class growth', () => {
  const cls = classDef('squire');
  const derived = deriveStats('squire', 5, {});
  assert.equal(derived.maxHp, cls.baseMaxHp + cls.hpPerLevel * 4);
  assert.equal(derived.attack, cls.baseAttack + cls.attackPerLevel * 4);
});

await check('a flat-attack item raises derived attack by its value', () => {
  const blade: GearItem = { id: 'itm_t1', slot: 'hand1', r: 'common', base: 'blade', s: { attack: 5 } };
  const bare = deriveStats('squire', 1, {});
  const armed = deriveStats('squire', 1, { hand1: blade });
  assert.equal(armed.attack, bare.attack + 5);
});

await check('attackPct multiplies the flat total', () => {
  const ring: GearItem = { id: 'itm_t2', slot: 'ring1', r: 'rare', base: 'ring', s: { attackPct: 50 } };
  const bare = deriveStats('squire', 1, {});
  const armed = deriveStats('squire', 1, { ring1: ring });
  assert.equal(armed.attack, Math.round(bare.attack * 1.5));
});

await check('increasedCritPct gear actually raises critChance (pure-pct fold bug)', () => {
  const bare = deriveStats('squire', 1, {});
  const ring: GearItem = { id: 'itm_t4', slot: 'ring1', r: 'rare', base: 'ring', s: { increasedCritPct: 40 } };
  const armed = deriveStats('squire', 1, { ring1: ring });
  assert.equal(armed.increasedCritPct, 40);
  assert.equal(armed.critChance, Math.round(bare.baseCritChance * 1.4));
});

await check('computed critChance clamps at its 75 cap under absurd increased%', () => {
  const ring: GearItem = { id: 'itm_t3', slot: 'ring1', r: 'legendary', base: 'ring', s: { increasedCritPct: 100000 } };
  const derived = deriveStats('squire', 1, { ring1: ring });
  assert.equal(derived.critChance, 75);
});
