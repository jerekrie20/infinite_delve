// The "Daily" panel: a lightweight HTML overlay (matches the existing #hud
// pattern) showing today's co-op frontier bar + the "deepest delve today"
// leaderboard. Reads from POST /api/daily via fetchDaily(); refreshes on open
// and after each run resolves.

import type { DailyResponse, LeaderRow } from '../../shared/daily';
import { fetchDaily } from '../api';

let backdrop: HTMLElement | null = null;
let content: HTMLElement | null = null;
let isOpen = false;

/** Wire the DAILY chip + close/backdrop dismissal. Call once on boot. */
export function initDailyPanel(): void {
  backdrop = document.getElementById('daily-panel');
  content = document.getElementById('daily-content');

  document.getElementById('btn-daily')?.addEventListener('click', () => {
    void toggleDaily();
  });
  document.getElementById('daily-close')?.addEventListener('click', closeDaily);
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDaily(); // tap outside the card
  });
}

async function toggleDaily(): Promise<void> {
  if (isOpen) {
    closeDaily();
    return;
  }
  isOpen = true;
  backdrop?.classList.add('show');
  await refreshDailyPanel();
}

function closeDaily(): void {
  isOpen = false;
  backdrop?.classList.remove('show');
}

/** Refetch + repaint. Safe to call while closed (keeps the panel warm). */
export async function refreshDailyPanel(): Promise<void> {
  if (!content) return;
  const data = await fetchDaily();
  content.innerHTML = renderDaily(data);
}

// ---- Rendering (pure string build) ----------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;'
      : ch === '<' ? '&lt;'
        : ch === '>' ? '&gt;'
          : ch === '"' ? '&quot;'
            : '&#39;'
  );
}

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function leaderRow(row: LeaderRow, meName: string | null): string {
  const isMe = meName !== null && row.username === meName;
  const badge = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `${row.rank}`;
  return (
    `<div class="lb-row${isMe ? ' me' : ''}">` +
    `<span class="lb-rank">${badge}</span>` +
    `<span class="lb-name">u/${esc(row.username)}</span>` +
    `<span class="lb-depth">${row.depth}<span> depth</span></span>` +
    `</div>`
  );
}

function renderDaily(d: DailyResponse): string {
  const f = d.frontier;
  const me = d.leaderboard.me;
  const parts: string[] = [];

  parts.push(`<div class="panel-title">Daily Delve</div>`);
  parts.push(`<div class="panel-day">Day ${d.dayNumber}</div>`);

  // Co-op frontier bar
  parts.push(
    `<div class="section-label">🏛️ Sub Frontier <span class="muted">${fmt(f.delvers)} delvers · ${fmt(f.runs)} runs</span></div>`
  );
  parts.push(
    `<div class="frontier-bar"><div class="frontier-fill" style="width:${f.pct}%"></div></div>`
  );
  parts.push(
    `<div class="frontier-meta"><span><b>${fmt(f.depths)}</b> / ${fmt(f.goal)} depths</span><span><b>${f.pct}%</b></span></div>`
  );

  // Leaderboard
  parts.push(`<div class="section-label">🏆 Deepest Delves Today</div>`);
  if (d.leaderboard.top.length === 0) {
    parts.push(`<div class="panel-empty">No delves logged yet today.<br>Be the first down the shaft.</div>`);
  } else {
    parts.push(d.leaderboard.top.map((r) => leaderRow(r, me?.username ?? null)).join(''));
  }

  // Your standing, if off the visible board
  if (me && me.rank > d.leaderboard.top.length) {
    parts.push(
      `<div class="you-rank">You're <b>#${fmt(me.rank)}</b> of ${fmt(d.leaderboard.totalPlayers)} — deepest <b>${me.depth}</b></div>`
    );
  }

  return parts.join('');
}
