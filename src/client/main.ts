import Phaser from 'phaser';
import { LaneScene } from './game/LaneScene';
import { HudScene, type HudHooks } from './game/HudScene';
import { fetchHero } from './api';
import { initDailyPanel, refreshDailyPanel } from './ui/daily';
import { initGearPanel, openGearPanel } from './ui/gear';

/** Wire a simple show/hide overlay panel (backdrop + trigger + close + tap-out). */
function wirePanel(triggerId: string, panelId: string, closeId: string): void {
  const backdrop = document.getElementById(panelId);
  const show = (): void => backdrop?.classList.add('show');
  const hide = (): void => backdrop?.classList.remove('show');
  document.getElementById(triggerId)?.addEventListener('click', show);
  document.getElementById(closeId)?.addEventListener('click', hide);
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) hide();
  });
}

async function boot(): Promise<void> {
  const { hero, idle } = await fetchHero();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#120c1c',
    pixelArt: true, // nearest-neighbor — keep the pixel sprites crisp
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 800,
      height: 1280,
    },
    scene: [],
  });

  game.scene.add('LaneScene', LaneScene, true, { hero, idle });

  // Debug handle (harmless) so the scene state can be inspected during dev.
  (window as unknown as { __game?: Phaser.Game }).__game = game;

  const lane = (): LaneScene | undefined =>
    game.scene.getScene('LaneScene') as LaneScene | undefined;

  // The HUD now lives on the Phaser canvas (HudScene, skinned via ui-map.json).
  // Hide the legacy HTML/CSS HUD frame; the modal panels below stay HTML (they
  // sit outside #hud, so hiding #hud leaves them intact).
  document.getElementById('hud')?.style.setProperty('display', 'none');

  const hooks: HudHooks = {
    extract: () => lane()?.extract(),
    openGear: openGearPanel,
    openBase: () => document.getElementById('base-panel')?.classList.add('show'),
    openMenu: () => document.getElementById('menu-panel')?.classList.add('show'),
  };
  game.scene.add('HudScene', HudScene, true, { hooks, hero });

  // Modal panels remain HTML overlays, opened from the canvas HUD buttons.
  wirePanel('btn-base', 'base-panel', 'base-close');
  wirePanel('btn-menu', 'menu-panel', 'menu-close');
  // Opening Daily from the menu closes the menu first (shared backdrop stack).
  document
    .getElementById('btn-daily')
    ?.addEventListener('click', () => document.getElementById('menu-panel')?.classList.remove('show'));

  // Daily meta panel: wire the DAILY entry, and repaint the board/frontier each
  // time a run resolves (the server records it in the run-result flow).
  initDailyPanel();
  game.events.on('run-resolved', () => void refreshDailyPanel());

  // Gear review panel: reads/mutates the hero through the live scene.
  initGearPanel({
    getHero: () => lane()?.getHeroSnapshot() ?? hero,
    changeGear: (id, unequip) => lane()?.changeGear(id, unequip) ?? Promise.resolve(),
    sellGear: (id) => lane()?.sellGear(id) ?? Promise.resolve(),
    onChange: (cb) => {
      game.events.on('hero-changed', cb);
    },
  });
}

void boot();
