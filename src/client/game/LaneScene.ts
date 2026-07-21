import Phaser from 'phaser';
import type { GearItem, GearSlot, Hero, MonsterRarity } from '../../shared/delve';
import { monsterForDepth, type IdleGains, type MonsterKind } from '../../shared/waves';
import { TUNING } from '../../shared/content/tuning';
import { itemName, rollDrop, sellValue } from '../../shared/content/items';
import { bankHaul, deriveStats, equipItem, sellItem, unequipSlot } from '../../shared/content/gear';
import { STATS, type StatId } from '../../shared/content/stats';
import { HANDLERS, type HandlerResult } from '../../shared/content/handlers';
import { postEquip, postRunResult, postSell } from '../api';

/** The side-view idle combat lane. Auto-battles down through depths (one monster
 *  per depth); the player's only choice is when to EXTRACT (bank) before the
 *  deepening monsters kill them. Reward values are the server's; the client
 *  shows a matching preview. Art = PixelLab side-view sprites (spr_hero/goblin/rat). */

const DESIGN_W = 800;
const DESIGN_H = 1280;
// The lane sits in the upper portion of the canvas so the opaque bottom control
// panel (the HTML HUD) never covers the fighters. Depth/gold/haul now live in
// the HTML HUD (top-bar details, panel money, Bag badge), so the canvas keeps
// only the fight itself.
const GROUND_Y = 640;
const HERO_X = 240;
const MONSTER_X = 580;
const ATTACK_INTERVAL_MS = TUNING.combat.attackIntervalMs;

/** Per-character render spec, derived from each PixelLab sprite's opaque bounds:
 *  origin = (horizontal center, feet) in 0..1 so the sprite stands on GROUND_Y;
 *  displayH = on-screen height in design px; scale = displayH / nativeH. */
interface CharSpec {
  key: string;
  originX: number;
  originY: number;
  nativeH: number;
  displayH: number;
}
const HERO_SPEC: CharSpec = { key: 'hero', originX: 0.5331, originY: 0.875, nativeH: 103, displayH: 150 };
const MONSTER_SPECS: Record<MonsterKind, CharSpec> = {
  grunt: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
  swarm: { key: 'rat', originX: 0.5221, originY: 0.8676, nativeH: 97, displayH: 140 },
  brute: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 140 },
  caster: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
};
const specScale = (s: CharSpec): number => s.displayH / s.nativeH;

/** Loot-pop colors by rarity; set + unique items override with their own color. */
const RARITY_COLORS: Record<string, string> = {
  common: '#c8c8c8',
  uncommon: '#5bd06a',
  rare: '#4aa3ff',
  epic: '#b45bff',
  legendary: '#ffb020',
};
const SET_COLOR = '#2ecf7f';
const UNIQUE_COLOR = '#ff8a3d';
const itemColor = (it: GearItem): string =>
  it.unique ? UNIQUE_COLOR : it.set ? SET_COLOR : RARITY_COLORS[it.r] ?? '#ffffff';

const MONSTER_RARITY_COLORS: Record<MonsterRarity, string> = {
  normal: '#ffffff',
  elite: '#4aa3ff',
  boss: '#ffb020',
};

interface Combatant {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  /** Derived crit chance (whole %). */
  critChance: number;
  /** Derived crit multiplier (1.5 base). */
  critMultiplier: number;
  /** Derived lifesteal (whole %). */
  lifesteal: number;
  /** Derived dodge chance (whole %). */
  dodge: number;
  /** Derived HP/sec regen. */
  hpRegen: number;
  /** Derived % bonus gold from kills. */
  goldFind: number;
}

/** Build a hero Combatant from the client-side Hero (pre-computed derives). */
function heroCombatant(h: Hero): Combatant {
  return {
    hp: h.maxHp, maxHp: h.maxHp,
    attack: h.attack, defense: h.defense,
    critChance: h.critChance, critMultiplier: h.critMultiplier,
    lifesteal: h.lifesteal, dodge: h.dodge,
    hpRegen: h.hpRegen, goldFind: h.goldFind,
  };
}

/** Collect all `implemented: true` behavioral stats from a DerivedMap,
 *  grouped by hook point. Called whenever the hero's gear changes. */
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

/** Dispatch one hook point across all equipped behavioral stats. Accumulates results. */
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

export class LaneScene extends Phaser.Scene {
  private hero!: Hero;
  private heroC!: Combatant;
  private monster!: Combatant;
  private heroDerived!: Record<string, number>;
  private heroBehaviors!: ReturnType<typeof behavioralStats>;
  private monsterBehaviors!: ReturnType<typeof behavioralStats>;
  private monsterRarity: MonsterRarity = 'normal';
  private depth = 1;
  private runGold = 0;
  private runHaul: GearItem[] = [];
  private bankedGold = 0;
  private pendingIdle?: IdleGains;
  private over = false;
  private tickAccum = 0;
  private monsterRevived = false;

  private heroSprite!: Phaser.GameObjects.Image;
  private monsterSprite!: Phaser.GameObjects.Image;
  private monsterSpec: CharSpec = MONSTER_SPECS.grunt;
  private bars!: Phaser.GameObjects.Graphics;
  private depthText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private haulText!: Phaser.GameObjects.Text;
  private attackTimer = ATTACK_INTERVAL_MS;

  /** Enable verbose combat logging in the browser console. Activate with ?debug=1
   *  in the URL, or set localStorage['delve_debug'] = '1'. */
  private debug = false;

  private debugLog(side: 'hero' | 'monster', event: string, detail: string, style?: string): void {
    if (!this.debug) return;
    const tag = side === 'hero' ? '🟢' : '🔴';
    const s = style ?? (side === 'hero' ? 'color:#5bd06a' : 'color:#ff5470');
    console.log(`%c[${this.depth}] ${tag} ${event} %c${detail}`, s, 'color:#9d8fc0');
  }

  constructor() {
    super('LaneScene');
  }

  init(data: { hero?: Hero; idle?: IdleGains }): void {
    this.debug = new URLSearchParams(window.location.search).has('debug')
      || globalThis.localStorage?.getItem('delve_debug') === '1';
    this.hero = data.hero ?? {
      class: 'squire', level: 1, xp: 0, xpToNext: 20, hp: 40, maxHp: 40,
      attack: 6, defense: 5, critChance: TUNING.combat.critChance * 100,
      critMultiplier: TUNING.combat.critMultiplier, lifesteal: 0, dodge: 0,
      hpRegen: 0, goldFind: 0, gold: 0, bestDepth: 1, stash: [], equipped: {},
    };
    if (data.idle) this.pendingIdle = data.idle;
    this.bankedGold = this.hero.gold;
    this.heroC = heroCombatant(this.hero);
    this.heroDerived = deriveStats(this.hero.class, this.hero.level, this.hero.equipped);
    this.heroBehaviors = behavioralStats(this.heroDerived);
    this.tickAccum = 0;
  }

  preload(): void {
    this.load.image('hero', 'spr_hero.png');
    this.load.image('goblin', 'spr_goblin.png');
    this.load.image('rat', 'spr_rat.png');
  }

  create(): void {
    this.drawBackground();
    this.drawShadows();

    this.heroSprite = this.add
      .image(HERO_X, GROUND_Y, HERO_SPEC.key)
      .setOrigin(HERO_SPEC.originX, HERO_SPEC.originY)
      .setScale(specScale(HERO_SPEC));
    // Texture/origin/scale set per-kind in spawnMonster (called below).
    this.monsterSprite = this.add.image(MONSTER_X, GROUND_Y, MONSTER_SPECS.grunt.key);
    this.bars = this.add.graphics();

    this.idleBob(this.heroSprite, 0);
    this.idleBob(this.monsterSprite, 250);

    // Depth/gold/haul are surfaced by the HTML HUD now; keep the text objects
    // (refreshHud still writes them) but hide them so nothing double-renders.
    this.depthText = this.add
      .text(DESIGN_W / 2, 96, 'DEPTH 1', {
        fontFamily: 'Arial', fontSize: '46px', color: '#ffffff', fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 6)
      .setVisible(false);

    this.goldText = this.add
      .text(DESIGN_W - 40, 96, '', {
        fontFamily: 'Arial', fontSize: '38px', color: '#ffe066', fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setShadow(0, 2, '#000000', 5)
      .setVisible(false);

    this.haulText = this.add
      .text(DESIGN_W - 40, 142, '', {
        fontFamily: 'Arial', fontSize: '26px', color: '#c9b8ff', fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setShadow(0, 2, '#000000', 4)
      .setVisible(false);

    this.spawnMonster();
    this.refreshHud();

    // "Welcome back" — offline idle gains auto-collected by the server.
    if (this.pendingIdle && this.pendingIdle.gold > 0) {
      this.time.delayedCall(300, () => {
        const mins = Math.round(this.pendingIdle!.paidSeconds / 60);
        this.banner(`WELCOME BACK\n+${this.pendingIdle!.gold}◆  (${mins}m idle)`, '#ffe066');
      });
    }
  }

  // ---- per-frame auto-battle (symmetric — both sides dispatch behaviors) ------

  override update(_time: number, delta: number): void {
    if (this.over) return;

    // perTick: HP regen for both combatants
    this.tickAccum += delta;
    if (this.tickAccum >= 1000) {
      this.tickAccum -= 1000;
      // Hero regen
      const tick = dispatchHook('perTick', this.heroBehaviors, 0, this.heroC, this.monster);
      if (tick.regen && this.heroC.hp > 0 && this.heroC.hp < this.heroC.maxHp) {
        this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + tick.regen);
      }
      // Monster regen
      const monTick = dispatchHook('perTick', this.monsterBehaviors, 0, this.monster, this.heroC);
      if (monTick.regen && this.monster.hp > 0 && this.monster.hp < this.monster.maxHp) {
        this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + monTick.regen);
        this.debugLog('monster', 'regen', `+${monTick.regen} → ${this.monster.hp}/${this.monster.maxHp}`);
      }
    }

    this.attackTimer -= delta;
    if (this.attackTimer > 0) return;
    this.attackTimer = ATTACK_INTERVAL_MS;

    this.doHeroAttack();
    if (this.monster.hp <= 0) {
      this.onMonsterDead();
      this.refreshHud();
      return;
    }
    this.doMonsterAttack();
    if (this.heroC.hp <= 0) {
      // Last-chance: hero revive
      const onLethal = dispatchHook('onTakeDamage', this.heroBehaviors, 1, this.heroC, this.monster);
      if (onLethal.heal) {
        this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + onLethal.heal);
        this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, 'REVIVED!', '#ffe066');
        this.debugLog('hero', '💀REVIVE', `back to ${this.heroC.hp}/${this.heroC.maxHp}!`, 'color:#ffe066;font-weight:bold');
      } else {
        this.debugLog('hero', '☠️ DIED', `at depth ${this.depth}`, 'color:#ff5470;font-weight:bold');
        this.die();
        return;
      }
    }
    this.refreshHud();
  }

  /** Hero attack phase, with symmetric monster onTakeDamage dispatch. */
  private doHeroAttack(): void {
    const onAtk = dispatchHook('onAttack', this.heroBehaviors, 0, this.heroC, this.monster);
    if (onAtk.dead) { this.monster.hp = 0; this.debugLog('hero', '⚡EXEC', 'instant kill!', 'color:#ffd84a;font-weight:bold'); return; }
    if ((onAtk.extraDmg ?? 0) > 0) this.debugLog('hero', 'pierce', `+${onAtk.extraDmg} bonus`);
    if (onAtk.extraDmg === -1) this.debugLog('hero', 'double', 'roll!', 'color:#ffd84a');
    const effectiveAtk = this.heroC.attack + (onAtk.extraDmg ?? 0);

    const hit = rollDamage(effectiveAtk, this.monster.defense, this.heroC.critChance, this.heroC.critMultiplier);

    // Monster defenses: dodge, block
    const monDef = dispatchHook('onTakeDamage', this.monsterBehaviors, hit.dmg, this.monster, this.heroC);
    if (monDef.dodged) {
      this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, 'DODGE', '#ffe066');
      this.debugLog('monster', 'DODGE', `evaded ${hit.dmg}`, 'color:#ffe066');
      if (monDef.counterDmg) {
        this.heroC.hp -= monDef.counterDmg;
        this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `${monDef.counterDmg}`, '#ff6b6b');
        this.debugLog('monster', 'counter', `${monDef.counterDmg} → hero`, 'color:#ff8a3d');
      }
      return;
    }
    if (monDef.blocked) {
      this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, 'BLOCK', '#4aa3ff');
      this.debugLog('monster', 'BLOCK', `negated ${hit.dmg}`, 'color:#4aa3ff');
      return;
    }

    this.monster.hp -= hit.dmg;
    this.hitFx(this.heroSprite, 1);
    this.floatNumber(
      MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24,
      hit.crit ? `${hit.dmg}!` : `${hit.dmg}`, hit.crit ? '#ffd84a' : '#ffffff'
    );
    this.debugLog('hero', 'hit', `${hit.dmg}${hit.crit ? ' CRIT!' : ''} → ${Math.max(0, this.monster.hp)}/${this.monster.maxHp}`,
      hit.crit ? 'color:#ffd84a;font-weight:bold' : undefined);

    // Monster thorns
    if (monDef.reflect && this.heroC.hp > 0) {
      this.heroC.hp -= monDef.reflect;
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `${monDef.reflect}`, '#ff6b6b');
      this.debugLog('monster', 'thorns', `${monDef.reflect} reflect → hero`, 'color:#ff8a3d');
    }

    // Hero onCrit
    if (hit.crit) {
      const onCrit = dispatchHook('onCrit', this.heroBehaviors, hit.dmg, this.heroC, this.monster);
      if (onCrit.heal && this.heroC.hp < this.heroC.maxHp) {
        this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + onCrit.heal);
        this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `+${onCrit.heal}`, '#7fe0a0');
        this.debugLog('hero', 'critHeal', `+${onCrit.heal}`);
      }
    }

    // Hero onDealDamage
    const onDmg = dispatchHook('onDealDamage', this.heroBehaviors, hit.dmg, this.heroC, this.monster);
    if (onDmg.heal && this.heroC.hp < this.heroC.maxHp) {
      this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + onDmg.heal);
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `+${onDmg.heal}`, '#7fe0a0');
      this.debugLog('hero', 'lifesteal', `+${onDmg.heal}`);
    }

    // Double-strike (signalled by extraDmg = -1)
    if (onAtk.extraDmg === -1 && this.monster.hp > 0) {
      const hit2 = rollDamage(effectiveAtk, this.monster.defense, this.heroC.critChance, this.heroC.critMultiplier);
      const monDef2 = dispatchHook('onTakeDamage', this.monsterBehaviors, hit2.dmg, this.monster, this.heroC);
      if (!monDef2.dodged && !monDef2.blocked) {
        this.monster.hp -= hit2.dmg;
        this.debugLog('hero', 'double!', `${hit2.dmg} → ${Math.max(0, this.monster.hp)}/${this.monster.maxHp}`, 'color:#ffd84a;font-weight:bold');
      }
      const onDmg2 = dispatchHook('onDealDamage', this.heroBehaviors, hit2.dmg, this.heroC, this.monster);
      if (onDmg2.heal && this.heroC.hp < this.heroC.maxHp) {
        this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + onDmg2.heal);
      }
    }
  }

  /** Monster attack phase, with symmetric onAttack/onDealDamage dispatch. */
  private doMonsterAttack(): void {
    // Monster onAttack: doubleStrike, execute, armor pierce
    const monAtk = dispatchHook('onAttack', this.monsterBehaviors, 0, this.monster, this.heroC);
    if (monAtk.dead) { this.heroC.hp = 0; this.debugLog('monster', '⚡EXEC', 'hero slain!', 'color:#ffd84a;font-weight:bold'); return; }
    if ((monAtk.extraDmg ?? 0) > 0) this.debugLog('monster', 'pierce', `+${monAtk.extraDmg} bonus`);
    if (monAtk.extraDmg === -1) this.debugLog('monster', 'double', 'roll!', 'color:#ffd84a');
    const monEffAtk = this.monster.attack + (monAtk.extraDmg ?? 0);

    // Monster uses rollDamage (crits too)
    const monHit = rollDamage(monEffAtk, this.heroC.defense, this.monster.critChance, this.monster.critMultiplier);

    // Hero defenses: dodge, block, thorns
    const heroDef = dispatchHook('onTakeDamage', this.heroBehaviors, monHit.dmg, this.heroC, this.monster);
    if (heroDef.dodged) {
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, 'DODGE', '#ffe066');
      this.debugLog('hero', 'DODGE', `evaded ${monHit.dmg}`, 'color:#ffe066');
      if (heroDef.counterDmg) {
        this.monster.hp -= heroDef.counterDmg;
        this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, `${heroDef.counterDmg}`, '#ffd84a');
        this.debugLog('hero', 'counter', `${heroDef.counterDmg} → monster`, 'color:#ffd84a');
      }
      return;
    }
    if (heroDef.blocked) {
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, 'BLOCK', '#4aa3ff');
      this.debugLog('hero', 'BLOCK', `negated ${monHit.dmg}`, 'color:#4aa3ff');
      return;
    }

    this.heroC.hp -= monHit.dmg;
    this.hitFx(this.monsterSprite, -1);
    this.floatNumber(
      HERO_X, GROUND_Y - HERO_SPEC.displayH - 24,
      monHit.crit ? `${monHit.dmg}!` : `${monHit.dmg}`, monHit.crit ? '#ff6b6b' : '#ff6b6b'
    );
    this.debugLog('monster', 'hit', `${monHit.dmg}${monHit.crit ? ' CRIT!' : ''} → ${Math.max(0, this.heroC.hp)}/${this.heroC.maxHp}`,
      monHit.crit ? 'color:#ff6b6b;font-weight:bold' : undefined);

    // Hero thorns
    if (heroDef.reflect && this.monster.hp > 0) {
      this.monster.hp -= heroDef.reflect;
      this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, `${heroDef.reflect}`, '#ffd84a');
      this.debugLog('hero', 'thorns', `${heroDef.reflect} reflect → monster`, 'color:#ffd84a');
    }

    // Monster onDealDamage: lifesteal
    const monDmg = dispatchHook('onDealDamage', this.monsterBehaviors, monHit.dmg, this.monster, this.heroC);
    if (monDmg.heal && this.monster.hp < this.monster.maxHp) {
      this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + monDmg.heal);
      this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, `+${monDmg.heal}`, '#7fe0a0');
      this.debugLog('monster', 'lifesteal', `+${monDmg.heal}`);
    }

    // Monster crit heal
    if (monHit.crit) {
      const monCrit = dispatchHook('onCrit', this.monsterBehaviors, monHit.dmg, this.monster, this.heroC);
      if (monCrit.heal && this.monster.hp < this.monster.maxHp) {
        this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + monCrit.heal);
        this.debugLog('monster', 'critHeal', `+${monCrit.heal}`);
      }
    }

    // Monster double-strike
    if (monAtk.extraDmg === -1 && this.heroC.hp > 0) {
      const monHit2 = rollDamage(monEffAtk, this.heroC.defense, this.monster.critChance, this.monster.critMultiplier);
      const heroDef2 = dispatchHook('onTakeDamage', this.heroBehaviors, monHit2.dmg, this.heroC, this.monster);
      if (!heroDef2.dodged && !heroDef2.blocked) {
        this.heroC.hp -= monHit2.dmg;
        this.debugLog('monster', 'double!', `${monHit2.dmg} → ${Math.max(0, this.heroC.hp)}/${this.heroC.maxHp}`, 'color:#ffd84a;font-weight:bold');
      }
      const monDmg2 = dispatchHook('onDealDamage', this.monsterBehaviors, monHit2.dmg, this.monster, this.heroC);
      if (monDmg2.heal && this.monster.hp < this.monster.maxHp) {
        this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + monDmg2.heal);
      }
    }
  }

  private onMonsterDead(): void {
    const m = monsterForDepth(this.depth);

    // Monster onKill: explode (hurts hero)
    const monOnKill = dispatchHook('onKill', this.monsterBehaviors, m.hp, this.monster, this.heroC);
    if (monOnKill.extraDmg && this.heroC.hp > 0) {
      this.heroC.hp -= monOnKill.extraDmg;
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `${monOnKill.extraDmg}`, '#ff8a3d');
      this.debugLog('monster', '💥EXPLODE', `${monOnKill.extraDmg} → hero`, 'color:#ff8a3d;font-weight:bold');
    }

    // Monster revive: refill HP, don't advance depth
    if (!this.monsterRevived) {
      // Check for revive ONLY on first death (reviveRoll handler returns {heal})
      const monDie = dispatchHook('onTakeDamage', this.monsterBehaviors, 1, this.monster, this.heroC);
      if (monDie.heal) {
        this.monster.hp = Math.min(this.monster.maxHp, monDie.heal);
        this.monsterRevived = true;
        this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, 'REVIVED!', '#ffe066');
        this.debugLog('monster', '💀REVIVE', `back to ${this.monster.hp}/${this.monster.maxHp}!`, 'color:#ffe066;font-weight:bold');
        this.tweens.add({
          targets: this.monsterSprite, scale: specScale(this.monsterSpec) * (this.monsterRarity === 'boss' ? 1.3 : 1),
          duration: 300, ease: 'Back.out',
        });
        return;
      }
    }

    // Hero onKill: heal on kill, gold find, XP bonus
    const onKill = dispatchHook('onKill', this.heroBehaviors, m.hp, this.heroC, this.monster);
    if (onKill.heal && this.heroC.hp < this.heroC.maxHp) {
      this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + onKill.heal);
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `+${onKill.heal}`, '#5bd06a');
      this.debugLog('hero', 'healOnKill', `+${onKill.heal} → ${this.heroC.hp}/${this.heroC.maxHp}`);
    }

    const goldMult = 1 + (onKill.bonusGold ?? 0) / 100;
    const totalGold = Math.round(m.gold * goldMult);
    this.runGold += totalGold;
    this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, `+${totalGold}◆`, '#ffe066');

    // Loot roll — unbanked haul the EXTRACT decision protects (lost on death).
    const drop = rollDrop(this.depth, m.kind === 'swarm', Math.random);
    if (drop) {
      this.runHaul.push(drop);
      this.dropToast(drop);
    }

    this.depth += 1;
    this.spawnMonster();
  }

  // ---- run end ---------------------------------------------------------------

  /** depths fully cleared this run = current depth minus the one in progress. */
  private clearedDepth(): number {
    return Math.max(0, this.depth - 1);
  }

  async extract(): Promise<void> {
    if (this.over) return;
    this.over = true;
    const cleared = this.clearedDepth();
    const haul = this.runHaul;
    const gearLine = haul.length ? `\n+${haul.length} gear` : '';
    const resp = await postRunResult('extracted', cleared, haul);
    if (resp) {
      this.hero = resp.hero;
      this.bankedGold = resp.hero.gold;
      const eq = resp.gained.itemsEquipped ? `  (${resp.gained.itemsEquipped} equipped)` : '';
      this.banner(`EXTRACTED\n+${resp.gained.gold}◆${gearLine}${eq}`, '#5bd06a');
    } else {
      // Offline (preview): bank the haul locally so gear + power growth show.
      bankHaul(this.hero, haul);
      this.hero.gold += this.runGold;
      this.rederiveHero();
      this.bankedGold = this.hero.gold;
      this.banner(`EXTRACTED\n+${this.runGold}◆${gearLine}`, '#5bd06a');
    }
    this.syncHeroStats();
    this.resetRun();
    // Meta loop: nudge the Daily panel; and the gear panel (power may have grown).
    this.sys.game.events.emit('run-resolved', { outcome: 'extracted', reached: cleared });
    this.sys.game.events.emit('hero-changed', this.hero);
  }

  private die(): void {
    this.over = true;
    const reached = this.clearedDepth();
    // Depth reached still counts toward "deepest delve today" — record it, then
    // let the Daily panel repaint once the server write lands.
    void postRunResult('died', reached).then(() =>
      this.sys.game.events.emit('run-resolved', { outcome: 'died', reached })
    );
    this.banner('DIED', '#ff5470');
    this.time.delayedCall(1500, () => this.resetRun());
  }

  private resetRun(): void {
    this.over = false;
    this.depth = 1;
    this.runGold = 0;
    this.runHaul = [];
    this.heroC.hp = this.heroC.maxHp;
    this.attackTimer = ATTACK_INTERVAL_MS;
    this.spawnMonster();
    this.refreshHud();
  }

  // ---- gear (read + change; the review panel drives these) -------------------

  /** Latest hero snapshot the gear panel reads. */
  getHeroSnapshot(): Hero {
    return this.hero;
  }

  /** Push the hero's derived stats into the live combatant (after gear/level change). */
  private syncHeroStats(): void {
    this.heroC = heroCombatant(this.hero);
    this.heroDerived = deriveStats(this.hero.class, this.hero.level, this.hero.equipped);
    this.heroBehaviors = behavioralStats(this.heroDerived);
    this.heroC.hp = Math.min(this.heroC.hp, this.heroC.maxHp);
  }

  /** Recompute the hero's derived stats from class + level + gear (offline path). */
  private rederiveHero(): void {
    const d = deriveStats(this.hero.class, this.hero.level, this.hero.equipped);
    this.hero.maxHp = d.maxHp;
    this.hero.attack = d.attack;
    this.hero.defense = d.defensePct;
    this.hero.critChance = d.critChance;
    this.hero.critMultiplier = d.critMultiplier;
    this.hero.lifesteal = d.lifestealPct;
    this.hero.dodge = d.dodgeChance;
    this.hero.hpRegen = d.hpRegen;
    this.hero.goldFind = d.goldFindPct;
    if (this.hero.hp > this.hero.maxHp) this.hero.hp = this.hero.maxHp;
    this.heroDerived = d;
    this.heroBehaviors = behavioralStats(d);
  }

  /** Equip a stash item or unequip a slot — server-authoritative, or local when
   *  offline (preview). Re-syncs combat stats + notifies the gear panel. */
  async changeGear(itemId?: string, unequip?: GearSlot): Promise<void> {
    const resp = await postEquip(itemId, unequip);
    if (resp) {
      this.hero = resp.hero;
    } else {
      if (itemId) equipItem(this.hero, itemId);
      else if (unequip) unequipSlot(this.hero, unequip);
      this.rederiveHero();
    }
    this.syncHeroStats();
    this.sys.game.events.emit('hero-changed', this.hero);
  }

  /** Sell a stash item for gold — server-authoritative, or local when offline. */
  async sellGear(itemId: string): Promise<void> {
    const resp = await postSell(itemId);
    if (resp) {
      this.hero = resp.hero;
    } else {
      const item = sellItem(this.hero, itemId);
      if (item) this.hero.gold += sellValue(item);
    }
    this.bankedGold = this.hero.gold;
    this.refreshHud();
    this.sys.game.events.emit('hero-changed', this.hero);
  }

  // ---- spawning / hud --------------------------------------------------------

  private spawnMonster(): void {
    const m = monsterForDepth(this.depth);
    this.monsterRarity = m.rarity;
    this.monsterRevived = false;
    this.monster = {
      hp: m.hp, maxHp: m.hp, attack: m.attack, defense: m.defense,
      critChance: TUNING.combat.critChance * 100, critMultiplier: TUNING.combat.critMultiplier,
      lifesteal: 0, dodge: 0, hpRegen: 0, goldFind: 0,
    };
    // Build monster behaviors from rolled passives (same path as hero behaviors).
    this.monsterBehaviors = behavioralStats(m.passives as Record<string, number>);
    // Dispatch onCombatStart for both sides.
    const onStart = dispatchHook('onCombatStart', this.monsterBehaviors, 0, this.monster, this.heroC);
    if (onStart.extraDmg && this.heroC.hp > 0) {
      this.heroC.hp -= onStart.extraDmg;
    }
    const spec = MONSTER_SPECS[m.kind];
    this.monsterSpec = spec;
    const bossScale = m.rarity === 'boss' ? 1.3 : 1.0;
    const scale = specScale(spec) * bossScale;
    this.monsterSprite
      .setTexture(spec.key)
      .setOrigin(spec.originX, spec.originY)
      .setScale(scale * 0.6)
      .setTint(m.rarity === 'elite' ? 0x4aa3ff : m.rarity === 'boss' ? 0xffb020 : 0xffffff);
    this.tweens.add({ targets: this.monsterSprite, scale, duration: 220, ease: 'Back.out' });
    // Name label
    this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 55, m.name, MONSTER_RARITY_COLORS[m.rarity]);

    // Debug: log spawn
    if (this.debug) {
      const pList = Object.entries(m.passives).map(([s, v]) => {
        const d = STATS[s as StatId];
        return `${d?.abbr ?? s}:${v}${d?.pct ? '%' : ''}`;
      }).join(' ');
      this.debugLog('monster', 'SPAWN', `${m.name} (${m.rarity}) hp=${m.hp} atk=${m.attack} def=${m.defense}${pList ? ' [' + pList + ']' : ''}`,
        'color:#ffb020;font-weight:bold');
    }
  }

  private refreshHud(): void {
    this.depthText.setText(`DEPTH ${this.depth}`);
    this.goldText.setText(`◆ ${this.bankedGold}  (+${this.runGold})`);
    this.haulText.setText(this.runHaul.length ? `🎒 ${this.runHaul.length} unbanked` : '');
    this.drawBars();
    // Feed the HTML HUD (bars, money, depth, gear, bag badge, extract label).
    this.sys.game.events.emit('hud-changed', {
      depth: this.depth,
      bankedGold: this.bankedGold,
      runGold: this.runGold,
      haulCount: this.runHaul.length,
      hp: this.heroC.hp,
      maxHp: this.heroC.maxHp,
      hero: this.hero,
    });
  }

  private drawBars(): void {
    this.bars.clear();
    this.bar(HERO_X, GROUND_Y - HERO_SPEC.displayH - 16, 96, this.heroC.hp / this.heroC.maxHp, 0x5bd06a);
    this.bar(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 16, 88, this.monster.hp / this.monster.maxHp, 0xff5470);
  }

  private bar(cx: number, y: number, w: number, frac: number, color: number): void {
    const f = Phaser.Math.Clamp(frac, 0, 1);
    this.bars.fillStyle(0x000000, 0.55);
    this.bars.fillRoundedRect(cx - w / 2 - 3, y - 3, w + 6, 16, 5);
    this.bars.fillStyle(0x2a2a2a, 1);
    this.bars.fillRoundedRect(cx - w / 2, y, w, 10, 3);
    this.bars.fillStyle(color, 1);
    this.bars.fillRoundedRect(cx - w / 2, y, w * f, 10, 3);
  }

  // ---- visuals ---------------------------------------------------------------

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x241a3a, 0x241a3a, 0x120c1c, 0x120c1c, 1);
    g.fillRect(0, 0, DESIGN_W, DESIGN_H);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 60; i++) {
      const sx = Math.random() * DESIGN_W;
      const sy = Math.random() * (GROUND_Y - 120);
      g.fillCircle(sx, sy, Math.random() < 0.2 ? 2 : 1);
    }
    g.fillStyle(0x3a7a3f, 1);
    g.fillRect(0, GROUND_Y, DESIGN_W, DESIGN_H - GROUND_Y);
    g.fillStyle(0x54a95b, 1);
    g.fillRect(0, GROUND_Y, DESIGN_W, 16);
  }

  /** Soft ground shadows the fighters bob above (they lift off the shadow). */
  private drawShadows(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(HERO_X, GROUND_Y - 2, 96, 22);
    g.fillEllipse(MONSTER_X, GROUND_Y - 2, 90, 20);
  }

  private idleBob(target: Phaser.GameObjects.Image, delayMs: number): void {
    this.tweens.add({
      targets: target, y: target.y - 8, duration: 700, yoyo: true,
      repeat: -1, ease: 'Sine.inOut', delay: delayMs,
    });
  }

  private hitFx(attacker: Phaser.GameObjects.Image, dir: number): void {
    this.tweens.add({
      targets: attacker, x: attacker.x + dir * 24, duration: 90, yoyo: true, ease: 'Quad.out',
    });
  }

  private floatNumber(x: number, y: number, label: string, color: string): void {
    const txt = this.add
      .text(x, y, label, {
        fontFamily: 'Arial', fontSize: '40px', color, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 4);
    this.tweens.add({
      targets: txt, y: y - 70, alpha: 0, duration: 700, ease: 'Quad.out',
      onComplete: () => txt.destroy(),
    });
  }

  /** A rising, quality-colored loot pop when gear drops (unique/set/rarity). */
  private dropToast(item: GearItem): void {
    const color = itemColor(item);
    const prefix = item.unique ? '★' : item.set ? '❖' : '✦';
    const txt = this.add
      .text(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 70, `${prefix} ${itemName(item)}`, {
        fontFamily: 'Arial', fontSize: '30px', color, fontStyle: 'bold', align: 'center',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 5);
    this.tweens.add({
      targets: txt, y: txt.y - 90, alpha: 0, duration: 1100, ease: 'Quad.out', delay: 200,
      onComplete: () => txt.destroy(),
    });
  }

  private banner(text: string, color: string): void {
    const b = this.add
      .text(DESIGN_W / 2, GROUND_Y - 300, text, {
        fontFamily: 'Arial', fontSize: '58px', color, fontStyle: 'bold', align: 'center',
      })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 8)
      .setScale(0.7);
    this.tweens.add({ targets: b, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({
      targets: b, alpha: 0, y: b.y - 60, delay: 1000, duration: 500,
      onComplete: () => b.destroy(),
    });
  }
}

/** Damage = attack * (1 - defense%), ± variance, crit chance × multiplier, min 1.
 *  `critChancePct` and `critMult` come from the attacker's derived stats (hero uses
 *  PoE-style base × increased; monster uses TUNING defaults). */
function rollDamage(
  attack: number,
  defensePct: number,
  critChancePct: number = TUNING.combat.critChance * 100,
  critMult: number = TUNING.combat.critMultiplier,
): { dmg: number; crit: boolean } {
  let dmg = attack * (1 - defensePct / 100);
  dmg *= 1 - TUNING.combat.damageVariance + Math.random() * (2 * TUNING.combat.damageVariance);
  const crit = Math.random() < critChancePct / 100;
  if (crit) dmg *= critMult;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}
