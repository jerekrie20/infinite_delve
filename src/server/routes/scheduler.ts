// Daily scheduler tick (Devvit cron → internal endpoint). Declared in
// devvit.json under `scheduler.tasks`. Runs once a day to:
//   1. close + snapshot yesterday's per-sub board + co-op frontier,
//   2. build the Frontier Report for the new (playable) day,
//   3. auto-post it to the sub — the virality/DQE engine.
//
// Needs the Devvit runtime (Redis + Reddit posting) and can only be exercised
// end-to-end via `npm run dev` (devvit playtest). It swallows errors and returns
// 200 so a failure never triggers a scheduler retry-storm (which could double-post).

import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';
import type { TaskResponse } from '@devvit/web/server';
import { closeDay } from '../core/frontier';
import { createDailyReportPost } from '../core/post';
import { buildFrontierReport } from '../../shared/report';
import { dailySeed, dayKey, dayNumber, previousDayKey } from '../../shared/daily';

export const scheduler = new Hono();

scheduler.post('/daily-tick', async (c) => {
  try {
    const now = Date.now();
    const subreddit = context.subredditName ?? 'delve';
    const todayKey = dayKey(now);
    const yesterdayKey = previousDayKey(todayKey);

    // 1. Close + snapshot the day that just ended.
    const snapshot = await closeDay(redis, yesterdayKey, now);

    // 2. Build the report for the fresh, playable day.
    const report = buildFrontierReport(snapshot, {
      dayKey: todayKey,
      dayNumber: dayNumber(todayKey),
      seed: dailySeed(subreddit, todayKey),
    });

    // 3. Auto-post the playable Frontier Report.
    const post = await createDailyReportPost(report);

    console.log(
      `daily-tick: closed ${yesterdayKey} (${snapshot.frontier.delvers} delvers, ` +
        `${snapshot.frontier.depths} depths), posted ${post.id} for ${todayKey}`
    );
  } catch (error) {
    console.error('daily-tick error (swallowed to avoid retry double-post):', error);
  }
  return c.json<TaskResponse>({}, 200);
});
