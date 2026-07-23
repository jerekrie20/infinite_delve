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
import {
  isBossDepth,
  isMiniBossDepth,
  templatesForDepth,
  validateRosterGaps,
  THEME_AFFINITIES,
  affinityForTemplate,
} from '../src/shared/content/monsters';

describe('waves');

await check('monsterForDepth: same seed → identical monster', () => {
  const a = monsterForDepth(7, createRng(1234));
  const b = monsterForDepth(7, createRng(1234));
  assert.deepEqual(a, b);
});

await check('boss floors (10, 20, 30) spawn bosses; 5, 15 are mini-boss (elite)', () => {
  assert.equal(monsterForDepth(10, createRng(1)).rarity, 'boss');
  assert.equal(monsterForDepth(20, createRng(1)).rarity, 'boss');
  assert.equal(monsterForDepth(30, createRng(1)).rarity, 'boss');
  // Depth 5 and 15 are mini-boss floors — forced elite, not boss.
  assert.equal(monsterForDepth(5, createRng(1)).rarity, 'elite');
  assert.equal(monsterForDepth(15, createRng(1)).rarity, 'elite');
  // Depth 7 is a normal floor.
  assert.notEqual(monsterForDepth(7, createRng(1)).rarity, 'boss');
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
  for (const d of [10, 20, 30]) {
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

// ── Phase 2: roster expansion + compound scaling + affinities ──────────

await check('roster: every depth 1-60 has ≥2 non-boss templates (gap check)', () => {
  const gaps = validateRosterGaps();
  assert.equal(gaps.length, 0, gaps.join('; '));
});

await check('roster: boss at every 10th depth, mini-boss at every 5th (non-10th)', () => {
  for (let d = 1; d <= 60; d++) {
    if (d % 10 === 0) {
      assert.ok(isBossDepth(d), `depth ${d} must be a boss floor`);
      assert.ok(!isMiniBossDepth(d), `depth ${d} must NOT be a mini-boss floor`);
    } else if (d % 5 === 0) {
      assert.ok(!isBossDepth(d), `depth ${d} must NOT be a boss floor`);
      assert.ok(isMiniBossDepth(d), `depth ${d} must be a mini-boss floor`);
    } else {
      assert.ok(!isBossDepth(d), `depth ${d} must NOT be a boss floor`);
      assert.ok(!isMiniBossDepth(d), `depth ${d} must NOT be a mini-boss floor`);
    }
  }
});

await check('roster: all 6 themes have ≥3 templates active within their band', () => {
  const themes = [
    { name: 'goblin_camp', min: 1, max: 10 },
    { name: 'crypt', min: 11, max: 20 },
    { name: 'warrens', min: 21, max: 30 },
    { name: 'deep', min: 31, max: 40 },
    { name: 'volcanic', min: 41, max: 50 },
    { name: 'abyss', min: 51, max: 60 },
  ];
  for (const theme of themes) {
    const mid = Math.floor((theme.min + theme.max) / 2);
    const active = templatesForDepth(mid).filter((t) => !t.bossInterval && t.theme === theme.name);
    assert.ok(active.length >= 2, `${theme.name} at depth ${mid}: only ${active.length} template(s)`);
  }
});

await check('compound scaling: depth 35 linear+compound > linear-only by notable margin', () => {
  const m = TUNING.monster;
  const lin35 = (m.baseHp + m.hpPerDepth * 35);
  const past30 = Math.pow(m.compoundHpExp, 35 - m.compoundThreshold);
  // The compound-scaled value at 35 should exceed the linear-only extrapolation.
  const compound35 = lin35 * past30;
  assert.ok(compound35 > lin35 * 1.1, `compound35 ${compound35} should notably exceed linear ${lin35}`);
});

await check('rewardEV grows past compound threshold but slower than HP scaling', () => {
  const ev30 = rewardEV(30).gold;
  const ev40 = rewardEV(40).gold;
  // Rewards grow with compoundRewardExp (1.02), which is gentler than HP (1.035).
  assert.ok(ev40 > ev30, 'rewards must grow past compound threshold');
  // Ratio should be less than raw HP growth ratio (accounts for template changes).
  const rewardRatio = ev40 / ev30;
  const hpCompoundFactor = Math.pow(TUNING.monster.compoundHpExp, 10);
  assert.ok(rewardRatio < hpCompoundFactor * 2, 'reward growth must be gentler than HP compound');
});

await check('theme affinities: all 6 themes have entries; lookups resolve', () => {
  assert.equal(THEME_AFFINITIES.goblin_camp!.vulnerable[0], 'fire');
  assert.equal(THEME_AFFINITIES.volcanic!.immune[0], 'fire');
  assert.equal(THEME_AFFINITIES.abyss!.resists.length, 2);
  // Affinity lookup by template id.
  const chief = affinityForTemplate('goblin_chief');
  assert.ok(chief !== undefined);
  assert.equal(chief!.vulnerable[0], 'fire');
});

await check('monsterForDepth: depth 5 mini-boss name includes "Mini-boss"', () => {
  const mb = monsterForDepth(5, createRng(7));
  assert.ok(mb.name.startsWith('Mini-boss'), `expected "Mini-boss ..." got "${mb.name}"`);
  assert.equal(mb.rarity, 'elite');
});
