import Phaser from 'phaser';
import type { Hero } from '../../shared/delve';
import { monsterForDepth, type IdleGains } from '../../shared/waves';
import { postRunResult } from '../api';

/** The side-view idle combat lane. Auto-battles down through depths (one monster
 *  per depth); the player's only choice is when to EXTRACT (bank) before the
 *  deepening monsters kill them. Reward values are the server's; the client
 *  shows a matching preview. Placeholder art (drawn shapes) — real PixelLab art
 *  next. */

const DESIGN_W = 800;
const DESIGN_H = 1280;
const GROUND_Y = 940;
const HERO_X = 240;
const MONSTER_X = 580;
const HERO_H = 96;
const MONSTER_H = 74;
const ATTACK_INTERVAL_MS = 600;

interface Combatant {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
}

export class LaneScene extends Phaser.Scene {
  private hero!: Hero;
  private heroC!: Combatant;
  private monster!: Combatant;
  private depth = 1; // depth of the monster currently being fought (1-indexed)
  private runGold = 0; // local preview; server is authoritative on extract
  private bankedGold = 0;
  private pendingIdle?: IdleGains;
  private over = false;

  private heroSprite!: Phaser.GameObjects.Container;
  private monsterSprite!: Phaser.GameObjects.Container;
  private bars!: Phaser.GameObjects.Graphics;
  private depthText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private attackTimer = ATTACK_INTERVAL_MS;

  constructor() {
    super('LaneScene');
  }

  init(data: { hero?: Hero; idle?: IdleGains }): void {
    this.hero = data.hero ?? {
      class: 'squire', level: 1, xp: 0, xpToNext: 20, hp: 30, maxHp: 30,
      attack: 6, defense: 5, gold: 0, bestDepth: 1, stash: [], equipped: {},
    };
    if (data.idle) this.pendingIdle = data.idle;
    this.bankedGold = this.hero.gold;
    this.heroC = {
      hp: this.hero.maxHp, maxHp: this.hero.maxHp,
      attack: this.hero.attack, defense: this.hero.defense,
    };
  }

  create(): void {
    this.drawBackground();

    this.heroSprite = this.makeChar(HERO_X, GROUND_Y, 0x5bd06a, 66, HERO_H, 1);
    this.monsterSprite = this.makeChar(MONSTER_X, GROUND_Y, 0x9b5bd0, 72, MONSTER_H, -1);
    this.bars = this.add.graphics();

    this.idleBob(this.heroSprite, 0);
    this.idleBob(this.monsterSprite, 250);

    this.depthText = this.add
      .text(DESIGN_W / 2, 96, 'DEPTH 1', {
        fontFamily: 'Arial', fontSize: '46px', color: '#ffffff', fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 6);

    this.goldText = this.add
      .text(DESIGN_W - 40, 96, '', {
        fontFamily: 'Arial', fontSize: '38px', color: '#ffe066', fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setShadow(0, 2, '#000000', 5);

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

    // Hero strikes the monster.
    const dmgToMonster = rollDamage(this.heroC.attack, this.monster.defense);
    this.monster.hp -= dmgToMonster;
    this.hitFx(this.heroSprite, 1);
    this.floatNumber(MONSTER_X, GROUND_Y - MONSTER_H - 40, `${dmgToMonster}`, '#ffffff');

    if (this.monster.hp <= 0) {
      this.onMonsterDead();
      this.refreshHud();
      return;
    }

    // The monster strikes back.
    const dmgToHero = rollDamage(this.monster.attack, this.heroC.defense);
    this.heroC.hp -= dmgToHero;
    this.hitFx(this.monsterSprite, -1);
    this.floatNumber(HERO_X, GROUND_Y - HERO_H - 40, `${dmgToHero}`, '#ff6b6b');

    if (this.heroC.hp <= 0) this.die();
    this.refreshHud();
  }

  private onMonsterDead(): void {
    this.runGold += monsterForDepth(this.depth).gold;
    this.floatNumber(MONSTER_X, GROUND_Y - MONSTER_H - 40, `+${monsterForDepth(this.depth).gold}◆`, '#ffe066');
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
    const resp = await postRunResult('extracted', cleared);
    if (resp) {
      this.bankedGold = resp.hero.gold;
      this.hero = resp.hero;
      this.banner(`EXTRACTED\n+${resp.gained.gold}◆`, '#5bd06a');
    } else {
      this.bankedGold += this.runGold; // offline fallback
      this.banner(`EXTRACTED\n+${this.runGold}◆`, '#5bd06a');
    }
    this.resetRun();
    // Meta loop: the server has recorded this run (awaited above) — nudge the
    // Daily panel to repaint the board + frontier.
    this.sys.game.events.emit('run-resolved', { outcome: 'extracted', reached: cleared });
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
    this.heroC.hp = this.heroC.maxHp;
    this.attackTimer = ATTACK_INTERVAL_MS;
    this.spawnMonster();
    this.refreshHud();
  }

  // ---- spawning / hud --------------------------------------------------------

  private spawnMonster(): void {
    const m = monsterForDepth(this.depth);
    this.monster = { hp: m.hp, maxHp: m.hp, attack: m.attack, defense: m.defense };
    this.monsterSprite.setScale(0.6);
    this.tweens.add({ targets: this.monsterSprite, scale: 1, duration: 220, ease: 'Back.out' });
  }

  private refreshHud(): void {
    this.depthText.setText(`DEPTH ${this.depth}`);
    this.goldText.setText(`◆ ${this.bankedGold}  (+${this.runGold})`);
    this.drawBars();
  }

  private drawBars(): void {
    this.bars.clear();
    this.bar(HERO_X, GROUND_Y - HERO_H - 26, 96, this.heroC.hp / this.heroC.maxHp, 0x5bd06a);
    this.bar(MONSTER_X, GROUND_Y - MONSTER_H - 26, 88, this.monster.hp / this.monster.maxHp, 0xff5470);
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

  private makeChar(
    x: number, y: number, color: number, w: number, h: number, faceDir: number
  ): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, 6, w * 1.15, 20);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h, w, h, 14);
    g.fillStyle(0x000000, 0.16);
    g.fillRoundedRect(-w / 2 + 8, -h + 16, w - 16, h - 40, 10);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(faceDir * 8 - 8, -h + 40, 6);
    g.fillCircle(faceDir * 8 + 10, -h + 40, 6);
    g.fillStyle(0x111111, 1);
    g.fillCircle(faceDir * 8 - 8 + faceDir * 2, -h + 40, 3);
    g.fillCircle(faceDir * 8 + 10 + faceDir * 2, -h + 40, 3);
    return this.add.container(x, y, [g]);
  }

  private idleBob(target: Phaser.GameObjects.Container, delayMs: number): void {
    this.tweens.add({
      targets: target, y: target.y - 8, duration: 700, yoyo: true,
      repeat: -1, ease: 'Sine.inOut', delay: delayMs,
    });
  }

  private hitFx(attacker: Phaser.GameObjects.Container, dir: number): void {
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

/** Damage = attack * (1 - defense%), ±10% variance, 5% crit x1.5, min 1. */
function rollDamage(attack: number, defensePct: number): number {
  let dmg = attack * (1 - defensePct / 100);
  dmg *= 0.9 + Math.random() * 0.2;
  if (Math.random() < 0.05) dmg *= 1.5;
  return Math.max(1, Math.round(dmg));
}
