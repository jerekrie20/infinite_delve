// Client failed-run retry queue (runQueue.ts) over a fake StorageLike.

import { assert, check, describe } from './helpers';
import {
  MAX_AGE_MS,
  MAX_QUEUE,
  enqueueRun,
  flushQueue,
  newRunId,
  readQueue,
  type PendingRun,
  type PostRunStatus,
  type StorageLike,
} from '../src/client/runQueue';
import { RUN_DEDUPE_TTL_SECONDS } from '../src/server/core/runDedupe';

describe('run-queue');

const NOW = Date.parse('2026-07-22T12:00:00Z');

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const run = (id: string, queuedAt = NOW): PendingRun => ({
  runId: id,
  outcome: 'extracted',
  depthReached: 7,
  haul: [],
  queuedAt,
});

await check('client retry horizon stays BELOW the server dedupe TTL (the safety invariant)', () => {
  assert.ok(MAX_AGE_MS < RUN_DEDUPE_TTL_SECONDS * 1000);
});

await check('enqueue → read round-trips, oldest first', () => {
  const s = fakeStorage();
  enqueueRun(s, run('a', NOW - 1000));
  enqueueRun(s, run('b', NOW));
  assert.deepEqual(readQueue(s, NOW).map((r) => r.runId), ['a', 'b']);
});

await check('stale (>24h) and malformed entries are pruned on read', () => {
  const s = fakeStorage();
  const entries = [run('fresh', NOW - 1000), run('stale', NOW - MAX_AGE_MS - 1), { garbage: true }];
  s.setItem('delve:pending-runs:v1', JSON.stringify(entries));
  assert.deepEqual(readQueue(s, NOW).map((r) => r.runId), ['fresh']);
});

await check('corrupted storage JSON yields an empty queue, not a crash', () => {
  const s = fakeStorage();
  s.setItem('delve:pending-runs:v1', '{not json[');
  assert.deepEqual(readQueue(s, NOW), []);
});

await check('the queue caps at MAX_QUEUE, dropping the oldest', () => {
  const s = fakeStorage();
  for (let i = 0; i < MAX_QUEUE + 3; i++) enqueueRun(s, run(`r${i}`, NOW + i));
  const queue = readQueue(s, NOW);
  assert.equal(queue.length, MAX_QUEUE);
  assert.equal(queue[0]?.runId, 'r3'); // r0-r2 dropped
});

await check('flush removes ok and rejected, STOPS on retryable keeping the rest', async () => {
  const s = fakeStorage();
  enqueueRun(s, run('ok1'));
  enqueueRun(s, run('rejected2'));
  enqueueRun(s, run('retry3'));
  enqueueRun(s, run('untouched4'));
  const statusFor: Record<string, PostRunStatus> = {
    ok1: 'ok', rejected2: 'rejected', retry3: 'retryable', untouched4: 'ok',
  };
  const posted: string[] = [];
  const { recovered, remaining } = await flushQueue(s, NOW, async (r) => {
    posted.push(r.runId);
    return statusFor[r.runId] ?? 'rejected';
  });
  assert.equal(recovered, 1);
  assert.equal(remaining, 2);
  assert.deepEqual(posted, ['ok1', 'rejected2', 'retry3']); // stopped at the retryable
  assert.deepEqual(readQueue(s, NOW).map((r) => r.runId), ['retry3', 'untouched4']);
});

await check('an empty flush clears the storage key entirely', async () => {
  const s = fakeStorage();
  enqueueRun(s, run('a'));
  await flushQueue(s, NOW, async () => 'ok');
  assert.equal(s.data.has('delve:pending-runs:v1'), false);
});

await check('newRunId produces unique, server-acceptable (≤64 char) ids', () => {
  const a = newRunId();
  const b = newRunId();
  assert.notEqual(a, b);
  assert.ok(a.length >= 1 && a.length <= 64);
});
