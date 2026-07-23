// Idle-looter game endpoints:
//   POST /api/hero        get-or-create hero + auto-collect offline idle gains
//   POST /api/run/result  bank an active run (extract) or drop it (death)
//   POST /api/equip       equip a stash item / unequip a slot
//   POST /api/sell        sell a stash item for gold
//
// The server owns all hero mutation and computes reward *values* from the
// shared wave formula (src/shared/waves.ts); a claimed depth is plausibility-
// clamped (maxPlausibleDepth). Every write goes through the heroStore CAS loop
// (updateHero): concurrent equip/sell/run requests replay instead of silently
// losing each other's writes; exhausted retries answer 409. run/result is
// idempotent per client runId (runDedupe) and rate-limited (rateLimit) — the
// dedupe check runs BEFORE the limiter so retried duplicates are free.

import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  EquipRequest,
  EquipResponse,
  GearItem,
  GearSlot,
  HeroResponse,
  RunResultRequest,
  RunResultResponse,
  SellRequest,
  SellResponse,
} from '../../shared/delve';
import {
  applyRun,
  collectIdle,
  equipItem,
  newStoredHero,
  sellItem,
  toHero,
  unequipSlot,
  type RunGained,
} from '../core/hero';
import { CAS_ATTEMPTS, HeroConflictError, readHero, updateHero } from '../core/heroStore';
import { RATE_LIMITS, consumeRateLimit } from '../core/rateLimit';
import { beginRun, completeRun, findCompletedRun } from '../core/runDedupe';
import { gearScore, sanitizeHaul } from '../../shared/content/items';
import { maxPlausibleDepth } from '../../shared/waves';
import { recordRun } from '../core/frontier';

type ErrorResponse = { error: string };

export const game = new Hono();

/** Stable per-player identity. Prefer the Reddit userId; fall back to a dev
 *  handle so local playtest works when unauthenticated. */
const playerId = (): string => context.userId ?? 'anonymous';

const isConflict = (error: unknown): error is HeroConflictError =>
  error instanceof HeroConflictError;

/** Total gearScore across the equipped paper-doll (plausibility input). */
const equippedGearScore = (equipped: Partial<Record<GearSlot, GearItem>>): number => {
  let total = 0;
  for (const item of Object.values(equipped)) if (item) total += gearScore(item);
  return total;
};

game.post('/hero', async (c) => {
  try {
    const uid = playerId();
    const { hero, result: idle } = await updateHero(
      redis,
      uid,
      Date.now(),
      (h) => collectIdle(h), // award offline gains since last seen
      CAS_ATTEMPTS.hero
    );
    return c.json<HeroResponse>({ hero: toHero(hero), idle });
  } catch (error) {
    if (isConflict(error)) return c.json<ErrorResponse>({ error: 'Busy — please retry' }, 409);
    console.error('POST /api/hero error:', error);
    return c.json<ErrorResponse>({ error: 'Failed to load hero' }, 500);
  }
});

game.post('/run/result', async (c) => {
  try {
    const uid = playerId();
    const nowMs = Date.now();

    let body: RunResultRequest;
    try {
      body = await c.req.json<RunResultRequest>();
    } catch {
      return c.json<ErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    const outcome = body.outcome === 'extracted' ? 'extracted' : 'died';
    const claimedDepth =
      typeof body.depthReached === 'number' && Number.isFinite(body.depthReached)
        ? Math.max(0, Math.min(Math.floor(body.depthReached), 100000))
        : 0;
    const runId =
      typeof body.runId === 'string' && body.runId.length >= 1 && body.runId.length <= 64
        ? body.runId
        : undefined;

    /** Duplicate submission: replay the stored summary (or a zeroed one while
     *  the first request is still mid-flight). Awards NOTHING, skips the
     *  limiter — a queued client retry must always be free and safe. */
    const duplicateResponse = async (): Promise<Response> => {
      const stored = runId ? await findCompletedRun(redis, uid, runId) : null;
      const hero = (await readHero(redis, uid, nowMs)) ?? newStoredHero(nowMs);
      const zeroed: RunGained = {
        gold: 0, xp: 0, levelsGained: 0, bestDepth: hero.bestDepth, itemsBanked: 0, itemsEquipped: 0,
      };
      return c.json<RunResultResponse>({
        hero: toHero(hero),
        outcome,
        duplicate: true,
        gained: stored ?? zeroed,
      });
    };

    // 1. Already banked? Replay it before spending the rate-limit budget.
    if (runId && (await findCompletedRun(redis, uid, runId))) return duplicateResponse();

    // 2. Rate limit (SECURITY_PERF ≤1 per 30s). Nothing written on deny; the
    //    client queues the run and retries with the SAME runId.
    const rl = RATE_LIMITS.runResult;
    const allowed = await consumeRateLimit(redis, 'run-result', uid, rl.limit, rl.windowSeconds, nowMs);
    if (!allowed) return c.json<ErrorResponse>({ error: 'Too many runs — will retry shortly' }, 429);

    // 3. Claim first-wins on the runId (concurrent double-fire guard).
    if (runId && !(await beginRun(redis, uid, runId))) return duplicateResponse();

    // 4. Bank the run. Depth is clamped INSIDE the mutator (plausibility needs
    //    the loaded hero's level/gear/lastSeenAt — read BEFORE applyRun stamps
    //    it). clampedDepth escapes for the meta write below.
    let clampedDepth = 0;
    const { hero, result: gained } = await updateHero(
      redis,
      uid,
      nowMs,
      (h) => {
        const elapsedSeconds = Math.max(0, (nowMs - h.lastSeenAt) / 1000);
        clampedDepth = Math.min(
          claimedDepth,
          maxPlausibleDepth(h.level, equippedGearScore(h.equipped), elapsedSeconds)
        );
        const haul = outcome === 'extracted' ? sanitizeHaul(body.haul, clampedDepth) : [];
        return applyRun(h, outcome, clampedDepth, haul);
      },
      CAS_ATTEMPTS.runResult
    );

    // 5. Remember the award so duplicates replay instead of double-banking.
    if (runId) await completeRun(redis, uid, runId, gained, nowMs);

    // Meta loop: record the run into today's per-sub board + co-op frontier.
    // Best-effort — a meta failure must never break the core run banking.
    // Uses the CLAMPED depth so the daily board can't be griefed past it.
    try {
      const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
      await recordRun(redis, username, clampedDepth, Date.now());
    } catch (metaError) {
      console.error('daily meta side-write failed (non-fatal):', metaError);
    }

    return c.json<RunResultResponse>({ hero: toHero(hero), outcome, gained });
  } catch (error) {
    if (isConflict(error)) return c.json<ErrorResponse>({ error: 'Busy — please retry' }, 409);
    console.error('POST /api/run/result error:', error);
    return c.json<ErrorResponse>({ error: 'Failed to submit run result' }, 500);
  }
});

game.post('/equip', async (c) => {
  try {
    const uid = playerId();

    let body: EquipRequest;
    try {
      body = await c.req.json<EquipRequest>();
    } catch {
      return c.json<ErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    const rl = RATE_LIMITS.equip;
    const allowed = await consumeRateLimit(redis, 'equip', uid, rl.limit, rl.windowSeconds, Date.now());
    if (!allowed) return c.json<ErrorResponse>({ error: 'Too fast — try again' }, 429);

    const { hero } = await updateHero(
      redis,
      uid,
      Date.now(),
      (h) => {
        if (typeof body.itemId === 'string') return equipItem(h, body.itemId);
        if (typeof body.unequip === 'string') return unequipSlot(h, body.unequip);
        return false;
      },
      CAS_ATTEMPTS.equip
    );

    return c.json<EquipResponse>({ hero: toHero(hero) });
  } catch (error) {
    if (isConflict(error)) return c.json<ErrorResponse>({ error: 'Busy — please retry' }, 409);
    console.error('POST /api/equip error:', error);
    return c.json<ErrorResponse>({ error: 'Failed to update gear' }, 500);
  }
});

game.post('/sell', async (c) => {
  try {
    const uid = playerId();

    let body: SellRequest;
    try {
      body = await c.req.json<SellRequest>();
    } catch {
      return c.json<ErrorResponse>({ error: 'Invalid JSON body' }, 400);
    }

    const rl = RATE_LIMITS.sell;
    const allowed = await consumeRateLimit(redis, 'sell', uid, rl.limit, rl.windowSeconds, Date.now());
    if (!allowed) return c.json<ErrorResponse>({ error: 'Too fast — try again' }, 429);

    const { hero, result: goldGained } = await updateHero(
      redis,
      uid,
      Date.now(),
      (h) => (typeof body.itemId === 'string' ? sellItem(h, body.itemId) : 0),
      CAS_ATTEMPTS.sell
    );

    return c.json<SellResponse>({ hero: toHero(hero), goldGained });
  } catch (error) {
    if (isConflict(error)) return c.json<ErrorResponse>({ error: 'Busy — please retry' }, 409);
    console.error('POST /api/sell error:', error);
    return c.json<ErrorResponse>({ error: 'Failed to sell item' }, 500);
  }
});
