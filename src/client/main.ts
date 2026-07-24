import Phaser from 'phaser';
import { showToast } from '@devvit/web/client';
import type { Hero, HeroClass } from '../shared/delve';
import { deriveStats } from '../shared/content/gear';
import { unlockedAbilities } from '../shared/content/actives';
import { LaneScene } from './game/LaneScene';
import { HudScene, type HudHooks } from './game/HudScene';
import { fetchHero, postChooseClass, postResetHero, postRunResult } from './api';
import { clearQueue, flushQueue } from './runQueue';
import { clearRotationOrder } from './rotation';
import { initDailyPanel, refreshDailyPanel } from './ui/daily';
import { initGearPanel, openGearPanel } from './ui/gear';
import { showClassSelect } from './ui/classSelect';
import { clearTutorial, initGuide, markTutorialDone } from './ui/guide';

/** Show-once flag for the D13 class-select creation moment (device-local, like
 *  the tutorial + rotation state). Cleared on factory reset so it returns. */
const ONBOARDED_KEY = 'delve:onboarded:v1';

/** True while the hero has never made progress — the only time the class-select
 *  creation moment shows (mirrors the server's isFreshHero gate). */
function isFreshHeroClient(h: Hero): boolean {
  return (
    h.level === 1 &&
    h.xp === 0 &&
    h.bestDepth <= 1 &&
    h.gold === 0 &&
    h.stash.length === 0 &&
    Object.keys(h.equipped).length === 0
  );
}

/** Offline-only fallback: preview the chosen class locally (derived from the
 *  shared registries) when /api/hero/class is unreachable. The server copy wins
 *  at the next successful load. */
function localHeroForClass(base: Hero, classId: HeroClass): Hero {
  const d = deriveStats(classId, base.level, base.equipped);
  return {
    ...base,
    class: classId,
    maxHp: d.maxHp,
    hp: d.maxHp,
    attack: d.attack,
    defense: d.defensePct,
    critChance: d.critChance,
    critMultiplier: d.critMultiplier,
    lifesteal: d.lifestealPct,
    dodge: d.dodgeChance,
    hpRegen: d.hpRegen,
    goldFind: d.goldFindPct,
    maxMana: d.maxMana,
    mana: d.maxMana,
    abilities: unlockedAbilities(classId, base.level),
  };
}

/** Hero-creation moment (D13): a brand-new fresh hero picks one of the 3 bases
 *  before the first run. Resolves to the class-updated hero (server-owned, with
 *  a local preview fallback). Returns the hero untouched if already onboarded. */
async function chooseClassIfNew(hero: Hero, ls: Storage): Promise<Hero> {
  if (ls.getItem(ONBOARDED_KEY) || !isFreshHeroClient(hero)) return hero;
  const chosen = await new Promise<Hero>((resolve) => {
    showClassSelect(async (classId) => {
      const resp = await postChooseClass(classId);
      resolve(resp?.hero ?? localHeroForClass(hero, classId));
    });
  });
  ls.setItem(ONBOARDED_KEY, '1');
  return chosen;
}

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

  const { hero: fetchedHero, idle } = await fetchHero();

  // The single live game — recreated whole on factory reset (driving Phaser's
  // scene lifecycle from an async DOM handler proved unreliable; a fresh
  // Phaser.Game is the same known-good path as a first boot). `game` is
  // reassigned, so every closure below reads it at call time. `gameReady` gates
  // the overlay sync during the destroy→recreate gap.
  let game: Phaser.Game;
  let gameReady = false;
  let gearOnChange: ((h: Hero) => void) | null = null;

  const lane = (): LaneScene | undefined =>
    game?.scene.getScene('LaneScene') as LaneScene | undefined;

  const hooks: HudHooks = {
    openGear: openGearPanel,
    openBase: () => document.getElementById('base-panel')?.classList.add('show'),
    openMenu: () => document.getElementById('menu-panel')?.classList.add('show'),
    cast: (abilityId: string) => lane()?.castAbility(abilityId),
    getRotation: () => lane()?.getRotationOrder() ?? [],
    setRotation: (order: string[]) => lane()?.setRotationOrder(order),
  };

  // DOM overlays must fully swallow input. Phaser listens for pointerdown on
  // the WINDOW as well as the canvas (inputWindowEvents default), so a tap on
  // a panel row also pressed canvas buttons underneath it — e.g. selling a
  // stash item hit the Continue zone. So while ANY overlay (.panel-backdrop:
  // gear/menu/daily/base/checkpoint/class/item popup) is visible, the game's
  // input manager is disabled outright. Skipped while no game is live (during
  // a reset's destroy→recreate gap).
  const syncOverlayGate = (): void => {
    if (!gameReady || !game?.input) return;
    const anyOverlayOpen = Array.from(
      document.querySelectorAll<HTMLElement>('.panel-backdrop')
    ).some((el) => el.classList.contains('show') || el.style.display === 'flex');
    game.input.enabled = !anyOverlayOpen;
  };

  /** Build a fresh game for `hero` and wire its per-instance event listeners.
   *  Used for the first boot and re-used verbatim on factory reset. */
  const createGame = (hero: Hero, idleGains?: typeof idle): Phaser.Game => {
    const g = new Phaser.Game({
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
    g.scene.add('LaneScene', LaneScene, true, { hero, idle: idleGains });
    g.scene.add('HudScene', HudScene, true, { hooks, hero });

    // Guided first run (D35): only for a genuinely new hero. A returning player
    // (any progress) has the tutorial pre-marked done so it never nags.
    if (!isFreshHeroClient(hero)) markTutorialDone(localStorage);
    initGuide(g, localStorage);

    // Per-instance event wiring (lost when the old game is destroyed).
    g.events.on('run-resolved', () => void refreshDailyPanel());
    if (gearOnChange) g.events.on('hero-changed', gearOnChange);

    (window as unknown as { __game?: Phaser.Game }).__game = g; // debug handle
    gameReady = true;
    syncOverlayGate();
    return g;
  };

  // Hero-creation moment (D13): pick a base class before the first run. Blocks
  // game creation so the engine builds from the chosen class's stats.
  const hero = await chooseClassIfNew(fetchedHero, localStorage);
  game = createGame(hero, idle);

  const overlayObserver = new MutationObserver(syncOverlayGate);
  overlayObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  syncOverlayGate();

  // Modal panels remain HTML overlays, opened from the canvas HUD buttons.
  wirePanelClose('base-panel', 'base-close');
  wirePanelClose('menu-panel', 'menu-close');
  // Opening Daily from the menu closes the menu first (shared backdrop stack).
  document
    .getElementById('btn-daily')
    ?.addEventListener('click', () => document.getElementById('menu-panel')?.classList.remove('show'));

  // Factory reset (menu → 🗑️): two-tap confirm (no alert/confirm in the Devvit
  // iframe), then server reset → clear device-local state → tear down the game →
  // re-run the D13 creation moment (class select + guided run) → build a fresh
  // game on the chosen hero. Never fake a reset locally — the server copy would
  // win at next load.
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
      // A reset is a brand-new hero: replay onboarding + the guided first run.
      localStorage.removeItem(ONBOARDED_KEY);
      clearTutorial(localStorage);
      document.getElementById('menu-panel')?.classList.remove('show');

      // Tear the whole game down so the stage goes blank behind the picker (the
      // "creation moment" loads first, like a fresh boot), then pick a class and
      // build a brand-new game on the chosen hero.
      gameReady = false;
      game.destroy(true);
      const freshHero = await chooseClassIfNew(resp.hero, localStorage);
      game = createGame(freshHero);
      showToast('Fresh start — back to Depth 1');
    })();
  });

  // Daily meta panel: the board/frontier repaint on 'run-resolved' is wired per
  // game instance inside createGame (the listener dies with the old game).
  initDailyPanel();

  // Gear review panel: reads/mutates the hero through the live scene. The
  // 'hero-changed' subscription is captured so createGame can re-attach it to a
  // rebuilt game after a reset.
  initGearPanel({
    getHero: () => lane()?.getHeroSnapshot() ?? hero,
    changeGear: (id, unequip) => lane()?.changeGear(id, unequip) ?? Promise.resolve(),
    sellGear: (id) => lane()?.sellGear(id) ?? Promise.resolve(),
    onChange: (cb) => {
      gearOnChange = cb;
      game.events.on('hero-changed', cb);
    },
  });
}

void boot();
