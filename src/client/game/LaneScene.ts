import Phaser from 'phaser';
import type { GearItem, GearSlot, Hero } from '../../shared/delve';
import type { IdleGains } from '../../shared/waves';
import { TUNING } from '../../shared/content/tuning';
import { itemName, sellValue } from '../../shared/content/items';
import { bankHaul, deriveStats, equipItem, sellItem, unequipSlot, type DerivedStats } from '../../shared/content/gear';
import { CombatEngine, type CombatEvent, type EngineSnapshot, type PackMemberView } from '../../shared/combat/engine';
import { STATUS_PRESETS } from '../../shared/combat/statuses';
import { ACTIVES } from '../../shared/content/actives';
import { seedFromString } from '../../shared/rng';
import { postEquip, postRunResult, postSell } from '../api';
import { enqueueRun, newRunId } from '../runQueue';
import { loadRotationOrder, saveRotationOrder } from '../rotation';

/** The side-view combat lane — a RENDERER of the shared combat engine (bible
 *  §1.4). All combat truth (timers, rotation, packs, statuses, drops) lives in
 *  src/shared/combat/engine.ts, seeded from the run's runId; this scene turns
 *  CombatEvents into sprites, floats, and tweens, and forwards taps back in.
 *  Never compute a combat rule here. Reward values are the server's; the
 *  client shows a matching preview. */

const DESIGN_W = 800;
const DESIGN_H = 1280;
// The lane sits in the upper portion of the canvas so the bottom control panel
// never covers the fighters.
const GROUND_Y = 640;
const HERO_X = 240;

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
const MONSTER_SPECS: Record<string, CharSpec> = {
  grunt: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
  swarm: { key: 'rat', originX: 0.5221, originY: 0.8676, nativeH: 97, displayH: 140 },
  brute: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 140 },
  caster: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
};
const specScale = (s: CharSpec): number => s.displayH / s.nativeH;

/** Pack layout (D32): x slots by pack size, fronts first (engine orders the
 *  pack fronts-then-backs for casters). Back-row members render slightly
 *  smaller to read as distance. */
const PACK_X: Record<number, number[]> = {
  1: [620],
  2: [560, 700],
  3: [510, 630, 745],
};

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

const MONSTER_RARITY_COLORS: Record<string, string> = {
  normal: '#ffffff',
  elite: '#4aa3ff',
  boss: '#ffb020',
};

/** One rendered pack member: sprite + layout info for floats/bars. */
interface MonsterActor {
  view: PackMemberView;
  sprite: Phaser.GameObjects.Image;
  spec: CharSpec;
  x: number;
  dead: boolean;
}

export class LaneScene extends Phaser.Scene {
  private hero!: Hero;
  private heroDerived!: DerivedStats;
  private engine!: CombatEngine;
  private snap!: EngineSnapshot;
  /** Idempotency id for THIS run — the server banks each runId at most once,
   *  and the engine's seed derives from it (one canonical seed per run). */
  private runId = '';
  private rotationOrder: string[] = [];
  private bankedGold = 0;
  private pendingIdle?: IdleGains;
  private over = false;

  private heroSprite!: Phaser.GameObjects.Image;
  private actors = new Map<string, MonsterActor>();
  private bars!: Phaser.GameObjects.Graphics;
  private heroStatusText!: Phaser.GameObjects.Text;
  private choiceGroup!: Phaser.GameObjects.Container;

  /** Enable verbose combat logging in the browser console. Activate with ?debug=1
   *  in the URL, or set localStorage['delve_debug'] = '1'. */
  private debug = false;

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
      hpRegen: 0, goldFind: 0, mana: 50, maxMana: 50, abilities: ['slam'],
      gold: 0, bestDepth: 1, stash: [], equipped: {},
    };
    if (data.idle) this.pendingIdle = data.idle;
    this.bankedGold = this.hero.gold;
    this.heroDerived = deriveStats(this.hero.class, this.hero.level, this.hero.equipped);
    this.rotationOrder = loadRotationOrder(localStorage, this.hero.abilities);
    this.startEngine();
  }

  /** Fresh engine = fresh run: new runId, seed derived from it, depth 1.
   *  Reloads the rotation order from the hero's current abilities so newly
   *  unlocked actives (e.g. Fortify at level 5) are included immediately. */
  private startEngine(): void {
    this.runId = newRunId();
    this.rotationOrder = loadRotationOrder(localStorage, this.hero.abilities);
    this.engine = new CombatEngine({
      hero: this.hero,
      derived: this.heroDerived,
      seed: seedFromString(this.runId),
      rotationOrder: this.rotationOrder,
    });
    this.snap = this.engine.snapshot();
  }

  preload(): void {
    this.load.image('hero', 'spr_hero.png');
    this.load.image('goblin', 'spr_goblin.png');
    this.load.image('rat', 'spr_rat.png');
  }

  create(): void {
    this.drawBackground();

    this.heroSprite = this.add
      .image(HERO_X, GROUND_Y, HERO_SPEC.key)
      .setOrigin(HERO_SPEC.originX, HERO_SPEC.originY)
      .setScale(specScale(HERO_SPEC));
    this.idleBob(this.heroSprite, 0);

    this.bars = this.add.graphics();
    this.heroStatusText = this.add
      .text(HERO_X, GROUND_Y - HERO_SPEC.displayH - 44, '', { fontFamily: 'Arial', fontSize: '22px' })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 3);

    this.buildChoiceUI();

    // The engine buffered its first floorStart during construction — a zero-
    // advance step drains it so the opening pack renders.
    this.handleEvents(this.engine.step(0));
    this.refreshHud();

    // "Welcome back" — offline idle gains auto-collected by the server.
    if (this.pendingIdle && this.pendingIdle.gold > 0) {
      this.time.delayedCall(300, () => {
        const mins = Math.round(this.pendingIdle!.paidSeconds / 60);
        this.banner(`WELCOME BACK\n+${this.pendingIdle!.gold}◆  (${mins}m idle)`, '#ffe066');
      });
    }
  }

  // ---- frame loop: advance the engine, render its events ---------------------

  override update(_time: number, delta: number): void {
    if (this.over) return;
    this.handleEvents(this.engine.step(delta));
    this.refreshHud();
  }

  private handleEvents(events: CombatEvent[]): void {
    for (const e of events) {
      if (this.debug && e.type !== 'hit') console.log('[delve]', e);
      switch (e.type) {
        case 'floorStart': this.renderPack(e.pack); break;
        case 'hit': this.renderHit(e); break;
        case 'dodge': this.floatAt(e.targetId, 'DODGE', '#ffe066'); break;
        case 'block': this.floatAt(e.targetId, 'BLOCK', '#4aa3ff'); break;
        case 'cast': {
          const def = ACTIVES[e.abilityId];
          if (def) this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 50, `${def.name.toUpperCase()}!`, '#ffd84a');
          break;
        }
        case 'statusApplied': {
          const preset = STATUS_PRESETS[e.statusId];
          this.floatAt(e.targetId, `${preset.icon} ${preset.name}${e.stacks > 1 ? ` ×${e.stacks}` : ''}`, '#c9b8ff');
          break;
        }
        case 'statusResisted': this.floatAt(e.targetId, 'RESIST', '#9d8fc0'); break;
        case 'dotTick': this.floatAt(e.targetId, `${e.total}`, '#b45bff'); break;
        case 'heal':
          // Lifesteal/critHeal stay silent (float budget); big heals surface.
          if (e.reason === 'healOnKill' || e.reason === 'regen') {
            this.floatAt(e.targetId, `+${e.amount}`, '#5bd06a');
          }
          break;
        case 'shieldChanged': break; // bars repaint every frame
        case 'revive': this.floatAt(e.targetId, 'REVIVED!', '#ffe066'); break;
        case 'kill': {
          this.floatAt(e.targetId, `+${e.gold}◆`, '#ffe066');
          this.killActor(e.targetId);
          break;
        }
        case 'lootDrop': this.dropToast(e.item); break;
        case 'floorCleared': this.showChoice(); break;
        case 'runEnded':
          if (e.outcome === 'died') this.onDied(e.depthCleared);
          else void this.finishExtract(e.depthCleared, e.runGold, e.haul);
          break;
      }
    }
  }

  // ---- pack rendering --------------------------------------------------------

  private renderPack(pack: PackMemberView[]): void {
    for (const actor of this.actors.values()) {
      this.tweens.killTweensOf(actor.sprite);
      actor.sprite.destroy();
    }
    this.actors.clear();

    const xs = PACK_X[pack.length] ?? PACK_X[3]!;
    pack.forEach((view, i) => {
      const spec = MONSTER_SPECS[view.kind] ?? MONSTER_SPECS.grunt!;
      const x = xs[i] ?? 620;
      const bossScale = view.rarity === 'boss' ? 1.3 : 1.0;
      const rowScale = view.row === 'back' ? 0.88 : 1.0;
      const scale = specScale(spec) * bossScale * rowScale;
      const sprite = this.add
        .image(x, GROUND_Y, spec.key)
        .setOrigin(spec.originX, spec.originY)
        .setScale(scale * 0.6)
        .setTint(view.rarity === 'elite' ? 0x4aa3ff : view.rarity === 'boss' ? 0xffb020 : 0xffffff);
      this.tweens.add({ targets: sprite, scale, duration: 220, ease: 'Back.out' });
      this.idleBob(sprite, 150 + i * 120);
      this.actors.set(view.id, { view, sprite, spec, x, dead: false });
      this.floatNumber(x, GROUND_Y - spec.displayH - 55, view.name, MONSTER_RARITY_COLORS[view.rarity] ?? '#ffffff');
    });
  }

  private killActor(id: string): void {
    const actor = this.actors.get(id);
    if (!actor || actor.dead) return;
    actor.dead = true;
    this.tweens.killTweensOf(actor.sprite);
    this.tweens.add({ targets: actor.sprite, alpha: 0, y: actor.sprite.y + 14, duration: 260, ease: 'Quad.in' });
  }

  private renderHit(e: Extract<CombatEvent, { type: 'hit' }>): void {
    // Attacker lunge: hero lunges right, monsters lunge left.
    if (e.sourceId === 'hero') this.hitFx(this.heroSprite, 1);
    else {
      const src = this.actors.get(e.sourceId);
      if (src && !src.dead) this.hitFx(src.sprite, -1);
    }
    const label = e.crit ? `${e.dmg}!` : `${e.dmg}`;
    const color =
      e.targetId === 'hero' ? '#ff6b6b' : e.crit ? '#ffd84a' : '#ffffff';
    this.floatAt(e.targetId, label, color);
    if (this.debug) {
      console.log(`[delve] ${e.sourceId}→${e.targetId} ${e.action} ${e.dmg}${e.crit ? ' CRIT' : ''} (hp ${e.targetHp})`);
    }
  }

  // ---- run end ---------------------------------------------------------------

  private async finishExtract(cleared: number, runGold: number, haul: GearItem[]): Promise<void> {
    this.over = true;
    const runId = this.runId;
    const gearLine = haul.length ? `\n+${haul.length} gear` : '';
    const result = await postRunResult('extracted', cleared, haul, runId);
    if (result.status === 'ok') {
      const resp = result.resp;
      this.hero = resp.hero;
      this.bankedGold = resp.hero.gold;
      const eq = resp.gained.itemsEquipped ? `  (${resp.gained.itemsEquipped} equipped)` : '';
      this.banner(`EXTRACTED\n+${resp.gained.gold}◆${gearLine}${eq}`, '#5bd06a');
    } else {
      // Server unreachable/busy: bank locally so gear + power growth show. A
      // retryable failure is also QUEUED and re-posted (same runId) on next
      // boot — the run reaches the server instead of vanishing on reload.
      if (result.status === 'retryable') {
        enqueueRun(localStorage, {
          runId,
          outcome: 'extracted',
          depthReached: cleared,
          haul,
          queuedAt: Date.now(),
        });
      }
      bankHaul(this.hero, haul);
      this.hero.gold += runGold;
      this.rederiveHero();
      this.bankedGold = this.hero.gold;
      const syncNote = result.status === 'retryable' ? '\nrun saved — will sync' : '';
      this.banner(`EXTRACTED\n+${runGold}◆${gearLine}${syncNote}`, '#5bd06a');
    }
    this.resetRun();
    // Meta loop: nudge the Daily panel; and the gear panel (power may have grown).
    this.sys.game.events.emit('run-resolved', { outcome: 'extracted', reached: cleared });
    this.sys.game.events.emit('hero-changed', this.hero);
  }

  private onDied(reached: number): void {
    this.over = true;
    const runId = this.runId; // capture — resetRun rotates it before the post may settle
    // Depth reached still counts toward "deepest delve today" — record it, then
    // let the Daily panel repaint once the server write lands. A retryable
    // failure (offline, or a fast death hitting the 1/30s limit) is queued so
    // the depth still reaches the board later.
    void postRunResult('died', reached, [], runId).then((result) => {
      if (result.status === 'retryable') {
        enqueueRun(localStorage, {
          runId,
          outcome: 'died',
          depthReached: reached,
          haul: [],
          queuedAt: Date.now(),
        });
      }
      this.sys.game.events.emit('run-resolved', { outcome: 'died', reached });
    });
    this.banner('DIED', '#ff5470');
    this.time.delayedCall(1500, () => this.resetRun());
  }

  private resetRun(): void {
    this.over = false;
    this.choiceGroup.setVisible(false);
    this.hero.mana = this.hero.maxMana; // mana resets each run
    this.startEngine();
    this.handleEvents(this.engine.step(0));
    this.sys.game.events.emit('run-reset');
    this.refreshHud();
  }

  // ---- gear + rotation (the review panel / HUD drive these) ------------------

  /** Latest hero snapshot the gear panel reads. */
  getHeroSnapshot(): Hero {
    return this.hero;
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
  }

  /** Push fresh derives into the live engine (after gear/level change). */
  private syncHeroStats(): void {
    this.rederiveHero();
    this.engine.applyHeroUpdate(this.hero, this.heroDerived);
  }

  /** Queue a manual cast — the engine validates and fires it on the next beat. */
  castAbility(abilityId: string): void {
    if (this.over) return;
    this.engine.castAbility(abilityId);
  }

  /** Reorder the rotation priority (HUD editor) — applies live + persists. */
  setRotationOrder(order: string[]): void {
    this.rotationOrder = order;
    this.engine.setRotationOrder(order);
    saveRotationOrder(localStorage, order);
  }

  getRotationOrder(): string[] {
    return [...this.rotationOrder];
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
    this.sys.game.events.emit('hero-changed', this.hero);
  }

  // ---- continue / extract choice ---------------------------------------------

  private buildChoiceUI(): void {
    const Y = GROUND_Y + 40;
    this.choiceGroup = this.add.container(0, 0).setVisible(false).setDepth(100);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRect(0, Y - 50, DESIGN_W, 170);
    this.choiceGroup.add(bg);
    const label = this.add.text(DESIGN_W / 2, Y - 20, 'Continue or extract?', {
      fontFamily: 'Arial', fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 2, '#000000', 5);
    this.choiceGroup.add(label);
    const contBg = this.add.graphics();
    contBg.fillStyle(0x37b04f, 1);
    contBg.fillRoundedRect(DESIGN_W / 2 + 40, Y + 16, 160, 64, 12);
    this.choiceGroup.add(contBg);
    const contText = this.add.text(DESIGN_W / 2 + 120, Y + 48, '▶ Continue', {
      fontFamily: 'Arial', fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.choiceGroup.add(contText);
    const extBg = this.add.graphics();
    extBg.fillStyle(0xffb020, 1);
    extBg.fillRoundedRect(DESIGN_W / 2 - 200, Y + 16, 160, 64, 12);
    this.choiceGroup.add(extBg);
    const extText = this.add.text(DESIGN_W / 2 - 120, Y + 48, '◀ Extract', {
      fontFamily: 'Arial', fontSize: '26px', color: '#1a1a1a', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.choiceGroup.add(extText);
    const contZone = this.add.zone(DESIGN_W / 2 + 120, Y + 48, 160, 64)
      .setInteractive({ useHandCursor: true });
    contZone.on('pointerdown', () => this.doContinue());
    this.choiceGroup.add(contZone);
    const extZone = this.add.zone(DESIGN_W / 2 - 120, Y + 48, 160, 64)
      .setInteractive({ useHandCursor: true });
    extZone.on('pointerdown', () => this.doExtract());
    this.choiceGroup.add(extZone);
  }

  private showChoice(): void {
    const label = this.choiceGroup.getAt(1) as Phaser.GameObjects.Text;
    if (label) {
      const s = this.engine.snapshot();
      const risk = s.haulCount > 0
        ? ` · 🎒${s.haulCount} gear · +${s.runGold}◆ unbanked`
        : ` · +${s.runGold}◆ unbanked`;
      label.setText(`Continue deeper or extract?${risk}`);
    }
    this.choiceGroup.setVisible(true);
  }

  private hideChoice(): void {
    this.choiceGroup.setVisible(false);
  }

  private doContinue(): void {
    this.hideChoice();
    const next = this.engine.snapshot().depth + 1;
    this.floatNumber(DESIGN_W / 2, GROUND_Y - 120, `Depth ${next}`, '#4aa3ff');
    // Hero runs right off-screen, next pack runs in.
    this.tweens.add({
      targets: this.heroSprite, x: DESIGN_W + 80, duration: 500, ease: 'Quad.in',
      onComplete: () => {
        this.heroSprite.x = -80;
        this.handleEvents(this.engine.continueRun());
        this.tweens.add({
          targets: this.heroSprite, x: HERO_X, duration: 400, ease: 'Quad.out',
        });
        this.refreshHud();
      },
    });
  }

  private doExtract(): void {
    this.hideChoice();
    this.floatNumber(DESIGN_W / 2, GROUND_Y - 120, 'Running home…', '#ffb020');
    // Hero runs left off-screen → bank + reset.
    this.tweens.add({
      targets: this.heroSprite, x: -80, duration: 600, ease: 'Quad.in',
      onComplete: () => {
        this.heroSprite.x = HERO_X;
        this.handleEvents(this.engine.extract());
      },
    });
  }

  // ---- hud -------------------------------------------------------------------

  private refreshHud(): void {
    this.snap = this.engine.snapshot();
    // Push live combat values back into the hero object the HUD/panels read.
    this.hero.mana = this.snap.mana;
    this.hero.hp = this.snap.hero.hp;
    this.drawBars();
    this.drawStatuses();
    this.sys.game.events.emit('hud-changed', {
      depth: this.snap.depth,
      bankedGold: this.bankedGold,
      runGold: this.snap.runGold,
      haulCount: this.snap.haulCount,
      hp: this.snap.hero.hp,
      maxHp: this.snap.hero.maxHp,
      hero: this.hero,
      cooldowns: this.snap.cooldowns,
      recentHits: this.snap.recentHits,
    });
  }

  private drawBars(): void {
    this.bars.clear();
    this.bar(HERO_X, GROUND_Y - HERO_SPEC.displayH - 16, 96,
      this.snap.hero.hp / this.snap.hero.maxHp,
      this.snap.hero.shield / this.snap.hero.maxHp, 0x5bd06a);
    for (const m of this.snap.monsters) {
      const actor = this.actors.get(m.id);
      if (!actor || actor.dead || m.hp <= 0) continue;
      this.bar(actor.x, GROUND_Y - actor.spec.displayH - 16, 88,
        m.hp / m.maxHp, m.shield / m.maxHp, 0xff5470);
    }
  }

  /** HP bar with a grey shield overlay segment after the HP fill (statuses.md:
   *  shield renders on the bar, not as an icon). */
  private bar(cx: number, y: number, w: number, hpFrac: number, shieldFrac: number, color: number): void {
    const f = Phaser.Math.Clamp(hpFrac, 0, 1);
    const s = Phaser.Math.Clamp(shieldFrac, 0, 1 - f);
    this.bars.fillStyle(0x000000, 0.55);
    this.bars.fillRoundedRect(cx - w / 2 - 3, y - 3, w + 6, 16, 5);
    this.bars.fillStyle(0x2a2a2a, 1);
    this.bars.fillRoundedRect(cx - w / 2, y, w, 10, 3);
    this.bars.fillStyle(color, 1);
    this.bars.fillRoundedRect(cx - w / 2, y, w * f, 10, 3);
    if (s > 0) {
      this.bars.fillStyle(0xc8c8d8, 1);
      this.bars.fillRoundedRect(cx - w / 2 + w * f, y, w * s, 10, 3);
    }
  }

  /** Status icon rows: emoji + stack counts under each HP bar (cap 6 + "+N");
   *  real 24px icons land with the art phase-1/2 pass. */
  private drawStatuses(): void {
    this.heroStatusText.setText(statusLine(this.snap.hero.statuses));
    this.heroStatusText.setPosition(HERO_X, GROUND_Y - HERO_SPEC.displayH - 44);
    // Monster statuses ride the float texts (perf budget: one text per side).
  }

  // ---- visuals ---------------------------------------------------------------

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x241a3a, 0x241a3a, 0x120c1c, 0x120c1c, 1);
    g.fillRect(0, 0, DESIGN_W, DESIGN_H);
    g.fillStyle(0xffffff, 1);
    // Cosmetic-only randomness (stars) — allowed outside the seeded engine.
    for (let i = 0; i < 60; i++) {
      const sx = Math.random() * DESIGN_W;
      const sy = Math.random() * (GROUND_Y - 120);
      g.fillCircle(sx, sy, Math.random() < 0.2 ? 2 : 1);
    }
    g.fillStyle(0x3a7a3f, 1);
    g.fillRect(0, GROUND_Y, DESIGN_W, DESIGN_H - GROUND_Y);
    g.fillStyle(0x54a95b, 1);
    g.fillRect(0, GROUND_Y, DESIGN_W, 16);
    // Soft ground shadow under the hero (monster shadows move with packs).
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(HERO_X, GROUND_Y - 2, 96, 22);
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

  /** Float text above an entity by id ('hero' or a pack member id). */
  private floatAt(entityId: string, label: string, color: string): void {
    if (entityId === 'hero') {
      this.floatNumber(HERO_X, GROUND_Y - HERO_SPEC.displayH - 24, label, color);
      return;
    }
    const actor = this.actors.get(entityId);
    if (!actor) return;
    this.floatNumber(actor.x, GROUND_Y - actor.spec.displayH - 24, label, color);
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
      .text(620, GROUND_Y - 200, `${prefix} ${itemName(item)}`, {
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

/** Join a status list into one emoji line, capped at 6 icons + "+N" (HUD rule
 *  in status-effects.md). Shield is excluded — it renders on the HP bar. */
function statusLine(statuses: Array<{ id: string; stacks: number }>): string {
  const icons = statuses
    .filter((s) => s.id !== 'shield')
    .map((s) => {
      const preset = STATUS_PRESETS[s.id as keyof typeof STATUS_PRESETS];
      const icon = preset?.icon ?? '✨';
      return s.stacks > 1 ? `${icon}${s.stacks}` : icon;
    });
  const shown = icons.slice(0, 6).join(' ');
  return icons.length > 6 ? `${shown} +${icons.length - 6}` : shown;
}
