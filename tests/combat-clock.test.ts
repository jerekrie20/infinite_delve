// Combat clock asserts — interval math (attackSpeedPct cap + absolute floor),
// fixed-step quantization (odd frame deltas must yield the same step count),
// and attack-timer fire/rearm behavior. FORMULAS "Combat clock" is normative.

import { describe, check, assert } from './helpers';
import { effectiveIntervalMs, StepAccumulator, AttackTimer } from '../src/shared/combat/clock';
import { TUNING } from '../src/shared/content/tuning';

describe('combat-clock');

await check('effectiveIntervalMs divides by (1 + AS%/100)', () => {
  assert.equal(effectiveIntervalMs(2000, 0), 2000);
  assert.equal(effectiveIntervalMs(2000, 25), Math.round(2000 / 1.25));
  assert.equal(effectiveIntervalMs(3000, 50), 2000);
});

await check('attackSpeedPct caps at +50 — 200% AS is no faster than 50%', () => {
  assert.equal(effectiveIntervalMs(2000, 200), effectiveIntervalMs(2000, TUNING.combat.attackSpeedCapPct));
});

await check('interval floors at the 1.0s absolute minimum', () => {
  assert.equal(effectiveIntervalMs(1200, 50), TUNING.combat.minAttackIntervalMs);
  assert.equal(effectiveIntervalMs(500, 0), TUNING.combat.minAttackIntervalMs);
});

await check('negative AS (Slow) lengthens the interval', () => {
  assert.equal(effectiveIntervalMs(2000, -20), Math.round(2000 / 0.8));
});

await check('StepAccumulator: odd frame deltas quantize to identical steps', () => {
  // 60fps-ish jittery deltas vs one clean feed — same total steps.
  const jittery = new StepAccumulator();
  const clean = new StepAccumulator();
  const deltas = [16.7, 16.6, 33.4, 8.1, 25.2, 99.9, 0.1, 300, 16.7, 83.3];
  const total = deltas.reduce((s, d) => s + d, 0);
  let jitterySteps = 0;
  for (const d of deltas) jitterySteps += jittery.advance(d);
  const cleanSteps = clean.advance(total);
  assert.equal(jitterySteps, cleanSteps);
  assert.equal(cleanSteps, Math.floor(total / TUNING.combat.tickMs));
});

await check('StepAccumulator carries the fractional remainder', () => {
  const acc = new StepAccumulator();
  assert.equal(acc.advance(99), 0);
  assert.equal(acc.advance(1), 1); // 99 + 1 = exactly one 100ms step
  assert.equal(acc.advance(0), 0);
});

await check('AttackTimer fires when its interval elapses, then rearms', () => {
  const t = new AttackTimer(300);
  assert.equal(t.advance(100), false);
  assert.equal(t.advance(100), false);
  assert.equal(t.advance(100), true); // 300ms elapsed
  t.rearm(200);
  assert.equal(t.advance(100), false);
  assert.equal(t.advance(100), true);
});
