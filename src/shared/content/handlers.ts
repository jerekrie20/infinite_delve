// Combat-stat HANDLER functions — one per behavioral stat. Each is a PURE
// function called by the engine's hook-dispatch loop (src/shared/combat/):
// handlers never mutate combatants — they RETURN results and the engine applies
// them centrally (collect-then-apply). All randomness comes from the injected
// `rng` (determinism law: same seed = same fight). Adding a new behavioral stat
// = one registry row + one ~5-line function here.
//
// Signature:  handler(damage, statValue, self, other, rng) → HandlerResult
//   damage    — the relevant damage number (outgoing, incoming, or 0 for perTick)
//   statValue — the owner's total derived value for this stat (already capped)
//   self      — the combatant that OWNS the stat
//   other     — the opposing combatant (current target/attacker)
//   rng       — the run's seeded 0..1 source (never Math.random)
//
// Hook dispatch order (each hook point loops all stats with that hook):
//   onCombatStart → onAttack → onCrit → onDealDamage → onTakeDamage →
//   onLethal → onKill → perTick

import type { Rng } from '../rng';
import type { StatusId } from '../combat/statuses';

/** The minimal combatant view handlers read (the engine's entity satisfies it). */
export interface Combatant {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
}

/** A status application requested by a handler. The ENGINE resolves it: rolls
 *  the defender's statusResist, computes magnitude from the status preset +
 *  the applier's stats, and applies stack rules (statuses.ts). */
export interface StatusRequest {
  id: StatusId;
  /** Explicit magnitude override; omitted = the preset's formula decides. */
  magnitude?: number | undefined;
  /** Explicit duration override in ms; omitted = the preset default. */
  durationMs?: number | undefined;
}

export interface HandlerResult {
  heal?: number;
  shield?: number;
  reflect?: number;
  bonusGold?: number;
  bonusXp?: number;
  dodged?: boolean;
  blocked?: boolean;
  blockedBy?: number;
  /** Extra raw damage added to the hit (pierce, preemptive). -1 = double-strike signal. */
  extraDmg?: number;
  /** Target is instantly dead (execute). */
  dead?: boolean;
  /** Counter-attack damage dealt back to the attacker. */
  counterDmg?: number;
  /** Regen amount applied per tick. */
  regen?: number;
  /** Status applications to resolve against the hit's TARGET. */
  applyStatus?: StatusRequest[];
}

export type HandlerFn = (
  dmg: number,
  val: number,
  self: Combatant,
  other: Combatant,
  rng: Rng,
) => HandlerResult;

// ── onDealDamage ────────────────────────────────────────────────────

/** Lifesteal: heal N% of damage dealt. */
function healPercent(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  return { heal: Math.round((dmg * val) / 100) };
}

/** Mana Leech: gain N% of damage dealt as mana (staged — Phase 3 casters). */
function manaPercent(): HandlerResult {
  return {};
}

/** Cleave: the engine deals N% of the hit to the adjacent enemy in the row.
 *  Signalled via extraDmg on a dedicated dispatch — the engine reads the
 *  derived cleavePct directly at hit time (structural-ish), so this handler
 *  only reports the portion; row adjacency lives in the engine. */
function cleaveAoE(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  return { extraDmg: Math.round((dmg * val) / 100) };
}

/** Shield Leech: convert N% of damage dealt into shield (Shield status pool). */
function shieldLeech(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  return { shield: Math.round((dmg * val) / 100) };
}

/** Burn applier: N% chance per hit to apply the Burn status. */
function applyBurn(dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  if (rng() * 100 < val) return { applyStatus: [{ id: 'burn' }] };
  return {};
}

/** Slow applier: N% chance per hit to apply the Slow status. */
function applySlow(dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  if (rng() * 100 < val) return { applyStatus: [{ id: 'slow' }] };
  return {};
}

/** Shock applier: N% chance per hit to apply a Shock stack (D38 lightning). */
function applyShock(dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  if (rng() * 100 < val) return { applyStatus: [{ id: 'shock' }] };
  return {};
}

// ── onCrit ──────────────────────────────────────────────────────────

/** Crit Burst: splash damage on crit (retired stat — kept harmless). */
function splashAoE(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  return { extraDmg: Math.round((dmg * val) / 100) };
}

/** Crit Heal: restore N% max HP whenever you land a crit. */
function critHealEffect(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { heal: Math.round((self.maxHp * val) / 100) };
}

/** Bleed applier: N% chance ON CRIT to apply a Bleed stack (crit-gated). */
function applyBleed(dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  if (rng() * 100 < val) return { applyStatus: [{ id: 'bleed' }] };
  return {};
}

// ── onAttack ────────────────────────────────────────────────────────

/** Double Strike: N% chance to instantly attack a second time. */
function doubleStrike(_dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0) return {};
  if (rng() * 100 < val) return { extraDmg: -1 }; // signal: repeat attack
  return {};
}

/** Execute: instantly kill the target if its HP is below N%. */
function executeKill(_dmg: number, val: number, _self: Combatant, other: Combatant): HandlerResult {
  if (val <= 0 || other.hp <= 0) return {};
  if ((other.hp / other.maxHp) * 100 <= val) return { dead: true };
  return {};
}

/** Ignore Defense: N% of own attack pierces armor as extra damage. */
function ignoreDefense(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { extraDmg: Math.round((self.attack * val) / 100) };
}

/** Poison applier: N% chance per attack to apply a Poison stack. */
function applyPoison(_dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0) return {};
  if (rng() * 100 < val) return { applyStatus: [{ id: 'poison' }] };
  return {};
}

// ── onTakeDamage ────────────────────────────────────────────────────

/** Dodge: N% chance to avoid all incoming damage. */
function dodgeRoll(_dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0) return {};
  if (rng() * 100 < val) return { dodged: true };
  return {};
}

/** Thorns: reflect N% of incoming damage back at the attacker. */
function reflectPercent(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  return { reflect: Math.round((dmg * val) / 100) };
}

/** Block: N% chance to negate the hit (blockAmount rework is staged). */
function blockRoll(dmg: number, val: number, _s: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  if (rng() * 100 < val) return { blocked: true };
  return {};
}

/** Counter Attack: after a successful dodge, deal N% of own attack back. */
function counterAttack(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { counterDmg: Math.round((self.attack * val) / 100) };
}

/** Block Heal: restore N% max HP on a successful block (staged). */
function onBlockHeal(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { heal: Math.round((self.maxHp * val) / 100) };
}

// ── onLethal (fires only when a hit would kill the owner) ──────────

/** Revive: N% chance to cheat death, back up at N% max HP. Once per fight —
 *  the engine gates re-entry. */
function reviveRoll(_dmg: number, val: number, self: Combatant, _o: Combatant, rng: Rng): HandlerResult {
  if (val <= 0) return {};
  if (rng() * 100 < val) return { heal: Math.round((self.maxHp * val) / 100) };
  return {};
}

// ── onKill ──────────────────────────────────────────────────────────

/** Heal on Kill: heal N% max HP when the target dies. */
function healOnKill(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { heal: Math.round((self.maxHp * val) / 100) };
}

/** Explode on Kill: deal N% of the dead one's max HP to its killer. */
function explodeAoE(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { extraDmg: Math.round((self.maxHp * val) / 100) };
}

/** Gold Find: +N% bonus gold from this kill. */
function bonusGold(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  return { bonusGold: val };
}

/** XP Bonus: +N% bonus XP from this kill (staged — server reward calc). */
function bonusXp(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  return { bonusXp: val };
}

/** Item Drop Chance: +N% increased drop rate (staged). */
function bonusDrops(): HandlerResult {
  return {};
}

// ── onCombatStart ───────────────────────────────────────────────────

/** Starting Shield: grant shield = N% max HP at combat start (Shield status). */
function grantShield(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { shield: Math.round((self.maxHp * val) / 100) };
}

/** Preemptive Strike: deal N% of own attack immediately at spawn. */
function preStrike(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { extraDmg: Math.round((self.attack * val) / 100) };
}

// ── perTick ─────────────────────────────────────────────────────────

/** Flat HP regen per second. */
function regenFlat(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  return { regen: val };
}

/** Percent-max-HP regen per second. */
function regenPercent(_dmg: number, val: number, self: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { regen: Math.round((self.maxHp * val) / 100) };
}

/** Rare Enemy Chance: spawn-layer stat, wrong hook today (staged). */
function rareEnemyRoll(): HandlerResult {
  return {};
}

/** Cooldown Reduction (staged — Phase 3 casters). */
function cooldownReduction(): HandlerResult {
  return {};
}

/** Mana Cost Reduction (staged — Phase 3 casters). */
function manaCostReduction(): HandlerResult {
  return {};
}

// ── Dispatch table ──────────────────────────────────────────────────

/** Maps stat.handler → handler function. The engine's hook-dispatch loop looks
 *  up behavioral stats here. Staged handlers return {} so they're harmless even
 *  if a stat is mistakenly set `implemented: true`. */
export const HANDLERS: Record<string, HandlerFn> = {
  healPercent,
  manaPercent,
  cleaveAoE,
  shieldLeech,
  applyBurn,
  applySlow,
  applyShock,
  splashAoE,
  critHealEffect,
  applyBleed,
  doubleStrike,
  executeKill,
  ignoreDefense,
  applyPoison,
  dodgeRoll,
  reflectPercent,
  blockRoll,
  counterAttack,
  onBlockHeal,
  reviveRoll,
  healOnKill,
  explodeAoE,
  bonusGold,
  bonusXp,
  bonusDrops,
  grantShield,
  preStrike,
  regenFlat,
  regenPercent,
  rareEnemyRoll,
  cooldownReduction,
  manaCostReduction,
};
