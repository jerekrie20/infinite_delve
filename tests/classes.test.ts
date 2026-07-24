// Phase 3 — classes & kits. Per-class base stats + mana, the caster stats
// (abilityPowerPct / maxMana folding), fixed innate passives (slot order =
// pool order), the option-1 ability unlock schedule, and the new engine
// mechanics the kits need (multi-hit, forced crit, self-shield, stun rider,
// chance rider) verified through the seeded shared engine.

import { describe, check, assert } from './helpers';
import { deriveStats } from '../src/shared/content/gear';
import { classDef } from '../src/shared/content/classes';
import {
  heroInnatePassives,
  playerPassiveSlots,
  PLAYER_PASSIVE_SLOT_LEVELS,
} from '../src/shared/content/passives';
import { unlockedAbilities, ACTIVES } from '../src/shared/content/actives';
import { runSim } from '../src/shared/sim/runSim';
import type { CombatEvent } from '../src/shared/combat/engine';
import type { GearItem } from '../src/shared/delve';

describe('classes (Phase 3)');

// ── Per-class base stats + mana (class-kits.md "Chain overviews") ──────

await check('archer + apprentice derive their catalog base stats', () => {
  const archer = deriveStats('archer', 1, {});
  assert.equal(archer.maxHp, 30);
  assert.equal(archer.attack, 5);
  assert.equal(archer.maxMana, 40);

  const app = deriveStats('apprentice', 1, {});
  assert.equal(app.maxHp, 26);
  assert.equal(app.attack, 8);
  assert.equal(app.maxMana, 80);
});

await check('per-class attack interval: apprentice slowest, archer fastest', () => {
  assert.equal(classDef('squire').attackIntervalMs, 2000);
  assert.equal(classDef('archer').attackIntervalMs, 1500);
  assert.equal(classDef('apprentice').attackIntervalMs, 3000);
});

await check('maxMana grows per level and folds maxManaPct gear', () => {
  assert.equal(deriveStats('squire', 10, {}).maxMana, 50 + 5 * 9);
  const orb: GearItem = { id: 'itm_m1', slot: 'ring1', r: 'rare', base: 'orb', s: { maxManaPct: 50 } };
  const armed = deriveStats('apprentice', 1, { ring1: orb });
  assert.equal(armed.maxMana, Math.round(80 * 1.5));
});

await check('abilityPowerPct gear folds into its derived total', () => {
  const staff: GearItem = { id: 'itm_ap', slot: 'hand1', r: 'rare', base: 'staff', s: { abilityPowerPct: 20 } };
  const bare = deriveStats('apprentice', 1, {});
  const armed = deriveStats('apprentice', 1, { hand1: staff });
  assert.equal(armed.abilityPowerPct, bare.abilityPowerPct + 20);
});

// ── Fixed innate passives (owner decision: fixed per class/level) ─────

await check('passive slots unlock at 1/12/35/60', () => {
  assert.deepEqual([...PLAYER_PASSIVE_SLOT_LEVELS], [1, 12, 35, 60]);
  assert.equal(playerPassiveSlots(1), 1);
  assert.equal(playerPassiveSlots(11), 1);
  assert.equal(playerPassiveSlots(12), 2);
  assert.equal(playerPassiveSlots(35), 3);
  assert.equal(playerPassiveSlots(60), 4);
  assert.equal(playerPassiveSlots(200), 4);
});

await check('innate passives follow pool order and are deterministic', () => {
  const s1 = heroInnatePassives('squire', 1);
  assert.deepEqual(Object.keys(s1), ['hpRegen']); // slot 1 = tier1[0]
  assert.ok(s1.hpRegen! > 0);

  const s12 = heroInnatePassives('squire', 12);
  assert.deepEqual(Object.keys(s12).sort(), ['hpRegen', 'thornsPct'].sort());

  assert.deepEqual(Object.keys(heroInnatePassives('archer', 1)), ['dodgeChance']);
  assert.deepEqual(Object.keys(heroInnatePassives('apprentice', 1)), ['manaRegenPct']);

  // rng-free: identical every call.
  assert.deepEqual(heroInnatePassives('squire', 35), heroInnatePassives('squire', 35));
});

await check('innate passives fold into deriveStats (archer gets dodge, apprentice AP)', () => {
  assert.ok(deriveStats('archer', 1, {}).dodgeChance > 0);
  // Apprentice L20 has unlocked slots 1+2 → manaRegenPct + abilityPowerPct.
  assert.ok(deriveStats('apprentice', 20, {}).abilityPowerPct > 0);
});

// ── Ability unlock schedule (1/5/12/25/45) ────────────────────────────

await check('option-1 abilities unlock on the slot schedule per class', () => {
  assert.deepEqual(unlockedAbilities('archer', 1), ['piercingShot']);
  assert.ok(unlockedAbilities('archer', 5).includes('tumble'));
  assert.ok(unlockedAbilities('apprentice', 12).includes('iceNova'));
  assert.deepEqual(unlockedAbilities('squire', 45), [
    'slam', 'fortify', 'tauntingShout', 'whirlwind', 'aegisOath',
  ]);
  // Every unlocked slot-1 ability is flagged basic (no-mana attack style).
  for (const cls of ['squire', 'archer', 'apprentice'] as const) {
    const basicId = unlockedAbilities(cls, 1)[0]!;
    assert.equal(ACTIVES[basicId]!.basic, true);
  }
});

// ── Determinism law holds for the new classes ─────────────────────────

await check('DETERMINISM: archer + apprentice runs are seed-stable', () => {
  for (const heroClass of ['archer', 'apprentice'] as const) {
    const a = runSim({ seed: 55, level: 10, heroClass });
    const b = runSim({ seed: 55, level: 10, heroClass });
    assert.deepEqual(a.events, b.events);
    assert.equal(a.depthCleared, b.depthCleared);
  }
});

// ── Engine mechanics the kits introduce (via the seeded sim) ──────────

/** Scan seeds for the first run whose event log satisfies `found`. */
const firstRun = (
  opts: Omit<Parameters<typeof runSim>[0], 'seed'> & { seeds?: number },
  found: (events: CombatEvent[]) => boolean,
): CombatEvent[] | null => {
  for (let seed = 1; seed <= (opts.seeds ?? 40); seed++) {
    const sim = runSim({ ...opts, seed });
    if (found(sim.events)) return sim.events;
  }
  return null;
};

await check('multi-hit: one Whirlwind cast lands multiple strikes', () => {
  const events = firstRun({ level: 25, heroClass: 'squire', extractAt: 10 }, (evs) => {
    for (let i = 0; i < evs.length; i++) {
      if (evs[i]!.type !== 'cast' || (evs[i] as { abilityId: string }).abilityId !== 'whirlwind') continue;
      let hits = 0;
      for (let j = i + 1; j < evs.length; j++) {
        const e = evs[j]!;
        if (e.type === 'cast' || e.type === 'floorCleared' || e.type === 'runEnded') break;
        if (e.type === 'hit' && e.action === 'Whirlwind') hits++;
      }
      if (hits >= 2) return true;
    }
    return false;
  });
  assert.ok(events, 'no Whirlwind cast produced ≥2 strikes across 40 seeds');
});

await check('guaranteed crit: every Deadeye hit crits', () => {
  let sawDeadeye = false;
  for (let seed = 1; seed <= 60 && !sawDeadeye; seed++) {
    const sim = runSim({ seed, level: 45, heroClass: 'archer', extractAt: 12 });
    for (const e of sim.events) {
      if (e.type === 'hit' && e.action === 'Deadeye') {
        sawDeadeye = true;
        assert.equal(e.crit, true, 'Deadeye hit was not a crit');
      }
    }
  }
  assert.ok(sawDeadeye, 'no Deadeye hit found across 60 seeds');
});

await check('self-shield: Mana Shield casts and raises the hero shield pool', () => {
  const events = firstRun({ level: 6, heroClass: 'apprentice', extractAt: 6 }, (evs) => {
    const cast = evs.some((e) => e.type === 'cast' && e.abilityId === 'manaShield');
    const shielded = evs.some((e) => e.type === 'shieldChanged' && e.targetId === 'hero' && e.pool > 0);
    return cast && shielded;
  });
  assert.ok(events, 'Mana Shield never produced a hero shield across 40 seeds');
});

await check('status rider: Ice Nova stuns the enemy', () => {
  const events = firstRun({ level: 14, heroClass: 'apprentice', extractAt: 8 }, (evs) =>
    evs.some((e) => e.type === 'cast' && e.abilityId === 'iceNova') &&
    evs.some((e) => e.type === 'statusApplied' && e.statusId === 'stun'),
  );
  assert.ok(events, 'Ice Nova never applied Stun across 40 seeds');
});

await check('chance rider: Fire Bolt sometimes Burns (15% proc)', () => {
  // L3 apprentice only knows Fire Bolt — any Burn must come from its 15% rider.
  const events = firstRun({ level: 3, heroClass: 'apprentice', extractAt: 8, seeds: 60 }, (evs) =>
    evs.some((e) => e.type === 'statusApplied' && e.statusId === 'burn'),
  );
  assert.ok(events, 'Fire Bolt never applied Burn across 60 seeds');
});
