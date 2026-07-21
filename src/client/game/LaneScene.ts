import Phaser from 'phaser';
import type { GearItem, GearSlot, Hero } from '../../shared/delve';
import { monsterForDepth, type IdleGains, type MonsterKind } from '../../shared/waves';
import { TUNING } from '../../shared/content/tuning';
import { rollDrop, sellValue } from '../../shared/content/items';
import { bankHaul, deriveStats, equipItem, sellItem, unequipSlot } from '../../shared/content/gear';
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
  it.unique ? UNIQUE_COLOR : it.set ? SET_COLOR : RARITY_COLORS[it.rarity] ?? '#ffffff';

interface Combatant {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  /** Crit chance, whole percent. */
  critChance: number;
  /** Lifesteal, whole percent of damage dealt (heroes only; 0 for monsters). */
  lifesteal: number;
}

export class LaneScene extends Phaser.Scene {
  private hero!: Hero;
  private heroC!: Combatant;
  private monster!: Combatant;
  private depth = 1; // depth of the monster currently being fought (1-indexed)
  private runGold = 0; // local preview; server is authoritative on extract
  private runHaul: GearItem[] = []; // gear found this run — unbanked, lost on death
  private bankedGold = 0;
  private pendingIdle?: IdleGains;
  private over = false;

  private heroSprite!: Phaser.GameObjects.Image;
  private monsterSprite!: Phaser.GameObjects.Image;
  private monsterSpec: CharSpec = MONSTER_SPECS.grunt;
  private bars!: Phaser.GameObjects.Graphics;
  private depthText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private haulText!: Phaser.GameObjects.Text;
  private attackTimer = ATTACK_INTERVAL_MS;

  constructor() {
    super('LaneScene');
  }

  init(data: { hero?: Hero; idle?: IdleGains }): void {
    this.hero = data.hero ?? {
      class: 'squire', level: 1, xp: 0, xpToNext: 20, hp: 40, maxHp: 40,
      attack: 6, defense: 5, critChance: TUNING.combat.critChance * 100, lifesteal: 0,
      gold: 0, bestDepth: 1, stash: [], equipped: {},
    };
    if (data.idle) this.pendingIdle = data.idle;
    this.bankedGold = this.hero.gold;
    this.heroC = {
      hp: this.hero.maxHp, maxHp: this.hero.maxHp,
      attack: this.hero.attack, defense: this.hero.defense,
      critChance: this.hero.critChance, lifesteal: this.hero.lifesteal,
    };
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

  // ---- per-frame auto-battle -------------------------------------------------

  override update(_time: number, delta: number): void {
    if (this.over) return;
    this.attackTimer -= delta;
    if (this.attackTimer > 0) return;
    this.attackTimer = ATTACK_INTERVAL_MS;

    // Hero strikes the monster (crit from the hero's derived critChance stat).
    const hit = rollDamage(this.heroC.attack, this.monster.defense, this.heroC.critChance);
    this.monster.hp -= hit.dmg;
    this.hitFx(this.heroSprite, 1);
    this.floatNumber(
      MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24,
      hit.crit ? `${hit.dmg}!` : `${hit.dmg}`, hit.crit ? '#ffd84a' : '#ffffff'
    );

    // Lifesteal — recover a slice of damage dealt (behavioral stat hook).
    if (this.heroC.lifesteal > 0 && this.heroC.hp < this.heroC.maxHp) {
      const leech = Math.round((hit.dmg * this.heroC.lifesteal) / 100);
      if (leech > 0) {
        this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + leech);
        this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `+${leech}`, '#7fe0a0');
      }
    }

    if (this.monster.hp <= 0) {
      this.onMonsterDead();
      this.refreshHud();
      return;
    }

    // The monster strikes back.
    const back = rollDamage(this.monster.attack, this.heroC.defense, this.monster.critChance);
    this.heroC.hp -= back.dmg;
    this.hitFx(this.monsterSprite, -1);
    this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `${back.dmg}`, '#ff6b6b');

    if (this.heroC.hp <= 0) this.die();
    this.refreshHud();
  }

  private onMonsterDead(): void {
    const m = monsterForDepth(this.depth);
    this.runGold += m.gold;
    this.floatNumber(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 24, `+${m.gold}◆`, '#ffe066');

    // Loot roll — unbanked haul the EXTRACT decision protects (lost on death).
    const drop = rollDrop(this.depth, m.kind === 'swarm', Math.random);
    if (drop) {
      this.runHaul.push(drop);
      this.dropToast(drop);
    }

    // Heal-on-kill — recover a slice of HP so runs breathe toward a deep wall.
    const heal = Math.round(this.heroC.maxHp * TUNING.combat.healOnKillPct);
    if (heal > 0 && this.heroC.hp < this.heroC.maxHp) {
      this.heroC.hp = Math.min(this.heroC.maxHp, this.heroC.hp + heal);
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, `+${heal}`, '#5bd06a');
    }

    this.depth += 1; // auto-advance deeper (idle)
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
    this.heroC.maxHp = this.hero.maxHp;
    this.heroC.attack = this.hero.attack;
    this.heroC.defense = this.hero.defense;
    this.heroC.critChance = this.hero.critChance;
    this.heroC.lifesteal = this.hero.lifesteal;
    if (this.heroC.hp > this.heroC.maxHp) this.heroC.hp = this.heroC.maxHp;
  }

  /** Recompute the hero's derived stats from class + level + gear (offline path). */
  private rederiveHero(): void {
    const d = deriveStats(this.hero.class, this.hero.level, this.hero.equipped);
    this.hero.maxHp = d.maxHp;
    this.hero.attack = d.attack;
    this.hero.defense = d.defensePct;
    this.hero.critChance = d.critChance;
    this.hero.lifesteal = d.lifestealPct;
    if (this.hero.hp > this.hero.maxHp) this.hero.hp = this.hero.maxHp;
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
    this.monster = {
      hp: m.hp, maxHp: m.hp, attack: m.attack, defense: m.defense,
      critChance: TUNING.combat.critChance * 100, lifesteal: 0,
    };
    const spec = MONSTER_SPECS[m.kind];
    this.monsterSpec = spec;
    const scale = specScale(spec);
    this.monsterSprite
      .setTexture(spec.key)
      .setOrigin(spec.originX, spec.originY)
      .setScale(scale * 0.6);
    this.tweens.add({ targets: this.monsterSprite, scale, duration: 220, ease: 'Back.out' });
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
      .text(MONSTER_X, GROUND_Y - this.monsterSpec.displayH - 70, `${prefix} ${item.name}`, {
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

/** Damage = attack * (1 - defense%), ± variance, crit chance × mult, min 1.
 *  `critChancePct` is the attacker's whole-percent crit chance (base + gear);
 *  other knobs from TUNING.combat. Returns the rolled damage and whether it crit. */
function rollDamage(
  attack: number,
  defensePct: number,
  critChancePct: number = TUNING.combat.critChance * 100
): { dmg: number; crit: boolean } {
  const c = TUNING.combat;
  let dmg = attack * (1 - defensePct / 100);
  dmg *= 1 - c.damageVariance + Math.random() * (2 * c.damageVariance);
  const crit = Math.random() < critChancePct / 100;
  if (crit) dmg *= c.critMultiplier;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}
