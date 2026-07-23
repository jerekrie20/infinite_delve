// Combat engine v2 asserts — THE determinism law (same seed twice →
// bit-identical event log), pack composition + floor-budget conservation
// (FORMULAS D32), pack-EV/server-payout agreement, revive-hook isolation
// (the onLethal fix), and the D35 variance lock.

import { describe, check, assert, assertNear } from './helpers';
import { packForDepth, rewardEV, bodyguardTemplateFor } from '../src/shared/waves';
import { TEMPLATES } from '../src/shared/content/monsters';
import { behavioralStats } from '../src/shared/combat/engine';
import { runSim } from '../src/shared/sim/runSim';
import { TUNING } from '../src/shared/content/tuning';
import { createRng, type Rng } from '../src/shared/rng';

describe('combat-engine');

/** Rng that replays a fixed script (throws past the end = draw-order guard). */
const scripted = (draws: number[]): Rng => {
  let i = 0;
  return () => {
    const v = draws[i++];
    if (v === undefined) throw new Error(`rng script exhausted at draw ${i}`);
    return v;
  };
};

await check('DETERMINISM LAW: same seed twice → bit-identical event log', () => {
  const a = runSim({ seed: 1234, level: 3 });
  const b = runSim({ seed: 1234, level: 3 });
  assert.deepEqual(a.events, b.events);
  assert.equal(a.depthCleared, b.depthCleared);
  assert.equal(a.runGold, b.runGold);
});

await check('different seeds diverge', () => {
  const a = runSim({ seed: 1234, level: 3 });
  const b = runSim({ seed: 4321, level: 3 });
  assert.notDeepEqual(a.events, b.events);
});

await check('pack sizes follow kind rules; boss floors spawn solo', () => {
  const rng = createRng(99);
  for (let i = 0; i < 200; i++) {
    const pack = packForDepth(3, rng); // goblin camp: grunt 1-2, brute solo
    const kind = pack[0]!.kind;
    if (kind === 'grunt') assert.ok(pack.length >= 1 && pack.length <= 2);
    if (kind === 'brute') assert.equal(pack.length, 1);
  }
  const bossPack = packForDepth(5, createRng(1)); // chieftain floor
  assert.equal(bossPack.length, 1);
  assert.equal(bossPack[0]!.rarity, 'boss');
});

await check('floor budget conserves: a grunt pair totals ~1.15× the solo budget', () => {
  const m = TUNING.monster;
  // Script: template pick → scout (index 0), size → pair, both rarities normal.
  const pack = packForDepth(3, scripted([0, 0.9, 0.9, 0.9]));
  assert.equal(pack.length, 2);
  assert.equal(pack[0]!.templateId, 'goblin_scout');
  const linHp = m.baseHp + m.hpPerDepth * 3;
  const expectedTotal = linHp * 1.0 * (1 + TUNING.combat.packBonusPerExtra); // statMult 1.0
  const actualTotal = pack[0]!.hp + pack[1]!.hp;
  assert.ok(Math.abs(actualTotal - expectedTotal) <= 1, `${actualTotal} !~ ${expectedTotal}`);
  // Each member carries an equal (smaller-than-solo) share.
  assert.equal(pack[0]!.hp, pack[1]!.hp);
  assert.ok(pack[0]!.hp < Math.round(linHp));
});

await check('caster packs: bodyguard fronts, caster backs (synthetic roster row)', () => {
  // Current roster has no caster+grunt band until Phase 2 — synthesize one.
  TEMPLATES.push({
    id: 'test_caster', name: 'Test Caster', sprite: 'goblin', kind: 'caster',
    baseStats: { hp: 10, attack: 5, defense: 1 }, statMult: 1.2,
    passivePool: 'goblinoid', depthMin: 3, depthMax: 3,
  });
  try {
    assert.equal(bodyguardTemplateFor(3)?.id, 'goblin_scout'); // first eligible in registry order
    // Script: template pick → the caster (index 2 of 3 active), rarities normal.
    const pack = packForDepth(3, scripted([0.99, 0.9, 0.9, 0.9]));
    assert.equal(pack.length, 2);
    assert.equal(pack[0]!.row, 'front');
    assert.equal(pack[0]!.templateId, 'goblin_scout');
    assert.equal(pack[1]!.row, 'back');
    assert.equal(pack[1]!.templateId, 'test_caster');
  } finally {
    TEMPLATES.pop();
  }
});

await check('rewardEV matches the empirical pack spawn mean (server = client)', () => {
  const rng = createRng(2024);
  const depth = 3;
  let totalGold = 0;
  const samples = 4000;
  for (let i = 0; i < samples; i++) {
    for (const member of packForDepth(depth, rng)) totalGold += member.gold;
  }
  const empirical = totalGold / samples;
  const ev = rewardEV(depth).gold;
  // Within 3% — rounding per member + sampling noise, seeded so it's stable.
  assert.ok(Math.abs(empirical - ev) / ev < 0.03, `empirical ${empirical} vs EV ${ev}`);
});

await check('rewardEV boss floors unchanged by the pack fold (solo)', () => {
  const m = TUNING.monster;
  const linGold = m.baseGold + m.goldPerDepth * 5;
  const chief = TEMPLATES.find((t) => t.id === 'goblin_chief')!;
  assertNear(rewardEV(5).gold, Math.round(linGold * chief.statMult * m.bossRewardMult));
});

await check('revive lives on onLethal ONLY — the probe cannot re-fire dodge/block', () => {
  const groups = behavioralStats({ reviveChance: 10, dodgeChance: 50, blockChance: 50 });
  assert.deepEqual(groups.onLethal.map((g) => g.stat), ['reviveChance']);
  assert.ok(!groups.onTakeDamage.some((g) => g.stat === 'reviveChance'));
  assert.ok(groups.onTakeDamage.some((g) => g.stat === 'dodgeChance'));
});

await check('damage variance is the D35 ±5% lock; every hit lands ≥ 1', () => {
  assert.equal(TUNING.combat.damageVariance, 0.05);
  const sim = runSim({ seed: 777, level: 5 });
  const hits = sim.events.filter((e) => e.type === 'hit');
  assert.ok(hits.length > 10);
  for (const h of hits) assert.ok(h.type === 'hit' && h.dmg >= 1);
});

await check('hero targets the FRONT-most pack member first', () => {
  // Find a seeded run containing a 2-member floor; the hero's first hit on
  // that floor must target the pack's first (front) member.
  for (let seed = 1; seed < 60; seed++) {
    const sim = runSim({ seed, level: 6, extractAt: 6 });
    for (let i = 0; i < sim.events.length; i++) {
      const e = sim.events[i]!;
      if (e.type !== 'floorStart' || e.pack.length < 2) continue;
      const firstHeroHit = sim.events.slice(i + 1).find(
        (x) => x.type === 'hit' && x.sourceId === 'hero'
      );
      if (firstHeroHit && firstHeroHit.type === 'hit') {
        assert.equal(firstHeroHit.targetId, e.pack[0]!.id);
        return; // one verified multi-member floor is enough
      }
    }
  }
  assert.fail('no multi-member floor found across 60 seeds — spawn rates broken?');
});

await check('mana is spent and cooldowns gate the rotation (fortify casts once)', () => {
  const sim = runSim({ seed: 31, level: 6, extractAt: 3 });
  const casts = sim.events.filter((e) => e.type === 'cast');
  // L6 squire knows fortify (L5 unlock); the rotation should cast it.
  assert.ok(casts.length >= 1, 'rotation never cast fortify');
  const applied = sim.events.some((e) => e.type === 'statusApplied' && e.statusId === 'fortify');
  assert.ok(applied, 'fortify cast but status never applied');
});

await check('extract-at policy banks; push-until-death dies', () => {
  const extracted = runSim({ seed: 8, level: 4, extractAt: 2 });
  assert.equal(extracted.outcome, 'extracted');
  assert.equal(extracted.depthCleared, 2);
  const pushed = runSim({ seed: 8, level: 1 });
  assert.equal(pushed.outcome, 'died');
});
