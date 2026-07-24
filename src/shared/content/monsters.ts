// Monster TEMPLATES as data. Each template defines a creature type with base
// stats, a passive pool, and a depth range where it appears. The spawn engine
// (waves.ts) scales stats by depth + rarity, rolls passives, and picks which
// template appears at each depth — so adding a new monster is one row here
// + one pool entry in passives.ts.
//
// Bosses are templates with a bossInterval; they override the normal spawn at
// every Nth depth within their range. Elites are rolled probabilistically on
// non-boss depths and draw extra stats from the template's passive pool.

import type { ElementTag, MonsterKind } from '../delve';
import type { StatusId } from '../combat/statuses';

export type { MonsterKind };

/** Per-kind base attack intervals ⚙ (roster.md pack-composition table is
 *  normative). A template may override with its own `intervalMs`; bosses use
 *  their kind's interval. Effective = interval ÷ (1 + attackSpeedPct/100). */
export const KIND_INTERVAL_MS: Record<MonsterKind, number> = {
  grunt: 2000,
  swarm: 1400,
  brute: 2600,
  caster: 3200,
  support: 3200,
};

/** Attack interval for a template: its override, else its kind's default. */
export function templateIntervalMs(t: MonsterTemplate): number {
  return t.intervalMs ?? KIND_INTERVAL_MS[t.kind];
}

/** Boss signature action — all expressible via the status framework (D39). */
export interface SignatureAction {
  type: 'applyStatus' | 'buffedHit';
  /** Status to apply (applyStatus) — magnitude/duration override the preset. */
  statusId?: StatusId;
  magnitude?: number;
  durationMs?: number;
  /** 'hero' = apply to the hero, 'self' = apply to the boss. */
  target?: 'hero' | 'self';
  /** Damage multiplier for buffedHit (e.g. 1.5 = 150% ATK). */
  damageMult?: number;
}

/** A boss signature move: cooldown-gated, one-beat telegraphed (D39). */
export interface BossSignature {
  name: string;
  cooldownMs: number;
  /** First firing delay from fight start (≥5s per FORMULAS). */
  firstDelayMs: number;
  actions: SignatureAction[];
}

export interface MonsterTemplate {
  id: string;
  name: string;
  sprite: string;          // client texture key, loaded in LaneScene.preload
  kind: MonsterKind;       // 'grunt' | 'swarm' | 'brute' | 'caster' | 'support'
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
  };
  /** Multiplier on depth-scaled stats (same role as old statMult). */
  statMult: number;
  /** Which passive pool this template draws from (passives.ts). */
  passivePool: string;
  /** First depth this template can appear. */
  depthMin: number;
  /** Last depth this template can appear (undefined = forever). */
  depthMax?: number;
  /** Theme this template belongs to (Goblin Camp, Crypt, Warrens…). */
  theme?: string;
  /** Element tag for affinity resistance/vulnerability (D38). */
  element?: ElementTag;
  /** If set, this template is the boss for the given theme. */
  bossOf?: string;
  /** Boss spawns at this exact depth within its range (must be set when bossOf is set). */
  bossInterval?: number;
  /** Boss signature move (D39) — cooldown-driven, one-beat telegraphed. */
  signature?: BossSignature;
  /** Attack interval override in ms (default: KIND_INTERVAL_MS[kind]). */
  intervalMs?: number;
}

// ---- The roster (D25: 18 templates + 6 bosses, depths 1-60) -----------------

export const TEMPLATES: MonsterTemplate[] = [
  // ── Depths 1-10 · Goblin Camp (theme: goblinoid/brute) ──────────────────
  {
    id: 'goblin_scout', name: 'Goblin Scout', sprite: 'goblin_scout',
    kind: 'grunt', baseStats: { hp: 8, attack: 4, defense: 0 },
    statMult: 1.0, passivePool: 'goblinoid',
    depthMin: 1, depthMax: 10, theme: 'goblin_camp',
  },
  {
    id: 'goblin_brute', name: 'Goblin Brute', sprite: 'goblin_brute',
    kind: 'brute', baseStats: { hp: 20, attack: 6, defense: 2 },
    statMult: 1.3, passivePool: 'brute',
    depthMin: 1, depthMax: 10, theme: 'goblin_camp',
  },
  {
    id: 'goblin_shaman', name: 'Goblin Shaman', sprite: 'goblin_shaman',
    kind: 'support', baseStats: { hp: 10, attack: 5, defense: 1 },
    statMult: 1.1, passivePool: 'goblinoid',
    depthMin: 1, depthMax: 10, theme: 'goblin_camp',
  },
  {
    id: 'goblin_chief', name: 'Goblin Chieftain', sprite: 'goblin_chief',
    kind: 'brute', baseStats: { hp: 40, attack: 8, defense: 3 },
    statMult: 1.5, passivePool: 'goblinoid',
    depthMin: 1, depthMax: 10, theme: 'goblin_camp',
    bossOf: 'goblin_camp', bossInterval: 10,
    signature: {
      name: 'War Cry', cooldownMs: 12000, firstDelayMs: 5000,
      actions: [{ type: 'applyStatus', statusId: 'rage', magnitude: 30, durationMs: 6000, target: 'self' }],
    },
  },

  // ── Depths 11-20 · Crypt (theme: undead) ────────────────────────────────
  {
    id: 'skeleton', name: 'Skeleton', sprite: 'skeleton',
    kind: 'grunt', baseStats: { hp: 12, attack: 5, defense: 1 },
    statMult: 1.1, passivePool: 'undead',
    depthMin: 11, depthMax: 20, theme: 'crypt', element: 'dark',
  },
  {
    id: 'skeleton_capt', name: 'Skeleton Captain', sprite: 'skeleton_capt',
    kind: 'brute', baseStats: { hp: 25, attack: 7, defense: 3 },
    statMult: 1.4, passivePool: 'undead',
    depthMin: 11, depthMax: 20, theme: 'crypt', element: 'dark',
  },
  {
    id: 'ghoul', name: 'Ghoul', sprite: 'ghoul',
    kind: 'swarm', baseStats: { hp: 9, attack: 6, defense: 0 },
    statMult: 1.2, passivePool: 'undead',
    depthMin: 11, depthMax: 20, theme: 'crypt', element: 'dark',
  },
  {
    id: 'necromancer', name: 'Necromancer', sprite: 'necromancer',
    kind: 'caster', baseStats: { hp: 50, attack: 10, defense: 4 },
    statMult: 1.6, passivePool: 'undead',
    depthMin: 11, depthMax: 20, theme: 'crypt', element: 'dark',
    bossOf: 'crypt', bossInterval: 20,
    signature: {
      name: 'Curse of the Grave', cooldownMs: 12000, firstDelayMs: 5000,
      actions: [{ type: 'applyStatus', statusId: 'curse', magnitude: -50, durationMs: 8000, target: 'hero' }],
    },
  },

  // ── Depths 21-30 · Warrens (theme: swarm) ───────────────────────────────
  {
    id: 'giant_rat', name: 'Giant Rat', sprite: 'giant_rat',
    kind: 'swarm', baseStats: { hp: 6, attack: 3, defense: 0 },
    statMult: 1.3, passivePool: 'swarm',
    depthMin: 21, depthMax: 30, theme: 'warrens', element: 'nature',
  },
  {
    id: 'plague_rat', name: 'Plague Rat', sprite: 'plague_rat',
    kind: 'swarm', baseStats: { hp: 7, attack: 4, defense: 0 },
    statMult: 1.3, passivePool: 'swarm',
    depthMin: 21, depthMax: 30, theme: 'warrens', element: 'nature',
  },
  {
    id: 'tunnel_horror', name: 'Tunnel Horror', sprite: 'tunnel_horror',
    kind: 'brute', baseStats: { hp: 28, attack: 8, defense: 4 },
    statMult: 1.5, passivePool: 'brute',
    depthMin: 21, depthMax: 30, theme: 'warrens',
  },
  {
    id: 'broodmother', name: 'Broodmother', sprite: 'broodmother',
    kind: 'swarm', baseStats: { hp: 60, attack: 12, defense: 5 },
    statMult: 1.7, passivePool: 'swarm',
    depthMin: 21, depthMax: 30, theme: 'warrens', element: 'nature',
    bossOf: 'warrens', bossInterval: 30,
    signature: {
      name: 'Feeding Frenzy', cooldownMs: 15000, firstDelayMs: 5000,
      actions: [{ type: 'applyStatus', statusId: 'haste', magnitude: 40, durationMs: 4000, target: 'self' }],
    },
  },

  // ── Depths 31-40 · Deep (theme: deep) ───────────────────────────────────
  {
    id: 'wraith', name: 'Wraith', sprite: 'wraith',
    kind: 'caster', baseStats: { hp: 16, attack: 7, defense: 2 },
    statMult: 1.2, passivePool: 'deep',
    depthMin: 31, depthMax: 40, theme: 'deep', element: 'dark',
  },
  {
    id: 'deep_stalker', name: 'Deep Stalker', sprite: 'deep_stalker',
    kind: 'grunt', baseStats: { hp: 18, attack: 8, defense: 2 },
    statMult: 1.3, passivePool: 'deep',
    depthMin: 31, depthMax: 40, theme: 'deep',
  },
  {
    id: 'gloom_caller', name: 'Gloom Caller', sprite: 'gloom_caller',
    kind: 'caster', baseStats: { hp: 14, attack: 9, defense: 3 },
    statMult: 1.3, passivePool: 'deep',
    depthMin: 31, depthMax: 40, theme: 'deep', element: 'dark',
  },
  {
    id: 'hollow_king', name: 'The Hollow King', sprite: 'hollow_king',
    kind: 'brute', baseStats: { hp: 70, attack: 13, defense: 6 },
    statMult: 1.8, passivePool: 'deep',
    depthMin: 31, depthMax: 40, theme: 'deep', element: 'dark',
    bossOf: 'deep', bossInterval: 40,
    signature: {
      name: 'Hollowing', cooldownMs: 12000, firstDelayMs: 5000,
      actions: [{ type: 'applyStatus', statusId: 'mark', magnitude: 25, durationMs: 6000, target: 'hero' }],
    },
  },

  // ── Depths 41-50 · Volcanic (theme: volcanic) ───────────────────────────
  {
    id: 'magma_imp', name: 'Magma Imp', sprite: 'magma_imp',
    kind: 'swarm', baseStats: { hp: 10, attack: 6, defense: 1 },
    statMult: 1.3, passivePool: 'volcanic',
    depthMin: 41, depthMax: 50, theme: 'volcanic', element: 'fire',
  },
  {
    id: 'cinder_brute', name: 'Cinder Brute', sprite: 'cinder_brute',
    kind: 'brute', baseStats: { hp: 32, attack: 10, defense: 5 },
    statMult: 1.5, passivePool: 'volcanic',
    depthMin: 41, depthMax: 50, theme: 'volcanic', element: 'fire',
  },
  {
    id: 'flame_adept', name: 'Flame Adept', sprite: 'flame_adept',
    kind: 'caster', baseStats: { hp: 18, attack: 11, defense: 3 },
    statMult: 1.4, passivePool: 'volcanic',
    depthMin: 41, depthMax: 50, theme: 'volcanic', element: 'fire',
  },
  {
    id: 'pyre_tyrant', name: 'Pyre Tyrant', sprite: 'pyre_tyrant',
    kind: 'brute', baseStats: { hp: 85, attack: 15, defense: 7 },
    statMult: 1.9, passivePool: 'volcanic',
    depthMin: 41, depthMax: 50, theme: 'volcanic', element: 'fire',
    bossOf: 'volcanic', bossInterval: 50,
    signature: {
      name: 'Eruption', cooldownMs: 14000, firstDelayMs: 5000,
      actions: [
        { type: 'buffedHit', damageMult: 1.5 },
        { type: 'applyStatus', statusId: 'burn', magnitude: 0, durationMs: 4000, target: 'hero' },
      ],
    },
  },

  // ── Depths 51-60 · Abyss (theme: abyss) ─────────────────────────────────
  {
    id: 'void_spawn', name: 'Void Spawn', sprite: 'void_spawn',
    kind: 'grunt', baseStats: { hp: 20, attack: 10, defense: 3 },
    statMult: 1.3, passivePool: 'abyss',
    depthMin: 51, depthMax: 60, theme: 'abyss', element: 'dark',
  },
  {
    id: 'abyss_knight', name: 'Abyss Knight', sprite: 'abyss_knight',
    kind: 'brute', baseStats: { hp: 36, attack: 12, defense: 6 },
    statMult: 1.6, passivePool: 'abyss',
    depthMin: 51, depthMax: 60, theme: 'abyss', element: 'dark',
  },
  {
    id: 'null_witch', name: 'Null Witch', sprite: 'null_witch',
    kind: 'caster', baseStats: { hp: 20, attack: 13, defense: 4 },
    statMult: 1.5, passivePool: 'abyss',
    depthMin: 51, depthMax: 60, theme: 'abyss', element: 'dark',
  },
  {
    id: 'herald_abyss', name: 'Herald of the Abyss', sprite: 'herald_abyss',
    kind: 'caster', baseStats: { hp: 100, attack: 17, defense: 8 },
    statMult: 2.0, passivePool: 'abyss',
    depthMin: 51, depthMax: 60, theme: 'abyss', element: 'dark',
    bossOf: 'abyss', bossInterval: 60,
    signature: {
      name: 'Unmaking', cooldownMs: 12000, firstDelayMs: 5000,
      actions: [
        { type: 'applyStatus', statusId: 'stun', magnitude: 0, durationMs: 1500, target: 'hero' },
        { type: 'applyStatus', statusId: 'armorBreak', magnitude: -15, durationMs: 8000, target: 'hero' },
      ],
    },
  },
];

// ---- Spawn selection -----------------------------------------------------------

/** All templates active at a given depth, sorted by kind priority. */
export function templatesForDepth(depth: number): MonsterTemplate[] {
  const d = Math.max(1, Math.floor(depth));
  return TEMPLATES.filter((t) => t.depthMin <= d && (t.depthMax === undefined || d <= t.depthMax));
}

/** True if this depth is a boss floor for any template in range. */
export function isBossDepth(depth: number): boolean {
  const d = Math.max(1, Math.floor(depth));
  for (const t of TEMPLATES) {
    if (!t.bossInterval || !t.bossOf) continue;
    if (d >= t.depthMin && (t.depthMax === undefined || d <= t.depthMax)) {
      if (d % t.bossInterval === 0) return true;
    }
  }
  return false;
}

/** True if this depth is a mini-boss floor: every 5th depth that is NOT a boss
 *  floor (D6: forced elevated elite). */
export function isMiniBossDepth(depth: number): boolean {
  const d = Math.max(1, Math.floor(depth));
  return d % 5 === 0 && !isBossDepth(d);
}

/** Return the boss template for this depth, if one is scheduled. */
export function bossForDepth(depth: number): MonsterTemplate | undefined {
  const d = Math.max(1, Math.floor(depth));
  for (const t of TEMPLATES) {
    if (!t.bossInterval || !t.bossOf) continue;
    if (d >= t.depthMin && (t.depthMax === undefined || d <= t.depthMax)) {
      if (d % t.bossInterval === 0) return t;
    }
  }
  return undefined;
}

// ---- Theme affinities (D38) ----------------------------------------------------

/** Affinity table: theme → { resists: ElementTag[], vulnerable: ElementTag[], immune: ElementTag[] }.
 *  Normative in roster.md. */
export interface ThemeAffinity {
  resists: ElementTag[];
  vulnerable: ElementTag[];
  immune: ElementTag[];
}

export const THEME_AFFINITIES: Record<string, ThemeAffinity> = {
  goblin_camp:  { resists: [],                 vulnerable: ['fire'],       immune: [] },
  crypt:        { resists: ['dark'],           vulnerable: ['fire'],       immune: [] },
  warrens:      { resists: ['nature'],         vulnerable: ['ice'],        immune: [] },
  deep:         { resists: ['ice'],            vulnerable: ['lightning'],  immune: [] },
  volcanic:     { resists: [],                 vulnerable: ['ice'],        immune: ['fire'] },
  abyss:        { resists: ['dark','lightning'], vulnerable: ['physical'], immune: [] },
};

/** Look up the affinity for a template's theme (or undefined if none). */
export function affinityForTemplate(templateId: string): ThemeAffinity | undefined {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  return tpl?.theme ? THEME_AFFINITIES[tpl.theme] : undefined;
}

/** Compute the theme affinity multiplier for applying a status element to a
 *  template's target (D38): 1.0 neutral, 0.75 resist, 1.25 vulnerable, 0 immune.
 *  Returns 1 if either the template or element is unknown (no affinity). */
export function themeAffinityMult(templateId: string, element: ElementTag): number {
  const aff = affinityForTemplate(templateId);
  if (!aff) return 1;
  if (aff.immune.includes(element)) return 0;
  if (aff.vulnerable.includes(element)) return 1.25;
  if (aff.resists.includes(element)) return 0.75;
  return 1;
}

// ---- Spawn-table sanity --------------------------------------------------------

/** Verify every depth 1-60 has ≥2 non-boss templates active (roster.md rule). */
export function validateRosterGaps(): string[] {
  const errors: string[] = [];
  for (let d = 1; d <= 60; d++) {
    const active = templatesForDepth(d).filter((t) => !t.bossInterval);
    if (active.length < 2) {
      errors.push(`Depth ${d}: only ${active.length} non-boss template(s) active (need ≥2)`);
    }
  }
  return errors;
}
