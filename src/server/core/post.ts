import { reddit, context } from '@devvit/web/server';
import type { BuiltReport } from '../../shared/report';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'infinite-delve',
  });
};

/**
 * Post the daily playable Frontier Report — the auto-posted virality/DQE
 * artifact. Uses the same custom-post entrypoint as the pinned game post (so the
 * card is tappable to play today's delve) and carries the report markdown as the
 * text fallback body (shown on old.reddit + as the readable summary).
 */
export const createDailyReportPost = async (report: BuiltReport) => {
  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: report.title,
    textFallback: { text: report.body },
  });
};
