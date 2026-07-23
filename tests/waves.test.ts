// waves.ts spawn + reward math. Starts with seeded-spawn determinism; the
// expected-value reward asserts land with the Phase 0 deterministic-reward fix.

import { assert, assertNear, check, describe } from './helpers';
import { createRng } from '../src/shared/rng';
import {
  computeIdle,
  eliteChanceAtDepth,
  idleGoldPerSecond,
  maxPlausibleDepth,
  monsterForDepth,
  rewardEV,
  runReward,
} from '../src/shared/waves';
import { TUNING } from '../src/shared/content/tuning';

describe('waves');

await check('monsterForDepth: same seed → identical monster', () => {
  const a = monsterForDepth(7, createRng(1234));
  const b = monsterForDepth(7, createRng(1234));
  assert.deepEqual(a, b);
});

await check('boss floors (5, 10, 20) spawn bosses; 15 does not', () => {
  assert.equal(monsterForDepth(5, createRng(1)).rarity, 'boss');
  assert.equal(monsterForDepth(10, createRng(1)).rarity, 'boss');
  assert.equal(monsterForDepth(20, createRng(1)).rarity, 'boss');
  assert.notEqual(monsterForDepth(15, createRng(1)).rarity, 'boss');
});

await check('runReward is DETERMINISTIC — the assert that would have caught the bug', () => {
  assert.deepEqual(runReward(25), runReward(25));
  assert.deepEqual(runReward(7), runReward(7));
});

await check('idleGoldPerSecond is deterministic and equals rewardEV/secondsPerKill', () => {
  assert.equal(idleGoldPerSecond(30), idleGoldPerSecond(30));
  assertNear(idleGoldPerSecond(30), rewardEV(30).gold / TUNING.idle.secondsPerKill);
});

await check('non-boss EV sits strictly between the all-normal and all-elite bounds', () => {
  const m = TUNING.monster;
  for (const d of [3, 7, 13, 22]) {
    const linGold = m.baseGold + m.goldPerDepth * d;
    const ev = rewardEV(d).gold;
    // Bounds use the weakest/strongest template multipliers at this depth.
    assert.ok(ev > linGold * 1.0, `EV at d${d} above the weakest all-normal floor`);
    assert.ok(ev < linGold * 1.7 * m.eliteRewardMult, `EV at d${d} below the all-elite ceiling`);
  }
});

await check('boss floors pay the boss multiplier exactly (matches monsterForDepth)', () => {
  for (const d of [5, 10, 20]) {
    const bossMonster = monsterForDepth(d, createRng(1));
    assert.equal(rewardEV(d).gold, bossMonster.gold);
    assert.equal(rewardEV(d).xp, bossMonster.xp);
  }
});

await check('runReward(0) is empty; rewards are monotonic in depth', () => {
  assert.deepEqual(runReward(0), { gold: 0, xp: 0 });
  let prev = 0;
  for (let d = 1; d <= 40; d++) {
    const { gold } = runReward(d);
    assert.ok(gold > prev, `runReward gold must rise at depth ${d}`);
    prev = gold;
  }
});

await check('eliteChanceAtDepth follows the curve and caps at eliteChanceCap', () => {
  const m = TUNING.monster;
  assertNear(eliteChanceAtDepth(1), m.eliteChance + m.eliteChancePerDepth);
  assert.equal(eliteChanceAtDepth(100000), m.eliteChanceCap);
});

await check('maxPlausibleDepth: progress bound stops a fresh hero claiming depth 100000', () => {
  const p = TUNING.plausibility;
  const fresh = maxPlausibleDepth(1, 0, 3600);
  assert.equal(fresh, p.depthBase); // hours of elapsed time can't beat the progress bound
  assert.ok(fresh < 100, 'fresh-hero bound must be small');
});

await check('maxPlausibleDepth: tiny elapsed time makes the pace bound win', () => {
  const p = TUNING.plausibility;
  assert.equal(maxPlausibleDepth(50, 10000, 10), Math.floor(10 / p.minSecondsPerFloor));
  assert.equal(maxPlausibleDepth(50, 10000, 0), 0);
});

await check('maxPlausibleDepth: extreme inputs hit the hard cap', () => {
  const p = TUNING.plausibility;
  assert.equal(maxPlausibleDepth(1e9, 1e12, 1e12), p.hardDepthCap);
});

await check('maxPlausibleDepth: monotonic in level and gear score', () => {
  const long = 1e7; // elapsed long enough that the pace bound never binds
  assert.ok(maxPlausibleDepth(10, 100, long) > maxPlausibleDepth(1, 100, long));
  assert.ok(maxPlausibleDepth(10, 500, long) > maxPlausibleDepth(10, 100, long));
});

await check('computeIdle caps paid seconds and flags the cap', () => {
  const under = computeIdle(10, 120);
  assert.equal(under.paidSeconds, 120);
  assert.equal(under.capped, false);

  const over = computeIdle(10, TUNING.idle.maxIdleSeconds * 3);
  assert.equal(over.paidSeconds, TUNING.idle.maxIdleSeconds);
  assert.equal(over.capped, true);
  assert.equal(over.xp, 0); // idle grants gold only — leveling stays active-play
});
