// The "Gear" review panel: an HTML overlay showing the hero's stats, equipped
// slots, and stash, with manual equip/unequip (the "review" half of the hybrid
// equip model). Reads + mutates the hero through injected deps (the LaneScene),
// so it works both server-backed and offline (preview).

import type { GearItem, GearSlot, Hero } from '../../shared/delve';
import { gearScore, sellValue } from '../../shared/content/items';
import { STAT_IDS, formatStat } from '../../shared/content/stats';
import { activeSets } from '../../shared/content/gear';
import { SETS } from '../../shared/content/sets';

export interface GearDeps {
  getHero: () => Hero;
  changeGear: (itemId?: string, unequip?: GearSlot) => Promise<void>;
  sellGear: (itemId: string) => Promise<void>;
  onChange: (cb: (h: Hero) => void) => void;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#c8c8c8',
  uncommon: '#5bd06a',
  rare: '#4aa3ff',
  epic: '#b45bff',
  legendary: '#ffb020',
};
/** Set + unique items get their own colors regardless of rarity tier. */
const SET_COLOR = '#2ecf7f';
const UNIQUE_COLOR = '#ff8a3d';

/** Equip slots shown, in display order (icon = sprite stand-in until art lands). */
const SLOTS: Array<{ slot: GearSlot; label: string; icon: string }> = [
  { slot: 'hand1', label: 'Weapon', icon: '⚔️' },
  { slot: 'body', label: 'Armor', icon: '👕' },
  { slot: 'head', label: 'Helm', icon: '⛑️' },
  { slot: 'feet', label: 'Boots', icon: '🥾' },
  { slot: 'ring1', label: 'Ring', icon: '💍' },
  { slot: 'amulet', label: 'Amulet', icon: '📿' },
];
const SLOT_META: Partial<Record<GearSlot, { label: string; icon: string }>> = Object.fromEntries(
  SLOTS.map((s) => [s.slot, { label: s.label, icon: s.icon }])
);

let deps: GearDeps | null = null;
let backdrop: HTMLElement | null = null;
let content: HTMLElement | null = null;
let isOpen = false;

export function initGearPanel(d: GearDeps): void {
  deps = d;
  backdrop = document.getElementById('gear-panel');
  content = document.getElementById('gear-content');

  document.getElementById('btn-gear')?.addEventListener('click', () => toggle());
  document.getElementById('gear-close')?.addEventListener('click', close);
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Tap any item row (equipped or stash) to open its detail popup, where the
  // Equip/Unequip/Sell actions live (mobile-friendly, same popup as the main HUD).
  content?.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-open-slot],[data-open-id]');
    if (!row || !deps) return;
    const hero = deps.getHero();
    const slot = row.dataset.openSlot as GearSlot | undefined;
    const id = row.dataset.openId;
    if (slot) {
      const it = hero.equipped[slot];
      if (it) openItemPopup(it, { equipped: true });
    } else if (id) {
      const it = hero.stash.find((i) => i.id === id);
      if (it) openItemPopup(it, { equipped: false });
    }
  });

  d.onChange(() => {
    if (isOpen) render();
  });
}

function toggle(): void {
  if (isOpen) close();
  else open();
}

/** Open the gear/inventory panel from elsewhere (Bag button, inline gear slots). */
export function openGearPanel(): void {
  open();
}

function open(): void {
  isOpen = true;
  backdrop?.classList.add('show');
  render();
}
function close(): void {
  isOpen = false;
  backdrop?.classList.remove('show');
}

// ---- rendering ------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

/** All stat lines an item carries, in registry order ("+8 ATK  +3% DEF"). */
function statLabel(it: GearItem): string {
  const parts: string[] = [];
  for (const id of STAT_IDS) {
    const v = it.stats[id];
    if (v) parts.push(formatStat(id, v));
  }
  return parts.join('  ');
}

/** Display color: unique → gold, set → green, else the rarity tier color. */
function itemColor(it: GearItem): string {
  if (it.unique) return UNIQUE_COLOR;
  if (it.set) return SET_COLOR;
  return RARITY_COLORS[it.rarity] ?? '#ffffff';
}

// ---- item detail popup (mobile tap-to-inspect) ----------------------------

let itemPopup: HTMLElement | null = null;

/** Lazily build the popup shell once and reuse it. */
function ensureItemPopup(): HTMLElement {
  if (itemPopup) return itemPopup;
  const el = document.createElement('div');
  el.id = 'item-popup';
  el.className = 'panel-backdrop';
  el.innerHTML =
    `<div class="item-card">` +
    `<button class="panel-close" aria-label="Close">✕</button>` +
    `<div class="item-pop-body"></div>` +
    `</div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target === el) closeItemPopup();
  });
  el.querySelector('.panel-close')?.addEventListener('click', closeItemPopup);
  itemPopup = el;
  return el;
}

function closeItemPopup(): void {
  itemPopup?.classList.remove('show');
}

const quality = (it: GearItem): string =>
  it.unique ? 'Unique' : it.set ? 'Set' : it.rarity.charAt(0).toUpperCase() + it.rarity.slice(1);

/**
 * Open the mobile item-detail popup for a single item. Shows a sprite placeholder
 * (the slot icon for now), the name, quality/slot tag, every stat line, set info,
 * and the contextual action (Unequip when equipped, else Equip + Sell).
 */
export function openItemPopup(it: GearItem, opts: { equipped?: boolean } = {}): void {
  const el = ensureItemPopup();
  const body = el.querySelector('.item-pop-body') as HTMLElement;
  const col = itemColor(it);
  const meta = SLOT_META[it.slot];
  const stats = STAT_IDS.filter((id) => it.stats[id]).map(
    (id) => `<div class="ip-stat">${formatStat(id, it.stats[id]!)}</div>`
  ).join('');
  const setName = it.set ? SETS[it.set]?.name : undefined;
  const actions = opts.equipped
    ? `<button class="gear-btn" data-act="unequip">Unequip</button>`
    : `<button class="gear-btn equip" data-act="equip">Equip</button>` +
      `<button class="gear-btn sell" data-act="sell">Sell ◆${sellValue(it)}</button>`;

  body.innerHTML =
    `<div class="ip-sprite" style="border-color:${col}">${meta?.icon ?? '❔'}</div>` +
    `<div class="ip-name" style="color:${col}">${esc(it.name)}</div>` +
    `<div class="ip-tag">${quality(it)} · ${meta?.label ?? it.slot}</div>` +
    (stats ? `<div class="ip-stats">${stats}</div>` : '') +
    (setName ? `<div class="ip-set">Part of <b>${esc(setName)}</b></div>` : '') +
    `<div class="ip-actions">${actions}</div>`;

  // Wire the contextual actions to the shared gear deps, then close.
  body.querySelector('[data-act="unequip"]')?.addEventListener('click', () => {
    void deps?.changeGear(undefined, it.slot);
    closeItemPopup();
  });
  body.querySelector('[data-act="equip"]')?.addEventListener('click', () => {
    void deps?.changeGear(it.id);
    closeItemPopup();
  });
  body.querySelector('[data-act="sell"]')?.addEventListener('click', () => {
    void deps?.sellGear(it.id);
    closeItemPopup();
  });

  el.classList.add('show');
}

function render(): void {
  if (!content || !deps) return;
  const hero = deps.getHero();
  const parts: string[] = [];

  parts.push(`<div class="panel-title">Gear</div>`);
  parts.push(
    `<div class="hero-stats">` +
      `<span>Lv ${hero.level}</span>` +
      `<span>⚔️ ${hero.attack}</span>` +
      `<span>❤️ ${hero.maxHp}</span>` +
      `<span>🛡️ ${hero.defense}%</span>` +
      `<span>🎯 ${hero.critChance}%</span>` +
      (hero.lifesteal > 0 ? `<span>🩸 ${hero.lifesteal}%</span>` : '') +
      `<span>◆ ${hero.gold}</span>` +
      `</div>`
  );

  // Equipped slots
  parts.push(`<div class="section-label">Equipped</div>`);
  for (const { slot, label } of SLOTS) {
    const it = hero.equipped[slot];
    if (it) {
      parts.push(
        `<div class="gear-slot tappable" data-open-slot="${slot}">` +
          `<span class="slot-label">${label}</span>` +
          `<span class="slot-item" style="color:${itemColor(it)}">${esc(it.name)} <em>${statLabel(it)}</em></span>` +
          `<span class="row-chevron">›</span>` +
          `</div>`
      );
    } else {
      parts.push(
        `<div class="gear-slot empty">` +
          `<span class="slot-label">${label}</span>` +
          `<span class="slot-item muted">— empty —</span>` +
          `</div>`
      );
    }
  }

  // Set bonuses — any set with 2+ equipped pieces; met thresholds light up.
  const sets = activeSets(hero.equipped);
  if (sets.length) {
    parts.push(`<div class="section-label">Set Bonuses</div>`);
    for (const s of sets) {
      const lines = s.bonuses
        .map((b) => `<span class="set-bonus ${b.active ? 'on' : 'off'}">${esc(b.text)}</span>`)
        .join('');
      parts.push(
        `<div class="gear-set">` +
          `<span class="set-name">${esc(s.name)} <em>(${s.count})</em></span>` +
          `<span class="set-lines">${lines}</span>` +
          `</div>`
      );
    }
  }

  // Stash, grouped by type (Weapon / Armor / …), strongest first within a group.
  parts.push(`<div class="section-label">Stash <span class="muted">${hero.stash.length}</span></div>`);
  if (hero.stash.length === 0) {
    parts.push(`<div class="panel-empty">No spare gear. Extract from a delve to bank loot.</div>`);
  } else {
    for (const { slot, label } of SLOTS) {
      const items = hero.stash.filter((i) => i.slot === slot).sort((a, b) => rank(b) - rank(a));
      if (items.length === 0) continue;
      parts.push(`<div class="group-header">${label} <span class="muted">${items.length}</span></div>`);
      for (const it of items) parts.push(stashRow(it));
    }
  }

  content.innerHTML = parts.join('');
}

function stashRow(it: GearItem): string {
  return (
    `<div class="stash-item tappable" data-open-id="${esc(it.id)}">` +
    `<div class="item-info">` +
    `<span class="item-name" style="color:${itemColor(it)}">${esc(it.name)}</span>` +
    `<span class="item-stat">${statLabel(it)}</span>` +
    `</div>` +
    `<span class="item-sell">◆${sellValue(it)}</span>` +
    `<span class="row-chevron">›</span>` +
    `</div>`
  );
}

/** Sort weight so the strongest stash items float to the top (shared scoring). */
function rank(it: GearItem): number {
  return gearScore(it);
}
