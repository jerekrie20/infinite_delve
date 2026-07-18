import Phaser from 'phaser';
import { LaneScene } from './game/LaneScene';
import { fetchHero } from './api';
import { initDailyPanel, refreshDailyPanel } from './ui/daily';

async function boot(): Promise<void> {
  const { hero, idle } = await fetchHero();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#120c1c',
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

  document
    .getElementById('btn-extract')
    ?.addEventListener('click', () => lane()?.extract());

  // Daily meta panel: wire the DAILY chip, and repaint the board/frontier each
  // time a run resolves (the server records it in the run-result flow). The
  // scene emits on the game-global bus, which exists immediately — attaching to
  // the scene's own emitter here would miss it (scene isn't created until boot).
  initDailyPanel();
  game.events.on('run-resolved', () => void refreshDailyPanel());
}

void boot();
