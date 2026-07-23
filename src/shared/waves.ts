// Shared, deterministic combat/reward math for the side-view idle looter.
// Both the client (runs the live auto-battle + shows numbers) and the server
// (awards run results + computes offline idle gains) import THIS, so the two
// never disagree. Numbers come from content/tuning + content/monsters (data),
// never hardcoded here. Pure functions only — no server/client imports.

import type { MonsterRarity } from './delve';
import { TUNING } from './content/tuning';
import {
  TEMPLATES, templatesForDepth, bossForDepth, isMiniBossDepth, templateIntervalMs,
  type BossSignature, type MonsterKind, type MonsterTemplate,
} from './content/monsters';
import { rollFromPool } from './content/passives';
import type { GearStats } from './delve';
import type { Rng } from './rng';

export type { MonsterKind };

/** RNG source: a 0..1 random function — REQUIRED everywhere (Phase 1 seeded
 *  combat: the engine passes the run's seeded rng; there is no live-random
 *  default left in gameplay paths). */
export type { Rng };

/** One spawned monster (a pack member). Stats scale with depth + rarity and
 *  are split by the pack share (FORMULAS floor budget); passive behaviors are
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
  /** Rolled passive stats — fed to the engine's behavioralStats(). */
  passives: GearStats;
  /** Pack row (D32): melee front, ranged/casters back. */
  row: 'front' | 'back';
  /** Base attack interval in ms (kind default or template override). */
  intervalMs: number;
  /** Boss signature (absent for non-bosses). Carried through to the engine. */
  signature?: BossSignature;
}

/** Engine-facing alias: what packForDepth emits. */
export type PackMember = WaveMonster;

/** Build one scaled monster. `share` splits the floor budget across a pack
 *  (1 for solo spawns); defense is a percent and is never split.
 *  Compound scaling (FORMULAS): past compoundThreshold, stats multiply by
 *  compoundExp^(d−threshold). Rewards use a gentler exponent. */
function scaledMonster(
  d: number,
  tpl: MonsterTemplate,
  rarity: MonsterRarity,
  share: number,
  rng: Rng,
): WaveMonster {
  const m = TUNING.monster;
  const hpMult = rarity === 'elite' ? m.eliteHpMult : rarity === 'boss' ? m.bossHpMult : 1;
  const atkMult = rarity === 'elite' ? m.eliteAtkMult : rarity === 'boss' ? m.bossAtkMult : 1;
  const rewardMult = rarity === 'elite' ? m.eliteRewardMult : rarity === 'boss' ? m.bossRewardMult : 1;

  // Compound factor: 1.0 below threshold, compoundExp^(d−threshold) past it.
  const past = Math.max(0, d - m.compoundThreshold);
  const compoundHp = Math.pow(m.compoundHpExp, past);
  const compoundAtk = Math.pow(m.compoundAtkExp, past);
  const compoundReward = Math.pow(m.compoundRewardExp, past);

  // Mini-boss floors: one extra passive tier beyond elite (D6 elevated elite).
  const passiveTiers = rarity === 'boss' ? 3
    : rarity === 'elite' && isMiniBossDepth(d) ? 3
    : rarity === 'elite' ? 2
    : 0;
  const budget = rarity === 'normal' ? 0 : m.passiveBudgetBase + m.passiveBudgetPerDepth * d;
  const passives = passiveTiers > 0
    ? rollFromPool(tpl.passivePool, passiveTiers,
        rarity === 'boss' ? [2, 3] : [1, passiveTiers], budget, rng)
    : {};

  const name = rarity === 'elite' && isMiniBossDepth(d)
    ? `Mini-boss ${tpl.name}`
    : rarity === 'elite' ? `Elite ${tpl.name}`
    : tpl.name;

  const sig = rarity === 'boss' ? tpl.signature : undefined;
  return {
    kind: tpl.kind,
    hp: Math.max(1, Math.round((m.baseHp + m.hpPerDepth * d) * tpl.statMult * hpMult * share * compoundHp)),
    attack: Math.max(1, Math.round((m.baseAttack + m.attackPerDepth * d) * tpl.statMult * atkMult * share * compoundAtk)),
    defense: Math.round(tpl.baseStats.defense * tpl.statMult),
    xp: Math.round((m.baseXp + m.xpPerDepth * d) * tpl.statMult * rewardMult * share * compoundReward),
    gold: Math.round((m.baseGold + m.goldPerDepth * d) * tpl.statMult * rewardMult * share * compoundReward),
    templateId: tpl.id,
    name,
    rarity,
    sprite: tpl.sprite,
    passives,
    row: tpl.kind === 'caster' || tpl.kind === 'support' ? 'back' : 'front',
    intervalMs: templateIntervalMs(tpl),
    ...(sig ? { signature: sig } : {}),
  };
}

/** The deep-depth fallback template (shouldn't fire with the roster's open-
 *  ended deep band, but every depth must resolve to something). */
function fallbackTemplate(): MonsterTemplate {
  return TEMPLATES[TEMPLATES.length - 1]!;
}

/** The bodyguard a caster spawn fronts with: the FIRST eligible grunt/brute
 *  template at this depth, in registry order (deterministic — the reward-EV
 *  fold and the live spawn must agree on this pick). */
export function bodyguardTemplateFor(depth: number): MonsterTemplate | undefined {
  return templatesForDepth(depth).find(
    (t) => !t.bossInterval && (t.kind === 'grunt' || t.kind === 'brute')
  );
}

export function monsterForDepth(depth: number, rng: Rng): WaveMonster {
  const d = Math.max(1, Math.floor(depth));

  // Boss floor check.
  const boss = bossForDepth(d);
  if (boss) return scaledMonster(d, boss, 'boss', 1, rng);

  // Normal/elite: pick a random template active at this depth.
  const active = templatesForDepth(d).filter((t) => !t.bossInterval);
  if (active.length === 0) {
    const t = fallbackTemplate();
    // Fallback keeps the legacy passive-free normal spawn.
    const solo = scaledMonster(d, t, 'normal', 1, rng);
    return { ...solo, passives: {} };
  }

  const tpl = active[Math.floor(rng() * active.length)]!;

  // Mini-boss floors force elevated elite; otherwise roll the shared curve.
  const rarity: MonsterRarity = isMiniBossDepth(d)
    ? 'elite'
    : rng() < eliteChanceAtDepth(d) ? 'elite' : 'normal';
  return scaledMonster(d, tpl, rarity, 1, rng);
}

/** Per-kind pack sizes (roster.md pack-composition ⚙): returns the member
 *  count for a picked template's kind. Caster size is decided by bodyguard
 *  availability, handled in packForDepth. */
function rollPackSize(kind: MonsterKind, rng: Rng): number {
  if (kind === 'brute') return 1;
  if (kind === 'grunt') return rng() < 0.5 ? 1 : 2;
  if (kind === 'swarm') return rng() < 0.5 ? 2 : 3;
  return 1; // caster — resolved by the caller
}

/** Spawn the full floor pack (D32): 1-3 members in front/back rows, splitting
 *  the floor budget with the pack bonus. Bosses spawn solo (adds are Phase 2).
 *  Mini-boss floors force elevated elite. Every member rolls its own elite
 *  chance + passives from the seeded rng — draw order is part of run
 *  determinism, don't reorder calls. */
export function packForDepth(depth: number, rng: Rng): WaveMonster[] {
  const d = Math.max(1, Math.floor(depth));

  const boss = bossForDepth(d);
  if (boss) return [scaledMonster(d, boss, 'boss', 1, rng)];

  const active = templatesForDepth(d).filter((t) => !t.bossInterval);
  const tpl = active.length === 0
    ? fallbackTemplate()
    : active[Math.floor(rng() * active.length)]!;

  const bonus = TUNING.combat.packBonusPerExtra;
  // Mini-boss floors: forced elevated elite. Otherwise roll normally.
  const rollRarity = (): MonsterRarity =>
    isMiniBossDepth(d) ? 'elite' : (rng() < eliteChanceAtDepth(d) ? 'elite' : 'normal');

  if (tpl.kind === 'caster') {
    const bodyguard = bodyguardTemplateFor(d);
    if (!bodyguard) return [scaledMonster(d, tpl, rollRarity(), 1, rng)];
    const share = (1 + bonus) / 2; // n = 2
    return [
      scaledMonster(d, bodyguard, rollRarity(), share, rng),
      scaledMonster(d, tpl, rollRarity(), share, rng),
    ];
  }

  if (tpl.kind === 'support') {
    // Support: backline + 1 front bodyguard (same pattern as caster).
    const bodyguard = bodyguardTemplateFor(d);
    if (!bodyguard) return [scaledMonster(d, tpl, rollRarity(), 1, rng)];
    const share = (1 + bonus) / 2;
    return [
      scaledMonster(d, bodyguard, rollRarity(), share, rng),
      scaledMonster(d, tpl, rollRarity(), share, rng),
    ];
  }

  const n = rollPackSize(tpl.kind, rng);
  const share = (1 + bonus * (n - 1)) / n;
  const pack: WaveMonster[] = [];
  for (let i = 0; i < n; i++) pack.push(scaledMonster(d, tpl, rollRarity(), share, rng));
  return pack;
}

/** Elite chance at a depth — ONE curve shared by the live spawn roll and the
 *  expected-value reward math, so client spawns and server payouts never
 *  disagree about how elite a depth is. */
export function eliteChanceAtDepth(depth: number): number {
  const m = TUNING.monster;
  const d = Math.max(1, Math.floor(depth));
  return Math.min(m.eliteChance + m.eliteChancePerDepth * d, m.eliteChanceCap);
}

/** Expected floor-total multiplier for one template pick: the pack-EV fold
 *  (FORMULAS): E[Σ member statMult × share] over the kind's pack-size
 *  distribution. Grunt E[1+b(n−1)] over {1,2}; swarm over {2,3}; caster with a
 *  bodyguard is a fixed pair whose statMults average. MUST mirror packForDepth
 *  exactly — spawn texture and server payouts share this shape. */
function packEVStatMult(depth: number, tpl: MonsterTemplate): number {
  const b = TUNING.combat.packBonusPerExtra;
  switch (tpl.kind) {
    case 'brute':
      return tpl.statMult;
    case 'grunt':
      return tpl.statMult * (1 + (1 + b)) / 2; // n ∈ {1,2} at 50/50
    case 'swarm':
      return tpl.statMult * ((1 + b) + (1 + 2 * b)) / 2; // n ∈ {2,3} at 50/50
    case 'caster':
    case 'support': {
      const bodyguard = bodyguardTemplateFor(depth);
      if (!bodyguard) return tpl.statMult;
      return ((tpl.statMult + bodyguard.statMult) / 2) * (1 + b); // fixed pair
    }
  }
}

/** EXPECTED reward for clearing one depth — fully deterministic (FORMULAS
 *  "Reward EV rule" + pack-EV fold): no template pick, no elite roll, no pack
 *  roll. Non-boss depths use the linear ramp × the mean pack-folded statMult
 *  of the active templates (spawn picks uniformly, so the mean IS the template
 *  EV) × the analytic elite fold (members roll elite independently, so the
 *  fold factors out). Boss floors mirror packForDepth's solo-boss branch
 *  exactly. Compound scaling applies to rewards past compoundThreshold.
 *  Values are FRACTIONAL — callers sum then round once, so the EV stays exact
 *  across a run. */
export function rewardEV(depth: number): { gold: number; xp: number } {
  const m = TUNING.monster;
  const d = Math.max(1, Math.floor(depth));
  const linGold = m.baseGold + m.goldPerDepth * d;
  const linXp = m.baseXp + m.xpPerDepth * d;
  // Compound factor for rewards (gentler than stats — FORMULAS 1.02^past).
  const past = Math.max(0, d - m.compoundThreshold);
  const compoundReward = Math.pow(m.compoundRewardExp, past);

  const boss = bossForDepth(d);
  if (boss) {
    // Matches the boss branch of packForDepth (solo, already deterministic).
    return {
      gold: Math.round(linGold * boss.statMult * m.bossRewardMult * compoundReward),
      xp: Math.round(linXp * boss.statMult * m.bossRewardMult * compoundReward),
    };
  }

  const active = templatesForDepth(d).filter((t) => !t.bossInterval);
  if (active.length === 0) {
    // Same fallback as packForDepth: the last template, solo, always 'normal'.
    const t = TEMPLATES[TEMPLATES.length - 1]!;
    return {
      gold: linGold * t.statMult * compoundReward,
      xp: linXp * t.statMult * compoundReward,
    };
  }

  const meanPackedMult =
    active.reduce((sum, t) => sum + packEVStatMult(d, t), 0) / active.length;
  // Mini-boss floors: forced elite — the EV fold uses 100% elite chance.
  const eliteChance = isMiniBossDepth(d) ? 1 : eliteChanceAtDepth(d);
  const eliteFold = 1 + eliteChance * (m.eliteRewardMult - 1);
  return {
    gold: linGold * meanPackedMult * eliteFold * compoundReward,
    xp: linXp * meanPackedMult * eliteFold * compoundReward,
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
