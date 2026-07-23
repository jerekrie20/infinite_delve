// heroStore.updateHero — the WATCH/MULTI/EXEC CAS loop — against the fake's
// conflict semantics: a competing write between watch and exec must force a
// replay, never a lost update.

import { assert, check, describe } from './helpers';
import { FakeRedis } from './fakes/redis';
import {
  CAS_ATTEMPTS,
  HeroConflictError,
  heroKey,
  updateHero,
} from '../src/server/core/heroStore';
import { STORED_HERO_VERSION, newStoredHero } from '../src/server/core/heroSchema';

describe('hero-store');

const NOW = Date.parse('2026-07-22T12:00:00Z');

await check('fresh key creates and persists a current-version hero', async () => {
  const fake = new FakeRedis();
  const { hero } = await updateHero(fake, 'u1', NOW, () => 'ok', CAS_ATTEMPTS.hero);
  assert.equal(hero.v, STORED_HERO_VERSION);
  assert.equal(hero.maxHp, 40); // recompute ran on the load path
  const stored = await fake.get(heroKey('u1'));
  assert.ok(stored);
  assert.equal(JSON.parse(stored).v, STORED_HERO_VERSION);
});

await check('mutator result is returned alongside the saved hero', async () => {
  const fake = new FakeRedis();
  const { hero, result } = await updateHero(
    fake,
    'u1',
    NOW,
    (h) => {
      h.gold += 25;
      return 'banked';
    },
    CAS_ATTEMPTS.hero
  );
  assert.equal(result, 'banked');
  assert.equal(hero.gold, 25);
});

await check('interleaved writers both land — the lost-update the CAS loop prevents', async () => {
  const fake = new FakeRedis();
  let injected = false;
  let replays = 0;
  // First exec: a competing +5-gold write sneaks in between watch and exec.
  fake.beforeExec = async () => {
    if (injected) return;
    injected = true;
    await updateHero(fake, 'u1', NOW, (h) => void (h.gold += 5), 3);
  };
  const { hero } = await updateHero(
    fake,
    'u1',
    NOW,
    (h) => {
      replays += 1;
      h.gold += 10;
    },
    3
  );
  assert.equal(hero.gold, 15, 'both writes must survive');
  assert.equal(replays, 2, 'the mutation replays on the fresh read');
});

await check('exhausted retries throw HeroConflictError (routes answer 409)', async () => {
  const fake = new FakeRedis();
  // Every exec loses the race: a direct competing write lands each time.
  fake.beforeExec = async () => {
    await fake.set(heroKey('u1'), JSON.stringify(newStoredHero(NOW)));
  };
  await assert.rejects(
    () => updateHero(fake, 'u1', NOW, (h) => void (h.gold += 1), 2),
    HeroConflictError
  );
});
