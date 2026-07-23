// consumeRateLimit fixed-window counters against the fake Redis.

import { assert, check, describe } from './helpers';
import { FakeRedis } from './fakes/redis';
import { RATE_LIMITS, consumeRateLimit } from '../src/server/core/rateLimit';

describe('rate-limit');

const T0 = Date.parse('2026-07-22T12:00:00Z');

await check('run-result 1/30s: first allowed, second denied, next window allowed', async () => {
  const fake = new FakeRedis();
  const rl = RATE_LIMITS.runResult;
  assert.equal(await consumeRateLimit(fake, 'run-result', 'u1', rl.limit, rl.windowSeconds, T0), true);
  assert.equal(await consumeRateLimit(fake, 'run-result', 'u1', rl.limit, rl.windowSeconds, T0 + 5000), false);
  assert.equal(
    await consumeRateLimit(fake, 'run-result', 'u1', rl.limit, rl.windowSeconds, T0 + 31_000),
    true
  );
});

await check('equip 5/s: five allowed, the sixth denied', async () => {
  const fake = new FakeRedis();
  const rl = RATE_LIMITS.equip;
  for (let i = 0; i < 5; i++) {
    assert.equal(await consumeRateLimit(fake, 'equip', 'u1', rl.limit, rl.windowSeconds, T0), true);
  }
  assert.equal(await consumeRateLimit(fake, 'equip', 'u1', rl.limit, rl.windowSeconds, T0), false);
});

await check('limits are per-user: one user’s spam never blocks another', async () => {
  const fake = new FakeRedis();
  const rl = RATE_LIMITS.runResult;
  assert.equal(await consumeRateLimit(fake, 'run-result', 'spammer', rl.limit, rl.windowSeconds, T0), true);
  assert.equal(await consumeRateLimit(fake, 'run-result', 'spammer', rl.limit, rl.windowSeconds, T0), false);
  assert.equal(await consumeRateLimit(fake, 'run-result', 'honest', rl.limit, rl.windowSeconds, T0), true);
});

await check('expire is set once per window, at 2× the window length', async () => {
  const fake = new FakeRedis();
  const rl = RATE_LIMITS.runResult;
  await consumeRateLimit(fake, 'run-result', 'u1', rl.limit, rl.windowSeconds, T0);
  await consumeRateLimit(fake, 'run-result', 'u1', rl.limit, rl.windowSeconds, T0 + 1000);
  assert.equal(fake.expireCalls.length, 1);
  assert.equal(fake.expireCalls[0]?.seconds, rl.windowSeconds * 2);
});
