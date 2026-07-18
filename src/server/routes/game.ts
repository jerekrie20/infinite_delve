// Idle-looter game endpoints:
//   POST /api/hero        get-or-create hero + auto-collect offline idle gains
//   POST /api/run/result  bank an active run (extract) or drop it (death)
//
// The server owns all hero mutation and computes reward *values* from the
// shared wave formula (src/shared/waves.ts) — the client is trusted only on the
// depth it reached (v0; server re-sim / anti-cheat deferred until a leaderboard).

import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  HeroResponse,
  RunResultRequest,
  RunResultResponse,
} from '../../shared/delve';
import { applyRun, collectIdle, getOrCreateHero, saveHero, toHero } from '../core/hero';
import { recordRun } from '../core/frontier';

type ErrorResponse = { error: string };

export const game = new Hono();

/** Stable per-player identity. Prefer the Reddit userId; fall back to a dev
 *  handle so local playtest works when unauthenticated. */
const playerId = (): string => context.userId ?? 'anonymous';

game.post('/hero', async (c) => {
  try {
    const uid = playerId();
    const hero = await getOrCreateHero(uid);
    const idle = collectIdle(hero); // award offline gains since last seen
    await saveHero(uid, hero);
    return c.json<HeroResponse>({ hero: toHero(hero), idle });
  } catch (error) {
    console.error('POST /api/hero error:', error);
    return c.json<ErrorResponse>({ error: 'Failed to load hero' }, 500);
  }
});

game.post('/run/result', async (c) => {
  try {
    const uid = playerId();

    let body: RunResultRequest;
    try {
      body = await c.req.json<RunResultRequest>();
    } catch {
      return c.json<ErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    const outcome = body.outcome === 'extracted' ? 'extracted' : 'died';
    const depthReached =
      typeof body.depthReached === 'number' && Number.isFinite(body.depthReached)
        ? Math.max(0, Math.min(Math.floor(body.depthReached), 100000))
        : 0;

    const hero = await getOrCreateHero(uid);
    const gained = applyRun(hero, outcome, depthReached);
    await saveHero(uid, hero);

    // Meta loop: record the run into today's per-sub board + co-op frontier.
    // Best-effort — a meta failure must never break the core run banking.
    try {
      const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
      await recordRun(redis, username, depthReached, Date.now());
    } catch (metaError) {
      console.error('daily meta side-write failed (non-fatal):', metaError);
    }

    return c.json<RunResultResponse>({ hero: toHero(hero), outcome, gained });
  } catch (error) {
    console.error('POST /api/run/result error:', error);
    return c.json<ErrorResponse>({ error: 'Failed to submit run result' }, 500);
  }
});
