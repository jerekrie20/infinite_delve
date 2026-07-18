// Meta-loop read endpoint for the client's Daily panel:
//   POST /api/daily   today's shared seed + co-op frontier bar + the
//                     "deepest delve today" leaderboard (top-N + your rank).
//
// The write side lives in POST /api/run/result (which side-writes each finished
// run into the board + frontier via core/frontier.recordRun).

import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type { DailyResponse } from '../../shared/daily';
import { readDaily } from '../core/frontier';

type ErrorResponse = { error: string };

export const daily = new Hono();

daily.post('/daily', async (c) => {
  try {
    const subreddit = context.subredditName ?? 'delve';
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const view = await readDaily(redis, subreddit, username, Date.now());
    return c.json<DailyResponse>(view);
  } catch (error) {
    console.error('POST /api/daily error:', error);
    return c.json<ErrorResponse>({ error: 'Failed to load daily' }, 500);
  }
});
