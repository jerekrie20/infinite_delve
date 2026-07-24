// THE combat engine (bible §1.4: one engine, three consumers). Runs the whole
// fight simulation — per-entity attack timers on the 100ms clock, rotation,
// packs, statuses, hook dispatch — and emits render-agnostic CombatEvents.
// LaneScene RENDERS these events; shared/sim and (Phase 6) the server run the
// same loop headless. Every roll draws from the injected seeded Rng: same seed
// = bit-identical event log (Daily Delve, offline sim, replay verification).
// Never re-implement a combat rule outside this module.

import type { GearItem, Hero, MonsterRarity } from '../delve';
import { STATS, type DerivedId, type DerivedMap, type HookPoint, type StatId } from '../content/stats';
import { HANDLERS, type Combatant, type HandlerResult, type StatusRequest } from '../content/handlers';
import { ACTIVES, type ActiveDef, type AbilityStatus, type Targeting } from '../content/actives';
import { classDef } from '../content/classes';
import { TUNING } from '../content/tuning';
import { rollDrop } from '../content/items';
import { packForDepth, type PackMember } from '../waves';
import { createRng, type Rng } from '../rng';
import { StepAccumulator, AttackTimer, effectiveIntervalMs } from './clock';
import {
  applyStatus, tickStatuses, cleanseForNextFloor, cleanseAll,
  statusAtkPct, statusAttackSpeedPct, statusDefenseDelta, statusDamageTakenPct,
  statusHealingTakenPct, statusStatDelta, isStunned, hasUndying, shockBonusPct, consumeShock,
  addShield, absorbWithShield, shieldPool,
  STATUS_PRESETS,
  type ActiveStatus, type ApplierView, type ApplyContext, type ModQuantity, type StatusId,
} from './statuses';
import { chooseBeatAction, type RotationState } from './rotation';
import { themeAffinityMult, type BossSignature } from '../content/monsters';

// ---- Entities ---------------------------------------------------------------

export type Row = 'front' | 'back';

/** One fighting entity (hero or pack member). Satisfies handlers' Combatant. */
export interface EngineEntity extends Combatant {
  id: string;
  side: 'hero' | 'monster';
  name: string;
  row: Row;
  rarity: MonsterRarity | 'hero';
  sprite: string;
  templateId?: string;
  kind?: string;
  critChance: number;
  critMultiplier: number;
  baseIntervalMs: number;
  /** Gear/class attackSpeedPct (statuses add on top at read time). */
  attackSpeedPct: number;
  /** Sparse derived reads (DR, cleave, healOnKill, poisonDamage, gold/xp…). */
  derived: Partial<Record<DerivedId, number>>;
  behaviors: HookGroups;
  statuses: ActiveStatus[];
  timer: AttackTimer;
  /** Once-per-fight revive gate. */
  revived: boolean;
  stunHistory: number[];
  /** Reward carried by this monster (0 for the hero). */
  gold: number;
  xp: number;
  /** Boss signature cooldown + wind-up state (undefined for non-bosses). */
  bossSignature?: {
    def: BossSignature;
    cooldownMs: number;
    windingUp: boolean;
  };
}

export type HookGroups = Record<HookPoint, Array<{ stat: StatId; val: number }>>;

/** Collect all implemented behavioral stats from a sparse derived map, grouped
 *  by hook point (moved here from LaneScene/combat-sim — single copy now). */
export function behavioralStats(d: Partial<Record<string, number>>): HookGroups {
  const groups: HookGroups = {
    onCombatStart: [], onAttack: [], onCrit: [], onDealDamage: [],
    onTakeDamage: [], onLethal: [], onKill: [], perTick: [],
  };
  for (const id of Object.keys(STATS) as StatId[]) {
    const def = STATS[id];
    if (def.kind !== 'behavioral' || !def.hook || !def.handler || def.implemented === false) continue;
    const val = d[def.target] ?? 0;
    if (val > 0) groups[def.hook].push({ stat: id, val });
  }
  return groups;
}

/** Dispatch one hook point: PURE collect — handlers return results, nothing is
 *  applied here (the engine applies centrally; the old mutate-in-loop heal was
 *  the Phase 1 audit cleanup). */
function collectHook(
  hook: HookPoint,
  owner: EngineEntity,
  other: EngineEntity,
  dmg: number,
  rng: Rng,
): HandlerResult {
  const out: HandlerResult = {};
  for (const { stat, val } of owner.behaviors[hook]) {
    const fn = HANDLERS[STATS[stat].handler!];
    if (!fn) continue;
    const r = fn(dmg, val, owner, other, rng);
    if (r.heal) out.heal = (out.heal ?? 0) + r.heal;
    if (r.shield) out.shield = (out.shield ?? 0) + r.shield;
    if (r.reflect) out.reflect = (out.reflect ?? 0) + r.reflect;
    if (r.extraDmg) out.extraDmg = (out.extraDmg ?? 0) + r.extraDmg;
    if (r.bonusGold) out.bonusGold = (out.bonusGold ?? 0) + r.bonusGold;
    if (r.bonusXp) out.bonusXp = (out.bonusXp ?? 0) + r.bonusXp;
    if (r.dodged) out.dodged = true;
    if (r.blocked) out.blocked = true;
    if (r.counterDmg) out.counterDmg = (out.counterDmg ?? 0) + r.counterDmg;
    if (r.dead) out.dead = true;
    if (r.regen) out.regen = (out.regen ?? 0) + r.regen;
    if (r.applyStatus) out.applyStatus = [...(out.applyStatus ?? []), ...r.applyStatus];
  }
  return out;
}

// ---- Events -----------------------------------------------------------------

export interface PackMemberView {
  id: string;
  name: string;
  kind: string;
  row: Row;
  rarity: MonsterRarity;
  sprite: string;
  templateId: string;
  hp: number;
  maxHp: number;
  /** Boss signature name for telegraph display (undefined for non-bosses). */
  signatureName?: string;
  /** Passive stat names for elite/boss badge display (D34). */
  passiveNames?: string[];
}

export type EventType = 'shrine' | 'altar' | 'cache' | 'lore';

export type CombatEvent =
  | { type: 'floorStart'; depth: number; pack: PackMemberView[] }
  | { type: 'hit'; sourceId: string; targetId: string; dmg: number; crit: boolean; action: string; targetHp: number }
  | { type: 'dodge'; targetId: string; sourceId: string }
  | { type: 'block'; targetId: string; sourceId: string }
  | { type: 'cast'; abilityId: string }
  | { type: 'statusApplied'; targetId: string; statusId: StatusId; stacks: number }
  | { type: 'statusResisted'; targetId: string; statusId: StatusId }
  | { type: 'dotTick'; targetId: string; total: number }
  | { type: 'heal'; targetId: string; amount: number; reason: string }
  | { type: 'shieldChanged'; targetId: string; pool: number }
  | { type: 'revive'; targetId: string }
  | { type: 'kill'; targetId: string; gold: number }
  | { type: 'lootDrop'; item: GearItem }
  | { type: 'bossWindUp'; bossId: string; signatureName: string }
  | { type: 'eventEncounter'; eventType: EventType; depth: number; result?: string }
  | { type: 'floorCleared'; depth: number; nextDepth: number }
  | { type: 'runEnded'; outcome: 'died' | 'extracted'; depthCleared: number; runGold: number; haul: GearItem[] };

/** One recent hit for the HUD summary tab (replaces the exchange-based
 *  CombatTurn — there is no shared beat anymore). */
export interface RecentHit {
  depth: number;
  side: 'hero' | 'monster';
  action: string;
  dmg: number;
  crit: boolean;
}

// ---- Snapshot (what renderers read between events) --------------------------

export interface EngineSnapshot {
  phase: 'fighting' | 'choosing' | 'over';
  depth: number;
  runGold: number;
  haulCount: number;
  mana: number;
  maxMana: number;
  cooldowns: Record<string, number>;
  hero: {
    hp: number;
    maxHp: number;
    shield: number;
    statuses: ActiveStatus[];
  };
  monsters: Array<PackMemberView & { shield: number; statuses: ActiveStatus[] }>;
  recentHits: RecentHit[];
}

// ---- The engine -------------------------------------------------------------

export interface EngineOptions {
  hero: Hero;
  derived: DerivedMap;
  seed: number;
  rotationOrder: string[];
  startDepth?: number;
}

const RECENT_HITS_CAP = 10;

export class CombatEngine {
  private readonly rng: Rng;
  private hero: EngineEntity;
  private heroInfo: Hero;
  private heroDerived: DerivedMap;
  private monsters: EngineEntity[] = [];
  private depth: number;
  private runGold = 0;
  private runHaul: GearItem[] = [];
  private mana: number;
  private cooldowns: Record<string, number> = {};
  private rotation: RotationState;
  private phase: 'fighting' | 'choosing' | 'over' = 'fighting';
  private readonly accumulator = new StepAccumulator();
  private subTickMs = 0;
  private fightMs = 0;
  private events: CombatEvent[] = [];
  private recentHits: RecentHit[] = [];
  private monsterSeq = 0;

  constructor(opts: EngineOptions) {
    this.rng = createRng(opts.seed);
    this.heroInfo = opts.hero;
    this.heroDerived = opts.derived;
    this.depth = Math.max(1, Math.floor(opts.startDepth ?? 1));
    this.mana = opts.hero.maxMana;
    this.rotation = { order: [...opts.rotationOrder], queued: null };
    this.hero = this.buildHero();
    this.spawnPack();
  }

  // ---- construction --------------------------------------------------------

  private buildHero(): EngineEntity {
    const d = this.heroDerived;
    const baseIntervalMs = classDef(this.heroInfo.class).attackIntervalMs;
    return {
      id: 'hero',
      side: 'hero',
      name: this.heroInfo.class,
      row: 'front',
      rarity: 'hero',
      sprite: 'hero',
      hp: d.maxHp,
      maxHp: d.maxHp,
      attack: d.attack,
      defense: d.defensePct,
      critChance: d.critChance,
      critMultiplier: d.critMultiplier,
      baseIntervalMs,
      attackSpeedPct: d.attackSpeedPct,
      derived: d,
      behaviors: behavioralStats(d),
      statuses: [],
      timer: new AttackTimer(effectiveIntervalMs(baseIntervalMs, d.attackSpeedPct)),
      revived: false,
      stunHistory: [],
      gold: 0,
      xp: 0,
    };
  }

  private buildMonster(m: PackMember): EngineEntity {
    this.monsterSeq += 1;
    const entity: EngineEntity = {
      id: `m${this.monsterSeq}`,
      side: 'monster',
      name: m.name,
      row: m.row,
      rarity: m.rarity,
      sprite: m.sprite,
      templateId: m.templateId,
      kind: m.kind,
      hp: m.hp,
      maxHp: m.hp,
      attack: m.attack,
      defense: m.defense,
      critChance: TUNING.combat.critChance * 100,
      critMultiplier: TUNING.combat.critMultiplier,
      baseIntervalMs: m.intervalMs,
      attackSpeedPct: 0,
      derived: m.passives,
      behaviors: behavioralStats(m.passives),
      statuses: [],
      timer: new AttackTimer(m.intervalMs),
      revived: false,
      stunHistory: [],
      gold: m.gold,
      xp: m.xp,
    };
    // Boss signature initialization (D39): cooldown-driven, one-beat telegraph.
    if (m.signature && entity.rarity === 'boss') {
      entity.bossSignature = {
        def: m.signature,
        cooldownMs: m.signature.firstDelayMs,
        windingUp: false,
      };
    }
    return entity;
  }

  private packView(): PackMemberView[] {
    return this.monsters.map((m) => {
      const sig = m.bossSignature?.def.name;
      // Elite/boss passive names for badge display (D34).
      const passiveNames = (m.rarity === 'elite' || m.rarity === 'boss')
        ? Object.keys(m.derived).filter((k) => STATS[k as StatId]?.kind === 'behavioral')
        : undefined;
      return {
        id: m.id, name: m.name, kind: m.kind ?? 'grunt', row: m.row,
        rarity: m.rarity === 'hero' ? 'normal' : m.rarity,
        sprite: m.sprite, templateId: m.templateId ?? '',
        hp: m.hp, maxHp: m.maxHp,
        ...(sig ? { signatureName: sig } : {}),
        ...(passiveNames?.length ? { passiveNames } : {}),
      };
    });
  }

  /** Event floors fire ~1-in-8 on non-boss, non-mini-boss depths (D42). */
  private isEventDepth(d: number): boolean {
    // Boss floors (10,20,30…) and mini-boss floors (5,15,25…) never events.
    if (d % 10 === 0 || d % 5 === 0) return false;
    // Seeded roll: 12.5% = 1-in-8 ⚙
    return this.rng() < 0.125;
  }

  private spawnPack(): void {
    // Event floors (D42): skip the fight, resolve the encounter.
    if (this.isEventDepth(this.depth)) {
      this.resolveEvent();
      return;
    }
    const pack = packForDepth(this.depth, this.rng);
    this.monsters = pack.map((m) => this.buildMonster(m));
    this.fightMs = 0;
    this.subTickMs = 0;
    this.emit({ type: 'floorStart', depth: this.depth, pack: this.packView() });

    // onCombatStart: hero first (deterministic order), then monsters.
    const front = this.firstAlive('front') ?? this.monsters[0];
    if (front) {
      const heroStart = collectHook('onCombatStart', this.hero, front, 0, this.rng);
      if (heroStart.shield) this.grantShield(this.hero, heroStart.shield, 'startingShield');
      if (heroStart.extraDmg) this.applyDamage(front, heroStart.extraDmg, this.hero, 'preemptive');
    }
    for (const m of this.monsters) {
      if (m.hp <= 0) continue;
      const monStart = collectHook('onCombatStart', m, this.hero, 0, this.rng);
      if (monStart.shield) this.grantShield(m, monStart.shield, 'startingShield');
      if (monStart.extraDmg) this.applyDamage(this.hero, monStart.extraDmg, m, 'preemptive');
    }
    this.reapDead(this.hero);
  }

  // ---- public API ----------------------------------------------------------

  /** Advance real time; returns the events produced by the fixed steps run.
   *  ALWAYS drains buffered events, even outside 'fighting' — construction can
   *  buffer an event-floor resolution (phase lands on 'choosing' immediately),
   *  and an event-driven renderer would otherwise never see it (the Phase 2
   *  run-start hard lock: ~1-in-8 starts spun forever with no pack). */
  step(deltaMs: number): CombatEvent[] {
    if (this.phase !== 'fighting') return this.drain();
    const steps = this.accumulator.advance(deltaMs);
    for (let i = 0; i < steps && this.phase === 'fighting'; i++) this.stepOnce();
    return this.drain();
  }

  /** Manual tap: queue an ability for the next attack beat (D33). */
  castAbility(abilityId: string): void {
    if (this.phase !== 'fighting') return;
    const def = ACTIVES[abilityId];
    if (!def || def.basic) return;
    if ((this.cooldowns[abilityId] ?? 0) > 0) return;
    if (this.mana < def.manaCost) return;
    this.rotation.queued = abilityId;
  }

  /** Continue to the next depth after a cleared floor. */
  continueRun(): CombatEvent[] {
    if (this.phase !== 'choosing') return [];
    this.depth += 1;
    this.phase = 'fighting';
    this.spawnPack();
    return this.drain();
  }

  /** Bank and end the run (only between fights — D33 flee rule is the UI's
   *  concern; the engine allows it whenever a choice is pending or mid-fight
   *  for the always-available flee valve). */
  extract(): CombatEvent[] {
    if (this.phase === 'over') return [];
    const cleared = this.phase === 'choosing' ? this.depth : this.depth - 1;
    this.endRun('extracted', Math.max(0, cleared));
    return this.drain();
  }

  setRotationOrder(order: string[]): void {
    this.rotation.order = [...order];
  }

  /** Gear/level changed mid-run: rebuild the hero from fresh derives, keeping
   *  current hp (clamped) and statuses/timer state. */
  applyHeroUpdate(hero: Hero, derived: DerivedMap): void {
    this.heroInfo = hero;
    this.heroDerived = derived;
    const keepHp = Math.min(this.hero.hp, derived.maxHp);
    const keepStatuses = this.hero.statuses;
    const keepTimer = this.hero.timer;
    const keepRevived = this.hero.revived;
    this.hero = this.buildHero();
    this.hero.hp = keepHp;
    this.hero.statuses = keepStatuses;
    this.hero.timer = keepTimer;
    this.hero.revived = keepRevived;
    this.mana = Math.min(this.mana, hero.maxMana);
  }

  snapshot(): EngineSnapshot {
    return {
      phase: this.phase,
      depth: this.depth,
      runGold: this.runGold,
      haulCount: this.runHaul.length,
      mana: this.mana,
      maxMana: this.heroInfo.maxMana,
      cooldowns: { ...this.cooldowns },
      hero: {
        hp: this.hero.hp,
        maxHp: this.hero.maxHp,
        shield: shieldPool(this.hero.statuses),
        statuses: this.hero.statuses,
      },
      monsters: this.monsters.map((m) => ({
        ...this.packView().find((v) => v.id === m.id)!,
        shield: shieldPool(m.statuses),
        statuses: m.statuses,
      })),
      recentHits: [...this.recentHits],
    };
  }

  // ---- fixed step ----------------------------------------------------------

  private stepOnce(): void {
    const stepMs = TUNING.combat.tickMs;
    this.fightMs += stepMs;

    // 1s sub-tick: statuses, regen, mana, cooldowns.
    this.subTickMs += stepMs;
    if (this.subTickMs >= TUNING.statuses.tickMs) {
      this.subTickMs -= TUNING.statuses.tickMs;
      this.oneSecondTick();
      if (this.phase !== 'fighting') return;
    }

    // Attack timers: hero first, then monsters in slot order (fixed ordering
    // is part of determinism). Stunned entities don't advance.
    if (!isStunned(this.hero.statuses) && this.hero.hp > 0) {
      if (this.hero.timer.advance(stepMs)) {
        this.hero.timer.rearm(this.entityIntervalMs(this.hero));
        this.heroBeat();
        if (this.phase !== 'fighting') return;
      }
    }
    for (const m of this.monsters) {
      if (m.hp <= 0 || isStunned(m.statuses)) continue;
      if (m.timer.advance(stepMs)) {
        m.timer.rearm(this.entityIntervalMs(m));
        // Boss signature wind-up: the one-beat telegraph completes → fire
        // the signature actions instead of a normal swing.
        if (m.bossSignature?.windingUp) {
          this.fireBossSignature(m);
        } else if (m.kind === 'support') {
          // Support monsters (D40): heal or buff a random pack member.
          this.supportAction(m);
        } else {
          this.resolveHit(m, this.hero, { mult: 1, action: 'attack' });
        }
        if (this.phase !== 'fighting') return;
      }
    }
  }

  private entityIntervalMs(e: EngineEntity): number {
    return effectiveIntervalMs(e.baseIntervalMs, e.attackSpeedPct + statusAttackSpeedPct(e.statuses));
  }

  private oneSecondTick(): void {
    // Hero: statuses → DoT/regen/expiry, then perTick hooks + mana + cooldowns.
    const heroTick = tickStatuses(this.hero.statuses);
    const heroDot = heroTick.dots.reduce((s, d) => s + d.damage, 0);
    if (heroDot > 0) {
      const through = absorbWithShield(this.hero.statuses, heroDot);
      this.emit({ type: 'dotTick', targetId: 'hero', total: heroDot });
      this.applyRawDamage(this.hero, through);
      if (this.reapDead(this.hero)) return;
    }
    if (heroTick.heal > 0) this.heal(this.hero, heroTick.heal, 'regen');

    const front = this.firstAlive('front') ?? this.firstAlive('back');
    if (front) {
      const tick = collectHook('perTick', this.hero, front, 0, this.rng);
      if (tick.regen && this.hero.hp > 0 && this.hero.hp < this.hero.maxHp) {
        this.heal(this.hero, tick.regen, 'hpRegen');
      }
    }
    if (this.mana < this.heroInfo.maxMana) {
      // Base 4%/s × (1 + gear/passive manaRegenPct) — stats-catalog formula.
      const regenMult = 1 + (this.heroDerived.manaRegenPct ?? 0) / 100;
      const manaRegen = Math.round(this.heroInfo.maxMana * TUNING.hero.manaRegenPct * regenMult);
      this.mana = Math.min(this.heroInfo.maxMana, this.mana + (manaRegen || 1));
    }
    for (const id of Object.keys(this.cooldowns)) {
      const v = this.cooldowns[id];
      if (v !== undefined && v > 0) this.cooldowns[id] = Math.max(0, v - TUNING.statuses.tickMs);
    }

    // Monsters, in slot order.
    for (const m of this.monsters) {
      if (m.hp <= 0) continue;
      const monTick = tickStatuses(m.statuses);
      const monDot = monTick.dots.reduce((s, d) => s + d.damage, 0);
      if (monDot > 0) {
        const through = absorbWithShield(m.statuses, monDot);
        this.emit({ type: 'dotTick', targetId: m.id, total: monDot });
        this.applyRawDamage(m, through);
        if (this.reapDead(m)) continue;
      }
      if (monTick.heal > 0) this.heal(m, monTick.heal, 'regen');
      const tick = collectHook('perTick', m, this.hero, 0, this.rng);
      if (tick.regen && m.hp > 0 && m.hp < m.maxHp) this.heal(m, tick.regen, 'hpRegen');

      // Boss signature cooldown (D39): ticks down each second; when it hits
      // zero, the wind-up begins — one attack beat of telegraph before the
      // signature fires.
      if (m.bossSignature && !m.bossSignature.windingUp) {
        m.bossSignature.cooldownMs -= TUNING.statuses.tickMs;
        if (m.bossSignature.cooldownMs <= 0) {
          m.bossSignature.windingUp = true;
          this.emit({ type: 'bossWindUp', bossId: m.id, signatureName: m.bossSignature.def.name });
        }
      }
    }
  }

  // ---- the hero's attack beat ---------------------------------------------

  private heroBeat(): void {
    const action = chooseBeatAction(this.rotation, this.mana, this.cooldowns);
    if (action.kind === 'basic') {
      const basicId = this.heroInfo.abilities.find((id) => ACTIVES[id]?.basic);
      const def = basicId ? ACTIVES[basicId] : undefined;
      if (!def) {
        // No basic def (shouldn't happen) — a plain 100% swing at the front.
        const target = this.pickTargets('front')[0];
        if (target) this.resolveHit(this.hero, target, { mult: 1, action: 'attack' });
        return;
      }
      this.resolveAbilityEffects(def, false);
      return;
    }

    const def = ACTIVES[action.abilityId]!;
    this.mana -= def.manaCost;
    this.cooldowns[action.abilityId] = this.effectiveCooldownMs(def);
    this.emit({ type: 'cast', abilityId: action.abilityId });
    this.resolveAbilityEffects(def, true);
  }

  /** Effective cooldown after the hero's cooldownReductionPct (caster stat). */
  private effectiveCooldownMs(def: ActiveDef): number {
    const cdr = Math.min(100, this.heroDerived.cooldownReductionPct ?? 0);
    return Math.round(def.cooldownMs * (1 - cdr / 100));
  }

  /** Resolve a hero ability/basic's effects: self-shield, then the damage
   *  component (hits × targeting, armor-pen + forced-crit + AP scaling), then
   *  its status riders. Shared by the basic-attack and rotation paths so every
   *  ability rides ONE code path (bible §1.4). `isAbility` = a mana ability
   *  (AP scales its damage); a basic attack does not scale with AP. */
  private resolveAbilityEffects(def: ActiveDef, isAbility: boolean): void {
    // Self Shield = % of maxHp (Shield Wall / Mana Shield / Aegis Oath).
    if (def.shieldPctMaxHp) {
      this.grantShield(this.hero, Math.round(this.hero.maxHp * def.shieldPctMaxHp / 100), def.id);
    }

    // Damage component: `hits` repeats over the targeting selection.
    if (def.damageMult !== undefined) {
      const hits = Math.max(1, def.hits ?? 1);
      const apMult = isAbility ? 1 + (this.heroDerived.abilityPowerPct ?? 0) / 100 : 1;
      for (let h = 0; h < hits; h++) {
        for (const target of this.pickTargets(def.targeting ?? 'front')) {
          if (target.hp <= 0) continue;
          this.resolveHit(this.hero, target, {
            mult: def.damageMult, action: def.name,
            ...(def.defIgnorePct ? { defIgnorePct: def.defIgnorePct } : {}),
            ...(def.guaranteedCrit ? { forceCrit: true } : {}),
            ...(apMult !== 1 ? { apMult } : {}),
          });
          if (this.phase !== 'fighting') return;
        }
      }
    }

    // Status riders — target-side lands on the current front selection.
    this.applyAbilityStatuses(def, this.pickTargets(def.targeting ?? 'front'));
  }

  /** Apply an ability's status riders: `chance` gates a proc (Fire Bolt's 15%
   *  Burn), `potencyMult` scales a DoT off the caster's attack, `magnitude`
   *  overrides outright. Self statuses ignore `targets`. */
  private applyAbilityStatuses(def: ActiveDef, targets: EngineEntity[]): void {
    for (const st of def.statuses ?? []) {
      if (st.chance !== undefined && this.rng() >= st.chance) continue;
      const magnitude = this.abilityStatusMagnitude(st);
      if (st.side === 'self') {
        this.applyStatusTo(this.hero, this.hero, {
          id: st.id, magnitude, durationMs: st.durationMs,
        }, def.id, true, 0, st.modTarget ? { modTarget: st.modTarget } : undefined);
      } else {
        for (const target of targets) {
          if (target.hp <= 0) continue;
          this.applyStatusTo(this.hero, target, {
            id: st.id, magnitude, durationMs: st.durationMs,
          }, def.id, false, 0, st.modTarget ? { modTarget: st.modTarget } : undefined);
        }
      }
    }
  }

  /** The magnitude an ability status applies: explicit override wins; else a
   *  potencyMult scales the preset's default (computed off the caster); else
   *  undefined (the preset decides). */
  private abilityStatusMagnitude(st: AbilityStatus): number | undefined {
    if (st.magnitude !== undefined) return st.magnitude;
    if (st.potencyMult !== undefined) {
      const preset = STATUS_PRESETS[st.id];
      const base = preset.defaultMagnitude?.({ attack: this.hero.attack, derived: this.hero.derived }, 0) ?? 0;
      return Math.round(base * st.potencyMult);
    }
    return undefined;
  }

  // ---- boss signatures (D39) -----------------------------------------------

  /** Fire a boss's signature move — the wind-up has completed (one beat of
   *  telegraph), now the big effect lands. Uses the existing damage + status
   *  pipelines so every effect is one of two actions: buffedHit or applyStatus. */
  private fireBossSignature(boss: EngineEntity): void {
    const bs = boss.bossSignature;
    if (!bs) return;
    bs.windingUp = false;
    bs.cooldownMs = bs.def.cooldownMs;

    for (const action of bs.def.actions) {
      switch (action.type) {
        case 'buffedHit': {
          const mult = action.damageMult ?? 1.5;
          this.resolveHit(boss, this.hero, { mult, action: bs.def.name });
          if (this.phase !== 'fighting') return;
          break;
        }
        case 'applyStatus': {
          const statusId = action.statusId;
          if (!statusId) continue;
          const target = action.target === 'self' ? boss : this.hero;
          this.applyStatusTo(boss, target, {
            id: statusId,
            magnitude: action.magnitude,
            durationMs: action.durationMs,
          }, bs.def.name, action.target === 'self', 0);
          break;
        }
      }
    }
  }

  // ---- event floors (D42) ---------------------------------------------------

  /** Resolve an event encounter: shrine (run buff), altar (HP→chest), cache
   *  (choice of 2 items), or lore (flavor + gold). Auto-resolve picks the
   *  deterministic best outcome so the sim and replay stay seeded. */
  private resolveEvent(): void {
    const types: EventType[] = ['shrine', 'altar', 'cache', 'lore'];
    const evt = types[Math.floor(this.rng() * types.length)]!;

    let result = '';
    switch (evt) {
      case 'shrine': {
        // Run-long boon: +8% ATK (rage-lite, permanent). Auto-resolve = always take.
        this.applyStatusTo(this.hero, this.hero, {
          id: 'rage', magnitude: 8, durationMs: 999_999_999,
        }, 'shrine', true, 0);
        result = '+8% ATK for the run';
        break;
      }
      case 'altar': {
        // Gamble altar: pay 15% HP → high-rarity drop. Auto-resolve = risk it.
        const hpCost = Math.round(this.hero.maxHp * 0.15);
        this.applyRawDamage(this.hero, hpCost);
        const drop = rollDrop(this.depth, false, this.rng);
        if (drop) {
          this.runHaul.push(drop);
          this.emit({ type: 'lootDrop', item: drop });
        }
        result = `paid ${hpCost} HP${drop ? ', got ' + drop.r + ' item' : ''}`;
        break;
      }
      case 'cache': {
        // Treasure cache: one free item. Auto-resolve = take best gearScore.
        const drop = rollDrop(this.depth, false, this.rng);
        if (drop) {
          this.runHaul.push(drop);
          this.emit({ type: 'lootDrop', item: drop });
        }
        result = drop ? `found ${drop.r} ${drop.base}` : 'empty';
        break;
      }
      case 'lore': {
        // Lore encounter: small gold reward + worldbuilding flavor.
        const gold = Math.round((TUNING.monster.baseGold + TUNING.monster.goldPerDepth * this.depth) * 2);
        this.runGold += gold;
        result = `+${gold}◆`;
        break;
      }
    }

    this.emit({ type: 'eventEncounter', eventType: evt, depth: this.depth, result });
    // Event floor cleared — same as a normal floor clear.
    cleanseForNextFloor(this.hero.statuses);
    this.hero.revived = false;
    this.phase = 'choosing';
    this.emit({ type: 'floorCleared', depth: this.depth, nextDepth: this.depth + 1 });
  }

  // ---- support monster AI (D40) --------------------------------------------

  /** Support monster action: heal a random alive pack member (not self) for
   *  15% of the support's attack value ⚙. Backline supports create kill-order
   *  decisions — clear them first or they sustain the pack. */
  private supportAction(support: EngineEntity): void {
    const allies = this.monsters.filter((m) => m.hp > 0 && m.id !== support.id);
    if (allies.length === 0) {
      // No allies — swing weakly at the hero instead.
      this.resolveHit(support, this.hero, { mult: 0.5, action: 'support' });
      return;
    }
    const target = allies[Math.floor(this.rng() * allies.length)]!;
    const healAmount = Math.max(1, Math.round(support.attack * 0.15));
    if (target.hp < target.maxHp) {
      this.heal(target, healAmount, 'support');
    }
    // Also apply a small buff: Rage (+10% ATK, 3s) — makes supports dangerous.
    this.applyStatusTo(support, target, {
      id: 'rage', magnitude: 10, durationMs: 3000,
    }, 'support', false, 0);
  }

  // ---- targeting -----------------------------------------------------------

  private alive(): EngineEntity[] {
    return this.monsters.filter((m) => m.hp > 0);
  }

  private firstAlive(row: Row): EngineEntity | undefined {
    return this.monsters.find((m) => m.hp > 0 && m.row === row);
  }

  /** Resolve a targeting type into concrete targets (D32 — never tap-target).
   *  front/back fall back to the other row when theirs is empty. */
  private pickTargets(targeting: Targeting): EngineEntity[] {
    const alive = this.alive();
    if (alive.length === 0) return [];
    switch (targeting) {
      case 'all':
        return alive;
      case 'back': {
        const back = this.firstAlive('back');
        return [back ?? this.firstAlive('front')!];
      }
      case 'random':
        return [alive[Math.floor(this.rng() * alive.length)]!];
      case 'front':
      default: {
        const front = this.firstAlive('front');
        return [front ?? this.firstAlive('back')!];
      }
    }
  }

  // ---- the damage pipeline -------------------------------------------------

  /** One hit from attacker onto defender: hooks → damage math → statuses.
   *  This is the ONE code path for basics, abilities, and monster swings. */
  private resolveHit(
    attacker: EngineEntity,
    defender: EngineEntity,
    opts: {
      mult: number;
      action: string;
      isRepeat?: boolean;
      /** % of the defender's defense this hit ignores (armor pen). */
      defIgnorePct?: number;
      /** Force a critical strike (Deadeye) — skips the crit roll. */
      forceCrit?: boolean;
      /** Ability-power multiplier on base damage (1 = none; caster abilities). */
      apMult?: number;
    },
  ): void {
    // onAttack: execute, pierce, double-strike signal, poison applier.
    const onAtk = collectHook('onAttack', attacker, defender, 0, this.rng);
    if (onAtk.dead) {
      this.recordHit(attacker.side, 'execute', 0, false);
      defender.hp = 0;
      this.emit({ type: 'hit', sourceId: attacker.id, targetId: defender.id, dmg: defender.maxHp, crit: false, action: 'execute', targetHp: 0 });
      this.reapDead(defender);
      return;
    }
    const pierceDmg = onAtk.extraDmg !== undefined && onAtk.extraDmg > 0 ? onAtk.extraDmg : 0;
    const doubleSignal = onAtk.extraDmg === -1;

    // Base damage: buffed attack × ability mult × ability-power + pierce, vs
    // live defense (armor-pen reduces the defender's effective defense).
    const atkPctMod = 1 + statusAtkPct(attacker.statuses) / 100;
    const apMult = opts.apMult ?? 1;
    const baseAtk = Math.round(attacker.attack * atkPctMod * apMult * opts.mult) + pierceDmg;
    let defense = Math.max(0, defender.defense + statusDefenseDelta(defender.statuses));
    if (opts.defIgnorePct) defense *= 1 - Math.min(100, opts.defIgnorePct) / 100;
    let dmg = baseAtk * (1 - defense / 100);
    const v = TUNING.combat.damageVariance;
    dmg *= 1 - v + this.rng() * (2 * v);
    const crit = opts.forceCrit === true || this.rng() < attacker.critChance / 100;
    if (crit) dmg *= attacker.critMultiplier;

    // Shock payoff: the next hit taken deals more, then the stacks are spent.
    const shock = shockBonusPct(defender.statuses);
    if (shock > 0) {
      dmg *= 1 + shock / 100;
      consumeShock(defender.statuses);
    }
    // Fortify/Mark: ±% damage taken, read at the point of use.
    dmg *= 1 + statusDamageTakenPct(defender.statuses) / 100;
    let finalDmg = Math.max(1, Math.round(dmg));

    // Status-granted dodge (Tumble's temporary +dodge, etc.) — an independent
    // avoidance roll on top of the innate dodge handler. Only draws rng when a
    // dodge-buff is actually live, so it never perturbs the base draw order.
    const statusDodge = statusStatDelta(defender.statuses, 'dodgeChance');
    if (statusDodge > 0 && this.rng() < statusDodge / 100) {
      this.emit({ type: 'dodge', targetId: defender.id, sourceId: attacker.id });
      this.recordHit(attacker.side, 'dodged', 0, false);
      return;
    }

    // Defender reaction: dodge (+counter) or block negate.
    const onDef = collectHook('onTakeDamage', defender, attacker, finalDmg, this.rng);
    if (onDef.dodged) {
      this.emit({ type: 'dodge', targetId: defender.id, sourceId: attacker.id });
      this.recordHit(attacker.side, 'dodged', 0, false);
      if (onDef.counterDmg) this.applyDamage(attacker, onDef.counterDmg, defender, 'counter');
      return;
    }
    if (onDef.blocked) {
      this.emit({ type: 'block', targetId: defender.id, sourceId: attacker.id });
      this.recordHit(attacker.side, 'blocked', 0, false);
      return;
    }

    // Flat damage reduction layer, then the shield pool, then HP.
    const dr = defender.derived.damageReductionPct ?? 0;
    if (dr > 0) finalDmg = Math.max(1, Math.round(finalDmg * (1 - dr / 100)));
    const beforeShield = finalDmg;
    const through = absorbWithShield(defender.statuses, finalDmg);
    if (through < beforeShield) {
      this.emit({ type: 'shieldChanged', targetId: defender.id, pool: shieldPool(defender.statuses) });
    }
    this.applyRawDamage(defender, through);
    this.emit({
      type: 'hit', sourceId: attacker.id, targetId: defender.id,
      dmg: finalDmg, crit, action: opts.action, targetHp: Math.max(0, defender.hp),
    });
    this.recordHit(attacker.side, opts.action, finalDmg, crit);

    // Thorns reflect (after the hit lands).
    if (onDef.reflect && attacker.hp > 0) {
      this.applyDamage(attacker, onDef.reflect, defender, 'thorns');
    }

    // Attacker payoffs — damage dealt counts shield-absorbed points too.
    const onDeal = collectHook('onDealDamage', attacker, defender, finalDmg, this.rng);
    if (onDeal.heal) this.heal(attacker, onDeal.heal, 'lifesteal');
    if (onDeal.shield) this.grantShield(attacker, onDeal.shield, 'shieldLeech');
    for (const req of onDeal.applyStatus ?? []) {
      this.applyStatusTo(attacker, defender, { ...req, hitDmg: finalDmg }, 'onDealDamage', false, finalDmg);
    }
    if (crit) {
      const onCrit = collectHook('onCrit', attacker, defender, finalDmg, this.rng);
      if (onCrit.heal) this.heal(attacker, onCrit.heal, 'critHeal');
      for (const req of onCrit.applyStatus ?? []) {
        this.applyStatusTo(attacker, defender, { ...req, hitDmg: finalDmg }, 'onCrit', false, finalDmg);
      }
    }
    for (const req of onAtk.applyStatus ?? []) {
      this.applyStatusTo(attacker, defender, { ...req, hitDmg: finalDmg }, 'onAttack', false, finalDmg);
    }

    // Cleave: X% of the hit also strikes the next enemy in the same row (true
    // adjacent-hit, D32). Splash skips dodge/block but respects shield.
    const clv = attacker.derived.cleavePct ?? 0;
    if (clv > 0 && defender.side === 'monster') {
      const adjacent = this.monsters.find((m) => m.hp > 0 && m.row === defender.row && m.id !== defender.id);
      if (adjacent) {
        const splash = Math.max(1, Math.round(finalDmg * clv / 100));
        this.applyDamage(adjacent, splash, attacker, 'cleave');
      }
    }

    // Death settles after all riders.
    if (defender.hp <= 0) {
      this.reapDead(defender);
      return;
    }

    // Double strike: one extra swing, never chains.
    if (doubleSignal && !opts.isRepeat && defender.hp > 0 && attacker.hp > 0) {
      this.resolveHit(attacker, defender, { ...opts, isRepeat: true, action: `${opts.action}×2` });
    }
  }

  /** Direct damage that skips the attack pipeline (thorns, counter, explode,
   *  cleave splash, preemptive) — goes through the shield, then HP, then the
   *  lethal check. */
  private applyDamage(target: EngineEntity, amount: number, source: EngineEntity, action: string): void {
    if (amount <= 0 || target.hp <= 0) return;
    const through = absorbWithShield(target.statuses, amount);
    this.applyRawDamage(target, through);
    this.emit({
      type: 'hit', sourceId: source.id, targetId: target.id,
      dmg: amount, crit: false, action, targetHp: Math.max(0, target.hp),
    });
    this.reapDead(target);
  }

  /** HP subtraction with the Undying floor. Lethal resolution (revive/death)
   *  happens in reapDead — callers invoke it once riders have settled. */
  private applyRawDamage(target: EngineEntity, amount: number): void {
    if (amount <= 0) return;
    target.hp -= amount;
    if (target.hp <= 0 && hasUndying(target.statuses)) target.hp = 1;
  }

  /** Settle a possibly-dead entity: onLethal revive probe (once per fight,
   *  ONLY revive handlers fire — the old bug re-rolled dodge/block here), then
   *  death/kill flow. Returns true if the entity died. */
  private reapDead(entity: EngineEntity): boolean {
    if (entity.hp > 0) return false;

    const opposing = entity.side === 'hero'
      ? (this.firstAlive('front') ?? this.firstAlive('back') ?? entity)
      : this.hero;
    if (!entity.revived) {
      const onLethal = collectHook('onLethal', entity, opposing, 1, this.rng);
      if (onLethal.heal) {
        entity.revived = true;
        entity.hp = Math.min(entity.maxHp, Math.max(1, onLethal.heal));
        this.emit({ type: 'revive', targetId: entity.id });
        return false;
      }
    }

    if (entity.side === 'hero') {
      this.endRun('died', Math.max(0, this.depth - 1));
      return true;
    }

    // Monster death. onKill both sides: the dying one (explode) first.
    const monKill = collectHook('onKill', entity, this.hero, entity.maxHp, this.rng);
    if (monKill.extraDmg && this.hero.hp > 0) {
      this.applyDamage(this.hero, monKill.extraDmg, entity, 'explode');
      if (this.phase !== 'fighting') return true;
    }
    const heroKill = collectHook('onKill', this.hero, entity, entity.maxHp, this.rng);
    if (heroKill.heal) this.heal(this.hero, heroKill.heal, 'healOnKill');
    const goldMult = 1 + (heroKill.bonusGold ?? 0) / 100;
    const gold = Math.round(entity.gold * goldMult);
    this.runGold += gold;
    this.emit({ type: 'kill', targetId: entity.id, gold });

    // Loot roll — unbanked haul the EXTRACT decision protects.
    const drop = rollDrop(this.depth, entity.kind === 'swarm', this.rng);
    if (drop) {
      this.runHaul.push(drop);
      this.emit({ type: 'lootDrop', item: drop });
    }

    if (this.alive().length === 0) {
      cleanseForNextFloor(this.hero.statuses);
      this.hero.revived = false; // revive gate is per FIGHT
      this.phase = 'choosing';
      this.emit({ type: 'floorCleared', depth: this.depth, nextDepth: this.depth + 1 });
    }
    return true;
  }

  // ---- helpers -------------------------------------------------------------

  private heal(target: EngineEntity, amount: number, reason: string): void {
    if (amount <= 0 || target.hp <= 0 || target.hp >= target.maxHp) return;
    const mult = 1 + statusHealingTakenPct(target.statuses) / 100;
    const healed = Math.max(0, Math.round(amount * mult));
    if (healed <= 0) return;
    target.hp = Math.min(target.maxHp, target.hp + healed);
    this.emit({ type: 'heal', targetId: target.id, amount: healed, reason });
  }

  private grantShield(target: EngineEntity, amount: number, source: string): void {
    addShield(target.statuses, amount, target.maxHp, source);
    this.emit({ type: 'shieldChanged', targetId: target.id, pool: shieldPool(target.statuses) });
  }

  private applyStatusTo(
    applier: EngineEntity,
    target: EngineEntity,
    req: StatusRequest & { hitDmg?: number },
    source: string,
    selfApplied: boolean,
    hitDmg: number,
    extra?: { modTarget?: ModQuantity },
  ): void {
    const applierView: ApplierView = { attack: applier.attack, derived: applier.derived };
    // Theme affinity (D38): compute multiplier from target's template theme
    // and the status's element tag.
    const statusElement = STATUS_PRESETS[req.id]?.element;
    const themeMult = !selfApplied && statusElement && target.templateId
      ? themeAffinityMult(target.templateId, statusElement)
      : 1;
    const ctx: ApplyContext = {
      targetStatusResist: target.derived.statusResist ?? 0,
      targetMaxHp: target.maxHp,
      selfApplied,
      isBoss: target.rarity === 'boss',
      fightMs: this.fightMs,
      stunHistory: target.stunHistory,
      rng: this.rng,
      ...(themeMult !== 1 ? { themeAffinityMult: themeMult } : {}),
    };
    const outcome = applyStatus(target.statuses, {
      id: req.id, source, magnitude: req.magnitude, durationMs: req.durationMs,
      hitDmg: req.hitDmg ?? hitDmg, modTarget: extra?.modTarget,
    }, applierView, ctx);
    if (outcome === 'applied') {
      const inst = target.statuses.find((s) => s.id === req.id);
      this.emit({ type: 'statusApplied', targetId: target.id, statusId: req.id, stacks: inst?.stacks ?? 1 });
    } else if (outcome === 'resisted') {
      this.emit({ type: 'statusResisted', targetId: target.id, statusId: req.id });
    }
  }

  private endRun(outcome: 'died' | 'extracted', depthCleared: number): void {
    this.phase = 'over';
    cleanseAll(this.hero.statuses);
    this.emit({
      type: 'runEnded', outcome, depthCleared,
      runGold: this.runGold, haul: [...this.runHaul],
    });
  }

  private recordHit(side: 'hero' | 'monster', action: string, dmg: number, crit: boolean): void {
    this.recentHits.push({ depth: this.depth, side, action, dmg, crit });
    if (this.recentHits.length > RECENT_HITS_CAP) this.recentHits.shift();
  }

  private emit(e: CombatEvent): void {
    this.events.push(e);
  }

  private drain(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
