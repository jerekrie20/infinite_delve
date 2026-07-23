// Combat CLOCK — fixed-step time-keeping for the engine (D32, FORMULAS "Combat
// clock"). Real frame deltas quantize into exact 100ms steps here; that
// quantization is what makes a run bit-identical regardless of frame rate
// (determinism law). Per-entity attack timers + the 1s status sub-tick both
// ride this. Pure math — no entities, no rng; the engine owns the state.

import { TUNING } from '../content/tuning';

/** Effective attack interval: base ÷ (1 + attackSpeedPct/100), with the total
 *  AS%% hard-capped (+50 ⚙) and the result floored at the absolute minimum
 *  interval (1.0s). Slow/Haste feed in as attackSpeedPct deltas BEFORE the cap. */
export function effectiveIntervalMs(baseIntervalMs: number, attackSpeedPct: number): number {
  const cappedPct = Math.min(attackSpeedPct, TUNING.combat.attackSpeedCapPct);
  const interval = baseIntervalMs / (1 + cappedPct / 100);
  return Math.max(TUNING.combat.minAttackIntervalMs, Math.round(interval));
}

/** Accumulates real elapsed ms and yields how many whole fixed steps to run.
 *  The fractional remainder carries — no time is lost or double-counted. */
export class StepAccumulator {
  private accumulatedMs = 0;

  /** Feed a real frame delta; returns the number of fixed steps now due. */
  advance(deltaMs: number): number {
    if (deltaMs > 0) this.accumulatedMs += deltaMs;
    const steps = Math.floor(this.accumulatedMs / TUNING.combat.tickMs);
    this.accumulatedMs -= steps * TUNING.combat.tickMs;
    return steps;
  }

  reset(): void {
    this.accumulatedMs = 0;
  }
}

/** One entity's attack timer. Counts down in fixed steps; on expiry the engine
 *  performs the attack and the timer re-arms at the CURRENT effective interval
 *  (so Slow/Haste applied mid-count change the next swing, not this one —
 *  deterministic and cheap). */
export class AttackTimer {
  private remainingMs: number;

  constructor(initialIntervalMs: number) {
    this.remainingMs = initialIntervalMs;
  }

  /** Advance one fixed step; true = the attack fires now (timer must then be
   *  re-armed via rearm()). While stunned, callers simply don't advance. */
  advance(stepMs: number): boolean {
    this.remainingMs -= stepMs;
    return this.remainingMs <= 0;
  }

  rearm(intervalMs: number): void {
    this.remainingMs = intervalMs;
  }

  /** 0..1 progress toward the next swing (for HUD cast bars). */
  progress(intervalMs: number): number {
    return Math.max(0, Math.min(1, 1 - this.remainingMs / intervalMs));
  }
}
