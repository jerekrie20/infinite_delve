/**
 * Deterministic fractal value noise for natural-looking terrain.
 * createNoise2D(seed) returns (x, y) -> [0, 1] that varies smoothly, so
 * thresholding it yields contiguous regions (meadows, ponds, hills) rather
 * than scattered single tiles. Copied from the Faction War map generator.
 */
export type Noise2D = (x: number, y: number) => number;

const hash2 = (x: number, y: number, seed: number): number => {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

const rand01 = (x: number, y: number, seed: number): number =>
  hash2(x, y, seed) / 4294967296;

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const valueNoise = (x: number, y: number, seed: number): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v00 = rand01(x0, y0, seed);
  const v10 = rand01(x0 + 1, y0, seed);
  const v01 = rand01(x0, y0 + 1, seed);
  const v11 = rand01(x0 + 1, y0 + 1, seed);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
};

export interface NoiseOptions {
  octaves?: number;
  frequency?: number;
  persistence?: number;
  lacunarity?: number;
}

export const createNoise2D = (
  seed: number,
  opts: NoiseOptions = {}
): Noise2D => {
  const octaves = opts.octaves ?? 4;
  const baseFreq = opts.frequency ?? 0.14;
  const persistence = opts.persistence ?? 0.5;
  const lacunarity = opts.lacunarity ?? 2;

  return (x, y) => {
    let amp = 1;
    let freq = baseFreq;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * valueNoise(x * freq, y * freq, (seed + o * 1013) >>> 0);
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  };
};
