// SFX pack (D28, audio.md) — the parts that can be checked without an audio
// device: the mute preference round-trip and the guarantee that audio NEVER
// starts before a user gesture (mobile webviews reject it, and an unlocked
// context on load is exactly the autoplay violation audio.md warns about).
//
// The cue synthesis itself needs a real AudioContext, so these checks pin the
// behaviour around it: playSfx must be a safe no-op when locked or muted.

import { assert, check, describe } from './helpers';
import { initSfx, isMuted, playSfx, toggleMute } from '../src/client/sfx';

describe('sfx');

/** Minimal in-memory stand-in for localStorage. */
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (k: string): string | null => data.get(k) ?? null,
    setItem: (k: string, v: string): void => void data.set(k, v),
  };
}

await check('a fresh player starts audible', () => {
  initSfx(fakeStorage());
  assert.equal(isMuted(), false);
});

await check('mute round-trips through storage', () => {
  const store = fakeStorage();
  initSfx(store);
  assert.equal(toggleMute(store), true);
  assert.equal(isMuted(), true);
  // A new session reading the same storage stays muted.
  initSfx(store);
  assert.equal(isMuted(), true);
  assert.equal(toggleMute(store), false);
  assert.equal(isMuted(), false);
});

await check('storage that throws (private mode) leaves the game audible, not crashed', () => {
  const hostile: Pick<Storage, 'getItem' | 'setItem'> = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
  initSfx(hostile);
  assert.equal(isMuted(), false);
  // Toggling still works for the session even though it can't persist.
  assert.equal(toggleMute(hostile), true);
  assert.equal(toggleMute(hostile), false);
});

await check('playSfx is a silent no-op before any user gesture (autoplay rule)', () => {
  initSfx(fakeStorage());
  // No unlockSfx() call has happened, and there is no AudioContext in node —
  // every cue must return without constructing anything or throwing.
  for (const id of ['hit', 'crit', 'kill', 'extract', 'death', 'levelUp', 'bossSpawn'] as const) {
    assert.doesNotThrow(() => playSfx(id));
  }
});

await check('playSfx stays a no-op while muted', () => {
  const store = fakeStorage();
  initSfx(store);
  toggleMute(store);
  assert.equal(isMuted(), true);
  assert.doesNotThrow(() => playSfx('extract'));
  toggleMute(store); // leave global state audible for any later test file
});
