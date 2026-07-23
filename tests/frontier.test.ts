// frontier.ts against the in-memory fake Redis: leaderboard max-depth-per-user,
// frontier sums, anonymous no-op, and closeDay snapshot logic.

import { assert, check, describe } from './helpers';
import { FakeRedis } from './fakes/redis';
import { closeDay, readDaily, recordRun } from '../src/server/core/frontier';
import { dayKey, frontierGoal } from '../src/shared/daily';

describe('frontier');

const NOW = Date.parse('2026-07-22T12:00:00Z');
const KEY = dayKey(NOW);

await check('leaderboard keeps each player’s MAX depth of the day', async () => {
  const redis = new FakeRedis();
  await recordRun(redis, 'alice', 5, NOW);
  await recordRun(redis, 'alice', 3, NOW); // shallower run must not regress the board
  assert.equal(await redis.zScore(`delve:lb:${KEY}`, 'alice'), 5);
  await recordRun(redis, 'alice', 8, NOW);
  assert.equal(await redis.zScore(`delve:lb:${KEY}`, 'alice'), 8);
});

await check('frontier hash sums EVERY run’s depth + counts runs', async () => {
  const redis = new FakeRedis();
  await recordRun(redis, 'alice', 5, NOW);
  await recordRun(redis, 'alice', 3, NOW);
  await recordRun(redis, 'bob', 8, NOW);
  const fields = await redis.hGetAll(`delve:frontier:${KEY}`);
  assert.equal(Number(fields.depths), 16);
  assert.equal(Number(fields.runs), 3);
});

await check('anonymous and zero-depth runs are no-ops', async () => {
  const redis = new FakeRedis();
  await recordRun(redis, 'anonymous', 12, NOW);
  await recordRun(redis, '', 12, NOW);
  await recordRun(redis, 'alice', 0, NOW);
  assert.equal(await redis.zCard(`delve:lb:${KEY}`), 0);
  assert.deepEqual(await redis.hGetAll(`delve:frontier:${KEY}`), {});
});

await check('readDaily reports top rows, my rank, and the frontier view', async () => {
  const redis = new FakeRedis();
  await recordRun(redis, 'alice', 5, NOW);
  await recordRun(redis, 'bob', 8, NOW);
  const daily = await readDaily(redis, 'testsub', 'alice', NOW);
  assert.equal(daily.leaderboard.top[0]?.username, 'bob');
  assert.equal(daily.leaderboard.top[0]?.depth, 8);
  assert.equal(daily.leaderboard.me?.rank, 2);
  assert.equal(daily.frontier.depths, 13);
  assert.equal(daily.frontier.delvers, 2);
});

await check('closeDay: goalHit false below goal, true at goal, snapshot persisted', async () => {
  const redis = new FakeRedis();
  await recordRun(redis, 'alice', 5, NOW);
  const below = await closeDay(redis, KEY, NOW);
  assert.equal(below.goalHit, false);
  assert.equal(below.frontier.goal, frontierGoal(1));

  // Push the frontier past the 1-delver goal, then re-close (idempotent re-snapshot).
  await recordRun(redis, 'alice', frontierGoal(1), NOW);
  const at = await closeDay(redis, KEY, NOW);
  assert.equal(at.goalHit, true);
  const latest = await redis.get('delve:report:latest');
  assert.ok(latest, 'latest report stored');
  assert.equal(JSON.parse(latest).dayKey, KEY);
});
