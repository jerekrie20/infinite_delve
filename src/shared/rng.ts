// Seeded deterministic PRNG (mulberry32) + draw helpers. THE `Rng` type every
// shared module signs its randomness with (waves/items re-export it). Same seed
// = bit-identical stream — Daily Delve fairness, offline sim, replay
// verification, and the test suite all depend on that; never swap the
// algorithm without versioning anything persisted that was rolled from a seed.

/** A 0..1 random source (Math.random at runtime; createRng(seed) in tests/sims). */
export type Rng = () => number;

export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Deterministic 32-bit seed from a string (FNV-1a). One canonical seed per
 *  runId: the client seeds its engine with it, and (Phase 7) the server can
 *  re-derive the same seed from the reported runId for replay verification. */
export const seedFromString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const randInt = (rng: Rng, minIncl: number, maxExcl: number): number =>
  minIncl + Math.floor(rng() * (maxExcl - minIncl));

export const pick = <T>(rng: Rng, arr: readonly T[]): T => {
  if (arr.length === 0) throw new Error('pick from empty array');
  return arr[randInt(rng, 0, arr.length)]!;
};

export const shuffle = <T>(rng: Rng, arr: readonly T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
