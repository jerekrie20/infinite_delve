// Active ABILITY registry — data-driven skill definitions shared by client and
// server. Same pattern as stats.ts: one row = one ability. Adding a new skill
// ("Fireball", "Backstab") is one row here + an icon in the HUD.
//
// Each ability belongs to a class and unlocks at a specific level. The hero's
// `abilities` array holds the ids they've unlocked. LaneScene dispatches casts
// during the hero's attack window — mana is deducted, cooldown starts, damage
// (or a special effect) fires.

// ---- Ability definition -------------------------------------------------------

export interface ActiveDef {
  id: string;
  name: string;
  /** Emoji icon shown on the skill button (until real art lands). */
  icon: string;
  manaCost: number;
  /** Cooldown in ms. */
  cooldownMs: number;
  /** Multiplier on the hero's ATK for damage-dealing abilities (>1 = harder hit). */
  damageMult?: number;
  /** Special effect handler name (future: 'fortify', 'heal', etc.). If set,
   *  LaneScene calls the named handler instead of applying damageMult. */
  handler?: string;
  /** Flavor / tooltip shown on long-press. */
  description: string;
}

// ---- Unlock table -------------------------------------------------------------

export interface AbilityUnlock {
  abilityId: string;
  classId: string;
  level: number;
}

// ---- The registry -------------------------------------------------------------

export const ACTIVES: Record<string, ActiveDef> = {
  slam: {
    id: 'slam',
    name: 'Slam',
    icon: '💥',
    manaCost: 15,
    cooldownMs: 8000,
    damageMult: 1.8,
    description: 'A heavy overhead strike dealing 180% weapon damage.',
  },
  fortify: {
    id: 'fortify',
    name: 'Fortify',
    icon: '🛡️',
    manaCost: 25,
    cooldownMs: 20000,
    handler: 'fortify',
    description: 'Raise your guard, reducing all incoming damage by 50% for 3 seconds.',
  },
};

/** Unlock table: class → ability ids + level requirements, in unlock order. */
export const CLASS_ABILITIES: Record<string, AbilityUnlock[]> = {
  squire: [
    { abilityId: 'slam', classId: 'squire', level: 1 },
    { abilityId: 'fortify', classId: 'squire', level: 5 },
  ],
};

/** Which abilities a class has unlocked at a given level. */
export function unlockedAbilities(classId: string, level: number): string[] {
  const list = CLASS_ABILITIES[classId];
  if (!list) return [];
  return list.filter((u) => level >= u.level).map((u) => u.abilityId);
}

// ---- Active buff tracking (for non-damage abilities like Fortify) -------------

export interface ActiveBuff {
  abilityId: string;
  /** Time remaining in ms. */
  remainingMs: number;
}

// ---- Special effect handlers (called by LaneScene when ability.handler is set) -

export type ActiveHandlerFn = (
  hero: { attack: number; maxHp: number; hp: number; defense: number },
  buffs: ActiveBuff[],
) => { damageDealt?: number; buffApplied?: ActiveBuff; healAmount?: number };

/** Fortify: apply a 50% damage reduction buff for 3 seconds. */
function applyFortify(
  _hero: { attack: number; maxHp: number; hp: number; defense: number },
  buffs: ActiveBuff[],
): { buffApplied: ActiveBuff } {
  // Remove existing fortify buff if present, then apply fresh.
  const idx = buffs.findIndex((b) => b.abilityId === 'fortify');
  if (idx >= 0) buffs.splice(idx, 1);
  const buff: ActiveBuff = { abilityId: 'fortify', remainingMs: 3000 };
  buffs.push(buff);
  return { buffApplied: buff };
}

export const ACTIVE_HANDLERS: Record<string, ActiveHandlerFn> = {
  fortify: applyFortify,
};
