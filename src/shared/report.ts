// Pure builder for the daily "Frontier Report" — the auto-posted virality/DQE
// artifact. Takes a closed-day snapshot + the new day being opened and returns
// { title, body } markdown for reddit.submitCustomPost. No I/O, no time, no
// server/client imports → fully deterministic and tsx-testable.

import { FRONTIER_MILESTONE, type FrontierSnapshot } from './daily';

/** The new (playable) day this report opens. */
export interface ReportTargetDay {
  dayKey: string;
  dayNumber: number;
  seed: number;
}

export interface BuiltReport {
  title: string;
  body: string;
}

/** Group an integer with thousands separators (locale-independent). */
export function formatInt(n: number): string {
  const rounded = Math.round(Math.abs(n));
  const digits = rounded.toString();
  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    groups.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return (n < 0 ? '-' : '') + groups.join(',');
}

/** A filled/empty unicode progress bar for the given percent. */
export function progressBar(pct: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return '▰'.repeat(filled) + '▱'.repeat(Math.max(0, width - filled));
}

/** 🥇🥈🥉 for the podium, plain "N." after. */
function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
}

/**
 * Build the Frontier Report post. `closed` is yesterday (the day that just
 * ended); `today` is the fresh, playable day this post opens.
 */
export function buildFrontierReport(
  closed: FrontierSnapshot,
  today: ReportTargetDay
): BuiltReport {
  const title = `⛏️ Delve · Day ${today.dayNumber} — Frontier Report`;
  const f = closed.frontier;
  const lines: string[] = [];

  lines.push(`### ⛏️ Frontier Report — Day ${closed.dayNumber}`);
  lines.push('');

  if (f.delvers === 0) {
    lines.push(`The frontier was **quiet** yesterday — nobody logged a delve.`);
    lines.push('');
    lines.push(
      `**Day ${today.dayNumber} is live.** Be the first down the shaft — how deep can you go?`
    );
    return { title, body: lines.join('\n') };
  }

  lines.push(`The sub delved **${formatInt(f.depths)} depths** yesterday.`);
  lines.push('');
  lines.push(
    `Frontier \`${progressBar(f.pct)}\` **${f.pct}%** → ${FRONTIER_MILESTONE}` +
      (closed.goalHit ? ' — **CLEARED!** 🎉' : '')
  );
  lines.push('');
  lines.push('**🏆 Deepest delvers**');
  lines.push('');
  for (const row of closed.top) {
    lines.push(`${medal(row.rank)} u/${row.username} — depth **${row.depth}**`);
  }
  lines.push('');
  lines.push(`🧑‍🤝‍🧑 ${formatInt(f.delvers)} delvers · ⚔️ ${formatInt(f.runs)} runs`);
  lines.push('');
  lines.push(
    `**Day ${today.dayNumber} is live** — same seed for all of us. How deep can *you* go?`
  );

  return { title, body: lines.join('\n') };
}
