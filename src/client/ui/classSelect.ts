// Class-select / hero-creation overlay (D13): the one-time moment a brand-new
// player picks one of the three base chains. Presentation only — the chosen id
// is posted to /api/hero/class (server owns the switch). Reads class base stats
// from the shared CLASSES registry so the cards never drift from the real math.

import type { HeroClass } from '../../shared/delve';
import { CLASSES } from '../../shared/content/classes';
import { CLASS_ABILITIES, ACTIVES } from '../../shared/content/actives';

/** Per-class flavor for the cards (classes.md fantasy/style column). Copy only —
 *  the numbers below come from the CLASSES registry, never hardcoded here. */
interface ClassBlurb {
  emoji: string;
  fantasy: string;
  style: string;
}
const BLURBS: Record<HeroClass, ClassBlurb> = {
  squire: { emoji: '⚔️', fantasy: 'Frontline bruiser', style: 'Tanky, steady, blocks and sustains.' },
  archer: { emoji: '🏹', fantasy: 'Precise hunter', style: 'Fast strikes, crits, and marks.' },
  apprentice: { emoji: '🔮', fantasy: 'Arcane force', style: 'Slow, heavy hits — stuns and burns.' },
};

/** Display order = the chain order in classes.md. */
const ORDER: HeroClass[] = ['squire', 'archer', 'apprentice'];

const perLevel = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** Show the picker and resolve `onPick` with the chosen class id. Falls back to
 *  squire if the DOM nodes are missing (never blocks boot). */
export function showClassSelect(onPick: (classId: HeroClass) => void): void {
  const panel = document.getElementById('class-panel');
  const list = document.getElementById('class-list');
  if (!panel || !list) {
    onPick('squire');
    return;
  }

  list.innerHTML = '';
  for (const id of ORDER) {
    const cls = CLASSES[id];
    const blurb = BLURBS[id];
    const beat = `${(cls.attackIntervalMs / 1000).toFixed(1)}s`;
    const basicId = (CLASS_ABILITIES[id] ?? [])[0]?.abilityId;
    const basicName = basicId ? (ACTIVES[basicId]?.name ?? '') : '';

    const card = document.createElement('button');
    card.className = 'class-card';
    card.innerHTML = `
      <div class="cc-head"><span class="cc-emoji">${blurb.emoji}</span><span class="cc-name">${cls.name}</span></div>
      <div class="cc-fantasy">${blurb.fantasy}</div>
      <div class="cc-style">${blurb.style}</div>
      <div class="cc-stats">
        <span>❤️ ${cls.baseMaxHp} HP (+${cls.hpPerLevel}/lvl)</span>
        <span>⚔️ ${cls.baseAttack} ATK (+${perLevel(cls.attackPerLevel)}/lvl)</span>
        <span>⏱️ ${beat} attack</span>
        <span>🔵 ${cls.baseMana} mana</span>
      </div>
      <div class="cc-ability">Attack style: <b>${basicName}</b></div>`;
    card.addEventListener('click', () => {
      panel.classList.remove('show');
      onPick(id);
    });
    list.appendChild(card);
  }

  panel.classList.add('show');
}
