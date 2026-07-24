// Class creation moment (D13): chooseClass only mutates a FRESH hero, recomputes
// maxHp from the new class base, and seeds a per-class loadout. isFreshHero is the
// server gate that stops it being used as a free respec.

import { assert, check, describe } from './helpers';
import { newStoredHero, newStoredClass } from '../src/server/core/heroSchema';
import { chooseClass, isFreshHero } from '../src/server/core/hero';
import { classDef } from '../src/shared/content/classes';

describe('hero-class');

const NOW = Date.parse('2026-07-24T12:00:00Z');

await check('newStoredClass seeds the class option-1 basic + guard loadout', () => {
  assert.deepEqual(newStoredClass('archer').loadout, { 1: 'piercingShot', 2: 'tumble' });
  assert.deepEqual(newStoredClass('apprentice').loadout, { 1: 'fireBolt', 2: 'manaShield' });
  assert.deepEqual(newStoredClass('apprentice').optionsUnlocked, ['manaShield']);
});

await check('a fresh hero can choose apprentice — class + maxHp switch', () => {
  const h = newStoredHero(NOW);
  assert.equal(isFreshHero(h), true);
  assert.equal(chooseClass(h, 'apprentice'), true);
  assert.equal(h.class, 'apprentice');
  assert.equal(h.activeClass, 'apprentice');
  assert.equal(h.maxHp, classDef('apprentice').baseMaxHp); // 26, recomputed
  assert.equal(h.hp, h.maxHp);
  assert.ok(h.classes.apprentice, 'apprentice StoredClass created');
});

await check('choosing an unknown class is rejected', () => {
  const h = newStoredHero(NOW);
  // @ts-expect-error — deliberately invalid class id
  assert.equal(chooseClass(h, 'necromancer'), false);
  assert.equal(h.class, 'squire');
});

await check('a started hero cannot re-choose (no free respec)', () => {
  const h = newStoredHero(NOW);
  h.gold = 50; // any progress marks the hero non-fresh
  assert.equal(isFreshHero(h), false);
  assert.equal(chooseClass(h, 'archer'), false);
  assert.equal(h.class, 'squire');

  const leveled = newStoredHero(NOW);
  leveled.level = 3;
  assert.equal(chooseClass(leveled, 'archer'), false);
});
