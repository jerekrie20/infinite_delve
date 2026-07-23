import Phaser from 'phaser';
import type { CombatTurn, GearSlot, Hero } from '../../shared/delve';
import { formatShort } from '../ui/format';
import { openItemPopup } from '../ui/gear';
import { ACTIVES } from '../../shared/content/actives';

/** Live combat + hero state the HUD paints from. LaneScene emits this shape on
 *  the 'hud-changed' game event; the HUD only reads it. */
export interface HudSnapshot {
  depth: number;
  bankedGold: number;
  /** Unbanked gold earned this run (surfaced on the EXTRACT button). */
  runGold: number;
  /** Unbanked gear count this run (Bag badge). */
  haulCount: number;
  hp: number;
  maxHp: number;
  hero: Hero;
  /** Last 5 combat turns for the summary tab. */
  combatTurns?: CombatTurn[];
}

/** The main-page HUD rendered as Phaser canvas objects, skinned with the wooden
 *  UI kit via ui-map.json (role → atlas frame + nine-slice insets + bar fills).
 *  Runs on top of LaneScene; driven by the same 'hud-changed'/'hero-changed'
 *  events the scene emits. Replaces the old HTML/CSS HUD. */

interface Slice { left: number; top: number; right: number; bottom: number }
interface Role { frame: string; slice?: Slice; fill?: string }
interface UiMap { roles: Record<string, Role> }

export interface HudHooks {
  openGear: () => void;
  openBase: () => void;
  openMenu: () => void;
  cast: (abilityId: string) => void;
}

const DEFAULT_SLICE: Slice = { left: 8, top: 8, right: 8, bottom: 8 };

/** Six real equip slots shown inline + two locked placeholders = 8-cell grid. */
const GEAR_SLOTS: GearSlot[] = ['hand1', 'hand2', 'body', 'head', 'legs', 'feet', 'belt', 'ring1', 'ring2', 'amulet'];
const RARITY_HEX: Record<string, number> = {
  common: 0xc8c8c8, uncommon: 0x5bd06a, rare: 0x4aa3ff, epic: 0xb45bff, legendary: 0xffb020,
};
const SET_HEX = 0x2ecf7f;
const UNIQUE_HEX = 0xff8a3d;

export class HudScene extends Phaser.Scene {
  private map!: Record<string, Role>;
  private hooks!: HudHooks;
  private hero!: Hero;
  private hp = 40;
  private maxHp = 40;

  private depthText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private barGfx!: Phaser.GameObjects.Graphics;
  private tabSkills!: Phaser.GameObjects.NineSlice;
  private tabEquip!: Phaser.GameObjects.NineSlice;
  private tabSkillsText!: Phaser.GameObjects.Text;
  private tabEquipText!: Phaser.GameObjects.Text;
  private skillsView!: Phaser.GameObjects.Container;
  private equipView!: Phaser.GameObjects.Container;
  private summaryView!: Phaser.GameObjects.Container;
  private summaryTexts: Phaser.GameObjects.Text[] = [];
  private tabSummary!: Phaser.GameObjects.NineSlice;
  private tabSummaryText!: Phaser.GameObjects.Text;
  private gearDots: Array<Phaser.GameObjects.Arc | null> = [];
  private bagBadge!: Phaser.GameObjects.Container;
  private bagBadgeText!: Phaser.GameObjects.Text;

  // Skill slot state
  private skillSlots: Array<{
    bg: Phaser.GameObjects.Image;
    icon: Phaser.GameObjects.Text;
    label: Phaser.GameObjects.Text;
    mana: Phaser.GameObjects.Text;
    cdOverlay: Phaser.GameObjects.Graphics;
  }> = [];
  private cooldowns: Record<string, number> = {}; // abilityId → remaining ms

  constructor() {
    super('HudScene');
  }

  init(data: { hooks: HudHooks; hero: Hero }): void {
    this.hooks = data.hooks;
    this.hero = data.hero;
    this.hp = data.hero.hp;
    this.maxHp = data.hero.maxHp;
    this.cooldowns = {};
  }

  preload(): void {
    this.load.atlas('ui', 'ui-sheet.png', 'ui-sheet.json');
    this.load.json('uimap', 'ui-map.json');
  }

  create(): void {
    this.map = (this.cache.json.get('uimap') as UiMap)?.roles ?? {};

    this.buildTopBar();
    this.buildPanel();

    // Live data wiring (game-global bus; survives scene restarts).
    this.game.events.on('hud-changed', this.onHud, this);
    this.game.events.on('hero-changed', this.onHero, this);
    this.game.events.on('run-reset', () => { this.cooldowns = {}; }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('hud-changed', this.onHud, this);
      this.game.events.off('hero-changed', this.onHero, this);
      this.game.events.off('run-reset');
    });

    this.repaintAll();
  }

  // ---- role → object helpers -------------------------------------------------

  private nine(key: string, x: number, y: number, w: number, h: number): Phaser.GameObjects.NineSlice | null {
    const r = this.map[key];
    if (!r) { this.missing(x, y, w, h, key); return null; }
    const s = r.slice ?? DEFAULT_SLICE;
    return this.add
      .nineslice(x, y, 'ui', r.frame, w, h, s.left, s.right, s.top, s.bottom)
      .setOrigin(0, 0);
  }

  private icon(key: string, cx: number, cy: number, box: number): Phaser.GameObjects.Image | null {
    const r = this.map[key];
    if (!r) { this.missing(cx - box / 2, cy - box / 2, box, box, key); return null; }
    const img = this.add.image(cx, cy, 'ui', r.frame);
    const f = this.textures.getFrame('ui', r.frame);
    if (f) img.setScale(Math.min(box / f.width, box / f.height));
    return img;
  }

  private fillColor(key: string, fallback = 0x888888): number {
    const hex = this.map[key]?.fill;
    return hex ? Phaser.Display.Color.HexStringToColor(hex).color : fallback;
  }

  private missing(x: number, y: number, w: number, h: number, key: string): void {
    const g = this.add.graphics();
    g.lineStyle(2, 0xff5470, 1).strokeRect(x, y, w, h);
    this.add.text(x + w / 2, y + h / 2, key + '?', { fontFamily: 'monospace', fontSize: '14px', color: '#ff8aa0' })
      .setOrigin(0.5);
  }

  private label(x: number, y: number, str: string, size: number, color = '#ffffff', align: 'left' | 'center' | 'right' = 'left'): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, str, { fontFamily: 'Arial', fontSize: `${size}px`, color, fontStyle: 'bold' })
      .setResolution(2)
      .setShadow(0, 2, '#000000', 3);
    t.setOrigin(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    return t;
  }

  // ---- build -----------------------------------------------------------------

  private buildTopBar(): void {
    this.nine('topbarBg', 8, 12, 784, 84);
    this.icon('iconHome', 56, 54, 60)?.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.hooks.openBase());
    this.icon('iconMenu', 744, 54, 60)?.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.hooks.openMenu());
    this.label(400, 40, 'THE DELVE', 18, '#c9b8ff', 'center');
    this.depthText = this.label(400, 70, 'Depth 1', 30, '#ffffff', 'center');
  }

  private buildPanel(): void {
    this.nine('panelBg', 6, 812, 788, 468);

    // Tabs — three: Skills, Equip, Summary
    const tabW = 252;
    this.tabSkills = this.mkTab(6, 832, tabW, 60, 'skills');
    this.tabSkillsText = this.label(6 + tabW / 2, 862, '⚡ Skills', 22, '#ffffff', 'center');
    this.tabSummary = this.mkTab(6 + tabW, 832, tabW, 60, 'summary');
    this.tabSummaryText = this.label(6 + tabW * 1.5, 862, '📋 Summary', 22, '#b9add6', 'center');
    this.tabEquip = this.mkTab(6 + tabW * 2, 832, tabW, 60, 'equip');
    this.tabEquipText = this.label(6 + tabW * 2.5, 862, '🎒 Equip', 22, '#b9add6', 'center');

    this.skillsView = this.add.container(0, 0);
    this.equipView = this.add.container(0, 0);
    this.summaryView = this.add.container(0, 0);
    this.buildSkillsView();
    this.buildEquipView();
    this.buildSummaryView();
    this.setTab('skills');
  }

  private mkTab(x: number, y: number, w: number, h: number, which: 'skills' | 'equip' | 'summary'): Phaser.GameObjects.NineSlice {
    const n = this.nine(which === 'skills' ? 'tabActive' : 'tabInactive', x, y, w, h)!;
    n.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.setTab(which));
    return n;
  }

  private buildSkillsView(): void {
    // Three stat bars (drawn by barGfx; labels are static).
    this.barGfx = this.add.graphics();
    this.skillsView.add(this.barGfx);
    for (const [i, name] of ['XP', 'HP', 'MP'].entries()) {
      this.skillsView.add(this.label(40, 930 + i * 40 + 14, name, 20, '#9d8fc0', 'left'));
    }

    // Skill slots — real buttons for unlocked abilities, locked placeholder for rest.
    this.skillSlots = [];
    const size = 104, gap = (720 - size * 5) / 4;
    for (let i = 0; i < 5; i++) {
      const cx = 40 + size / 2 + i * (size + gap);
      const abilityId = this.hero.abilities[i] ?? null;
      const def = abilityId ? ACTIVES[abilityId] : null;

      // Slot background
      const bg = this.icon('skillSlot', cx, 1104, size);
      if (!bg) continue;
      if (!def) { bg.setTint(0x555555); bg.setAlpha(0.5); }
      this.skillsView.add(bg);

      const cdGfx = this.add.graphics();
      this.skillsView.add(cdGfx);

      if (def) {
        // Real ability button
        const icon = this.label(cx, 1088, def.icon, 30, '#ffffff', 'center');
        const label = this.label(cx, 1136, def.name, 16, '#d0c8e8', 'center');
        const mana = this.label(cx, 1152, `${def.manaCost}◆`, 14, '#4aa3ff', 'center');
        this.skillsView.add(icon);
        this.skillsView.add(label);
        this.skillsView.add(mana);
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tapSkill(i, abilityId!, def.manaCost, def.cooldownMs));
        this.skillSlots.push({ bg, icon, label, mana, cdOverlay: cdGfx });
      } else {
        // Locked placeholder
        const lock = this.label(cx, 1104, '🔒', 26, '#6f6690', 'center');
        this.skillsView.add(lock);
        this.skillSlots.push({ bg, icon: lock, label: lock, mana: lock, cdOverlay: cdGfx });
      }
    }
  }

  /** Tap a skill button — validate mana + cooldown, then fire. */
  private tapSkill(_idx: number, abilityId: string, manaCost: number, cdMs: number): void {
    if (this.cooldowns[abilityId] && this.cooldowns[abilityId]! > 0) return; // on cooldown
    if (this.hero.mana < manaCost) return; // insufficient mana
    this.cooldowns[abilityId] = cdMs;
    this.hooks.cast(abilityId);
  }

  private buildEquipView(): void {
    const size = 96, gap = 14;
    this.gearDots = [];
    for (let idx = 0; idx < 8; idx++) {
      const c = idx % 4, r = (idx / 4) | 0;
      const cx = 40 + size / 2 + c * (size + gap);
      const cy = 916 + size / 2 + r * (size + gap);
      const locked = idx >= 6;
      const slot = this.icon('gearSlot', cx, cy, size);
      if (slot) {
        if (locked) {
          slot.setTint(0x555555).setAlpha(0.5);
        } else {
          const gslot = GEAR_SLOTS[idx]!;
          slot.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tapSlot(gslot));
        }
        this.equipView.add(slot);
      }
      if (locked) {
        this.equipView.add(this.label(cx, cy, '🔒', 22, '#6f6690', 'center'));
        this.gearDots.push(null);
      } else {
        const dot = this.add.circle(cx + size / 2 - 12, cy - size / 2 + 12, 8, 0xffffff).setVisible(false);
        this.equipView.add(dot);
        this.gearDots.push(dot);
      }
    }

    // Right column: coin + gold, and the bag.
    const coin = this.icon('iconCoin', 520, 950, 48);
    if (coin) this.equipView.add(coin);
    this.moneyText = this.label(552, 950, '0', 30, '#ffe066', 'left');
    this.equipView.add(this.moneyText);

    const bag = this.icon('iconBag', 640, 1080, 96);
    if (bag) { bag.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.hooks.openGear()); this.equipView.add(bag); }

    // Unbanked-haul badge on the bag.
    this.bagBadge = this.add.container(676, 1044);
    const bg = this.add.circle(0, 0, 16, 0xffe066);
    this.bagBadgeText = this.add.text(0, 0, '0', { fontFamily: 'Arial', fontSize: '20px', color: '#120c1c', fontStyle: 'bold' }).setOrigin(0.5);
    this.bagBadge.add([bg, this.bagBadgeText]);
    this.bagBadge.setVisible(false);
    this.equipView.add(this.bagBadge);
  }

  // ---- tab switching ---------------------------------------------------------

  private buildSummaryView(): void {
    // 5 empty turn rows — filled by onHud from combatTurns
    for (let i = 0; i < 5; i++) {
      const y = 920 + i * 36;
      const t = this.label(40, y, '', 18, '#6f6690', 'left');
      this.summaryView.add(t);
      this.summaryTexts.push(t);
    }
  }

  private setTab(which: 'skills' | 'equip' | 'summary'): void {
    this.skillsView.setVisible(which === 'skills');
    this.equipView.setVisible(which === 'equip');
    this.summaryView.setVisible(which === 'summary');
    this.tabSkills.setTexture('ui', this.map[which === 'skills' ? 'tabActive' : 'tabInactive']?.frame);
    this.tabSummary.setTexture('ui', this.map[which === 'summary' ? 'tabActive' : 'tabInactive']?.frame);
    this.tabEquip.setTexture('ui', this.map[which === 'equip' ? 'tabActive' : 'tabInactive']?.frame);
    this.tabSkillsText.setColor(which === 'skills' ? '#ffffff' : '#b9add6');
    this.tabSummaryText.setColor(which === 'summary' ? '#ffffff' : '#b9add6');
    this.tabEquipText.setColor(which === 'equip' ? '#ffffff' : '#b9add6');
  }

  // ---- cooldown tick -----------------------------------------------------------

  override update(_time: number, delta: number): void {
    // Decrement ability cooldowns and redraw overlays.
    for (const [id, ms] of Object.entries(this.cooldowns)) {
      if (ms <= 0) continue;
      const remaining = ms - delta;
      this.cooldowns[id] = Math.max(0, remaining);
    }
    this.drawCooldowns();
  }

  private drawCooldowns(): void {
    const size = 104, gap = (720 - size * 5) / 4;
    for (let i = 0; i < 5; i++) {
      const slot = this.skillSlots[i];
      if (!slot) continue;
      const abilityId = this.hero.abilities[i] ?? null;
      const def = abilityId ? ACTIVES[abilityId] : null;
      const cd = abilityId ? (this.cooldowns[abilityId] ?? 0) : 0;

      const g = slot.cdOverlay;
      g.clear();
      if (cd > 0 && def) {
        const cx = 40 + size / 2 + i * (size + gap);
        // Dark overlay + remaining seconds text
        g.fillStyle(0x000000, 0.55);
        g.fillRoundedRect(cx - size / 2, 1104 - size / 2, size, size, 12);
        // We draw the text via the existing label (reuse icon text for cd display)
        slot.icon.setText(Math.ceil(cd / 1000).toString());
        slot.icon.setFontSize(22).setColor('#ffb020');
      } else if (def) {
        slot.icon.setText(def.icon).setFontSize(30).setColor('#ffffff');
        // Dim if insufficient mana
        if (this.hero.mana < def.manaCost) {
          g.fillStyle(0x000000, 0.3);
          const cx = 40 + size / 2 + i * (size + gap);
          g.fillRoundedRect(cx - size / 2, 1104 - size / 2, size, size, 12);
        }
      }
    }
  }

  // ---- live updates ----------------------------------------------------------

  private onHud(s: HudSnapshot): void {
    this.hero = s.hero;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.depthText.setText(`Depth ${s.depth}`);
    this.moneyText.setText(formatShort(s.bankedGold));
    if (s.haulCount > 0) { this.bagBadge.setVisible(true); this.bagBadgeText.setText(String(s.haulCount)); }
    else this.bagBadge.setVisible(false);
    this.drawBars();
    this.drawGear();
    this.drawSummary(s.combatTurns ?? []);
  }

  private onHero(h: Hero): void {
    this.hero = h;
    this.moneyText.setText(formatShort(h.gold));
    this.drawGear();
  }

  private repaintAll(): void {
    this.depthText.setText('Depth 1');
    this.moneyText.setText(formatShort(this.hero.gold));
    this.drawBars();
    this.drawGear();
  }

  private drawBars(): void {
    const g = this.barGfx;
    g.clear();
    const xpFrac = this.hero.xpToNext > 0 ? this.hero.xp / this.hero.xpToNext : 0;
    const hpFrac = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    const mpFrac = this.hero.maxMana > 0 ? this.hero.mana / this.hero.maxMana : 0;
    const rows: Array<[string, number]> = [['xpBar', xpFrac], ['hpBar', hpFrac], ['mpBar', mpFrac]];
    rows.forEach(([key, frac], i) => this.bar(g, key, 96, 930 + i * 40, 664, 26, frac));
  }

  /** Clean colored fill + dark track + light border (sprite kept for future ends). */
  private bar(g: Phaser.GameObjects.Graphics, key: string, x: number, y: number, w: number, h: number, frac: number): void {
    const r = h / 2;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(x, y, w, h, r);
    const f = Phaser.Math.Clamp(frac, 0, 1);
    if (f > 0) g.fillStyle(this.fillColor(key), 1).fillRoundedRect(x, y, Math.max(h, w * f), h, r);
    g.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(x, y, w, h, r);
  }

  private drawGear(): void {
    GEAR_SLOTS.forEach((slot, i) => {
      const dot = this.gearDots[i];
      if (!dot) return;
      const item = this.hero.equipped[slot];
      if (item) {
        const hex = item.unique ? UNIQUE_HEX : item.set ? SET_HEX : RARITY_HEX[item.r] ?? 0xffffff;
        dot.setVisible(true).setFillStyle(hex);
      } else dot.setVisible(false);
    });
  }

  private drawSummary(turns: import('../../shared/delve').CombatTurn[]): void {
    for (let i = 0; i < 5; i++) {
      const t = this.summaryTexts[i];
      if (!t) continue;
      const turn = turns[i];
      if (!turn) { t.setText('').setColor('#6f6690'); continue; }
      const fmt = (_side: 'hero' | 'monster', action: string, dmg: number, crit: boolean): string => {
        if (!action) return '—';
        if (action === 'dodged') return 'missed';
        if (action === 'blocked') return 'blocked';
        if (action === 'execute') return 'EXECUTED!';
        const d = `${dmg}${crit ? '💥' : ''}`;
        if (action === 'attack') return `hit ${d}`;
        return `${action} ${d}`;
      };
      const heroStr = fmt('hero', turn.heroAction, turn.heroDmg, turn.heroCrit);
      const monStr = fmt('monster', turn.monsterAction, turn.monsterDmg, turn.monsterCrit);
      const line = `D${turn.depth}  ⚔️${heroStr.padEnd(16)} 🛡️${monStr}`;
      t.setText(line);
      const heroWinning = turn.heroDmg > turn.monsterDmg;
      t.setColor(heroWinning ? '#5bd06a' : turn.heroDmg === turn.monsterDmg ? '#b9add6' : '#ff5470');
    }
  }

  /** Tap an equipped slot → item-detail popup (mobile inspect); empty → inventory. */
  private tapSlot(slot: GearSlot): void {
    const item = this.hero.equipped[slot];
    if (item) openItemPopup(item, { equipped: true });
    else this.hooks.openGear();
  }
}
