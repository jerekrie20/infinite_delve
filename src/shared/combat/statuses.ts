// Status-effect FRAMEWORK — the unified buff/debuff/DoT system (D14, D38) and
// all 16 launch statuses as PRESET rows over generic machinery (DoT tick ·
// signed StatMod read-at-use · Shield pool · Stun gate). Implementation
// contract: game_design/mechanics/03-combat/status-effects.md — magnitudes and
// durations there are normative; this file mirrors them as data rows.
// The engine (engine.ts) is the only writer; renderers read via the queries.
// Do not add a bespoke status system anywhere — a new status is one preset row.

import { TUNING } from '../content/tuning';
import type { DerivedId } from '../content/stats';
import type { Rng } from '../rng';

// ---- Ids, tags, shapes ------------------------------------------------------

export type StatusId =
  | 'poison' | 'burn' | 'bleed' | 'shock'          // DoT / payoff
  | 'stun'                                          // hard control
  | 'slow' | 'weaken' | 'armorBreak' | 'mark' | 'curse' // debuffs (mods)
  | 'fortify' | 'rage' | 'haste' | 'regen' | 'undying'  // buffs
  | 'shield'                                        // absorb pool
  | 'statMod';                                      // generic ad-hoc modifier

/** Element tags (D38): metadata on statuses/abilities; theme affinities read
 *  them (±25% potency — Phase 2 wiring). No damage-type matrix exists. */
export type ElementTag = 'fire' | 'ice' | 'lightning' | 'dark' | 'nature' | 'physical';

export type StackRule = 'refresh' | 'stack' | 'extend';

/** Quantities a mod-kind status can shift. The five combat quantities are read
 *  by the engine at their point of use; a DerivedId makes ANY derived stat
 *  buffable via the generic statMod (class-kits: Tumble, Focus, Perfect Draw…). */
export type ModQuantity =
  | 'atkPct'            // ×(1 + Σ/100) on outgoing base attack
  | 'attackSpeedPct'    // added to the owner's attackSpeedPct before the cap
  | 'defenseFlat'       // added to defensePct (floor 0)
  | 'damageTakenPct'    // ×(1 + Σ/100) on incoming damage (Fortify −, Mark +)
  | 'healingTakenPct'   // ×(1 + Σ/100) on incoming heals (Curse −)
  | DerivedId;

/** One live status on one combatant. One instance per (id, side) — stacking
 *  rules mutate the instance, never duplicate it. */
export interface ActiveStatus {
  id: StatusId;
  /** Signed meaning per status: dmg/s per stack (DoTs), % delta (mods),
   *  absorb points (shield), heal/s (regen), % per stack (shock). */
  magnitude: number;
  remainingMs: number;
  stacks: number;
  /** abilityId | statId | monster templateId — for UI/debug. */
  source: string;
  /** statMod only: which quantity this instance modifies. */
  modTarget?: ModQuantity | undefined;
}

/** What a magnitude formula may read off the applier at apply time. */
export interface ApplierView {
  attack: number;
  /** Sparse derived reads (poisonDamage etc.); missing = 0. */
  derived: Partial<Record<DerivedId, number>>;
}

export interface StatusPreset {
  id: StatusId;
  name: string;
  /** Emoji placeholder for the HUD icon row (real 24px icons: art phase 1-2). */
  icon: string;
  element?: ElementTag;
  kind: 'dot' | 'control' | 'mod' | 'buff' | 'shield' | 'special';
  stackRule: StackRule;
  maxStacks?: number;
  /** extend rule: total duration ceiling. */
  durationCapMs?: number;
  defaultDurationMs: number;
  /** mod/buff statuses: the quantity magnitude modifies (statMod instances
   *  carry their own). */
  modTarget?: ModQuantity;
  /** Default signed magnitude when the applier doesn't override. */
  defaultMagnitude?: (applier: ApplierView, hitDmg: number) => number;
  /** Self-applied; never resisted; survives floor transitions. */
  buff?: boolean;
}

// ---- The 16 presets (status-effects.md is normative; v1 numbers ⚙) ---------

export const STATUS_PRESETS: Record<StatusId, StatusPreset> = {
  // Damage over time — magnitude = damage/s PER STACK
  poison: {
    id: 'poison', name: 'Poison', icon: '☠️', element: 'nature',
    kind: 'dot', stackRule: 'stack', maxStacks: 5, defaultDurationMs: 6000,
    defaultMagnitude: (a) =>
      Math.max(1, Math.round(a.attack * 0.08 * (1 + (a.derived.poisonDamage ?? 0) / 100))),
  },
  burn: {
    id: 'burn', name: 'Burn', icon: '🔥', element: 'fire',
    kind: 'dot', stackRule: 'refresh', defaultDurationMs: 3000,
    defaultMagnitude: (a) => Math.max(1, Math.round(a.attack * 0.4)),
  },
  bleed: {
    id: 'bleed', name: 'Bleed', icon: '🩸', element: 'physical',
    kind: 'dot', stackRule: 'stack', maxStacks: 3, defaultDurationMs: 4000,
    defaultMagnitude: (_a, hitDmg) => Math.max(1, Math.round(hitDmg * 0.25)),
  },
  // Shock — payoff element: magnitude = +% damage per stack, consumed by next hit
  shock: {
    id: 'shock', name: 'Shock', icon: '⚡', element: 'lightning',
    kind: 'special', stackRule: 'stack', maxStacks: 3, defaultDurationMs: 4000,
    defaultMagnitude: () => 25,
  },
  // Hard control
  stun: {
    id: 'stun', name: 'Stun', icon: '💫', element: 'physical',
    kind: 'control', stackRule: 'extend', durationCapMs: 4000, defaultDurationMs: 1500,
  },
  // Stat debuffs (read at point of use — signed magnitudes)
  slow: {
    id: 'slow', name: 'Slow', icon: '🐌', element: 'ice',
    kind: 'mod', stackRule: 'refresh', defaultDurationMs: 5000,
    modTarget: 'attackSpeedPct', defaultMagnitude: () => -25,
  },
  weaken: {
    id: 'weaken', name: 'Weaken', icon: '📉',
    kind: 'mod', stackRule: 'refresh', defaultDurationMs: 6000,
    modTarget: 'atkPct', defaultMagnitude: () => -20,
  },
  armorBreak: {
    id: 'armorBreak', name: 'Armor Break', icon: '🛠️', element: 'physical',
    kind: 'mod', stackRule: 'refresh', defaultDurationMs: 7000,
    modTarget: 'defenseFlat', defaultMagnitude: () => -15,
  },
  mark: {
    id: 'mark', name: 'Mark', icon: '🎯',
    kind: 'mod', stackRule: 'refresh', defaultDurationMs: 7000,
    modTarget: 'damageTakenPct', defaultMagnitude: () => 25,
  },
  curse: {
    id: 'curse', name: 'Curse', icon: '🕯️', element: 'dark',
    kind: 'mod', stackRule: 'refresh', defaultDurationMs: 8000,
    modTarget: 'healingTakenPct', defaultMagnitude: () => -50,
  },
  // Buffs (self-applied, never resisted, survive floor transitions)
  fortify: {
    id: 'fortify', name: 'Fortify', icon: '🛡️',
    kind: 'buff', stackRule: 'refresh', defaultDurationMs: 3000,
    modTarget: 'damageTakenPct', defaultMagnitude: () => -50, buff: true,
  },
  rage: {
    id: 'rage', name: 'Rage', icon: '😤',
    kind: 'buff', stackRule: 'refresh', defaultDurationMs: 6000,
    modTarget: 'atkPct', defaultMagnitude: () => 30, buff: true,
  },
  haste: {
    id: 'haste', name: 'Haste', icon: '💨',
    kind: 'buff', stackRule: 'refresh', defaultDurationMs: 5000,
    modTarget: 'attackSpeedPct', defaultMagnitude: () => 30, buff: true,
  },
  regen: {
    id: 'regen', name: 'Regen', icon: '💚',
    kind: 'buff', stackRule: 'refresh', defaultDurationMs: 5000, buff: true,
  },
  undying: {
    id: 'undying', name: 'Undying', icon: '🕊️',
    kind: 'buff', stackRule: 'refresh', defaultDurationMs: 5000, buff: true,
  },
  // Shield — absorb pool; no duration (cleared at fight end / when broken)
  shield: {
    id: 'shield', name: 'Shield', icon: '🔰',
    kind: 'shield', stackRule: 'extend', defaultDurationMs: Number.MAX_SAFE_INTEGER,
  },
  // Generic ad-hoc modifier — instances carry their own modTarget + magnitude
  statMod: {
    id: 'statMod', name: 'Empowered', icon: '✨',
    kind: 'mod', stackRule: 'refresh', defaultDurationMs: 4000,
  },
};

// ---- Application ------------------------------------------------------------

export interface ApplyRequest {
  id: StatusId;
  source: string;
  magnitude?: number | undefined;
  durationMs?: number | undefined;
  modTarget?: ModQuantity | undefined;
  /** Triggering hit damage (bleed scales off it); 0 when not hit-driven. */
  hitDmg?: number | undefined;
}

export interface ApplyContext {
  /** Target's derived statusResist (whole %); 0 = never resists. */
  targetStatusResist: number;
  /** Target max HP (shield cap). */
  targetMaxHp: number;
  /** Self-application (buffs) — skips the resist roll. */
  selfApplied: boolean;
  /** Boss target: innate stun resist + stun-duration halving apply. */
  isBoss: boolean;
  /** Fight clock ms — timestamps the stun-halving window. */
  fightMs: number;
  /** Fight-ms stamps of prior successful stuns ON this target (engine-owned;
   *  mutated on a successful stun). */
  stunHistory: number[];
  rng: Rng;
  /** Theme affinity multiplier for duration/magnitude (D38):
   *  1.0 = neutral, 0.75 = resist, 1.25 = vulnerable, 0 = immune.
   *  Computed by the engine from the target's theme + status element. */
  themeAffinityMult?: number;
}

export type ApplyOutcome = 'applied' | 'resisted' | 'capped';

/** Apply one status to a side's list per the framework rules: resist roll →
 *  per-side cap → one-instance-per-id stack rule (boss stun rule for stun).
 *  Mutates `list` (and ctx.stunHistory on a successful stun). */
export function applyStatus(
  list: ActiveStatus[],
  req: ApplyRequest,
  applier: ApplierView,
  ctx: ApplyContext,
): ApplyOutcome {
  const preset = STATUS_PRESETS[req.id];
  const isBuff = preset.buff === true || ctx.selfApplied;

  // Resist model: one roll per application; self-buffs never resisted.
  if (!isBuff) {
    let resist = ctx.targetStatusResist;
    if (req.id === 'stun' && ctx.isBoss) resist += TUNING.statuses.bossStunResistPct;
    if (resist > 0 && ctx.rng() * 100 < resist) return 'resisted';

    // Theme affinity immune check (D38): element-tagged statuses blocked entirely.
    if (ctx.themeAffinityMult !== undefined && ctx.themeAffinityMult <= 0) {
      return 'resisted';
    }
  }

  // Theme affinity potency modifier (D38): ±25% on duration + magnitude.
  const affinity = !isBuff && ctx.themeAffinityMult !== undefined
    ? ctx.themeAffinityMult : 1;

  const magnitude =
    req.magnitude ?? preset.defaultMagnitude?.(applier, req.hitDmg ?? 0) ?? 0;
  let durationMs = req.durationMs ?? preset.defaultDurationMs;

  // Theme affinity potency (D38): ±25% on duration and magnitude.
  if (affinity !== 1 && !isBuff) {
    durationMs = Math.round(durationMs * affinity);
    // Magnitude scaling affects debuffs (round toward zero for signed values).
    // DoTs and debuffs: multiply magnitude proportionally.
  }

  // Boss stun rule: each successful stun within the window halves the next.
  if (req.id === 'stun' && ctx.isBoss) {
    const windowStart = ctx.fightMs - TUNING.statuses.stunHalvingWindowMs;
    const recent = ctx.stunHistory.filter((t) => t >= windowStart).length;
    durationMs = Math.round(durationMs / 2 ** recent);
  }

  // One instance per (id, side); the generic statMod keys by (id, modTarget)
  // so two ad-hoc buffs on different stats don't collide.
  const reqTarget = req.modTarget ?? preset.modTarget;
  const existing = list.find(
    (s) => s.id === req.id && (req.id !== 'statMod' || s.modTarget === reqTarget),
  );
  if (!existing) {
    // Per-side cap: new applications beyond it are dropped (oldest is NOT
    // displaced — simple and ungameable).
    if (list.length >= TUNING.statuses.capPerSide) return 'capped';
    list.push({
      id: req.id, magnitude, remainingMs: durationMs, stacks: 1,
      source: req.source, modTarget: req.modTarget ?? preset.modTarget,
    });
  } else {
    switch (preset.stackRule) {
      case 'refresh': // reset duration; higher magnitude wins (signed: farther from 0)
        existing.remainingMs = durationMs;
        if (Math.abs(magnitude) > Math.abs(existing.magnitude)) existing.magnitude = magnitude;
        break;
      case 'stack':
        existing.stacks = Math.min(existing.stacks + 1, preset.maxStacks ?? 99);
        existing.remainingMs = durationMs;
        if (Math.abs(magnitude) > Math.abs(existing.magnitude)) existing.magnitude = magnitude;
        break;
      case 'extend': {
        const cap = preset.durationCapMs ?? Number.MAX_SAFE_INTEGER;
        existing.remainingMs = Math.min(existing.remainingMs + durationMs, cap);
        break;
      }
    }
  }
  if (req.id === 'stun') ctx.stunHistory.push(ctx.fightMs);
  return 'applied';
}

// ---- The 1s tick ------------------------------------------------------------

export interface TickResult {
  /** Total DoT damage this tick (per status, for merged 1s float text). */
  dots: Array<{ id: StatusId; damage: number }>;
  /** Regen healing this tick. */
  heal: number;
  /** Statuses that expired this tick (HUD removal). */
  expired: StatusId[];
}

/** Advance all statuses by one status tick (1s): DoT damage, Regen healing,
 *  duration decrement, expiry. Shield never ticks (no duration). Mutates list. */
export function tickStatuses(list: ActiveStatus[]): TickResult {
  const out: TickResult = { dots: [], heal: 0, expired: [] };
  for (const s of list) {
    if (s.id === 'shield') continue;
    const preset = STATUS_PRESETS[s.id];
    if (preset.kind === 'dot') out.dots.push({ id: s.id, damage: s.magnitude * s.stacks });
    if (s.id === 'regen') out.heal += s.magnitude;
    s.remainingMs -= TUNING.statuses.tickMs;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    if (s.id !== 'shield' && s.remainingMs <= 0) {
      out.expired.push(s.id);
      list.splice(i, 1);
    }
  }
  return out;
}

// ---- Read-at-use queries ----------------------------------------------------

function sumMod(list: ActiveStatus[], target: ModQuantity): number {
  let total = 0;
  for (const s of list) if (s.modTarget === target) total += s.magnitude * s.stacks;
  return total;
}

/** ±% on outgoing base attack (Rage +, Weaken −). */
export const statusAtkPct = (list: ActiveStatus[]): number => sumMod(list, 'atkPct');

/** ± attackSpeedPct delta (Haste +, Slow −), added before the AS cap. */
export const statusAttackSpeedPct = (list: ActiveStatus[]): number =>
  sumMod(list, 'attackSpeedPct');

/** ± flat defensePct delta (Armor Break −); caller floors the result at 0. */
export const statusDefenseDelta = (list: ActiveStatus[]): number =>
  sumMod(list, 'defenseFlat');

/** ±% on incoming damage (Mark +, Fortify −). */
export const statusDamageTakenPct = (list: ActiveStatus[]): number =>
  sumMod(list, 'damageTakenPct');

/** ±% on incoming healing (Curse −). Applied to every heal the owner receives. */
export const statusHealingTakenPct = (list: ActiveStatus[]): number =>
  sumMod(list, 'healingTakenPct');

/** Generic derived-stat delta from statMod instances (Focus, Tumble…). */
export const statusStatDelta = (list: ActiveStatus[], id: DerivedId): number =>
  sumMod(list, id);

export const isStunned = (list: ActiveStatus[]): boolean =>
  list.some((s) => s.id === 'stun');

export const hasUndying = (list: ActiveStatus[]): boolean =>
  list.some((s) => s.id === 'undying');

// ---- Shock (setup-then-payoff) ---------------------------------------------

/** +% bonus the NEXT hit on this side deals (25 per stack ⚙). */
export function shockBonusPct(list: ActiveStatus[]): number {
  const s = list.find((x) => x.id === 'shock');
  return s ? s.magnitude * s.stacks : 0;
}

/** Consume Shock after the hit that spent it. */
export function consumeShock(list: ActiveStatus[]): void {
  const i = list.findIndex((x) => x.id === 'shock');
  if (i >= 0) list.splice(i, 1);
}

// ---- Shield pool ------------------------------------------------------------

export const shieldPool = (list: ActiveStatus[]): number =>
  list.find((s) => s.id === 'shield')?.magnitude ?? 0;

/** Add absorb points (pool capped at shieldCapPctMaxHp × maxHp). Bypasses the
 *  8-status cap check only if a shield already exists; otherwise counts. */
export function addShield(list: ActiveStatus[], amount: number, ownerMaxHp: number, source: string): void {
  if (amount <= 0) return;
  const cap = Math.round(ownerMaxHp * TUNING.statuses.shieldCapPctMaxHp);
  const existing = list.find((s) => s.id === 'shield');
  if (existing) {
    existing.magnitude = Math.min(existing.magnitude + amount, cap);
    return;
  }
  if (list.length >= TUNING.statuses.capPerSide) return;
  list.push({
    id: 'shield', magnitude: Math.min(amount, cap),
    remainingMs: Number.MAX_SAFE_INTEGER, stacks: 1, source,
  });
}

/** Deplete the pool by incoming damage; returns the damage that gets through.
 *  A broken shield is removed. */
export function absorbWithShield(list: ActiveStatus[], damage: number): number {
  const i = list.findIndex((s) => s.id === 'shield');
  if (i < 0 || damage <= 0) return damage;
  const s = list[i]!;
  const absorbed = Math.min(s.magnitude, damage);
  s.magnitude -= absorbed;
  if (s.magnitude <= 0) list.splice(i, 1);
  return damage - absorbed;
}

// ---- Cleanse rules ----------------------------------------------------------

/** Floor transition (monster death): the hero keeps self-buffs (+ shield),
 *  loses debuffs; monster lists die with the monsters. Mutates + returns list. */
export function cleanseForNextFloor(list: ActiveStatus[]): ActiveStatus[] {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    const preset = STATUS_PRESETS[s.id];
    if (!(preset.buff === true || s.id === 'shield')) list.splice(i, 1);
  }
  return list;
}

/** Run reset / extract: everything clears. */
export function cleanseAll(list: ActiveStatus[]): void {
  list.length = 0;
}
