import Phaser from 'phaser';
import { showToast } from '@devvit/web/client';
import { LaneScene } from './game/LaneScene';
import { HudScene, type HudHooks } from './game/HudScene';
import { fetchHero, postResetHero, postRunResult } from './api';
import { clearQueue, flushQueue } from './runQueue';
import { clearRotationOrder } from './rotation';
import { initDailyPanel, refreshDailyPanel } from './ui/daily';
import { initGearPanel, openGearPanel } from './ui/gear';

/** Wire an overlay panel's dismissal (close button + tap-out on the backdrop).
 *  Panels are OPENED from the canvas HUD via HudHooks, not from DOM triggers.
 *  Stops propagation so clicks inside panels never reach the Phaser canvas. */
function wirePanelClose(panelId: string, closeId: string): void {
  const backdrop = document.getElementById(panelId);
  const hide = (): void => backdrop?.classList.remove('show');
  document.getElementById(closeId)?.addEventListener('click', (e) => { e.stopPropagation(); hide(); });
  backdrop?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === backdrop) hide();
  });
}

async function boot(): Promise<void> {
  // Re-post any runs whose /api/run/result failed last session BEFORE loading
  // the hero, so fetchHero returns the already-credited state in one shot.
  // Deliberate simplification: flush at boot only — a mid-session retry would
  // burn the 30s rate-limit window against the player's next live run.
  try {
    const { recovered } = await flushQueue(localStorage, Date.now(), async (run) => {
      const result = await postRunResult(run.outcome, run.depthReached, run.haul, run.runId, true);
      return result.status;
    });
    if (recovered > 0) {
      showToast(`Recovered ${recovered} unsynced run${recovered > 1 ? 's' : ''}`);
    }
  } catch (err) {
    console.warn('[delve] run-queue flush failed (non-fatal)', err);
  }

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

  const hooks: HudHooks = {
    openGear: openGearPanel,
    openBase: () => document.getElementById('base-panel')?.classList.add('show'),
    openMenu: () => document.getElementById('menu-panel')?.classList.add('show'),
    cast: (abilityId: string) => lane()?.castAbility(abilityId),
    getRotation: () => lane()?.getRotationOrder() ?? [],
    setRotation: (order: string[]) => lane()?.setRotationOrder(order),
  };
  game.scene.add('HudScene', HudScene, true, { hooks, hero });

  // Modal panels remain HTML overlays, opened from the canvas HUD buttons.
  wirePanelClose('base-panel', 'base-close');
  wirePanelClose('menu-panel', 'menu-close');
  // Opening Daily from the menu closes the menu first (shared backdrop stack).
  document
    .getElementById('btn-daily')
    ?.addEventListener('click', () => document.getElementById('menu-panel')?.classList.remove('show'));

  // Factory reset (menu → 🗑️): two-tap confirm (no alert/confirm in the Devvit
  // iframe), then server reset → clear device-local state → restart both
  // scenes with the fresh hero. Never fake a reset locally — the server copy
  // would win at next load.
  const resetButton = document.getElementById('btn-reset');
  const resetLabel = resetButton?.textContent ?? '';
  let resetArmed = false;
  const disarmReset = (): void => {
    resetArmed = false;
    if (resetButton) resetButton.textContent = resetLabel;
  };
  resetButton?.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetButton.textContent = '⚠️ Tap again to erase EVERYTHING';
      setTimeout(disarmReset, 4000);
      return;
    }
    disarmReset();
    void (async () => {
      const resp = await postResetHero();
      if (!resp) {
        showToast('Reset failed — try again');
        return;
      }
      clearQueue(localStorage);       // old hero's pending runs must not re-award
      clearRotationOrder(localStorage);
      document.getElementById('menu-panel')?.classList.remove('show');
      game.scene.getScene('LaneScene')?.scene.restart({ hero: resp.hero });
      game.scene.getScene('HudScene')?.scene.restart({ hooks, hero: resp.hero });
      game.events.emit('hero-changed', resp.hero);
      showToast('Fresh start — back to Depth 1');
    })();
  });

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
