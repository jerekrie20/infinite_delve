// Combat-stat HANDLER functions — one per behavioral stat. Each is a pure-ish
// function called by LaneScene's hook-dispatch loop. The handler table maps
// stat.handler → function; adding a new behavioral stat = one registry row +
// one ~5-line function here + flipping `implemented: true`.
//
// Signature:  handler(damage, statValue, hero, monster) → HandlerResult
//   damage   — the relevant damage number (outgoing, incoming, or 0 for perTick)
//   statValue— the hero's total derived value for this stat (already capped)
//   hero     — hero Combatant (mutated in-place for heals/shields)
//   monster  — monster Combatant
//
// Hook dispatch order (each hook point loops all stats with that hook):
//   onCombatStart → onAttack → onCrit → onDealDamage → onTakeDamage → onKill → perTick

export interface Combatant {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
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
  /** Extra raw damage added to the hit (cleave, burst, preemptive). */
  extraDmg?: number;
  /** Monster is instantly dead (execute). */
  dead?: boolean;
  /** Counter-attack damage dealt back to the attacker. */
  counterDmg?: number;
  /** Regen amount applied per tick. */
  regen?: number;
}

export type HandlerFn = (
  dmg: number,
  val: number,
  hero: Combatant,
  monster: Combatant,
) => Partial<HandlerResult>;

// ── onDealDamage ────────────────────────────────────────────────────

/** Lifesteal: heal N% of damage dealt. */
function healPercent(dmg: number, val: number, _hero: Combatant): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  const heal = Math.round((dmg * val) / 100);
  return { heal };
}

/** Mana Leech: gain N% of damage dealt as mana (staged — no mana resource yet). */
function manaPercent(_dmg: number, _val: number, _hero: Combatant): HandlerResult {
  return {};
}

/** Cleave: deal N% of single-target damage to surrounding enemies as extra.
 *  Staged — AoE enemies not implemented yet. */
function cleaveAoE(_dmg: number, _val: number): HandlerResult {
  return {};
}

/** Shield Leech: convert N% of damage dealt into a temporary health barrier.
 *  Staged — shield system not implemented yet. */
function shieldLeech(_dmg: number, _val: number): HandlerResult {
  return {};
}

// ── onCrit ──────────────────────────────────────────────────────────

/** Crit Burst: deal AoE splash damage when you crit. */
function splashAoE(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  return { extraDmg: Math.round((dmg * val) / 100) };
}

/** Crit Heal: restore HP whenever you land a crit. */
function critHealEffect(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { heal: Math.round((hero.maxHp * val) / 100) };
}

// ── onAttack ────────────────────────────────────────────────────────

/** Double Strike: N% chance to instantly attack a second time. */
function doubleStrike(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  if (Math.random() * 100 < val) return { extraDmg: -1 }; // signal: repeat attack
  return {};
}

/** Execute: instantly kill monster if HP falls below N%. */
function executeKill(_dmg: number, val: number, _hero: Combatant, monster: Combatant): HandlerResult {
  if (val <= 0 || monster.hp <= 0) return {};
  if ((monster.hp / monster.maxHp) * 100 <= val) return { dead: true };
  return {};
}

/** Ignore Defense: N% of hero's attack pierces monster armor. */
function ignoreDefense(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { extraDmg: Math.round(hero.attack * val / 100) };
}

/** Poison: rolled separately by LaneScene; this is a placeholder. */
function applyPoison(_dmg: number, _val: number): HandlerResult {
  return {};
}

// ── onTakeDamage ────────────────────────────────────────────────────

/** Dodge: N% chance to avoid all incoming damage. */
function dodgeRoll(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  if (Math.random() * 100 < val) return { dodged: true };
  return {};
}

/** Thorns: reflect N% of incoming damage back at the attacker. */
function reflectPercent(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  return { reflect: Math.round((dmg * val) / 100) };
}

/** Block: N% chance to reduce damage by blockAmount. blockAmount is a separate
 *  stat; LaneScene pairs them during dispatch. */
function blockRoll(dmg: number, val: number): HandlerResult {
  if (val <= 0 || dmg <= 0) return {};
  if (Math.random() * 100 < val) return { blocked: true };
  return {};
}

/** Counter Attack: after a successful dodge, deal N% damage back. */
function counterAttack(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { counterDmg: Math.round(hero.attack * val / 100) };
}

/** Block Heal: restore N% max HP on a successful block. */
function onBlockHeal(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { heal: Math.round(hero.maxHp * val / 100) };
}

/** Revive: N% chance to cheat death, revive with N% HP. */
function reviveRoll(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  if (Math.random() * 100 < val) return { heal: Math.round(hero.maxHp * val / 100) };
  return {};
}

/** Status Resist: N% chance to ignore a debuff (staged). */
function statusResistRoll(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  if (Math.random() * 100 < val) return {}; // resisted — caller checks for this
  return {};
}

// ── onKill ──────────────────────────────────────────────────────────

/** Heal on Kill: heal N% max HP when a monster dies. */
function healOnKill(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { heal: Math.round(hero.maxHp * val / 100) };
}

/** Explode on Kill: deal N% of monster's max HP as AoE to surrounding enemies. */
function explodeAoE(_dmg: number, val: number, _hero: Combatant, monster: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { extraDmg: Math.round(monster.maxHp * val / 100) };
}

/** Gold Find: +N% bonus gold from this kill. */
function bonusGold(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  return { bonusGold: val };
}

/** XP Bonus: +N% bonus XP from this kill. */
function bonusXp(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  return { bonusXp: val };
}

/** Item Drop Chance: +N% increased drop rate (staged). */
function bonusDrops(_dmg: number, _val: number): HandlerResult {
  return {};
}

// ── onCombatStart ───────────────────────────────────────────────────

/** Starting Shield: grant a shield equal to N% max HP at combat start. */
function grantShield(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { shield: Math.round(hero.maxHp * val / 100) };
}

/** Preemptive Strike: deal N% damage immediately when a new monster spawns. */
function preStrike(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { extraDmg: Math.round(hero.attack * val / 100) };
}

// ── perTick ─────────────────────────────────────────────────────────

/** Flat HP regen per second. */
function regenFlat(_dmg: number, val: number): HandlerResult {
  if (val <= 0) return {};
  return { regen: val };
}

/** Percent-max-HP regen per second. */
function regenPercent(_dmg: number, val: number, hero: Combatant): HandlerResult {
  if (val <= 0) return {};
  return { regen: Math.round(hero.maxHp * val / 100) };
}

/** Rare Enemy Chance: N% chance for next spawn to be elite/boss (staged). */
function rareEnemyRoll(_dmg: number, _val: number): HandlerResult {
  return {};
}

/** Cooldown Reduction (future — staged). */
function cooldownReduction(_dmg: number, _val: number): HandlerResult {
  return {};
}

/** Mana Cost Reduction (future — staged). */
function manaCostReduction(_dmg: number, _val: number): HandlerResult {
  return {};
}

// ── Dispatch table ──────────────────────────────────────────────────

/** Maps stat.handler → handler function. LaneScene's hook-dispatch loop looks
 *  up behavioral stats here. Staged handlers return {} so they're harmless even
 *  if a stat is mistakenly set `implemented: true`. */
export const HANDLERS: Record<string, HandlerFn> = {
  healPercent,
  manaPercent,
  cleaveAoE,
  shieldLeech,
  splashAoE,
  critHealEffect,
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
  statusResistRoll,
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
