// Combat simulator — tick-by-tick auto-battle with full event logging.
// Run:  npx tsx tools/combat-sim.ts [depth] [heroAtk] [heroDef] [heroHp]
// Defaults: depth 5, 14 atk, 12 def, 100 hp (mid-gear squire).
//
// Prints every attack, every proc, every hook dispatch. Lets you see the
// monster system working without playing through the game on Reddit.

import { monsterForDepth } from '../src/shared/waves';
import { TUNING } from '../src/shared/content/tuning';
import { STATS, type StatId } from '../src/shared/content/stats';
import { HANDLERS, type HandlerResult } from '../src/shared/content/handlers';

// ---- Re-implement the combat loop (pure, no Phaser) ---------------------------

interface Combatant {
  hp: number; maxHp: number; attack: number; defense: number;
  critChance: number; critMultiplier: number;
  lifesteal: number; dodge: number; hpRegen: number; goldFind: number;
}

/** Group behavioral stats by hook point (same as LaneScene.behavioralStats). */
function behavioralStats(d: Record<string, number>): Record<string, Array<{ stat: StatId; val: number }>> {
  const groups: Record<string, Array<{ stat: StatId; val: number }>> = {
    onCombatStart: [], onAttack: [], onCrit: [],
    onDealDamage: [], onTakeDamage: [], onKill: [], perTick: [],
  };
  for (const id of Object.keys(STATS) as StatId[]) {
    const def = STATS[id];
    if (def.kind !== 'behavioral' || !def.hook || !def.handler || def.implemented === false) continue;
    const val = d[def.target] ?? 0;
    if (val > 0) groups[def.hook]!.push({ stat: id, val });
  }
  return groups;
}

/** Dispatch one hook point (same as LaneScene.dispatchHook). */
function dispatchHook(
  hook: string,
  groups: Record<string, Array<{ stat: StatId; val: number }>>,
  dmg: number,
  hero: Combatant,
  monster: Combatant,
): HandlerResult {
  const out: HandlerResult = {};
  for (const { stat, val } of groups[hook] ?? []) {
    const fn = HANDLERS[STATS[stat].handler!];
    if (!fn) continue;
    const r = fn(dmg, val, hero, monster);
    if (r.heal) hero.hp = Math.min(hero.maxHp, hero.hp + r.heal);
    if (r.shield) out.shield = (out.shield ?? 0) + r.shield;
    if (r.reflect) out.reflect = (out.reflect ?? 0) + r.reflect;
    if (r.extraDmg) out.extraDmg = (out.extraDmg ?? 0) + r.extraDmg;
    if (r.bonusGold) out.bonusGold = (out.bonusGold ?? 0) + r.bonusGold;
    if (r.dodged) out.dodged = true;
    if (r.blocked) out.blocked = true;
    if (r.blockedBy) out.blockedBy = r.blockedBy;
    if (r.counterDmg) out.counterDmg = (out.counterDmg ?? 0) + r.counterDmg;
    if (r.dead) out.dead = true;
    if (r.regen) out.regen = (out.regen ?? 0) + r.regen;
  }
  return out;
}

/** Damage roll (same as LaneScene.rollDamage). */
function rollDamage(
  attack: number, defensePct: number,
  critChancePct: number = TUNING.combat.critChance * 100,
  critMult: number = TUNING.combat.critMultiplier,
): { dmg: number; crit: boolean } {
  let dmg = attack * (1 - defensePct / 100);
  dmg *= 1 - TUNING.combat.damageVariance + Math.random() * (2 * TUNING.combat.damageVariance);
  const crit = Math.random() < critChancePct / 100;
  if (crit) dmg *= critMult;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}

// ---- Simulation ---------------------------------------------------------------

interface SimLog {
  tick: number;
  side: 'hero' | 'monster';
  event: string;
  detail: string;
}

interface SimResult {
  winner: 'hero' | 'monster';
  ticks: number;
  heroDmgDealt: number;
  monsterDmgDealt: number;
  heroProcs: Record<string, number>;
  monsterProcs: Record<string, number>;
  log: SimLog[];
}

function simulate(
  hero: Combatant,
  depth: number,
  maxTicks: number = 600,
): SimResult {
  const wave = monsterForDepth(depth);
  const monster: Combatant = {
    hp: wave.hp, maxHp: wave.hp, attack: wave.attack, defense: wave.defense,
    critChance: TUNING.combat.critChance * 100,
    critMultiplier: TUNING.combat.critMultiplier,
    lifesteal: 0, dodge: 0, hpRegen: 0, goldFind: 0,
  };

  const heroBehaviors = behavioralStats({
    lifestealPct: hero.lifesteal,
    dodgeChance: hero.dodge,
    thornsPct: 0,
    hpRegen: hero.hpRegen,
    healOnKillPct: 45, // TUNING base
    goldFindPct: hero.goldFind,
  });
  const monsterBehaviors = behavioralStats(wave.passives as Record<string, number>);

  const log: SimLog[] = [];
  const heroProcs: Record<string, number> = {};
  const monsterProcs: Record<string, number> = {};
  let heroDmgDealt = 0;
  let monsterDmgDealt = 0;
  let tickAccum = 0;
  let monsterRevived = false;

  const addLog = (side: 'hero' | 'monster', event: string, detail: string) => {
    log.push({ tick: log.length + 1, side, event, detail });
  };

  const incProc = (side: 'hero' | 'monster', name: string) => {
    const map = side === 'hero' ? heroProcs : monsterProcs;
    map[name] = (map[name] ?? 0) + 1;
  };

  // onCombatStart for monster
  const monStart = dispatchHook('onCombatStart', monsterBehaviors, 0, monster, hero);
  if (monStart.extraDmg) {
    hero.hp -= monStart.extraDmg;
    addLog('monster', 'onCombatStart', `preemptive strike: ${monStart.extraDmg} dmg → hero`);
  }

  for (let tick = 0; tick < maxTicks; tick++) {
    // perTick
    tickAccum++;
    if (tickAccum >= Math.round(1000 / TUNING.combat.attackIntervalMs)) {
      tickAccum = 0;
      const heroTick = dispatchHook('perTick', heroBehaviors, 0, hero, monster);
      if (heroTick.regen && hero.hp > 0 && hero.hp < hero.maxHp) {
        hero.hp = Math.min(hero.maxHp, hero.hp + heroTick.regen);
      }
      const monTick = dispatchHook('perTick', monsterBehaviors, 0, monster, hero);
      if (monTick.regen && monster.hp > 0 && monster.hp < monster.maxHp) {
        monster.hp = Math.min(monster.maxHp, monster.hp + monTick.regen);
      }
    }

    // ── Hero attacks ──
    if (monster.hp > 0) {
      // onAttack
      const onAtk = dispatchHook('onAttack', heroBehaviors, 0, hero, monster);
      if (onAtk.dead) {
        monster.hp = 0;
        addLog('hero', 'execute', 'instant kill!');
        incProc('hero', 'execute');
      } else {
        const effAtk = hero.attack + (onAtk.extraDmg ?? 0);
        if (onAtk.extraDmg && onAtk.extraDmg !== -1) {
          addLog('hero', 'armorPierce', `+${onAtk.extraDmg} bonus dmg`);
          incProc('hero', 'armorPierce');
        }
        if (onAtk.extraDmg === -1) {
          incProc('hero', 'doubleStrike');
        }

        const hit = rollDamage(effAtk, monster.defense, hero.critChance, hero.critMultiplier);

        // Monster defenses
        const monDef = dispatchHook('onTakeDamage', monsterBehaviors, hit.dmg, monster, hero);
        if (monDef.dodged) {
          addLog('monster', 'dodge', `evaded ${hit.dmg} dmg`);
          incProc('monster', 'dodge');
          if (monDef.counterDmg) {
            hero.hp -= monDef.counterDmg;
            addLog('monster', 'counterAttack', `${monDef.counterDmg} dmg → hero`);
            incProc('monster', 'counterAttack');
          }
        } else if (monDef.blocked) {
          addLog('monster', 'block', `negated ${hit.dmg} dmg`);
          incProc('monster', 'block');
        } else {
          monster.hp -= hit.dmg;
          heroDmgDealt += hit.dmg;
          addLog('hero', 'attack', `${hit.dmg}${hit.crit ? ' CRIT!' : ''} → monster (${Math.max(0, monster.hp)}/${monster.maxHp} hp)`);
          if (hit.crit) incProc('hero', 'crit');

          // Thorns
          if (monDef.reflect) {
            hero.hp -= monDef.reflect;
            addLog('monster', 'thorns', `${monDef.reflect} reflect → hero`);
            incProc('monster', 'thorns');
          }

          // onCrit
          if (hit.crit) {
            const onCrit = dispatchHook('onCrit', heroBehaviors, hit.dmg, hero, monster);
            if (onCrit.heal) {
              hero.hp = Math.min(hero.maxHp, hero.hp + onCrit.heal);
              addLog('hero', 'critHeal', `+${onCrit.heal} hp`);
              incProc('hero', 'critHeal');
            }
          }

          // onDealDamage
          const onDmg = dispatchHook('onDealDamage', heroBehaviors, hit.dmg, hero, monster);
          if (onDmg.heal) {
            hero.hp = Math.min(hero.maxHp, hero.hp + onDmg.heal);
            addLog('hero', 'lifesteal', `+${onDmg.heal} hp`);
            incProc('hero', 'lifesteal');
          }
        }

        // Double strike
        if (onAtk.extraDmg === -1 && monster.hp > 0) {
          const hit2 = rollDamage(effAtk, monster.defense, hero.critChance, hero.critMultiplier);
          const monDef2 = dispatchHook('onTakeDamage', monsterBehaviors, hit2.dmg, monster, hero);
          if (!monDef2.dodged && !monDef2.blocked) {
            monster.hp -= hit2.dmg;
            heroDmgDealt += hit2.dmg;
            addLog('hero', 'doubleStrike', `${hit2.dmg} → monster (${Math.max(0, monster.hp)}/${monster.maxHp} hp)`);
          }
        }
      }
    }

    // Check monster death
    if (monster.hp <= 0) {
      // Monster onKill + revive
      const monOnKill = dispatchHook('onKill', monsterBehaviors, wave.hp, monster, hero);
      if (monOnKill.extraDmg) {
        hero.hp -= monOnKill.extraDmg;
        addLog('monster', 'explode', `${monOnKill.extraDmg} dmg → hero`);
        incProc('monster', 'explode');
      }

      if (!monsterRevived) {
        const monDieHook = dispatchHook('onTakeDamage', monsterBehaviors, 1, monster, hero);
        if (monDieHook.heal) {
          monster.hp = Math.min(monster.maxHp, monDieHook.heal);
          monsterRevived = true;
          addLog('monster', 'revive', `back to ${monster.hp}/${monster.maxHp} hp!`);
          incProc('monster', 'revive');
          continue;
        }
      }

      // Hero onKill
      const onKill = dispatchHook('onKill', heroBehaviors, wave.hp, hero, monster);
      if (onKill.heal) {
        hero.hp = Math.min(hero.maxHp, hero.hp + onKill.heal);
        addLog('hero', 'healOnKill', `+${onKill.heal} hp → ${hero.hp}/${hero.maxHp}`);
        incProc('hero', 'healOnKill');
      }

      addLog('hero', 'VICTORY', `monster died after ${log.length} events`);
      return { winner: 'hero', ticks: tick + 1, heroDmgDealt, monsterDmgDealt, heroProcs, monsterProcs, log };
    }

    // ── Monster attacks ──
    if (hero.hp > 0) {
      const monAtk = dispatchHook('onAttack', monsterBehaviors, 0, monster, hero);
      if (monAtk.dead) {
        hero.hp = 0;
        addLog('monster', 'execute', 'instant kill!');
        incProc('monster', 'execute');
      } else {
        const monEffAtk = monster.attack + (monAtk.extraDmg ?? 0);
        if (monAtk.extraDmg && monAtk.extraDmg !== -1) {
          addLog('monster', 'armorPierce', `+${monAtk.extraDmg} bonus dmg`);
          incProc('monster', 'armorPierce');
        }
        if (monAtk.extraDmg === -1) incProc('monster', 'doubleStrike');

        const monHit = rollDamage(monEffAtk, hero.defense, monster.critChance, monster.critMultiplier);

        const heroDef = dispatchHook('onTakeDamage', heroBehaviors, monHit.dmg, hero, monster);
        if (heroDef.dodged) {
          addLog('hero', 'dodge', `evaded ${monHit.dmg} dmg`);
          incProc('hero', 'dodge');
          if (heroDef.counterDmg) {
            monster.hp -= heroDef.counterDmg;
            addLog('hero', 'counterAttack', `${heroDef.counterDmg} dmg → monster`);
            incProc('hero', 'counterAttack');
          }
        } else if (heroDef.blocked) {
          addLog('hero', 'block', `negated ${monHit.dmg} dmg`);
          incProc('hero', 'block');
        } else {
          hero.hp -= monHit.dmg;
          monsterDmgDealt += monHit.dmg;
          addLog('monster', 'attack', `${monHit.dmg}${monHit.crit ? ' CRIT!' : ''} → hero (${Math.max(0, hero.hp)}/${hero.maxHp} hp)`);
          if (monHit.crit) incProc('monster', 'crit');

          if (heroDef.reflect) {
            monster.hp -= heroDef.reflect;
            addLog('hero', 'thorns', `${heroDef.reflect} reflect → monster`);
            incProc('hero', 'thorns');
          }

          if (monHit.crit) {
            const monCrit = dispatchHook('onCrit', monsterBehaviors, monHit.dmg, monster, hero);
            if (monCrit.heal) {
              monster.hp = Math.min(monster.maxHp, monster.hp + monCrit.heal);
              addLog('monster', 'critHeal', `+${monCrit.heal} hp`);
              incProc('monster', 'critHeal');
            }
          }

          const monDmg = dispatchHook('onDealDamage', monsterBehaviors, monHit.dmg, monster, hero);
          if (monDmg.heal) {
            monster.hp = Math.min(monster.maxHp, monster.hp + monDmg.heal);
            addLog('monster', 'lifesteal', `+${monDmg.heal} hp`);
            incProc('monster', 'lifesteal');
          }
        }

        if (monAtk.extraDmg === -1 && hero.hp > 0) {
          const monHit2 = rollDamage(monEffAtk, hero.defense, monster.critChance, monster.critMultiplier);
          const heroDef2 = dispatchHook('onTakeDamage', heroBehaviors, monHit2.dmg, hero, monster);
          if (!heroDef2.dodged && !heroDef2.blocked) {
            hero.hp -= monHit2.dmg;
            monsterDmgDealt += monHit2.dmg;
            addLog('monster', 'doubleStrike', `${monHit2.dmg} → hero (${Math.max(0, hero.hp)}/${hero.maxHp} hp)`);
          }
        }
      }
    }

    if (hero.hp <= 0) {
      const onLethal = dispatchHook('onTakeDamage', heroBehaviors, 1, hero, monster);
      if (onLethal.heal) {
        hero.hp = Math.min(hero.maxHp, hero.hp + onLethal.heal);
        addLog('hero', 'revive', `back to ${hero.hp}/${hero.maxHp} hp!`);
        incProc('hero', 'revive');
        continue;
      }
      addLog('monster', 'VICTORY', `hero died after ${log.length} events`);
      return { winner: 'monster', ticks: tick + 1, heroDmgDealt, monsterDmgDealt, heroProcs, monsterProcs, log };
    }
  }

  return { winner: 'hero', ticks: maxTicks, heroDmgDealt, monsterDmgDealt, heroProcs, monsterProcs, log };
}

// ---- CLI -----------------------------------------------------------------------

const args = process.argv.slice(2);
const depth = parseInt(args[0] ?? '5', 10);
const heroAtk = parseInt(args[1] ?? '14', 10);
const heroDef = parseInt(args[2] ?? '12', 10);
const heroHp = parseInt(args[3] ?? '100', 10);

const hero: Combatant = {
  hp: heroHp, maxHp: heroHp, attack: heroAtk, defense: heroDef,
  critChance: 5, critMultiplier: 1.5, lifesteal: 0, dodge: 0, hpRegen: 0, goldFind: 0,
};

console.log('═══ Combat Simulator ═══');
console.log(`Hero:  ${heroHp} hp · ${heroAtk} atk · ${heroDef}% def · 5% crit`);
console.log(`Depth: ${depth}`);
console.log('');

const wave = monsterForDepth(depth);
console.log(`SPAWN: ${wave.name} (${wave.rarity}) — ${wave.templateId}`);
console.log(`  HP: ${wave.hp} · ATK: ${wave.attack} · DEF: ${wave.defense}`);
console.log(`  Kind: ${wave.kind} · Sprite: ${wave.sprite}`);
const passiveList = Object.entries(wave.passives);
if (passiveList.length > 0) {
  console.log('  PASSIVES:');
  for (const [stat, val] of passiveList) {
    const def = STATS[stat as StatId];
    console.log(`    ${def.name}: ${val}${def.pct ? '%' : ''}  [hook: ${def.hook}]`);
  }
} else {
  console.log('  PASSIVES: (none — normal enemy)');
}
console.log('');

const result = simulate(hero, depth);

console.log('─── Combat Log ───');
for (const entry of result.log) {
  const tag = entry.side === 'hero' ? '🟢' : '🔴';
  console.log(`[${String(entry.tick).padStart(3)}] ${tag} ${entry.event.padEnd(16)} ${entry.detail}`);
}

console.log('');
console.log('═══ Result ═══');
console.log(`Winner: ${result.winner === 'hero' ? '🟢 HERO' : '🔴 MONSTER'}`);
console.log(`Ticks:  ${result.ticks}`);
console.log(`Hero dealt:    ${result.heroDmgDealt} dmg`);
console.log(`Monster dealt: ${result.monsterDmgDealt} dmg`);
console.log('');
if (Object.keys(result.heroProcs).length > 0) {
  console.log('Hero procs:', result.heroProcs);
}
if (Object.keys(result.monsterProcs).length > 0) {
  console.log('Monster procs:', result.monsterProcs);
}
