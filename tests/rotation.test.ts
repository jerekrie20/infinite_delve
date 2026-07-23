// Rotation asserts (D30) — priority pick, skip-if-unaffordable falls through
// to the basic attack, manual taps interleave and win, slot-1 basics never
// enter the rotation, and stale saved orders normalize against unlocks.

import { describe, check, assert } from './helpers';
import { chooseBeatAction, normalizeRotationOrder, type RotationState } from '../src/shared/combat/rotation';
import { ACTIVES } from '../src/shared/content/actives';

describe('rotation');

const rot = (order: string[], queued: string | null = null): RotationState => ({ order, queued });

await check('registry sanity: slam is the basic, fortify is rotatable', () => {
  assert.equal(ACTIVES.slam!.basic, true);
  assert.equal(ACTIVES.slam!.manaCost, 0);
  assert.ok(!ACTIVES.fortify!.basic);
});

await check('highest-priority affordable ability casts', () => {
  const action = chooseBeatAction(rot(['fortify']), 100, {});
  assert.deepEqual(action, { kind: 'ability', abilityId: 'fortify' });
});

await check('unaffordable ability is skipped → basic attack fires', () => {
  const action = chooseBeatAction(rot(['fortify']), ACTIVES.fortify!.manaCost - 1, {});
  assert.deepEqual(action, { kind: 'basic' });
});

await check('an ability on cooldown is skipped → basic attack fires', () => {
  const action = chooseBeatAction(rot(['fortify']), 100, { fortify: 5000 });
  assert.deepEqual(action, { kind: 'basic' });
});

await check('manual tap wins over the rotation and is consumed', () => {
  const state = rot(['fortify'], 'fortify');
  const action = chooseBeatAction(state, 100, {});
  assert.deepEqual(action, { kind: 'ability', abilityId: 'fortify' });
  assert.equal(state.queued, null);
});

await check('an unaffordable tap is dropped, not held', () => {
  const state = rot([], 'fortify');
  const action = chooseBeatAction(state, 0, {});
  assert.deepEqual(action, { kind: 'basic' });
  assert.equal(state.queued, null);
});

await check('basics can never be queued into the rotation slot', () => {
  const state = rot([], 'slam');
  const action = chooseBeatAction(state, 100, {});
  assert.deepEqual(action, { kind: 'basic' }); // slam ignored as a cast
});

await check('normalize: drops unknown + basic ids, appends new unlocks, dedupes', () => {
  const order = normalizeRotationOrder(['ghost_ability', 'slam', 'fortify', 'fortify'], ['slam', 'fortify']);
  assert.deepEqual(order, ['fortify']);
  const fresh = normalizeRotationOrder([], ['slam', 'fortify']);
  assert.deepEqual(fresh, ['fortify']); // slot order default, basics excluded
});
