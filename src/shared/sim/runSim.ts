// Headless RUN SIMULATOR — Sim CLI v2's core (TOOLING #2) and the seed of the
// Phase 6 server expedition sim. Drives THE shared CombatEngine (never a
// re-implementation) with a policy: rotation plays the fight, floors auto-
// continue until death, an extract-at depth, or the stalemate cap. Pure and
// seeded — same seed + same policy = identical summary; the determinism tests
// and the balance sandbox both ride on that.

import type { Hero } from '../delve';
import { deriveStats, type DerivedStats } from '../content/gear';
import { unlockedAbilities } from '../content/actives';
import { classDef } from '../content/classes';
import { normalizeRotationOrder } from '../combat/rotation';
import { TUNING } from '../content/tuning';
import { CombatEngine, type CombatEvent } from '../combat/engine';
import type { GearItem, GearSlot } from '../delve';

export interface SimOptions {
  seed: number;
  /** Hero level (derives stats via the same deriveStats the game uses). */
  level?: number;
  /** Equipped gear (empty = naked class baseline). */
  equipped?: Partial<Record<GearSlot, GearItem>>;
  /** Priority order for slots 2-5; default = unlock order. */
  rotationOrder?: string[];
  /** Extract after clearing this depth (undefined = push until death). */
  extractAt?: number;
  /** Hard ceiling on simulated fight time — a stalemate (regen ≥ incoming)
   *  extracts instead of looping forever. */
  maxSimMs?: number;
}

export interface FloorResult {
  depth: number;
  /** Time to clear the floor, ms of simulated combat time. */
  ttkMs: number;
  /** Damage the hero took on this floor. */
  heroDamageTaken: number;
  packSize: number;
}

export interface RunSummary {
  outcome: 'died' | 'extracted';
  depthCleared: number;
  runGold: number;
  haulCount: number;
  totalSimMs: number;
  floors: FloorResult[];
  /** Full event count (cheap fidelity check between identical seeds). */
  eventCount: number;
  /** The exact event log — the determinism tests compare these bit-for-bit. */
  events: CombatEvent[];
}

const DEFAULT_MAX_SIM_MS = 60 * 60 * 1000; // one simulated hour — generous wall

/** Build the minimal Hero the engine needs from class + level + gear. */
export function simHero(level: number, equipped: Partial<Record<GearSlot, GearItem>>): {
  hero: Hero;
  derived: DerivedStats;
} {
  const derived = deriveStats('squire', level, equipped);
  const maxMana = TUNING.hero.baseMana + TUNING.hero.manaPerLevel * (level - 1);
  const cls = classDef('squire');
  const hero: Hero = {
    class: cls.id, level, xp: 0, xpToNext: 0,
    hp: derived.maxHp, maxHp: derived.maxHp,
    attack: derived.attack, defense: derived.defensePct,
    critChance: derived.critChance, critMultiplier: derived.critMultiplier,
    lifesteal: derived.lifestealPct, dodge: derived.dodgeChance,
    hpRegen: derived.hpRegen, goldFind: derived.goldFindPct,
    mana: maxMana, maxMana,
    abilities: unlockedAbilities(cls.id, level),
    gold: 0, bestDepth: 1, stash: [], equipped,
  };
  return { hero, derived };
}

/** Run one seeded, policy-driven run to completion. */
export function runSim(opts: SimOptions): RunSummary {
  const level = Math.max(1, Math.floor(opts.level ?? 1));
  const { hero, derived } = simHero(level, opts.equipped ?? {});
  const rotationOrder = normalizeRotationOrder(opts.rotationOrder ?? [], hero.abilities);
  const engine = new CombatEngine({ hero, derived, seed: opts.seed, rotationOrder });

  const maxSimMs = opts.maxSimMs ?? DEFAULT_MAX_SIM_MS;
  const stepMs = 1000;
  const events: CombatEvent[] = [];
  const floors: FloorResult[] = [];

  let simMs = 0;
  let floorStartMs = 0;
  let floorDamageTaken = 0;
  let packSize = 0;
  let outcome: 'died' | 'extracted' = 'extracted';
  let depthCleared = 0;
  let runGold = 0;
  let haulCount = 0;
  let done = false;

  const consume = (batch: CombatEvent[]): void => {
    for (const e of batch) {
      events.push(e);
      switch (e.type) {
        case 'floorStart':
          floorStartMs = simMs;
          floorDamageTaken = 0;
          packSize = e.pack.length;
          break;
        case 'hit':
          if (e.targetId === 'hero') floorDamageTaken += e.dmg;
          break;
        case 'dotTick':
          if (e.targetId === 'hero') floorDamageTaken += e.total;
          break;
        case 'floorCleared':
          floors.push({
            depth: e.depth,
            ttkMs: simMs - floorStartMs,
            heroDamageTaken: floorDamageTaken,
            packSize,
          });
          break;
        case 'runEnded':
          outcome = e.outcome;
          depthCleared = e.depthCleared;
          runGold = e.runGold;
          haulCount = e.haul.length;
          done = true;
          break;
        default:
          break;
      }
    }
  };

  consume(engine.step(0)); // drain the opening floorStart

  while (!done) {
    const snap = engine.snapshot();
    if (snap.phase === 'choosing') {
      const clearedSoFar = snap.depth;
      if (opts.extractAt !== undefined && clearedSoFar >= opts.extractAt) {
        consume(engine.extract());
      } else {
        consume(engine.continueRun());
      }
      continue;
    }
    if (simMs >= maxSimMs) {
      // Stalemate wall: the fight can't finish — bank what's cleared.
      consume(engine.extract());
      break;
    }
    simMs += stepMs;
    consume(engine.step(stepMs));
  }

  return {
    outcome, depthCleared, runGold, haulCount,
    totalSimMs: simMs, floors, eventCount: events.length, events,
  };
}
