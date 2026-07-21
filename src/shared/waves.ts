// Shared, deterministic combat/reward math for the side-view idle looter.
// Both the client (runs the live auto-battle + shows numbers) and the server
// (awards run results + computes offline idle gains) import THIS, so the two
// never disagree. Numbers come from content/tuning + content/monsters (data),
// never hardcoded here. Pure functions only — no server/client imports.

import { TUNING } from './content/tuning';
import { archetypeForDepth, type MonsterKind } from './content/monsters';

export type { MonsterKind };

/** The single monster you face at a given depth (one monster per depth = your
 *  progress marker). Stats scale with depth; every 5th depth is a tougher
 *  "swarm" for variety and a difficulty spike. */
export interface WaveMonster {
  kind: MonsterKind;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  gold: number;
}

export function monsterForDepth(depth: number): WaveMonster {
  const d = Math.max(1, Math.floor(depth));
  const arch = archetypeForDepth(d);
  const m = TUNING.monster;
  const mult = arch.statMult;
  return {
    kind: arch.kind,
    hp: Math.round((m.baseHp + m.hpPerDepth * d) * mult),
    attack: Math.round((m.baseAttack + m.attackPerDepth * d) * mult),
    defense: 0,
    xp: Math.round((m.baseXp + m.xpPerDepth * d) * mult),
    gold: Math.round((m.baseGold + m.goldPerDepth * d) * mult),
  };
}

/** Total reward for clearing depths 1..depthReached this run — the amount an
 *  EXTRACT banks. Server-authoritative (recomputed from the reported depth, so
 *  it never trusts a client-supplied gold total). */
export function runReward(depthReached: number): { gold: number; xp: number } {
  const target = Math.max(0, Math.floor(depthReached));
  let gold = 0;
  let xp = 0;
  for (let d = 1; d <= target; d++) {
    const m = monsterForDepth(d);
    gold += m.gold;
    xp += m.xp;
  }
  return { gold, xp };
}

// ---- Idle / offline accrual ------------------------------------------------

/** Passive gold/sec, scaled to the monster at your best (banked) depth.
 *  Idle grants GOLD ONLY — leveling/XP stays an active-play reward, so a long
 *  break can't rocket the hero up levels (and active runs stay meaningful). */
export function idleGoldPerSecond(bestDepth: number): number {
  return monsterForDepth(bestDepth).gold / TUNING.idle.secondsPerKill;
}

export interface IdleGains {
  /** Real elapsed seconds since last seen (uncapped, for display). */
  seconds: number;
  /** Seconds actually paid out (min of elapsed and the cap). */
  paidSeconds: number;
  gold: number;
  /** Reserved: idle XP is 0 for now (leveling is an active-play reward). */
  xp: number;
  /** True if elapsed hit the cap (client can nudge "you maxed out — play now"). */
  capped: boolean;
}

export function computeIdle(bestDepth: number, elapsedSeconds: number): IdleGains {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const paid = Math.min(elapsed, TUNING.idle.maxIdleSeconds);
  return {
    seconds: elapsed,
    paidSeconds: paid,
    gold: Math.floor(idleGoldPerSecond(bestDepth) * paid),
    xp: 0,
    capped: elapsed >= TUNING.idle.maxIdleSeconds,
  };
}
