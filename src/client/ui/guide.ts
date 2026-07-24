// Guided first run (D35): 2-3 inline coach prompts + a first-extract celebration,
// skippable from the very first prompt. Presentation only — it listens to the
// game events LaneScene already emits ('run-choice' at the first choice doors,
// 'run-resolved' at run end) and shows a non-blocking bubble; the fight keeps
// running behind it. State lives in localStorage (device-local, like the
// rotation order + checkpoint UI), so the tutorial shows exactly once.

import type Phaser from 'phaser';

const TUTORIAL_KEY = 'delve:tutorial:v1';

export const tutorialDone = (ls: Storage): boolean => {
  try {
    return ls.getItem(TUTORIAL_KEY) === 'done';
  } catch {
    return true; // no storage → don't nag
  }
};

export const markTutorialDone = (ls: Storage): void => {
  try {
    ls.setItem(TUTORIAL_KEY, 'done');
  } catch {
    /* private mode — the in-memory guard below still prevents re-showing */
  }
};

/** Clear the show-once flag so the guided run returns (used on factory reset). */
export const clearTutorial = (ls: Storage): void => {
  try {
    ls.removeItem(TUTORIAL_KEY);
  } catch {
    /* no storage — nothing to clear */
  }
};

/** The guide's game-event listeners from a prior init (e.g. before a factory
 *  reset re-arms it), tracked so they can be detached — otherwise each reset
 *  would stack another live pair on the shared emitter. */
let activeGuideListeners: { onChoice: () => void; onResolved: (e: { outcome?: string } | undefined) => void } | null =
  null;

/** Wire the guided first run. No-op if the tutorial is already done. Safe to
 *  call every boot / after a reset — it detaches any prior listeners first and
 *  the localStorage flag gates re-showing. */
export function initGuide(game: Phaser.Game, ls: Storage): void {
  if (activeGuideListeners) {
    game.events.off('run-choice', activeGuideListeners.onChoice);
    game.events.off('run-resolved', activeGuideListeners.onResolved);
    activeGuideListeners = null;
  }
  if (tutorialDone(ls)) return;
  const coach = document.getElementById('coach');
  if (!coach) return;

  let finished = false;
  let choicePrompted = false;

  const hide = (): void => {
    coach.classList.remove('show');
    coach.innerHTML = '';
  };
  const finish = (): void => {
    if (finished) return;
    finished = true;
    markTutorialDone(ls);
    hide();
  };

  /** Render a bubble. `skippable` adds a Skip button that ends the tutorial. */
  const bubble = (html: string, primaryLabel: string, onPrimary: () => void, skippable: boolean): void => {
    if (finished) return;
    coach.innerHTML = `
      <div class="coach-bubble">
        <div class="coach-text">${html}</div>
        <div class="coach-actions">
          ${skippable ? '<button class="coach-skip" type="button">Skip</button>' : ''}
          <button class="coach-next" type="button">${primaryLabel}</button>
        </div>
      </div>`;
    coach.classList.add('show');
    coach.querySelector<HTMLButtonElement>('.coach-next')?.addEventListener('click', onPrimary);
    coach.querySelector<HTMLButtonElement>('.coach-skip')?.addEventListener('click', finish);
  };

  // Prompt 1 — auto-battle. Skippable from here on (D35).
  bubble(
    '⚔️ Your delver fights on their own. Watch them cut deeper into the dark — every kill drops gold and loot.',
    'Got it',
    hide,
    true,
  );

  // Prompt 2 — the choice doors, on the first floor that pauses for a choice.
  const onChoice = (): void => {
    if (finished || choicePrompted) return;
    choicePrompted = true;
    bubble(
      'Floor cleared! ⬅️ the <b>amber door</b> extracts — banks everything you’ve earned. ➡️ the <b>glowing door</b> descends deeper for greater rewards, but dying loses this run’s loot.',
      'Got it',
      hide,
      true,
    );
  };

  // Run end — celebrate the first extract; on a death just bow out (no re-nag).
  const onResolved = (e: { outcome?: string } | undefined): void => {
    if (finished) return;
    if (e?.outcome === 'extracted') {
      coach.innerHTML = `
        <div class="coach-bubble celebrate">
          <div class="coach-text">🎉 <b>First delve banked!</b> Your gold and loot are safe. Gear up, then dive again — deeper each time.</div>
          <div class="coach-actions"><button class="coach-next" type="button">Onward</button></div>
        </div>`;
      coach.classList.add('show');
      coach.querySelector<HTMLButtonElement>('.coach-next')?.addEventListener('click', finish);
    } else {
      finish();
    }
  };

  game.events.on('run-choice', onChoice);
  game.events.on('run-resolved', onResolved);
  activeGuideListeners = { onChoice, onResolved };
}
