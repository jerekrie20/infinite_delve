// runDedupe first-wins claim + summary replay against the fake Redis.

import { assert, check, describe } from './helpers';
import { FakeRedis } from './fakes/redis';
import {
  RUN_DEDUPE_TTL_SECONDS,
  beginRun,
  completeRun,
  findCompletedRun,
  runSeenKey,
} from '../src/server/core/runDedupe';
import type { RunGained } from '../src/server/core/hero';

describe('run-dedupe');

const NOW = Date.parse('2026-07-22T12:00:00Z');
const GAINED: RunGained = { gold: 120, xp: 80, levelsGained: 1, bestDepth: 9, itemsBanked: 2, itemsEquipped: 1 };

await check('begin → complete → find replays the exact summary', async () => {
  const fake = new FakeRedis();
  assert.equal(await beginRun(fake, 'u1', 'run-a'), true);
  assert.equal(await findCompletedRun(fake, 'u1', 'run-a'), null, 'pending until completed');
  await completeRun(fake, 'u1', 'run-a', GAINED, NOW);
  assert.deepEqual(await findCompletedRun(fake, 'u1', 'run-a'), GAINED);
});

await check('second begin on the same runId loses first-wins', async () => {
  const fake = new FakeRedis();
  assert.equal(await beginRun(fake, 'u1', 'run-a'), true);
  assert.equal(await beginRun(fake, 'u1', 'run-a'), false);
});

await check('runIds are scoped per user', async () => {
  const fake = new FakeRedis();
  assert.equal(await beginRun(fake, 'u1', 'run-a'), true);
  assert.equal(await beginRun(fake, 'u2', 'run-a'), true);
});

await check('the seen marker gets the dedupe TTL on first claim only', async () => {
  const fake = new FakeRedis();
  await beginRun(fake, 'u1', 'run-a');
  await beginRun(fake, 'u1', 'run-a');
  const seenExpires = fake.expireCalls.filter((e) => e.key === runSeenKey('u1', 'run-a'));
  assert.equal(seenExpires.length, 1);
  assert.equal(seenExpires[0]?.seconds, RUN_DEDUPE_TTL_SECONDS);
});
