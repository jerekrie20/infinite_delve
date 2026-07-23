// Shared, deterministic combat/reward math for the side-view idle looter.
// Both the client (runs the live auto-battle + shows numbers) and the server
// (awards run results + computes offline idle gains) import THIS, so the two
// never disagree. Numbers come from content/tuning + content/monsters (data),
// never hardcoded here. Pure functions only — no server/client imports.

import type { MonsterRarity } from './delve';
import { TUNING } from './content/tuning';
import { TEMPLATES, templatesForDepth, bossForDepth, type MonsterKind } from './content/monsters';
import { rollMonsterPassives } from './content/passives';
import type { GearStats } from './delve';
import type { Rng } from './rng';

export type { MonsterKind };

/** RNG source: a 0..1 random function (Math.random at runtime; seeded in tests). */
export type { Rng };

/** The single monster you face at a given depth (one monster per depth = your
 *  progress marker). Stats scale with depth + rarity; passive behaviors are
 *  rolled at spawn from the template's pool. */
export interface WaveMonster {
  kind: MonsterKind;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  gold: number;
  /** The template that spawned this monster. */
  templateId: string;
  /** Display name (e.g. "Elite Skeleton"). */
  name: string;
  /** Spawn rarity. */
  rarity: MonsterRarity;
  /** Client texture key. */
  sprite: string;
  /** Rolled passive stats — fed directly to behavioralStats() in LaneScene. */
  passives: GearStats;
}

export function monsterForDepth(depth: number, rng: Rng = Math.random): WaveMonster {
  const d = Math.max(1, Math.floor(depth));
  const m = TUNING.monster;

  // Boss floor check.
  const boss = bossForDepth(d);
  if (boss) {
    const budget = m.passiveBudgetBase + m.passiveBudgetPerDepth * d;
    const passives = rollMonsterPassives(boss.passivePool, 'boss', budget, rng);
    return {
      kind: boss.kind,
      hp: Math.round((m.baseHp + m.hpPerDepth * d) * boss.statMult * m.bossHpMult),
      attack: Math.round((m.baseAttack + m.attackPerDepth * d) * boss.statMult * m.bossAtkMult),
      defense: Math.round(boss.baseStats.defense * boss.statMult),
      xp: Math.round((m.baseXp + m.xpPerDepth * d) * boss.statMult * m.bossRewardMult),
      gold: Math.round((m.baseGold + m.goldPerDepth * d) * boss.statMult * m.bossRewardMult),
      templateId: boss.id,
      name: boss.name,
      rarity: 'boss',
      sprite: boss.sprite,
      passives,
    };
  }

  // Normal/elite: pick a random template active at this depth.
  const active = templatesForDepth(d).filter((t) => !t.bossInterval);
  if (active.length === 0) {
    // Fallback — shouldn't happen with the deep template (depthMin 30, no max).
    const t = TEMPLATES[TEMPLATES.length - 1]!;
    return {
      kind: t.kind,
      hp: Math.round((m.baseHp + m.hpPerDepth * d) * t.statMult),
      attack: Math.round((m.baseAttack + m.attackPerDepth * d) * t.statMult),
      defense: Math.round(t.baseStats.defense * t.statMult),
      xp: Math.round((m.baseXp + m.xpPerDepth * d) * t.statMult),
      gold: Math.round((m.baseGold + m.goldPerDepth * d) * t.statMult),
      templateId: t.id,
      name: t.name,
      rarity: 'normal',
      sprite: t.sprite,
      passives: {},
    };
  }

  const tpl = active[Math.floor(rng() * active.length)]!;

  // Roll rarity from the shared curve (the EV reward math folds the SAME curve
  // in analytically — they must never disagree).
  const rarity: MonsterRarity = rng() < eliteChanceAtDepth(d) ? 'elite' : 'normal';

  const hpMult = rarity === 'elite' ? m.eliteHpMult : 1;
  const atkMult = rarity === 'elite' ? m.eliteAtkMult : 1;
  const rewardMult = rarity === 'elite' ? m.eliteRewardMult : 1;

  const budget = rarity === 'elite' ? m.passiveBudgetBase + m.passiveBudgetPerDepth * d : 0;
  const passives = rollMonsterPassives(tpl.passivePool, rarity, budget, rng);

  const name = rarity === 'elite' ? `Elite ${tpl.name}` : tpl.name;

  return {
    kind: tpl.kind,
    hp: Math.round((m.baseHp + m.hpPerDepth * d) * tpl.statMult * hpMult),
    attack: Math.round((m.baseAttack + m.attackPerDepth * d) * tpl.statMult * atkMult),
    defense: Math.round(tpl.baseStats.defense * tpl.statMult),
    xp: Math.round((m.baseXp + m.xpPerDepth * d) * tpl.statMult * rewardMult),
    gold: Math.round((m.baseGold + m.goldPerDepth * d) * tpl.statMult * rewardMult),
    templateId: tpl.id,
    name,
    rarity,
    sprite: tpl.sprite,
    passives,
  };
}

/** Elite chance at a depth — ONE curve shared by the live spawn roll and the
 *  expected-value reward math, so client spawns and server payouts never
 *  disagree about how elite a depth is. */
export function eliteChanceAtDepth(depth: number): number {
  const m = TUNING.monster;
  const d = Math.max(1, Math.floor(depth));
  return Math.min(m.eliteChance + m.eliteChancePerDepth * d, m.eliteChanceCap);
}

/** EXPECTED reward for clearing one depth — fully deterministic (FORMULAS
 *  "Reward EV rule"): no template pick, no elite roll. Non-boss depths use the
 *  linear ramp × mean statMult of the active templates (spawn picks uniformly,
 *  so the mean IS the template EV) × the analytic elite fold. Boss floors
 *  mirror monsterForDepth's boss branch exactly. Values are FRACTIONAL —
 *  callers sum then round once, so the EV stays exact across a run. */
export function rewardEV(depth: number): { gold: number; xp: number } {
  const m = TUNING.monster;
  const d = Math.max(1, Math.floor(depth));
  const linGold = m.baseGold + m.goldPerDepth * d;
  const linXp = m.baseXp + m.xpPerDepth * d;

  const boss = bossForDepth(d);
  if (boss) {
    // Matches the boss branch of monsterForDepth (already deterministic).
    return {
      gold: Math.round(linGold * boss.statMult * m.bossRewardMult),
      xp: Math.round(linXp * boss.statMult * m.bossRewardMult),
    };
  }

  const active = templatesForDepth(d).filter((t) => !t.bossInterval);
  if (active.length === 0) {
    // Same fallback as monsterForDepth: the deep template, always 'normal'.
    const t = TEMPLATES[TEMPLATES.length - 1]!;
    return { gold: linGold * t.statMult, xp: linXp * t.statMult };
  }

  const meanStatMult = active.reduce((sum, t) => sum + t.statMult, 0) / active.length;
  const eliteFold = 1 + eliteChanceAtDepth(d) * (m.eliteRewardMult - 1);
  return {
    gold: linGold * meanStatMult * eliteFold,
    xp: linXp * meanStatMult * eliteFold,
  };
}

/** Total reward for clearing depths 1..depthReached this run — the amount an
 *  EXTRACT banks. Server-authoritative (recomputed from the reported depth, so
 *  it never trusts a client-supplied gold total) and DETERMINISTIC: same depth
 *  → same payout, always (expected value, never a live roll). */
export function runReward(depthReached: number): { gold: number; xp: number } {
  const target = Math.max(0, Math.floor(depthReached));
  let gold = 0;
  let xp = 0;
  for (let d = 1; d <= target; d++) {
    const ev = rewardEV(d);
    gold += ev.gold;
    xp += ev.xp;
  }
  return { gold: Math.round(gold), xp: Math.round(xp) };
}

/** Hard ceiling on a plausible `depthReached` claim (FORMULAS "Anti-cheat
 *  depth plausibility"): the LOWEST of an absolute cap, a progress bound from
 *  level + equipped gear, and a pace bound from elapsed real time. Bounds are
 *  deliberately generous — this is grief-stopping, not anti-cheat (that's
 *  replay verification, Phase 7). Pure; the server clamps with it. */
export function maxPlausibleDepth(
  level: number,
  equippedGearScore: number,
  elapsedSeconds: number
): number {
  const p = TUNING.plausibility;
  const safeLevel = Math.max(1, Math.floor(level));
  const safeGear = Math.max(0, equippedGearScore);
  const safeElapsed = Math.max(0, elapsedSeconds);
  const progressBound =
    p.depthBase + p.depthPerLevel * (safeLevel - 1) + safeGear / p.gearScorePerDepth;
  const paceBound = Math.floor(safeElapsed / p.minSecondsPerFloor);
  return Math.max(0, Math.floor(Math.min(p.hardDepthCap, progressBound, paceBound)));
}

// ---- Idle / offline accrual ------------------------------------------------

/** Passive gold/sec from the EXPECTED reward at your best (banked) depth —
 *  deterministic (the old live monsterForDepth roll could silently 4× the rate
 *  on an elite draw). Idle grants GOLD ONLY — leveling/XP stays an active-play
 *  reward, so a long break can't rocket the hero up levels. */
export function idleGoldPerSecond(bestDepth: number): number {
  return rewardEV(Math.max(1, Math.floor(bestDepth))).gold / TUNING.idle.secondsPerKill;
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
