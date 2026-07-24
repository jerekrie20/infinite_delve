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
import { bossForDepth } from '../../shared/content/monsters';
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
const HERO_SPEC: CharSpec = { key: 'hero', originX: 0.5136, originY: 0.75, nativeH: 90, displayH: 150 };
const MONSTER_SPECS: Record<string, CharSpec> = {
  grunt: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
  swarm: { key: 'rat', originX: 0.5221, originY: 0.8676, nativeH: 97, displayH: 140 },
  brute: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 140 },
  caster: { key: 'goblin', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
};
const specScale = (s: CharSpec): number => s.displayH / s.nativeH;

/** Per-TEMPLATE sprite specs, keyed by a monster template's `sprite` field
 *  (roster.md). Origins from scratchpad/bbox.mjs (opaque center + feet). Falls
 *  back to the kind-based MONSTER_SPECS below for templates without bespoke art.
 *  Goblin Camp theme (D25) authored 2026-07-23. */
const SPRITE_SPECS: Record<string, CharSpec> = {
  goblin_scout: { key: 'goblin_scout', originX: 0.4375, originY: 0.9375, nativeH: 108, displayH: 128 },
  goblin_brute: { key: 'goblin_brute', originX: 0.4805, originY: 0.9375, nativeH: 111, displayH: 150 },
  goblin_shaman: { key: 'goblin_shaman', originX: 0.4727, originY: 0.9375, nativeH: 117, displayH: 134 },
  goblin_chief: { key: 'goblin_chief', originX: 0.4969, originY: 0.925, nativeH: 142, displayH: 150 },
  // Crypt (11-20)
  skeleton: { key: 'skeleton', originX: 0.3789, originY: 0.9688, nativeH: 120, displayH: 130 },
  skeleton_capt: { key: 'skeleton_capt', originX: 0.4961, originY: 0.9609, nativeH: 112, displayH: 148 },
  ghoul: { key: 'ghoul', originX: 0.4961, originY: 0.9766, nativeH: 121, displayH: 128 },
  necromancer: { key: 'necromancer', originX: 0.475, originY: 0.9563, nativeH: 144, displayH: 150 },
  // Warrens (21-30)
  giant_rat: { key: 'giant_rat', originX: 0.5195, originY: 0.9063, nativeH: 95, displayH: 112 },
  plague_rat: { key: 'plague_rat', originX: 0.5586, originY: 0.9063, nativeH: 99, displayH: 112 },
  tunnel_horror: { key: 'tunnel_horror', originX: 0.4922, originY: 0.9609, nativeH: 117, displayH: 148 },
  broodmother: { key: 'broodmother', originX: 0.5125, originY: 0.9187, nativeH: 134, displayH: 150 },
  // Deep (31-40)
  wraith: { key: 'wraith', originX: 0.5195, originY: 0.9063, nativeH: 106, displayH: 138 },
  deep_stalker: { key: 'deep_stalker', originX: 0.4766, originY: 0.9922, nativeH: 122, displayH: 132 },
  gloom_caller: { key: 'gloom_caller', originX: 0.4883, originY: 0.9609, nativeH: 109, displayH: 132 },
  hollow_king: { key: 'hollow_king', originX: 0.5156, originY: 0.9563, nativeH: 148, displayH: 155 },
  // Volcanic (41-50)
  magma_imp: { key: 'magma_imp', originX: 0.4922, originY: 0.9453, nativeH: 118, displayH: 122 },
  cinder_brute: { key: 'cinder_brute', originX: 0.4961, originY: 0.9609, nativeH: 116, displayH: 150 },
  flame_adept: { key: 'flame_adept', originX: 0.4375, originY: 0.9531, nativeH: 119, displayH: 134 },
  pyre_tyrant: { key: 'pyre_tyrant', originX: 0.5, originY: 0.9563, nativeH: 146, displayH: 158 },
  // Abyss (51-60)
  void_spawn: { key: 'void_spawn', originX: 0.5117, originY: 0.8203, nativeH: 85, displayH: 120 },
  abyss_knight: { key: 'abyss_knight', originX: 0.4023, originY: 0.9609, nativeH: 119, displayH: 150 },
  null_witch: { key: 'null_witch', originX: 0.4922, originY: 0.9375, nativeH: 112, displayH: 136 },
  herald_abyss: { key: 'herald_abyss', originX: 0.5563, originY: 0.9688, nativeH: 153, displayH: 158 },
};
/** The two diegetic choice doors (D3/D33): tapping them in the cleared lane
 *  extracts (left, amber "surface") or descends (right, theme-glow "deeper") —
 *  replaces the old flat button band. Origins from bbox.mjs. */
const DOOR = {
  extract: { key: 'door_extract', x: 108, originX: 0.5594, originY: 0.8795, nativeH: 179, displayH: 190 },
  descend: { key: 'door_descend', x: 700, originX: 0.525, originY: 0.8527, nativeH: 170, displayH: 190 },
};

/** Sprite keys for themes 2-6 whose PNG file name matches the key (preloaded in
 *  a loop). Goblin Camp loads separately because its boss file name differs. */
const THEME_MONSTER_KEYS = [
  'skeleton', 'skeleton_capt', 'ghoul', 'necromancer',
  'giant_rat', 'plague_rat', 'tunnel_horror', 'broodmother',
  'wraith', 'deep_stalker', 'gloom_caller', 'hollow_king',
  'magma_imp', 'cinder_brute', 'flame_adept', 'pyre_tyrant',
  'void_spawn', 'abyss_knight', 'null_witch', 'herald_abyss',
];

/** Theme id for a depth (roster.md bands). Only goblin_camp has bespoke decor
 *  art so far; the palette table covers all six so the "darkening descent"
 *  (ART_BIBLE §3) reads even before later themes get their props. */
function themeForDepth(depth: number): string {
  if (depth <= 10) return 'goblin_camp';
  if (depth <= 20) return 'crypt';
  if (depth <= 30) return 'warrens';
  if (depth <= 40) return 'deep';
  if (depth <= 50) return 'volcanic';
  return 'abyss';
}

/** Backdrop palette per theme (ART_BIBLE §3): base darkens with depth, each
 *  theme owns one luminous glow accent. `glow` is the reward/light color. */
interface ThemePalette { top: number; bottom: number; ground: number; groundEdge: number; glow: number; }
const THEME_PALETTES: Record<string, ThemePalette> = {
  goblin_camp: { top: 0x2c2016, bottom: 0x120c08, ground: 0x362718, groundEdge: 0x5a4326, glow: 0xff8a3d },
  crypt: { top: 0x24243c, bottom: 0x0e0e18, ground: 0x2a2a3c, groundEdge: 0x45456a, glow: 0x9db8ff },
  warrens: { top: 0x2a2410, bottom: 0x120f06, ground: 0x2e2a14, groundEdge: 0x4d4a1e, glow: 0xc4d24a },
  deep: { top: 0x0e1a24, bottom: 0x05090e, ground: 0x122029, groundEdge: 0x1e3a44, glow: 0x2fd6c4 },
  volcanic: { top: 0x241210, bottom: 0x0e0605, ground: 0x2a1512, groundEdge: 0x5a221a, glow: 0xff6a2a },
  abyss: { top: 0x140a1e, bottom: 0x050308, ground: 0x160b22, groundEdge: 0x2e1a44, glow: 0xb060ff },
};
/** Decor props placed on a theme's backdrop (behind the fighters). `originY`
 *  from bbox.mjs pins the prop's feet to the ground; `glow` (px radius) adds a
 *  soft light pool for luminous props (braziers). */
interface DecorSpec { key: string; file: string; x: number; scale: number; originY: number; glow?: number; }
const THEME_DECOR: Record<string, DecorSpec[]> = {
  goblin_camp: [
    { key: 'decor_goblin_brazier', file: 'decor/goblin_brazier.png', x: 96, scale: 1.15, originY: 0.8542, glow: 150 },
    { key: 'decor_goblin_totem', file: 'decor/goblin_totem.png', x: 712, scale: 1.05, originY: 0.9609 },
  ],
  crypt: [
    { key: 'decor_crypt_bones', file: 'decor/crypt_bones.png', x: 96, scale: 1.1, originY: 0.9063, glow: 140 },
    { key: 'decor_crypt_gravestone', file: 'decor/crypt_gravestone.png', x: 712, scale: 1.1, originY: 0.9583 },
  ],
  warrens: [
    { key: 'decor_warrens_fungus', file: 'decor/warrens_fungus.png', x: 96, scale: 1.1, originY: 0.9063, glow: 140 },
    { key: 'decor_warrens_nest', file: 'decor/warrens_nest.png', x: 712, scale: 1.1, originY: 0.8333 },
  ],
  deep: [
    { key: 'decor_deep_crystal', file: 'decor/deep_crystal.png', x: 96, scale: 1.1, originY: 0.9375, glow: 160 },
    { key: 'decor_deep_stalagmite', file: 'decor/deep_stalagmite.png', x: 712, scale: 1.05, originY: 0.9609 },
  ],
  volcanic: [
    { key: 'decor_volcanic_vent', file: 'decor/volcanic_vent.png', x: 96, scale: 1.15, originY: 0.8854, glow: 170 },
    { key: 'decor_volcanic_rock', file: 'decor/volcanic_rock.png', x: 712, scale: 1.1, originY: 0.8542 },
  ],
  abyss: [
    { key: 'decor_abyss_crystal', file: 'decor/abyss_crystal.png', x: 96, scale: 1.1, originY: 0.9063, glow: 170 },
    { key: 'decor_abyss_pillar', file: 'decor/abyss_pillar.png', x: 712, scale: 1.05, originY: 0.9609 },
  ],
};

/** Status + passive-badge icons (24px grim-glow pixel art, public/icons/, D27).
 *  Keyed by status id OR monster passive stat id; several passives reuse a
 *  status icon where the concept is identical (hpRegen→regen, burnChance→burn,
 *  slowOnHit→slow). Filenames are the deduped values loaded in preload(). */
const ICON_FILE: Record<string, string> = {
  // statuses (status-effects.md)
  poison: 'poison', burn: 'burn', bleed: 'bleed', shock: 'shock', stun: 'stun',
  slow: 'slow', weaken: 'weaken', armorBreak: 'armorBreak', mark: 'mark',
  curse: 'curse', fortify: 'fortify', rage: 'rage', haste: 'haste',
  regen: 'regen', undying: 'undying', statMod: 'empowered',
  // elite/boss passive-badge stats (D34; roster passive pools)
  thornsPct: 'thorns', blockChance: 'block', counterAttackPct: 'counter',
  dodgeChance: 'dodge', doubleStrikeChance: 'doublestrike',
  executeThreshold: 'execute', explodeOnKill: 'explode', lifestealPct: 'lifesteal',
  reviveChance: 'revive', startingShield: 'barrier', statusResist: 'ward',
  hpRegen: 'regen', hpRegenPct: 'regen', burnChance: 'burn', slowOnHitPct: 'slow',
};
const ICON_FILES_UNIQUE = Array.from(new Set(Object.values(ICON_FILE)));
/** On-screen size of a status icon and the gap between icons in the row. */
const STATUS_ICON_PX = 26;
const STATUS_ICON_GAP = 30;

/** Render depths (backdrop -20 / decor -12 sit below these). Fighters draw at
 *  SPRITE_DEPTH with their contact shadow just beneath; HP bars sit ABOVE all
 *  fighters so a big boss can't hide its own bar. */
const SHADOW_DEPTH = -6;
const SPRITE_DEPTH = 0;
const BARS_DEPTH = 20;
/** Texture key for a status/passive id, or undefined if it has no icon yet. */
const iconKey = (id: string): string | undefined =>
  ICON_FILE[id] ? `icon-${ICON_FILE[id]}` : undefined;

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
  /** Y of the sprite's actual top (feet minus displayed opaque height, after
   *  boss/row scale) — HP bar, name, and badges anchor to this so they clear
   *  differently-sized sprites (bug: boss bars landed inside the sprite). */
  topY: number;
  /** Contact shadow planted at the feet so the sprite reads as grounded. */
  shadow: Phaser.GameObjects.Ellipse;
  /** Persistent elite/boss passive-badge icons above this actor (D34). */
  badges: Phaser.GameObjects.Image[];
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
  /** Set when an event floor's banner just showed — stretches the auto-
   *  continue delay so the result is readable. */
  private eventFloorShown = false;

  private heroSprite!: Phaser.GameObjects.Image;
  private actors = new Map<string, MonsterActor>();
  private bars!: Phaser.GameObjects.Graphics;
  /** Backdrop layer: a painted per-theme scene image (its foreground floor lands
   *  on GROUND_Y) when one exists, else the code gradient on `bg`. `bg` also
   *  carries the boss vignette + hero shadow. */
  private bg!: Phaser.GameObjects.Graphics;
  private bgImage: Phaser.GameObjects.Image | undefined;
  private decorSprites: Phaser.GameObjects.GameObject[] = [];
  private bgTheme = '';
  private bgBoss = false;
  /** Pooled hero status-icon row (max 6 icons + stack counts + "+N"). */
  private heroStatusIcons: { icon: Phaser.GameObjects.Image; count: Phaser.GameObjects.Text }[] = [];
  private heroStatusOverflow!: Phaser.GameObjects.Text;
  private choiceGroup!: Phaser.GameObjects.Container;
  /** Pulsing glow behind each choice door + the risk readout, refreshed per
   *  choice; the pulse tween is stopped when the choice is dismissed. */
  private extractGlow!: Phaser.GameObjects.Ellipse;
  private descendGlow!: Phaser.GameObjects.Ellipse;
  private choiceRisk!: Phaser.GameObjects.Text;
  private choicePulse: Phaser.Tweens.Tween | undefined;
  private fleeButton!: Phaser.GameObjects.Text;

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
      gold: 0, bestDepth: 1, checkpoints: [1], stash: [], equipped: {},
    };
    if (data.idle) this.pendingIdle = data.idle;
    this.bankedGold = this.hero.gold;
    this.heroDerived = deriveStats(this.hero.class, this.hero.level, this.hero.equipped);
    this.rotationOrder = loadRotationOrder(localStorage, this.hero.abilities);
    this.startEngine();
  }

  /** Fresh engine = fresh run: new runId, seed derived from it, at the chosen
   *  checkpoint depth (D4). Reloads the rotation order from the hero's current
   *  abilities so newly unlocked actives (e.g. Fortify at level 5) are included
   *  immediately. */
  private startEngine(startDepth = 1): void {
    this.runId = newRunId();
    this.rotationOrder = loadRotationOrder(localStorage, this.hero.abilities);
    this.engine = new CombatEngine({
      hero: this.hero,
      derived: this.heroDerived,
      seed: seedFromString(this.runId),
      rotationOrder: this.rotationOrder,
      startDepth,
    });
    this.snap = this.engine.snapshot();
  }

  preload(): void {
    this.load.image('hero', 'spr_hero.png');
    this.load.image('goblin', 'spr_goblin.png');
    this.load.image('rat', 'spr_rat.png');
    // Goblin Camp theme sprites (grim-glow, D25/D29). The chief's file name
    // differs from its sprite key, so these four load explicitly.
    this.load.image('goblin_scout', 'monsters/goblin_scout.png');
    this.load.image('goblin_brute', 'monsters/goblin_brute.png');
    this.load.image('goblin_shaman', 'monsters/goblin_shaman.png');
    this.load.image('goblin_chief', 'monsters/goblin_chieftain.png');
    // Themes 2-6 (Crypt→Abyss): sprite key === file name, one texture each.
    for (const k of THEME_MONSTER_KEYS) this.load.image(k, `monsters/${k}.png`);
    for (const list of Object.values(THEME_DECOR)) {
      for (const d of list) this.load.image(d.key, d.file);
    }
    this.load.image('door_extract', 'decor/extract_portal.png');
    this.load.image('door_descend', 'decor/descend_gate.png');
    // Painted per-theme scene backdrops (floor-inclusive); missing ones fall back
    // to the code gradient. A missing file just logs — the scene still renders.
    this.load.on('loaderror', () => undefined);
    for (const t of Object.keys(THEME_PALETTES)) this.load.image(`backdrop_${t}`, `backdrops/${t}.png`);
    for (const f of ICON_FILES_UNIQUE) this.load.image(`icon-${f}`, `icons/${f}.png`);
  }

  create(): void {
    this.drawBackground();

    this.heroSprite = this.add
      .image(HERO_X, GROUND_Y, HERO_SPEC.key)
      .setOrigin(HERO_SPEC.originX, HERO_SPEC.originY)
      .setScale(specScale(HERO_SPEC))
      .setDepth(SPRITE_DEPTH);
    this.idleBob(this.heroSprite, 0);

    this.bars = this.add.graphics().setDepth(BARS_DEPTH);
    // Hero status-icon row: a fixed pool of 6 icons + stack-count badges, shown/
    // hidden each frame (real 24px grim-glow icons, D27 — replaces the emoji row).
    for (let i = 0; i < 6; i++) {
      const icon = this.add.image(0, 0, '__DEFAULT').setDisplaySize(STATUS_ICON_PX, STATUS_ICON_PX).setVisible(false);
      const count = this.add
        .text(0, 0, '', { fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5).setShadow(0, 1, '#000000', 3).setVisible(false);
      this.heroStatusIcons.push({ icon, count });
    }
    this.heroStatusOverflow = this.add
      .text(0, 0, '', { fontFamily: 'Arial', fontSize: '19px', color: '#cfc6e6', fontStyle: 'bold' })
      .setOrigin(0, 0.5).setShadow(0, 2, '#000000', 3).setVisible(false);

    this.buildLaneDoors();
    this.buildFleeButton();

    // Run-start checkpoint picker (D4): a hero with unlocked checkpoints
    // chooses where the SESSION's first run starts too — not just after
    // death/extract. The init-built engine is held and replaced on pick.
    const checkpoints = this.hero.checkpoints ?? [1];
    if (checkpoints.length > 1) {
      this.over = true;
      showCheckpointPicker(checkpoints, (depth) => this.resetRun(depth));
    } else {
      // The engine buffered its first floorStart during construction — a zero-
      // advance step drains it so the opening pack renders.
      this.handleEvents(this.engine.step(0));
    }
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
        case 'bossWindUp': {
          const bossActor = this.actors.get(e.bossId);
          if (bossActor) {
            this.floatNumber(bossActor.x, bossActor.topY - 44, `⚡ ${e.signatureName}`, '#ffb020');
            // Telegraph flash (D31): the boss pulses red until the signature
            // fires (one attack beat) — readable even if the float is missed.
            if (!bossActor.dead) {
              bossActor.sprite.setTint(0xff5470);
              this.tweens.add({
                targets: bossActor.sprite,
                scaleX: bossActor.sprite.scaleX * 1.12,
                scaleY: bossActor.sprite.scaleY * 1.12,
                duration: 180, yoyo: true, repeat: 4, ease: 'Sine.inOut',
                onComplete: () => {
                  if (!bossActor.dead) bossActor.sprite.setTint(0xffb020);
                },
              });
            }
          }
          break;
        }
        case 'revive': this.floatAt(e.targetId, 'REVIVED!', '#ffe066'); break;
        case 'kill': {
          this.floatAt(e.targetId, `+${e.gold}◆`, '#ffe066');
          this.killActor(e.targetId);
          break;
        }
        case 'lootDrop': this.lootOrb(e.item); break;
        case 'eventEncounter': {
          const icons: Record<string, string> = { shrine: '🙏', altar: '🔥', cache: '📦', lore: '📜' };
          // Events are a full banner + a longer pre-continue beat — the old
          // 0.7s float vanished before anyone could read it (Phase 2 bug).
          this.banner(`${icons[e.eventType] ?? '✨'} ${e.eventType.toUpperCase()}\n${e.result ?? ''}`, '#ffd84a', 1800);
          this.eventFloorShown = true;
          break;
        }
        case 'floorCleared':
          // Choice pacing (D3/D33): pause only at every 5th depth
          // (mini-boss/boss floors). Auto-continue between — with a longer
          // hold after an event floor so its banner can be read.
          if (isPauseDepth(e.nextDepth)) {
            this.showChoice();
          } else {
            const delay = this.eventFloorShown ? 2000 : 400;
            this.eventFloorShown = false;
            this.time.delayedCall(delay, () => this.doContinue());
          }
          break;
        case 'runEnded':
          if (e.outcome === 'died') void this.onDied(e.depthCleared);
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
      actor.shadow.destroy();
      for (const b of actor.badges) b.destroy();
    }
    this.actors.clear();

    // Re-theme the lane for this floor's depth band + boss-lair state (D31).
    this.updateBackdrop(this.engine.snapshot().depth, pack.some((v) => v.rarity === 'boss'));

    const xs = PACK_X[pack.length] ?? PACK_X[3]!;
    pack.forEach((view, i) => {
      const spec = SPRITE_SPECS[view.sprite] ?? MONSTER_SPECS[view.kind] ?? MONSTER_SPECS.grunt!;
      const x = xs[i] ?? 620;
      const bossScale = view.rarity === 'boss' ? 1.3 : 1.0;
      const rowScale = view.row === 'back' ? 0.88 : 1.0;
      const scale = specScale(spec) * bossScale * rowScale;
      // Displayed opaque height (feet→head) → the sprite's real top on-screen.
      const effH = spec.displayH * bossScale * rowScale;
      const topY = GROUND_Y - effH;
      // Contact shadow planted at the feet (doesn't bob) so the sprite reads as
      // standing on the ground. Width tracks the sprite's displayed footprint.
      const shadowW = spec.nativeH * scale * 0.42;
      const shadow = this.add.ellipse(x, GROUND_Y - 2, shadowW, shadowW * 0.28, 0x000000, 0.34)
        .setDepth(SHADOW_DEPTH);
      const sprite = this.add
        .image(x, GROUND_Y, spec.key)
        .setOrigin(spec.originX, spec.originY)
        .setScale(scale * 0.6)
        .setDepth(SPRITE_DEPTH)
        .setTint(view.rarity === 'elite' ? 0x4aa3ff : view.rarity === 'boss' ? 0xffb020 : 0xffffff);
      this.tweens.add({ targets: sprite, scale, duration: 220, ease: 'Back.out' });
      this.idleBob(sprite, 150 + i * 120);
      this.floatNumber(x, topY - 28, view.name, MONSTER_RARITY_COLORS[view.rarity] ?? '#ffffff');
      // Elite/boss passive badges (D34): a persistent icon row above the name,
      // so the fight's threats stay readable (was a fading text of raw stat ids).
      const badges = this.buildPassiveBadges(view, x, topY - 60);
      this.actors.set(view.id, { view, sprite, spec, x, dead: false, topY, shadow, badges });
    });

    // Boss floor: show the boss name banner at the top of the lane.
    const boss = pack.find((v) => v.rarity === 'boss');
    if (boss) {
      const bannerLines = [`⚔ BOSS FLOOR ${this.engine.snapshot().depth} ⚔`, boss.name];
      if (boss.signatureName) bannerLines.push(`Watch for: ${boss.signatureName}`);
      this.banner(bannerLines.join('\n'), '#ffb020', 2200);
    }
  }

  /** Build the persistent passive-badge icon row for an elite/boss actor,
   *  centered at `x` on baseline `y`. Stats without an icon are skipped. */
  private buildPassiveBadges(view: PackMemberView, x: number, y: number): Phaser.GameObjects.Image[] {
    const names = (view.passiveNames ?? []).filter((id) => {
      const k = iconKey(id);
      return k !== undefined && this.textures.exists(k);
    }).slice(0, 4);
    if (names.length === 0) return [];
    const gap = 24;
    const startX = x - (names.length * gap) / 2 + gap / 2;
    return names.map((id, j) =>
      this.add.image(startX + j * gap, y, iconKey(id)!).setDisplaySize(22, 22));
  }

  private killActor(id: string): void {
    const actor = this.actors.get(id);
    if (!actor || actor.dead) return;
    actor.dead = true;
    this.tweens.killTweensOf(actor.sprite);
    this.tweens.add({ targets: actor.sprite, alpha: 0, y: actor.sprite.y + 14, duration: 260, ease: 'Quad.in' });
    this.tweens.add({ targets: [...actor.badges, actor.shadow], alpha: 0, duration: 200, ease: 'Quad.in' });
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
    // After extract banner fades, show checkpoint picker (D4).
    this.time.delayedCall(2000, () => this.pickCheckpointAndRestart());
    // Meta loop: nudge the Daily panel; and the gear panel (power may have grown).
    this.sys.game.events.emit('run-resolved', { outcome: 'extracted', reached: cleared });
    this.sys.game.events.emit('hero-changed', this.hero);
  }

  private async onDied(reached: number): Promise<void> {
    this.over = true;
    const snap = this.engine.snapshot();
    const runGold = snap.runGold;
    const haulCount = snap.haulCount;

    // Death recap (D35): killer + last exchanges + what was lost.
    const recent = snap.recentHits.slice(-5);
    const killerLine = recent.length > 0
      ? recent.filter((h) => h.side === 'monster').slice(-1).map((h) => `by ${h.action} (${h.dmg} dmg${h.crit ? ' CRIT' : ''})`)[0] ?? ''
      : '';
    const recapLines = [`Died at depth ${reached}`];
    if (killerLine) recapLines.push(killerLine);
    if (haulCount > 0 || runGold > 0) {
      recapLines.push(`Lost: ${runGold > 0 ? `+${runGold}◆` : ''}${haulCount > 0 ? ` ${haulCount} gear` : ''}`);
    }

    // Banner shows immediately for juice; the full recap CARD rides the
    // checkpoint panel below (D34) so it can actually be read. Server sync
    // happens during the display.
    this.banner(recapLines.join('\n'), '#ff5470', 1600);

    // Await the server response so this.hero.checkpoints is up-to-date before
    // the checkpoint picker reads it (D4). On network failure the run is queued
    // and checkpoints stay stale — the picker still appears with what we have.
    const runId = this.runId;
    const result = await postRunResult('died', reached, [], runId);
    if (result.status === 'ok') {
      this.hero = result.resp.hero;
      this.bankedGold = this.hero.gold;
      this.sys.game.events.emit('hero-changed', this.hero);
    } else if (result.status === 'retryable') {
      enqueueRun(localStorage, {
        runId,
        outcome: 'died',
        depthReached: reached,
        haul: [],
        queuedAt: Date.now(),
      });
    }
    this.sys.game.events.emit('run-resolved', { outcome: 'died', reached });

    // After the banner beat, show the checkpoint picker carrying the recap
    // card — it stays until the player picks where to delve next.
    this.time.delayedCall(2000, () => this.pickCheckpointAndRestart(recapLines));
  }

  /** Show the checkpoint picker, then restart the run at the chosen depth (D4).
   *  With `recapLines` (death flow, D34) the picker ALWAYS shows — it carries
   *  the recap card, which stays readable until the player picks. Without them
   *  (extract flow) a single-checkpoint hero just restarts at depth 1. */
  private pickCheckpointAndRestart(recapLines?: string[]): void {
    const checkpoints = this.hero.checkpoints ?? [1];
    if (!recapLines && checkpoints.length <= 1) {
      this.resetRun(1);
      return;
    }
    showCheckpointPicker(checkpoints, (depth) => this.resetRun(depth), recapLines);
  }

  private resetRun(startDepth = 1): void {
    this.over = false;
    this.choiceGroup.setVisible(false);
    this.hero.mana = this.hero.maxMana; // mana resets each run
    this.startEngine(startDepth);
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

  /** Diegetic choice doors (D3/D33): in the cleared lane the hero stands between
   *  an amber extract portal (left) and a theme-lit descend gate (right). Tapping
   *  a door takes the action — no UI band, the choice lives in the world. */
  private buildLaneDoors(): void {
    this.choiceGroup = this.add.container(0, 0).setVisible(false).setDepth(60);
    const mkDoor = (d: typeof DOOR.extract, glowColor: number, label: string, labelColor: string,
      onTap: () => void): { glow: Phaser.GameObjects.Ellipse; parts: Phaser.GameObjects.GameObject[] } => {
      const glow = this.add.ellipse(d.x, GROUND_Y - d.displayH * 0.46, 210, 250, glowColor, 0.5);
      const img = this.add.image(d.x, GROUND_Y, d.key)
        .setOrigin(d.originX, d.originY)
        .setScale(d.displayH / d.nativeH);
      const cap = this.add.text(d.x, GROUND_Y + 28, label, {
        fontFamily: 'Arial', fontSize: '25px', color: labelColor, fontStyle: 'bold',
      }).setOrigin(0.5).setShadow(0, 2, '#000000', 5);
      const zone = this.add.zone(d.x, GROUND_Y - d.displayH / 2, 185, d.displayH + 60)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', onTap);
      return { glow, parts: [glow, img, cap, zone] };
    };
    const extract = mkDoor(DOOR.extract, 0xffb020, '↑ EXTRACT', '#ffd77a', () => this.doExtract());
    const descend = mkDoor(DOOR.descend, 0x9db8ff, 'DESCEND ↓', '#dfe6ff', () => this.doContinue());
    this.extractGlow = extract.glow;
    this.descendGlow = descend.glow;
    this.choiceRisk = this.add.text(DESIGN_W / 2, GROUND_Y - 268, '', {
      fontFamily: 'Arial', fontSize: '23px', color: '#e8e0f5', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5).setShadow(0, 2, '#000000', 5);
    this.choiceGroup.add([...extract.parts, ...descend.parts, this.choiceRisk]);
  }

  private showChoice(): void {
    const s = this.engine.snapshot();
    const risk = s.haulCount > 0
      ? `unbanked +${s.runGold}◆  ·  🎒 ${s.haulCount} gear at risk`
      : `unbanked +${s.runGold}◆`;
    this.choiceRisk.setText(`Depth ${s.depth} cleared\n${risk}`);
    // Descend gate glows in the NEXT floor's theme accent.
    const pal = THEME_PALETTES[themeForDepth(s.depth + 1)] ?? THEME_PALETTES.goblin_camp!;
    this.descendGlow.setFillStyle(pal.glow, 0.5);
    this.choiceGroup.setVisible(true);
    this.choicePulse?.stop();
    for (const glow of [this.extractGlow, this.descendGlow]) { glow.setScale(0.9); glow.setAlpha(0.45); }
    this.choicePulse = this.tweens.add({
      targets: [this.extractGlow, this.descendGlow],
      scale: 1.08, alpha: 0.85, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }

  private hideChoice(): void {
    this.choicePulse?.stop();
    this.choicePulse = undefined;
    this.choiceGroup.setVisible(false);
  }

  /** Small always-visible flee button (D33: flee between fights only). */
  private buildFleeButton(): void {
    this.fleeButton = this.add
      .text(DESIGN_W - 20, 20, '⚡ Flee', {
        fontFamily: 'Arial', fontSize: '22px', color: '#ffb020',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setShadow(0, 2, '#000000', 3)
      .setAlpha(0.4)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    this.fleeButton.on('pointerdown', () => {
      if (this.engine.snapshot().phase === 'choosing') {
        this.doExtract();
      }
    });
    this.fleeButton.on('pointerover', () => {
      if (this.engine.snapshot().phase === 'choosing') {
        this.fleeButton.setAlpha(1);
      }
    });
    this.fleeButton.on('pointerout', () => {
      if (this.engine.snapshot().phase !== 'over') {
        this.fleeButton.setAlpha(this.engine.snapshot().phase === 'choosing' ? 0.8 : 0.4);
      }
    });
  }

  private doContinue(): void {
    this.hideChoice();
    const next = this.engine.snapshot().depth + 1;
    // Boss rooms (D31): the next floor is a boss lair — enter through the
    // door transition instead of the plain run-off.
    if (bossForDepth(next)) {
      this.bossDoorTransition(next);
      return;
    }
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

  /** Boss-room door transition (D31): the lane darkens behind a closing door,
   *  the lair title card shows, then the door opens on the boss floor. */
  private bossDoorTransition(next: number): void {
    const boss = bossForDepth(next);
    const overlay = this.add
      .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x000000, 1)
      .setAlpha(0)
      .setDepth(200);
    const title = this.add
      .text(DESIGN_W / 2, GROUND_Y - 240,
        `🚪 DEPTH ${next} 🚪\n${boss ? `The lair of\n${boss.name}` : 'Boss lair'}`, {
          fontFamily: 'Arial', fontSize: '54px', color: '#ffb020',
          fontStyle: 'bold', align: 'center',
        })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(201);
    // Hero runs right into the dark → title card → door opens on the boss.
    this.tweens.add({
      targets: this.heroSprite, x: DESIGN_W + 80, duration: 500, ease: 'Quad.in',
    });
    this.tweens.add({
      targets: overlay, alpha: 0.85, duration: 500,
      onComplete: () => {
        this.tweens.add({ targets: title, alpha: 1, duration: 250 });
        this.heroSprite.x = -80;
        this.time.delayedCall(1100, () => {
          this.handleEvents(this.engine.continueRun());
          this.tweens.add({ targets: this.heroSprite, x: HERO_X, duration: 400, ease: 'Quad.out' });
          this.tweens.add({
            targets: [overlay, title], alpha: 0, duration: 450,
            onComplete: () => { overlay.destroy(); title.destroy(); },
          });
          this.refreshHud();
        });
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
    // Flee button: active between fights, dim during combat.
    if (this.fleeButton) {
      this.fleeButton.setAlpha(this.snap.phase === 'choosing' ? 0.8 : 0.4);
    }
    // Boss floor: surface the live boss's name/title under the depth text
    // in the top bar (map detail first, boss title below).
    const liveBoss = this.snap.monsters.find((m) => m.rarity === 'boss' && m.hp > 0);
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
      bossName: liveBoss?.name,
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
      // Anchor to the sprite's real top (boss/row-scaled) so bars always clear
      // the sprite, whatever its size.
      this.bar(actor.x, actor.topY - 14, 88, m.hp / m.maxHp, m.shield / m.maxHp, 0xff5470);
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

  /** Hero status-icon row under the HP bar: real 24px grim-glow icons + stack
   *  counts, capped at 6 with a "+N" overflow (status-effects.md HUD rule).
   *  Shield is excluded — it renders as a segment on the HP bar. */
  private drawStatuses(): void {
    const list = this.snap.hero.statuses.filter((s) => s.id !== 'shield');
    const y = GROUND_Y - HERO_SPEC.displayH - 44;
    const shown = Math.min(list.length, this.heroStatusIcons.length);
    const totalW = shown * STATUS_ICON_GAP;
    const startX = HERO_X - totalW / 2 + STATUS_ICON_GAP / 2;
    for (let i = 0; i < this.heroStatusIcons.length; i++) {
      const slot = this.heroStatusIcons[i]!;
      const s = i < shown ? list[i] : undefined;
      const key = s ? iconKey(s.id) : undefined;
      if (s && key && this.textures.exists(key)) {
        const x = startX + i * STATUS_ICON_GAP;
        slot.icon.setTexture(key).setDisplaySize(STATUS_ICON_PX, STATUS_ICON_PX).setPosition(x, y).setVisible(true);
        if (s.stacks > 1) slot.count.setText(String(s.stacks)).setPosition(x + 10, y + 10).setVisible(true);
        else slot.count.setVisible(false);
      } else {
        slot.icon.setVisible(false);
        slot.count.setVisible(false);
      }
    }
    if (list.length > shown) {
      this.heroStatusOverflow
        .setText(`+${list.length - shown}`)
        .setPosition(startX + shown * STATUS_ICON_GAP - STATUS_ICON_GAP / 2 + 6, y)
        .setVisible(true);
    } else {
      this.heroStatusOverflow.setVisible(false);
    }
    // Monster statuses ride the float texts (perf budget: one text per side).
  }

  // ---- visuals ---------------------------------------------------------------

  /** Re-theme the backdrop when the floor's theme or boss-status changes
   *  (called from renderPack on each floorStart). */
  private updateBackdrop(depth: number, boss: boolean): void {
    const theme = themeForDepth(depth);
    if (theme === this.bgTheme && boss === this.bgBoss && this.bg) return;
    this.drawBackground(theme, boss);
  }

  /** Paint the themed backdrop (ART_BIBLE §3 "darkening descent") plus its decor
   *  props. Boss floors (D31) douse the ambient light, intensify the theme glow,
   *  and add a floor vignette so the lair reads as a threshold moment. */
  private drawBackground(theme = 'goblin_camp', boss = false): void {
    const pal = THEME_PALETTES[theme] ?? THEME_PALETTES.goblin_camp!;
    if (!this.bg) this.bg = this.add.graphics().setDepth(-19);
    const g = this.bg;
    g.clear();
    const backdropKey = `backdrop_${theme}`;
    if (this.textures.exists(backdropKey)) {
      // Painted scene backdrop (behind everything): its foreground floor is at
      // the source image bottom, so scaling it to GROUND_Y lands the floor right
      // under the fighters — the ground IS the backdrop. Boss lair = cool-dim.
      if (!this.bgImage) this.bgImage = this.add.image(0, 0, backdropKey).setOrigin(0, 0).setDepth(-20);
      const src = this.textures.get(backdropKey).getSourceImage();
      const scale = Math.max(DESIGN_W / src.width, GROUND_Y / src.height);
      this.bgImage.setTexture(backdropKey).setScale(scale)
        .setTint(boss ? 0x7a8290 : 0xffffff).setVisible(true);
      // Fill the strip below the floor (behind the bottom UI) with the theme dark.
      g.fillStyle(pal.bottom, 1);
      g.fillRect(0, GROUND_Y, DESIGN_W, DESIGN_H - GROUND_Y);
    } else {
      // Fallback for themes without a painted backdrop yet: gradient + shelf.
      if (this.bgImage) this.bgImage.setVisible(false);
      const top = boss ? Phaser.Display.Color.IntegerToColor(pal.top).darken(35).color : pal.top;
      const bottom = boss ? Phaser.Display.Color.IntegerToColor(pal.bottom).darken(35).color : pal.bottom;
      g.fillGradientStyle(top, top, bottom, bottom, 1);
      g.fillRect(0, 0, DESIGN_W, GROUND_Y + 40);
      g.fillStyle(pal.glow, boss ? 0.22 : 0.13);
      g.fillEllipse(DESIGN_W / 2, GROUND_Y - 24, DESIGN_W * 1.15, 250);
      g.fillStyle(pal.ground, 1);
      g.fillRect(0, GROUND_Y, DESIGN_W, DESIGN_H - GROUND_Y);
      g.fillStyle(pal.groundEdge, 1);
      g.fillRect(0, GROUND_Y, DESIGN_W, 12);
      g.fillStyle(pal.glow, boss ? 0.12 : 0.20);
      g.fillRect(0, GROUND_Y, DESIGN_W, 3);
      g.fillStyle(0x000000, 0.30);
      g.fillRect(0, GROUND_Y + 66, DESIGN_W, DESIGN_H - GROUND_Y - 66);
    }
    if (boss) {
      // Lair vignette: side gutters darken inward.
      g.fillStyle(0x000000, 0.5);
      g.fillRect(0, 0, 130, GROUND_Y + 40);
      g.fillRect(DESIGN_W - 130, 0, 130, GROUND_Y + 40);
    }
    // Soft contact shadow under the hero (monster shadows are per-actor sprites).
    g.fillStyle(0x000000, 0.34);
    g.fillEllipse(HERO_X, GROUND_Y - 2, 104, 24);
    // A painted backdrop already carries the environment + glow, so foreground
    // decor props would double up — only place them in the gradient fallback.
    if (this.textures.exists(backdropKey)) this.clearDecor();
    else this.placeDecor(theme, boss);
    this.bgTheme = theme;
    this.bgBoss = boss;
  }

  private clearDecor(): void {
    for (const s of this.decorSprites) s.destroy();
    this.decorSprites = [];
  }

  /** (Re)place the current theme's decor sprites behind the fighters, with a
   *  soft glow pool under luminous props. Doused to a cold tint on boss floors. */
  private placeDecor(theme: string, boss: boolean): void {
    this.clearDecor();
    for (const d of THEME_DECOR[theme] ?? []) {
      if (!this.textures.exists(d.key)) continue;
      if (d.glow && !boss) {
        const glow = this.add.graphics().setDepth(-15);
        glow.fillStyle((THEME_PALETTES[theme] ?? THEME_PALETTES.goblin_camp!).glow, 0.16);
        glow.fillEllipse(d.x, GROUND_Y - 30, d.glow, d.glow * 0.85);
        this.decorSprites.push(glow);
      }
      const img = this.add.image(d.x, GROUND_Y + 4, d.key)
        .setOrigin(0.5, d.originY)
        .setScale(d.scale)
        .setDepth(-12);
      if (boss) img.setTint(0x8890a0);
      this.decorSprites.push(img);
    }
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

  /** Loot-as-light orbs (D41): glowing orb flies to the bag with the item name. */
  private lootOrb(item: GearItem): void {
    const color = itemColor(item);
    const orb = this.add
      .circle(620, GROUND_Y - 160, 14, Phaser.Display.Color.HexStringToColor(color).color, 0.9)
      .setStrokeStyle(3, Phaser.Display.Color.HexStringToColor('#ffffff').color, 0.4);
    this.tweens.add({
      targets: orb,
      x: DESIGN_W / 2 + 30, y: DESIGN_H - 60,
      scale: 0.5, alpha: 0.6,
      duration: 700, ease: 'Quad.in', delay: 150,
      onComplete: () => orb.destroy(),
    });
    // Name toast still shows briefly.
    this.dropToast(item);
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

  /** Center-lane announcement text. `holdMs` = how long it stays before the
   *  fade (default 1s; boss/event/death moments hold longer). */
  private banner(text: string, color: string, holdMs = 1000): void {
    const b = this.add
      .text(DESIGN_W / 2, GROUND_Y - 300, text, {
        fontFamily: 'Arial', fontSize: '58px', color, fontStyle: 'bold', align: 'center',
      })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 8)
      .setScale(0.7);
    this.tweens.add({ targets: b, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({
      targets: b, alpha: 0, y: b.y - 60, delay: holdMs, duration: 500,
      onComplete: () => b.destroy(),
    });
  }
}

// ---- Choice pacing (D3/D33) --------------------------------------------------

/** True at every 5th depth (mini-boss / boss checkpoint floors) — these are
 *  the only floors where the player makes a Continue/Extract choice. */
function isPauseDepth(depth: number): boolean {
  return depth % 5 === 0;
}

// ---- Checkpoint picker (D4) -------------------------------------------------

/** Boss depth → theme name map for the picker labels. */
const BOSS_THEMES: Record<number, string> = {
  10: 'Goblin Chieftain · Goblin Camp',
  20: 'Necromancer · Crypt',
  30: 'Broodmother · Warrens',
  40: 'The Hollow King · Deep',
  50: 'Pyre Tyrant · Volcanic',
  60: 'Herald of the Abyss · Abyss',
};

/** Populate the #checkpoint-panel with a button per unlocked checkpoint, then
 *  show it. On tap, hide and call `callback(depth)`. `recapLines` (death flow,
 *  D34) fills the recap card at the top and retitles the panel — the card
 *  stays up until the player picks, so the recap is never missable. */
function showCheckpointPicker(
  checkpoints: number[],
  callback: (depth: number) => void,
  recapLines?: string[],
): void {
  const panel = document.getElementById('checkpoint-panel');
  const list = document.getElementById('checkpoint-list');
  if (!panel || !list) { callback(1); return; }

  const title = document.getElementById('checkpoint-title');
  if (title) title.textContent = recapLines ? '☠ You Died' : 'Choose Starting Depth';
  const recap = document.getElementById('checkpoint-recap');
  if (recap) {
    recap.textContent = recapLines ? recapLines.join('\n') : '';
    recap.classList.toggle('show', Boolean(recapLines));
  }

  list.innerHTML = '';
  for (const depth of checkpoints) {
    const btn = document.createElement('button');
    btn.className = 'menu-item';
    const theme = BOSS_THEMES[depth - 1];
    btn.textContent = theme
      ? `Depth ${depth} — after ${theme}`
      : `Depth ${depth} (fresh start)`;
    btn.addEventListener('click', () => {
      panel.style.display = 'none';
      callback(depth);
    });
    list.appendChild(btn);
  }

  panel.style.display = 'flex';
}
