// Shared, deterministic combat/reward math for the side-view idle looter.
// Both the client (runs the live auto-battle + shows numbers) and the server
// (awards run results + computes offline idle gains) import THIS, so the two
// never disagree. Pure functions only — no server/client imports.

export type MonsterKind = 'grunt' | 'swarm';

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

export const WAVE_CONFIG = {
  baseHp: 12,
  hpPerDepth: 5,
  baseAttack: 3,
  attackPerDepth: 1,
  baseXp: 4,
  xpPerDepth: 2,
  baseGold: 3,
  goldPerDepth: 2,
  swarmEveryN: 5,
  swarmMultiplier: 1.5,
} as const;

export function monsterForDepth(depth: number): WaveMonster {
  const d = Math.max(1, Math.floor(depth));
  const kind: MonsterKind = d % WAVE_CONFIG.swarmEveryN === 0 ? 'swarm' : 'grunt';
  const mult = kind === 'swarm' ? WAVE_CONFIG.swarmMultiplier : 1;
  return {
    kind,
    hp: Math.round((WAVE_CONFIG.baseHp + WAVE_CONFIG.hpPerDepth * d) * mult),
    attack: Math.round((WAVE_CONFIG.baseAttack + WAVE_CONFIG.attackPerDepth * d) * mult),
    defense: 0,
    xp: Math.round((WAVE_CONFIG.baseXp + WAVE_CONFIG.xpPerDepth * d) * mult),
    gold: Math.round((WAVE_CONFIG.baseGold + WAVE_CONFIG.goldPerDepth * d) * mult),
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

export const IDLE_CONFIG = {
  /** Offline gains stop accruing after this long — the "come back tomorrow"
   *  cap that makes the daily check-in the habit (the DQE money hook). */
  maxIdleSeconds: 8 * 60 * 60, // 8 hours
  /** Idle pace: the hero passively clears ~one monster this often. Slow on
   *  purpose — idle is spending money, not the main progression. */
  secondsPerKill: 60,
} as const;

/** Passive gold/sec, scaled to the monster at your best (banked) depth.
 *  Idle grants GOLD ONLY — leveling/XP stays an active-play reward, so a long
 *  break can't rocket the hero up levels (and active runs stay meaningful). */
export function idleGoldPerSecond(bestDepth: number): number {
  return monsterForDepth(bestDepth).gold / IDLE_CONFIG.secondsPerKill;
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
  const paid = Math.min(elapsed, IDLE_CONFIG.maxIdleSeconds);
  return {
    seconds: elapsed,
    paidSeconds: paid,
    gold: Math.floor(idleGoldPerSecond(bestDepth) * paid),
    xp: 0,
    capped: elapsed >= IDLE_CONFIG.maxIdleSeconds,
  };
}
