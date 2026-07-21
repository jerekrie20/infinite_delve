// The main-page HUD: top-bar map details, the three stat bars (XP/HP wired,
// Mana a placeholder), five (locked) skill circles, the inline equipped-gear
// grid, abbreviated gold, and the Bag button. Pure DOM — driven by snapshots the
// LaneScene emits on the game bus ('hud-changed') plus hero updates on equip
// ('hero-changed'). Tapping a gear slot or the Bag opens the existing gear panel.

import type { GearSlot, Hero } from '../../shared/delve';
import { itemName } from '../../shared/content/items';
import { openGearPanel } from './gear';

import type { CombatTurn } from '../../shared/delve';

/** Live combat + hero state the HUD paints from. */
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

/** Inline equipped slots shown on the main page, in display order. Six real
 *  equip slots + two locked placeholders = the eight-cell grid in the sketch. */
const GEAR_SLOTS: Array<{ slot: GearSlot; icon: string; label: string }> = [
  { slot: 'hand1', icon: '⚔️', label: 'Weapon' },
  { slot: 'hand2', icon: '🛡️', label: 'Off-hand' },
  { slot: 'body',  icon: '👕', label: 'Armor' },
  { slot: 'head',  icon: '⛑️', label: 'Helm' },
  { slot: 'legs',  icon: '👖', label: 'Legs' },
  { slot: 'feet',  icon: '🥾', label: 'Boots' },
  { slot: 'belt',  icon: '🎗️', label: 'Belt' },
  { slot: 'ring1', icon: '💍', label: 'Ring' },
  { slot: 'ring2', icon: '💍', label: 'Ring 2' },
  { slot: 'amulet', icon: '📿', label: 'Amulet' },
];
const LOCKED_SLOTS = 0;
const SKILL_SLOTS = 5;

const RARITY_COLORS: Record<string, string> = {
  common: '#c8c8c8',
  uncommon: '#5bd06a',
  rare: '#4aa3ff',
  epic: '#b45bff',
  legendary: '#ffb020',
};

let last: HudSnapshot | null = null;

// Cached elements.
let mdSub: HTMLElement | null = null;
let xpFill: HTMLElement | null = null;
let xpVal: HTMLElement | null = null;
let hpFill: HTMLElement | null = null;
let hpVal: HTMLElement | null = null;
let mpFill: HTMLElement | null = null;
let gearGrid: HTMLElement | null = null;
let money: HTMLElement | null = null;
let bagBadge: HTMLElement | null = null;
let extractBtn: HTMLElement | null = null;

/** Abbreviate large numbers: 1000→1k, 1200→1.2k, 100000→100k, 1e6→1m, 1e9→1b. */
export function formatShort(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  const units: Array<{ v: number; s: string }> = [
    { v: 1e12, s: 't' },
    { v: 1e9, s: 'b' },
    { v: 1e6, s: 'm' },
    { v: 1e3, s: 'k' },
  ];
  for (const u of units) {
    if (v >= u.v) {
      const scaled = v / u.v;
      const str =
        scaled < 10 ? scaled.toFixed(1).replace(/\.0$/, '') : String(Math.floor(scaled));
      return str + u.s;
    }
  }
  return String(v);
}

export function initHud(): void {
  mdSub = document.getElementById('md-sub');
  xpFill = document.getElementById('xp-fill');
  xpVal = document.getElementById('xp-val');
  hpFill = document.getElementById('hp-fill');
  hpVal = document.getElementById('hp-val');
  mpFill = document.getElementById('mp-fill');
  gearGrid = document.getElementById('gear-grid');
  money = document.getElementById('money');
  bagBadge = document.getElementById('bag-badge');
  extractBtn = document.getElementById('btn-extract');

  renderSkills();
  initTabs();

  // Mana is a placeholder resource for now — show it "full" but dimmed (CSS).
  if (mpFill) mpFill.style.width = '100%';

  // Tapping any real (unlocked) equipped slot opens the inventory/gear panel.
  gearGrid?.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest('.gslot');
    if (cell && !cell.classList.contains('locked')) openGearPanel();
  });
}

/** Full repaint from a fresh combat/hero snapshot. */
export function updateHud(s: HudSnapshot): void {
  last = s;
  paint();
}

/** Hero-only update (equip/unequip/extract) — keeps the last combat snapshot. */
export function updateHudHero(hero: Hero): void {
  if (!last) return;
  last.hero = hero;
  last.bankedGold = hero.gold;
  paint();
}

function paint(): void {
  if (!last) return;
  const { hero } = last;

  if (mdSub) mdSub.textContent = `Depth ${last.depth}`;

  const xpFrac = hero.xpToNext > 0 ? hero.xp / hero.xpToNext : 0;
  if (xpFill) xpFill.style.width = `${clampPct(xpFrac)}%`;
  if (xpVal) xpVal.textContent = `${Math.floor(hero.xp)}/${hero.xpToNext}`;

  const hpFrac = last.maxHp > 0 ? last.hp / last.maxHp : 0;
  if (hpFill) hpFill.style.width = `${clampPct(hpFrac)}%`;
  if (hpVal) hpVal.textContent = `${Math.max(0, Math.round(last.hp))}/${last.maxHp}`;

  if (money) money.textContent = `◆ ${formatShort(last.bankedGold)}`;

  if (bagBadge) {
    if (last.haulCount > 0) {
      bagBadge.textContent = String(last.haulCount);
      bagBadge.hidden = false;
    } else {
      bagBadge.hidden = true;
    }
  }

  if (extractBtn) {
    extractBtn.textContent =
      last.runGold > 0 ? `EXTRACT  +${formatShort(last.runGold)}◆` : 'EXTRACT & BANK';
  }

  renderGear(hero);
}

/** Segmented Skills/Equip tabs: clicking a tab button shows its page. */
function initTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('.tab-btn'));
  const pages = Array.from(document.querySelectorAll<HTMLElement>('.tab-page'));
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      for (const b of buttons) b.classList.toggle('active', b.dataset.tab === tab);
      for (const p of pages) p.classList.toggle('active', p.dataset.tab === tab);
    });
  }
}

function renderSkills(): void {
  const el = document.getElementById('skills');
  if (!el) return;
  el.innerHTML = Array.from(
    { length: SKILL_SLOTS },
    () => '<div class="skill-slot locked" title="Skill slot — coming soon">🔒</div>'
  ).join('');
}

function renderGear(hero: Hero): void {
  if (!gearGrid) return;
  const cells: string[] = [];
  for (const { slot, icon, label } of GEAR_SLOTS) {
    const it = hero.equipped[slot];
    if (it) {
      const color = RARITY_COLORS[it.r] ?? '#ffffff';
      cells.push(
        `<div class="gslot" style="border-color:${color}" title="${esc(`${label}: ${itemName(it)}`)}">${icon}</div>`
      );
    } else {
      cells.push(`<div class="gslot empty" title="${esc(label)} — empty">${icon}</div>`);
    }
  }
  for (let i = 0; i < LOCKED_SLOTS; i++) {
    cells.push('<div class="gslot locked" title="Locked slot">🔒</div>');
  }
  gearGrid.innerHTML = cells.join('');
}

function clampPct(frac: number): number {
  return Math.max(0, Math.min(1, frac)) * 100;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}
