// Status-framework asserts — stack rules, per-side cap, resist model, boss
// stun halving, Shield pool + cap, Shock consume, cleanse rules, the 1s DoT
// tick. status-effects.md is the implementation contract these enforce.

import { describe, check, assert } from './helpers';
import {
  applyStatus, tickStatuses, cleanseForNextFloor, cleanseAll,
  statusAtkPct, statusAttackSpeedPct, statusDamageTakenPct, statusHealingTakenPct,
  isStunned, shockBonusPct, consumeShock, addShield, absorbWithShield, shieldPool,
  STATUS_PRESETS,
  type ActiveStatus, type ApplyContext, type ApplierView,
} from '../src/shared/combat/statuses';
import { TUNING } from '../src/shared/content/tuning';
import { createRng } from '../src/shared/rng';

const applier: ApplierView = { attack: 100, derived: {} };

/** Context factory: resist 0 + rng that never resists unless overridden. */
function ctx(overrides: Partial<ApplyContext> = {}): ApplyContext {
  return {
    targetStatusResist: 0,
    targetMaxHp: 200,
    selfApplied: false,
    isBoss: false,
    fightMs: 0,
    stunHistory: [],
    rng: createRng(7),
    ...overrides,
  };
}

describe('statuses');

await check('poison stacks to its max, never duplicates the instance', () => {
  const list: ActiveStatus[] = [];
  for (let i = 0; i < 8; i++) applyStatus(list, { id: 'poison', source: 't' }, applier, ctx());
  assert.equal(list.length, 1);
  assert.equal(list[0]!.stacks, STATUS_PRESETS.poison.maxStacks);
});

await check('poison magnitude = 8% applier ATK, scaled by poisonDamage%', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'poison', source: 't' }, { attack: 100, derived: { poisonDamage: 50 } }, ctx());
  assert.equal(list[0]!.magnitude, Math.round(100 * 0.08 * 1.5));
});

await check('burn refreshes: duration resets, HIGHER magnitude wins', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'burn', source: 'a', magnitude: 40 }, applier, ctx());
  list[0]!.remainingMs = 500;
  applyStatus(list, { id: 'burn', source: 'b', magnitude: 20 }, applier, ctx());
  assert.equal(list[0]!.magnitude, 40); // weaker re-apply does not downgrade
  assert.equal(list[0]!.remainingMs, STATUS_PRESETS.burn.defaultDurationMs);
});

await check('stun extends up to its 4s cap', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'stun', source: 't', durationMs: 3000 }, applier, ctx());
  applyStatus(list, { id: 'stun', source: 't', durationMs: 3000 }, applier, ctx());
  assert.equal(list[0]!.remainingMs, STATUS_PRESETS.stun.durationCapMs);
  assert.ok(isStunned(list));
});

await check('per-side cap: the 9th distinct status is dropped, oldest kept', () => {
  const list: ActiveStatus[] = [];
  const ids = ['poison', 'burn', 'bleed', 'shock', 'stun', 'slow', 'weaken', 'armorBreak', 'mark'] as const;
  const outcomes = ids.map((id) => applyStatus(list, { id, source: 't' }, applier, ctx()));
  assert.equal(list.length, TUNING.statuses.capPerSide);
  assert.equal(outcomes[8], 'capped');
  assert.equal(list[0]!.id, 'poison'); // oldest NOT displaced
});

await check('statusResist blocks applications; self-buffs never roll it', () => {
  const alwaysResists = (): number => 0.5; // 0.5×100 < 99 → resisted
  const listDebuff: ActiveStatus[] = [];
  const blocked = applyStatus(listDebuff, { id: 'slow', source: 't' }, applier,
    ctx({ targetStatusResist: 99, rng: alwaysResists }));
  assert.equal(blocked, 'resisted');
  const listBuff: ActiveStatus[] = [];
  const applied = applyStatus(listBuff, { id: 'rage', source: 't' }, applier,
    ctx({ targetStatusResist: 99, selfApplied: true, rng: alwaysResists }));
  assert.equal(applied, 'applied');
});

await check('boss stun rule: each stun within 10s halves the next duration', () => {
  const stunHistory: number[] = [];
  // Boss innate 40 resist vs stun — use an rng stream whose draws stay high
  // enough to pass the roll (createRng(3) first draws > 0.4).
  const rng = (): number => 0.9;
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'stun', source: 't', durationMs: 2000 }, applier,
    ctx({ isBoss: true, fightMs: 1000, stunHistory, rng }));
  assert.equal(list[0]!.remainingMs, 2000);
  list.length = 0; // first stun expired
  applyStatus(list, { id: 'stun', source: 't', durationMs: 2000 }, applier,
    ctx({ isBoss: true, fightMs: 5000, stunHistory, rng }));
  assert.equal(list[0]!.remainingMs, 1000); // halved once
  list.length = 0;
  applyStatus(list, { id: 'stun', source: 't', durationMs: 2000 }, applier,
    ctx({ isBoss: true, fightMs: 8000, stunHistory, rng }));
  assert.equal(list[0]!.remainingMs, 500); // halved twice within the window
});

await check('mod queries sum signed magnitudes (Rage + Weaken coexist)', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'rage', source: 't', magnitude: 30 }, applier, ctx({ selfApplied: true }));
  applyStatus(list, { id: 'weaken', source: 't', magnitude: -20 }, applier, ctx());
  assert.equal(statusAtkPct(list), 10);
});

await check('slow/haste feed attackSpeedPct; fortify/mark feed damageTakenPct', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'slow', source: 't', magnitude: -25 }, applier, ctx());
  applyStatus(list, { id: 'haste', source: 't', magnitude: 30 }, applier, ctx({ selfApplied: true }));
  assert.equal(statusAttackSpeedPct(list), 5);
  const list2: ActiveStatus[] = [];
  applyStatus(list2, { id: 'fortify', source: 't', magnitude: -50 }, applier, ctx({ selfApplied: true }));
  applyStatus(list2, { id: 'mark', source: 't', magnitude: 25 }, applier, ctx());
  assert.equal(statusDamageTakenPct(list2), -25);
});

await check('curse halves healing received via healingTakenPct', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'curse', source: 't' }, applier, ctx());
  assert.equal(statusHealingTakenPct(list), -50);
});

await check('shock: bonus = 25/stack, consumed after the payoff hit', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'shock', source: 't' }, applier, ctx());
  applyStatus(list, { id: 'shock', source: 't' }, applier, ctx());
  assert.equal(shockBonusPct(list), 50);
  consumeShock(list);
  assert.equal(shockBonusPct(list), 0);
  assert.equal(list.length, 0);
});

await check('shield: pool caps at 50% maxHp, absorbs before HP, breaks', () => {
  const list: ActiveStatus[] = [];
  addShield(list, 500, 200, 't'); // cap = 100
  assert.equal(shieldPool(list), 100);
  const through = absorbWithShield(list, 60);
  assert.equal(through, 0);
  assert.equal(shieldPool(list), 40);
  const through2 = absorbWithShield(list, 100);
  assert.equal(through2, 60); // 40 absorbed, shield broken
  assert.equal(shieldPool(list), 0);
});

await check('1s tick: DoTs report damage × stacks, durations expire', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'poison', source: 't', magnitude: 8, durationMs: 1000 }, applier, ctx());
  applyStatus(list, { id: 'poison', source: 't', magnitude: 8, durationMs: 1000 }, applier, ctx());
  const tick = tickStatuses(list);
  assert.equal(tick.dots[0]!.damage, 16); // 8 × 2 stacks
  assert.deepEqual(tick.expired, ['poison']);
  assert.equal(list.length, 0);
});

await check('regen heals on the tick; shield never ticks away', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'regen', source: 't', magnitude: 12 }, applier, ctx({ selfApplied: true }));
  addShield(list, 50, 200, 't');
  const tick = tickStatuses(list);
  assert.equal(tick.heal, 12);
  assert.equal(shieldPool(list), 50);
});

await check('floor cleanse keeps buffs + shield, drops debuffs; run cleanse clears all', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'rage', source: 't' }, applier, ctx({ selfApplied: true }));
  applyStatus(list, { id: 'poison', source: 't' }, applier, ctx());
  addShield(list, 30, 200, 't');
  cleanseForNextFloor(list);
  assert.deepEqual(list.map((s) => s.id).sort(), ['rage', 'shield']);
  cleanseAll(list);
  assert.equal(list.length, 0);
});

await check('generic statMod: two mods on different targets coexist', () => {
  const list: ActiveStatus[] = [];
  applyStatus(list, { id: 'statMod', source: 'focus', magnitude: 50, modTarget: 'increasedCritPct' }, applier, ctx({ selfApplied: true }));
  applyStatus(list, { id: 'statMod', source: 'tumble', magnitude: 40, modTarget: 'dodgeChance' }, applier, ctx({ selfApplied: true }));
  assert.equal(list.length, 2);
});
