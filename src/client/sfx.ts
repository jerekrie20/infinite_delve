// Light SFX pack (D28, game_design/art/audio.md) — Phase 3 "first juice pass".
//
// Synthesised with WebAudio rather than shipped as audio files. audio.md budgets
// ~300KB of OGGs for ~18 one-shots; oscillator+noise cues cost **zero** bundle
// bytes, add no network requests inside the Devvit iframe, and keep splash.html
// featherweight (this module is only imported by the game entry, never the
// splash). Every cue is short, mono, and mixed well under 1.0 gain.
//
// Autoplay rule (audio.md): mobile webviews refuse audio until a user gesture,
// so the context is created lazily on the first `play()` AFTER `unlock()` has
// seen a real tap, and resumed if the browser suspended it.

/** Every cue the game can fire. Keep in sync with the audio.md event map. */
export type SfxId =
  | 'hit' | 'crit' | 'monsterHit' | 'dodge' | 'cast' | 'kill'
  | 'loot' | 'lootRare' | 'levelUp' | 'choice' | 'extract' | 'death'
  | 'bossSpawn' | 'tap';

const MUTE_KEY = 'delve:muted:v1';

interface CueStep {
  /** Oscillator shape, or 'noise' for a filtered white-noise burst. */
  wave: OscillatorType | 'noise';
  /** Start/end frequency in Hz (a glide when they differ). */
  from: number;
  to?: number;
  /** Seconds from the cue's start, and how long this step rings for. */
  at: number;
  dur: number;
  /** Peak gain before the exponential decay. */
  gain: number;
}

/** The cue book. Feel notes come straight from audio.md's event→sound table. */
const CUES: Record<SfxId, CueStep[]> = {
  // Hero hit lands — soft thump.
  hit: [{ wave: 'triangle', from: 220, to: 120, at: 0, dur: 0.09, gain: 0.22 }],
  // Crit — sharper crack + shimmer (pairs with the existing screen shake).
  crit: [
    { wave: 'square', from: 520, to: 180, at: 0, dur: 0.07, gain: 0.20 },
    { wave: 'noise', from: 3000, at: 0, dur: 0.10, gain: 0.16 },
    { wave: 'sine', from: 1180, to: 1760, at: 0.04, dur: 0.16, gain: 0.10 },
  ],
  // Monster hit lands — duller thud, distinct from the hero's.
  monsterHit: [{ wave: 'sine', from: 150, to: 70, at: 0, dur: 0.11, gain: 0.20 }],
  // Dodge / block — whiff.
  dodge: [{ wave: 'noise', from: 1400, at: 0, dur: 0.13, gain: 0.13 }],
  // Ability cast — arcane whoosh rising into a chime.
  cast: [
    { wave: 'noise', from: 900, at: 0, dur: 0.16, gain: 0.10 },
    { wave: 'sine', from: 440, to: 880, at: 0.02, dur: 0.20, gain: 0.14 },
  ],
  // Kill — small pop + coin tinkle.
  kill: [
    { wave: 'triangle', from: 300, to: 90, at: 0, dur: 0.09, gain: 0.18 },
    { wave: 'sine', from: 1320, at: 0.06, dur: 0.12, gain: 0.10 },
  ],
  // Loot drop — chest thunk.
  loot: [{ wave: 'triangle', from: 260, to: 160, at: 0, dur: 0.12, gain: 0.16 }],
  // Epic+/set/unique — a riser on top of the thunk.
  lootRare: [
    { wave: 'triangle', from: 260, to: 160, at: 0, dur: 0.12, gain: 0.16 },
    { wave: 'sine', from: 660, to: 1320, at: 0.05, dur: 0.30, gain: 0.13 },
  ],
  // Level up — bright fanfare (major triad).
  levelUp: [
    { wave: 'square', from: 523, at: 0, dur: 0.13, gain: 0.12 },
    { wave: 'square', from: 659, at: 0.10, dur: 0.13, gain: 0.12 },
    { wave: 'square', from: 784, at: 0.20, dur: 0.26, gain: 0.14 },
  ],
  // Checkpoint choice appears — the low tension drum.
  choice: [{ wave: 'sine', from: 110, to: 82, at: 0, dur: 0.34, gain: 0.20 }],
  // Extract success — THE payoff: a warm rising resolve chord.
  extract: [
    { wave: 'triangle', from: 392, at: 0, dur: 0.34, gain: 0.13 },
    { wave: 'triangle', from: 523, at: 0.09, dur: 0.34, gain: 0.13 },
    { wave: 'triangle', from: 659, at: 0.18, dur: 0.42, gain: 0.15 },
    { wave: 'sine', from: 784, to: 1046, at: 0.26, dur: 0.46, gain: 0.11 },
  ],
  // Death — short descending sting, deliberately not punishing.
  death: [
    { wave: 'sawtooth', from: 330, to: 110, at: 0, dur: 0.34, gain: 0.15 },
    { wave: 'sine', from: 165, to: 62, at: 0.10, dur: 0.40, gain: 0.12 },
  ],
  // Boss spawn — horn + rumble.
  bossSpawn: [
    { wave: 'sawtooth', from: 98, to: 147, at: 0, dur: 0.46, gain: 0.16 },
    { wave: 'sine', from: 55, at: 0, dur: 0.60, gain: 0.16 },
  ],
  // UI tap / equip — a soft click.
  tap: [{ wave: 'sine', from: 880, to: 660, at: 0, dur: 0.045, gain: 0.10 }],
};

/** Cues that may fire many times a second — rate-limited so a fast attack
 *  timer or a 4-hit Volley can't stack into a buzz. */
const THROTTLE_MS: Partial<Record<SfxId, number>> = {
  hit: 60, monsterHit: 60, dodge: 80, loot: 90, cast: 90,
};

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let muted = false;
let unlocked = false;
let noiseBuffer: AudioBuffer | undefined;
const lastPlayed = new Map<SfxId, number>();

/** Read the persisted mute preference. Safe before `initSfx`. */
export function isMuted(): boolean {
  return muted;
}

/** Load the stored mute preference. Call once at boot. */
export function initSfx(storage: Pick<Storage, 'getItem' | 'setItem'>): void {
  try {
    muted = storage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false; // private-mode storage — default to audible
  }
}

/** Flip mute and persist it. Returns the new state. */
export function toggleMute(storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  muted = !muted;
  try {
    storage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // preference just won't persist; the session still respects it
  }
  if (muted && ctx) lastPlayed.clear();
  return muted;
}

/** Mark that a real user gesture has happened — mobile webviews need this
 *  before any audio may start. Wire to the first tap (class select / Continue). */
export function unlockSfx(): void {
  unlocked = true;
  void ctx?.resume();
}

/** Lazily build the audio graph; returns undefined when audio can't run. */
function audio(): { ctx: AudioContext; master: GainNode } | undefined {
  if (!unlocked || muted) return undefined;
  if (!ctx) {
    const Ctor = globalThis.AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    try {
      ctx = new Ctor();
    } catch {
      return undefined; // no audio device / blocked
    }
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return master ? { ctx, master } : undefined;
}

/** One second of white noise, reused by every noise step. */
function noise(context: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const len = Math.floor(context.sampleRate * 0.5);
    noiseBuffer = context.createBuffer(1, len, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    // Deterministic pseudo-noise: shared/ forbids Math.random and there is no
    // reason for audio texture to vary run to run.
    let seed = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
  }
  return noiseBuffer;
}

/** Fire a cue. Silent (and cheap) when muted, locked, or throttled. */
export function playSfx(id: SfxId): void {
  const throttle = THROTTLE_MS[id];
  if (throttle !== undefined) {
    const now = performance.now();
    const prev = lastPlayed.get(id);
    if (prev !== undefined && now - prev < throttle) return;
    lastPlayed.set(id, now);
  }
  const a = audio();
  if (!a) return;
  const steps = CUES[id];
  const t0 = a.ctx.currentTime;

  for (const step of steps) {
    const gain = a.ctx.createGain();
    const start = t0 + step.at;
    const end = start + step.dur;
    // Tiny attack then exponential decay — no clicks, no sustained tones.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(step.gain, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(a.master);

    if (step.wave === 'noise') {
      const src = a.ctx.createBufferSource();
      src.buffer = noise(a.ctx);
      const filter = a.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = step.from;
      filter.Q.value = 0.8;
      src.connect(filter);
      filter.connect(gain);
      src.start(start);
      src.stop(end);
    } else {
      const osc = a.ctx.createOscillator();
      osc.type = step.wave;
      osc.frequency.setValueAtTime(step.from, start);
      if (step.to !== undefined && step.to !== step.from) {
        osc.frequency.exponentialRampToValueAtTime(step.to, end);
      }
      osc.connect(gain);
      osc.start(start);
      osc.stop(end);
    }
  }
}
