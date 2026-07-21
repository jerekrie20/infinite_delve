// generateDelve(seed, depth) — mapgen v3. Builds a Meadow delve as a LAYERED
// pipeline instead of one flat threshold, so maps have real geography:
//
//   1. Paint surface material (grass/tree/water/hill), tree density modulated
//      by a low-frequency "wildness" field so there are open plains AND thickets.
//   2. Terrace the elevation noise into an integer height 0..3 per tile
//      (rank-based cuts so tiers never degenerate, then median-smoothed into
//      broad plateaus). This is the field the isometric renderer lifts + walls.
//   3. Carve a winding river (steepest-descent) with a couple of fords.
//   4. Pick the spawn, then stamp landmarks (grove, mesa) that reward detours.
//   5. Choose the extract as the farthest REACHABLE tile, and scatter monsters,
//      loot and decor on the reachable region.
//
// Connectivity is height-aware: two walkable tiles are only linked if the step
// between them is <= MAX_CLIMBABLE_STEP, so a 2-level drop is a real cliff you
// route around. Everything is placed in the single largest reachable region and
// the extract is the farthest reachable tile from spawn, so every map is
// winnable BY CONSTRUCTION regardless of how rivers/cliffs carve it up.
//
// Every random choice draws from the seeded rng / seeded noise (never
// Math.random), so the server can re-verify any run from its seed alone.

import {
  MAX_CLIMBABLE_STEP,
  Terrain,
  isWalkable,
  type DecorKind,
  type DecorSpot,
  type DelveMap,
  type GearItem,
  type LootSpot,
  type Monster,
  type MonsterKind,
  type Point,
} from '../../shared/delve';
import { createNoise2D, type Noise2D } from './noise';
import { createRng, pick, randInt, shuffle, type Rng } from './rng';

/** v3 tuning knobs — all cheap to change. */
export const DELVE_CONFIG = {
  width: 28,
  height: 28,

  // --- terrain noise (unchanged from v2) ---
  elevationFrequency: 0.1,
  coverFrequency: 0.16,
  warpFrequency: 0.05,
  warpStrength: 4,
  treeLevel: 0.72,

  // --- height tiers (0..4) ---
  // Rank cuts: a tile's level = how many of these percentiles its elevation
  // clears. Four cuts => five levels 0..4. Ranks self-balance per seed so no
  // tier is ever empty. Then a 3x3 median filter erases single-tile speckle.
  heightTierFractions: [0.2, 0.42, 0.63, 0.83] as const,
  peakJitter: 0.06,
  smoothingPasses: 2,
  // Lowest 8% of elevation samples become ambient ponds (Water at height 0).
  pondFraction: 0.08,

  // --- rivers ---
  riverMeanderStrength: 0.15,
  riverWaterCapFraction: 0.08, // stop widening once water >= 8% of the map
  riverFordCount: 2,
  borderMargin: 3, // keep the river source this far from the edge

  // --- landmarks / POIs ---
  minPoiSpacing: 8, // Chebyshev tiles between POI centers
  basePoiCount: 3,

  // --- wildness / density zones ---
  wildnessFrequency: 0.04, // much lower than coverFrequency -> big smooth zones
  densitySpread: 0.35, // how far wildness shifts the tree threshold
  treeThresholdFloor: 0.5, // even the wildest zone stays <= ~50% trees

  // --- population (unchanged from v2) ---
  baseMonsters: 5,
  baseLoot: 3,
  decorChance: 0.05,
  minSpawnClearance: 4,
  minMonsterSpacing: 2,
  minLootSpacing: 2,
  swarmChance: 0.3,
  gearDropChance: 0.4,
} as const;

const DECOR_KINDS: readonly DecorKind[] = ['rock', 'bush', 'flowers', 'log', 'mushrooms'];

/** Base gear pool for ordinary scattered loot. */
const GEAR_POOL: readonly Omit<GearItem, 'id'>[] = [
  { slot: 'hand1', r: 'common', base: 'blade', s: { attack: 2 } },
  { slot: 'body', r: 'common', base: 'armor', s: { maxHp: 6, defensePct: 3 } },
  { slot: 'head', r: 'common', base: 'helm', s: { maxHp: 4 } },
  { slot: 'feet', r: 'common', base: 'boots', s: { maxHp: 3 } },
  { slot: 'amulet', r: 'uncommon', base: 'amulet', s: { attack: 2, maxHp: 5 } },
  { slot: 'ring1', r: 'uncommon', base: 'ring', s: { attack: 3 } },
];

/** Richer pool — POIs guarantee a drop from here, so detours are worth it. */
const POI_GEAR_POOL: readonly Omit<GearItem, 'id'>[] = [
  { slot: 'hand1', r: 'rare', base: 'blade', s: { attack: 5 } },
  { slot: 'head', r: 'epic', base: 'helm', s: { maxHp: 12, attack: 3 } },
  { slot: 'body', r: 'rare', base: 'armor', s: { maxHp: 10, defensePct: 4 } },
  { slot: 'amulet', r: 'epic', base: 'amulet', s: { maxHp: 14, goldFindPct: 8 } },
];

const idx = (x: number, y: number, w: number) => y * w + x;
const cheb = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const inBounds = (x: number, y: number, w: number, h: number) =>
  x >= 0 && y >= 0 && x < w && y < h;

const NESW = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

const EIGHT = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

// ---------------------------------------------------------------------------

export function generateDelve(seed: number, depth = 1): DelveMap {
  const { width: w, height: h } = DELVE_CONFIG;
  const rng = createRng(seed);

  const elevation = createNoise2D(seed >>> 0, {
    frequency: DELVE_CONFIG.elevationFrequency,
    octaves: 4,
  });
  const cover = createNoise2D((seed ^ 0x9e3779b9) >>> 0, {
    frequency: DELVE_CONFIG.coverFrequency,
    octaves: 3,
    persistence: 0.55,
  });
  const warpX = createNoise2D((seed ^ 0x27d4eb2f) >>> 0, {
    frequency: DELVE_CONFIG.warpFrequency,
    octaves: 2,
  });
  const warpY = createNoise2D((seed ^ 0x165667b1) >>> 0, {
    frequency: DELVE_CONFIG.warpFrequency,
    octaves: 2,
  });
  const wildness = createNoise2D((seed ^ 0x1b56c4f9) >>> 0, {
    frequency: DELVE_CONFIG.wildnessFrequency,
    octaves: 2,
  });

  // 1. Paint surface material + capture the (warped) elevation sample per tile.
  const tiles: number[] = new Array(w * h);
  const elevationSamples = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = x + (warpX(x, y) - 0.5) * 2 * DELVE_CONFIG.warpStrength;
      const wy = y + (warpY(x, y) - 0.5) * 2 * DELVE_CONFIG.warpStrength;
      const e = elevation(wx, wy);
      elevationSamples[idx(x, y, w)] = e;

      // Tree threshold is LOCAL: high-wildness zones are thickets, low ones are
      // plains. Clamp so even the wildest zone stays porous.
      const localTreeThreshold = Math.max(
        DELVE_CONFIG.treeThresholdFloor,
        DELVE_CONFIG.treeLevel - (wildness(x, y) - 0.5) * DELVE_CONFIG.densitySpread
      );
      tiles[idx(x, y, w)] =
        cover(wx, wy) > localTreeThreshold ? Terrain.Tree : Terrain.Grass;
    }
  }

  // 2. Terrace elevation into integer heights 0..3, then median-smooth.
  const heights = terraceHeights(elevationSamples, w, h, rng);

  // 3. Ambient ponds: the very lowest samples become Water at height 0.
  applyAmbientPonds(tiles, heights, elevationSamples, w, h);

  // 4. Carve a river (steepest-descent) with fords punched into it.
  carveRiver(tiles, heights, elevationSamples, w, h);

  // 5. Largest reachable region (height-aware). Degenerate seed -> open field.
  let region = largestWalkableComponent(tiles, heights, w, h);
  if (region.length < 20) {
    tiles.fill(Terrain.Grass);
    heights.fill(0);
    region = allTiles(w, h);
    return populate(seed, depth, tiles, heights, w, h, region, topLeft(region), [], new Set(), wildness, rng);
  }

  // Spawn is fixed EARLY (top-left-most reachable tile) so landmarks can face it.
  let spawn = topLeft(region);

  // 6. Landmarks. Each stamps terrain/height and returns a rich loot spot; the
  //    tiles it claims are reserved so ordinary population skips them.
  const { poiLoot, reserved } = placeLandmarks(
    tiles, heights, region, spawn, w, h, depth, rng
  );

  // 7. Landmarks changed the terrain, so recompute the reachable region and,
  //    if the spawn got cut off, re-anchor it.
  region = largestWalkableComponent(tiles, heights, w, h);
  if (!region.some((p) => p.x === spawn.x && p.y === spawn.y)) spawn = topLeft(region);

  return populate(seed, depth, tiles, heights, w, h, region, spawn, poiLoot, reserved, wildness, rng);
}

// ---------------------------------------------------------------------------
// Height field
// ---------------------------------------------------------------------------

/**
 * Turn the [0,1] elevation samples into integer height levels 0..3 using
 * RANK-based cut points (quantiles), so a balanced spread of levels exists on
 * every seed — fixed value cuts would leave some seeds with no top tier because
 * fractal noise clusters around 0.5. Then median-smooth to broad plateaus.
 */
function terraceHeights(
  elevationSamples: Float64Array,
  w: number,
  h: number,
  rng: Rng
): number[] {
  const tileCount = w * h;
  // NOTE: Float64Array.sort() is NUMERIC. A plain Array's .sort() is
  // lexicographic and would corrupt these cuts — keep this typed.
  const sorted = Float64Array.from(elevationSamples).sort();
  const rankAt = (fraction: number) => sorted[Math.floor(fraction * tileCount)]!;

  // One cut per fraction; only the top cut gets rng jitter so peaks vary. Level
  // = how many cuts the sample clears, so N cuts => N+1 levels.
  const fracs = DELVE_CONFIG.heightTierFractions;
  const cuts = fracs.map((f, i) =>
    rankAt(i === fracs.length - 1 ? f + DELVE_CONFIG.peakJitter * rng() : f)
  );

  const heights = new Array<number>(tileCount);
  for (let i = 0; i < tileCount; i++) {
    const e = elevationSamples[i]!;
    let level = 0;
    for (const cut of cuts) if (e > cut) level++;
    heights[i] = level;
  }

  for (let pass = 0; pass < DELVE_CONFIG.smoothingPasses; pass++)
    medianSmooth(heights, w, h);
  return heights;
}

/** 3x3 median filter — deletes isolated single-tile bumps while keeping crisp
 *  terrace edges (an average would round every plateau into a ramp). */
function medianSmooth(heights: number[], w: number, h: number): void {
  const source = heights.slice();
  const neighborhood: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      neighborhood.length = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, w, h)) continue;
          neighborhood.push(source[idx(nx, ny, w)]!);
        }
      neighborhood.sort((a, b) => a - b);
      heights[idx(x, y, w)] = neighborhood[Math.floor(neighborhood.length / 2)]!;
    }
  }
}

/** Mark the lowest `pondFraction` of samples as Water at height 0. */
function applyAmbientPonds(
  tiles: number[],
  heights: number[],
  elevationSamples: Float64Array,
  w: number,
  h: number
): void {
  const sorted = Float64Array.from(elevationSamples).sort();
  const pondCut = sorted[Math.floor(DELVE_CONFIG.pondFraction * w * h)]!;
  for (let i = 0; i < w * h; i++) {
    if (elevationSamples[i]! < pondCut) {
      tiles[i] = Terrain.Water;
      heights[i] = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Rivers
// ---------------------------------------------------------------------------

/** Drop a "droplet" on the highest interior tile and let it roll downhill to an
 *  edge, biased by a meander field so it S-bends. Carve Water along the way and
 *  punch a couple of fords so the river is a route choice, not a wall. */
function carveRiver(
  tiles: number[],
  heights: number[],
  elevationSamples: Float64Array,
  w: number,
  h: number
): void {
  const margin = DELVE_CONFIG.borderMargin;

  // Source: the highest strictly-interior tile (deterministic argmax, y-then-x).
  let source = -1;
  let best = -Infinity;
  for (let y = margin; y < h - margin; y++)
    for (let x = margin; x < w - margin; x++) {
      const e = elevationSamples[idx(x, y, w)]!;
      if (e > best) {
        best = e;
        source = idx(x, y, w);
      }
    }
  if (source < 0) return;

  const meander = createNoise2D(0x1f83d9ab, {
    frequency: 0.06,
    octaves: 2,
  });

  const path: Point[] = [];
  const visited = new Uint8Array(w * h);
  let current = source;
  for (let step = 0; step < w * h; step++) {
    const cx = current % w;
    const cy = (current - cx) / w;
    path.push({ x: cx, y: cy });
    visited[current] = 1;

    // Step to the lowest-scoring unvisited 8-neighbor (elevation + meander).
    let next = -1;
    let lowest = Infinity;
    for (const [dx, dy] of EIGHT) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      const ni = idx(nx, ny, w);
      if (visited[ni]) continue;
      const score =
        elevationSamples[ni]! +
        (meander(nx, ny) - 0.5) * DELVE_CONFIG.riverMeanderStrength;
      if (score < lowest) {
        lowest = score;
        next = ni;
      }
    }

    // Stalled in a pit -> march toward the nearest edge so we always terminate.
    if (next === -1 || lowest >= elevationSamples[current]!) {
      next = stepTowardNearestEdge(cx, cy, w, h, visited);
    }
    if (next === -1) break; // boxed in; path so far is fine

    current = next;
    const ex = current % w;
    const ey = (current - ex) / w;
    if (ex === 0 || ey === 0 || ex === w - 1 || ey === h - 1) {
      path.push({ x: ex, y: ey });
      break; // reached the border
    }
  }

  // Carve: 1 wide upstream, widening to radius 1 in the final third; capped.
  const waterCap = Math.floor(w * h * DELVE_CONFIG.riverWaterCapFraction);
  let water = 0;
  path.forEach((p, order) => {
    const widen = order > path.length * (2 / 3) ? 1 : 0;
    for (let dy = -widen; dy <= widen; dy++)
      for (let dx = -widen; dx <= widen; dx++) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, w, h)) continue;
        if (water >= waterCap) return;
        const i = idx(nx, ny, w);
        tiles[i] = Terrain.Water;
        heights[i] = 0;
        water++;
      }
  });

  // Fords: place in the NARROW upstream half (first 60% of the path) so a single
  // walkable tile actually bridges the 1-wide channel.
  const narrowEnd = Math.floor(path.length * 0.6);
  for (let f = 1; f <= DELVE_CONFIG.riverFordCount; f++) {
    const at = Math.floor((narrowEnd * f) / (DELVE_CONFIG.riverFordCount + 1));
    const p = path[at];
    if (!p) continue;
    const i = idx(p.x, p.y, w);
    tiles[i] = Terrain.Grass;
    // Height must be within one step of an adjacent LAND tile, or canStepBetween
    // silently rejects the crossing. Copy a walkable neighbor's height.
    heights[i] = nearbyLandHeight(tiles, heights, p, w, h);
  }
}

/** Toward whichever of the four edges is nearest; ties broken deterministically.
 *  Returns an unvisited in-bounds neighbor index, or -1. */
function stepTowardNearestEdge(
  cx: number,
  cy: number,
  w: number,
  h: number,
  visited: Uint8Array
): number {
  const distLeft = cx;
  const distRight = w - 1 - cx;
  const distTop = cy;
  const distBottom = h - 1 - cy;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  let dx = 0;
  let dy = 0;
  if (min === distTop) dy = -1;
  else if (min === distBottom) dy = 1;
  else if (min === distLeft) dx = -1;
  else dx = 1;
  const nx = cx + dx;
  const ny = cy + dy;
  if (inBounds(nx, ny, w, h) && !visited[idx(nx, ny, w)]) return idx(nx, ny, w);
  return -1;
}

/** Median-ish height of walkable land neighbors (fallback: this tile's own). */
function nearbyLandHeight(
  tiles: number[],
  heights: number[],
  p: Point,
  w: number,
  h: number
): number {
  for (const [dx, dy] of NESW) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!inBounds(nx, ny, w, h)) continue;
    const ni = idx(nx, ny, w);
    if (tiles[ni] === Terrain.Grass || tiles[ni] === Terrain.Hill) return heights[ni]!;
  }
  return heights[idx(p.x, p.y, w)]!;
}

// ---------------------------------------------------------------------------
// Landmarks / POIs
// ---------------------------------------------------------------------------

interface LandmarkResult {
  poiLoot: LootSpot[];
  reserved: Set<number>;
}

/** Blue-noise place a few landmark centers, then stamp each one. */
function placeLandmarks(
  tiles: number[],
  heights: number[],
  region: Point[],
  spawn: Point,
  w: number,
  h: number,
  depth: number,
  rng: Rng
): LandmarkResult {
  const count = DELVE_CONFIG.basePoiCount + Math.floor((depth - 1) / 2);
  const featureRadius = 3;
  const centers: Point[] = [];
  for (const candidate of shuffle(rng, region)) {
    if (centers.length >= count) break;
    // Whole footprint must be on-grid, clear of the spawn, spaced from other
    // POIs, and not sitting on water (the river/ponds).
    if (
      candidate.x < featureRadius + 1 ||
      candidate.y < featureRadius + 1 ||
      candidate.x >= w - featureRadius - 1 ||
      candidate.y >= h - featureRadius - 1
    )
      continue;
    if (cheb(candidate, spawn) < 6) continue;
    if (centers.some((c) => cheb(candidate, c) < DELVE_CONFIG.minPoiSpacing)) continue;
    if (footprintTouchesWater(tiles, candidate, featureRadius, w, h)) continue;
    centers.push(candidate);
  }

  const poiLoot: LootSpot[] = [];
  const reserved = new Set<number>();
  let poiCounter = 0;
  centers.forEach((center, i) => {
    // Alternate the two landmark kinds for variety.
    if (i % 2 === 0) stampGrove(tiles, center, spawn, w, h);
    else stampMesa(tiles, heights, center, spawn, w, h);

    const base = POI_GEAR_POOL[randInt(rng, 0, POI_GEAR_POOL.length)]!;
    poiLoot.push({
      id: `poi${i}`,
      x: center.x,
      y: center.y,
      gold: randInt(rng, 20, 41),
      item: { ...base, id: `pg${i}_${poiCounter++}` },
    });
    reserved.add(idx(center.x, center.y, w));
  });

  return { poiLoot, reserved };
}

function footprintTouchesWater(
  tiles: number[],
  center: Point,
  radius: number,
  w: number,
  h: number
): boolean {
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      if (tiles[idx(nx, ny, w)] === Terrain.Water) return true;
    }
  return false;
}

/** A ring of trees around an open clearing, with a gap facing the spawn so the
 *  clearing (and its rich loot) is reachable without chopping trees. */
function stampGrove(
  tiles: number[],
  center: Point,
  spawn: Point,
  w: number,
  h: number
): void {
  const radius = 3;
  const gapAngle = Math.atan2(spawn.y - center.y, spawn.x - center.x);
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.round(Math.hypot(dx, dy)) !== radius) continue; // ring only
      // Normalize the angle difference into (-pi, pi] before comparing, or the
      // +/-pi seam wraps and the gap lands in the wrong place / seals the ring.
      const a = Math.atan2(dy, dx);
      const diff = Math.atan2(Math.sin(a - gapAngle), Math.cos(a - gapAngle));
      if (Math.abs(diff) < 0.7) continue; // leave the gap toward spawn
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (inBounds(nx, ny, w, h)) tiles[idx(nx, ny, w)] = Terrain.Tree;
    }
  // Clearing interior is open grass.
  for (let dy = -radius + 1; dy <= radius - 1; dy++)
    for (let dx = -radius + 1; dx <= radius - 1; dx++) {
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (inBounds(nx, ny, w, h) && tiles[idx(nx, ny, w)] !== Terrain.Water)
        tiles[idx(nx, ny, w)] = Terrain.Grass;
    }
}

/** Raise a small cluster to height 3 (cliffs on every side) with ONE carved
 *  ramp toward the spawn so it's a defensible loot perch you can actually reach. */
function stampMesa(
  tiles: number[],
  heights: number[],
  center: Point,
  spawn: Point,
  w: number,
  h: number
): void {
  const radius = 2;
  const mesaHeight = 4; // the tallest tier
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.hypot(dx, dy) > radius) continue;
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      tiles[idx(nx, ny, w)] = Terrain.Hill; // walkable rocky top
      heights[idx(nx, ny, w)] = mesaHeight;
    }

  // Ramp: step down 3 -> 2 -> 1 along the cardinal direction toward spawn, so
  // each step is climbable (<= MAX_CLIMBABLE_STEP).
  const stepX = Math.abs(spawn.x - center.x) >= Math.abs(spawn.y - center.y)
    ? Math.sign(spawn.x - center.x) || 1
    : 0;
  const stepY = stepX === 0 ? Math.sign(spawn.y - center.y) || 1 : 0;
  for (let s = 1; s < mesaHeight; s++) {
    const rx = center.x + stepX * (radius + s);
    const ry = center.y + stepY * (radius + s);
    if (!inBounds(rx, ry, w, h)) continue;
    const ri = idx(rx, ry, w);
    if (tiles[ri] === Terrain.Water) continue;
    tiles[ri] = Terrain.Grass;
    heights[ri] = mesaHeight - s; // 3, 2, 1 ...
  }
}

// ---------------------------------------------------------------------------
// Connectivity (height-aware)
// ---------------------------------------------------------------------------

/** Two adjacent walkable tiles connect only if their height step is climbable. */
function canStep(tiles: number[], heights: number[], a: number, b: number): boolean {
  if (!isWalkable(tiles[a]!) || !isWalkable(tiles[b]!)) return false;
  return Math.abs(heights[a]! - heights[b]!) <= MAX_CLIMBABLE_STEP;
}

/** Largest 4-connected set of walkable tiles reachable via climbable steps. */
function largestWalkableComponent(
  tiles: number[],
  heights: number[],
  w: number,
  h: number
): Point[] {
  const seen = new Uint8Array(w * h);
  let best: Point[] = [];
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const start = idx(sx, sy, w);
      if (seen[start] || !isWalkable(tiles[start]!)) continue;
      const comp: Point[] = [];
      const queue: number[] = [start];
      seen[start] = 1;
      while (queue.length) {
        const cur = queue.pop()!;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        comp.push({ x: cx, y: cy });
        for (const [dx, dy] of NESW) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(nx, ny, w, h)) continue;
          const ni = idx(nx, ny, w);
          if (seen[ni] || !canStep(tiles, heights, cur, ni)) continue;
          seen[ni] = 1;
          queue.push(ni);
        }
      }
      if (comp.length > best.length) best = comp;
    }
  }
  return best;
}

/** BFS step distances from `start` across the climbable region. */
function bfsDistances(
  tiles: number[],
  heights: number[],
  w: number,
  h: number,
  start: Point
): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const queue: number[] = [idx(start.x, start.y, w)];
  dist[queue[0]!] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy] of NESW) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      const ni = idx(nx, ny, w);
      if (dist[ni] !== -1 || !canStep(tiles, heights, cur, ni)) continue;
      dist[ni] = dist[cur]! + 1;
      queue.push(ni);
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Population
// ---------------------------------------------------------------------------

function populate(
  seed: number,
  depth: number,
  tiles: number[],
  heights: number[],
  w: number,
  h: number,
  region: Point[],
  spawn: Point,
  poiLoot: LootSpot[],
  poiReserved: Set<number>,
  wildness: Noise2D,
  rng: Rng
): DelveMap {
  // Extract: farthest REACHABLE tile from spawn, excluding POI-claimed tiles.
  const dist = bfsDistances(tiles, heights, w, h, spawn);
  let extract = spawn;
  let far = -1;
  for (const p of region) {
    const i = idx(p.x, p.y, w);
    if (poiReserved.has(i)) continue;
    const d = dist[i]!;
    if (d > far) {
      far = d;
      extract = p;
    }
  }

  // A landmark can occasionally get cut off (e.g. a mesa whose ramp didn't land
  // on connected ground). Only keep POI loot the player can actually reach.
  const reachablePoiLoot = poiLoot.filter((l) => dist[idx(l.x, l.y, w)] !== -1);

  const reserved = new Set<number>(poiReserved);
  reserved.add(idx(spawn.x, spawn.y, w));
  reserved.add(idx(extract.x, extract.y, w));

  const candidates = shuffle(
    rng,
    region.filter((p) => {
      const i = idx(p.x, p.y, w);
      return dist[i]! >= DELVE_CONFIG.minSpawnClearance && !reserved.has(i);
    })
  );

  const depthMul = 1 + 0.25 * (depth - 1);
  const monsters: Monster[] = [];
  const loot: LootSpot[] = [...reachablePoiLoot];
  const placed: Point[] = [];
  let gearCounter = 0;

  const numMonsters = DELVE_CONFIG.baseMonsters + (depth - 1);
  const numLoot = DELVE_CONFIG.baseLoot + Math.floor((depth - 1) / 2);

  let ci = 0;
  const nextSpot = (minSpacing: number): Point | null => {
    while (ci < candidates.length) {
      const p = candidates[ci++]!;
      if (placed.every((q) => cheb(p, q) >= minSpacing)) return p;
    }
    return null;
  };

  for (let i = 0; i < numMonsters; i++) {
    const p = nextSpot(DELVE_CONFIG.minMonsterSpacing);
    if (!p) break;
    placed.push(p);
    const kind: MonsterKind = rng() < DELVE_CONFIG.swarmChance ? 'swarm' : 'grunt';
    monsters.push(makeMonster(`m${i}`, kind, p, depthMul));
  }

  for (let i = 0; i < numLoot; i++) {
    const p = nextSpot(DELVE_CONFIG.minLootSpacing);
    if (!p) break;
    placed.push(p);
    const gold = Math.round(randInt(rng, 5, 16) * depthMul);
    const spot: LootSpot = { id: `l${i}`, x: p.x, y: p.y, gold };
    if (rng() < DELVE_CONFIG.gearDropChance) {
      const base = GEAR_POOL[randInt(rng, 0, GEAR_POOL.length)]!;
      spot.item = { ...base, id: `g${i}_${gearCounter++}` };
    }
    loot.push(spot);
  }

  const decorReserved = new Set<number>(reserved);
  for (const p of placed) decorReserved.add(idx(p.x, p.y, w));
  for (const l of poiLoot) decorReserved.add(idx(l.x, l.y, w));
  const decor = scatterDecor(tiles, w, h, decorReserved, wildness, rng);

  return {
    seed,
    depth,
    biome: 'meadow',
    width: w,
    height: h,
    tiles,
    heights,
    spawn,
    extract,
    monsters,
    loot,
    decor,
  };
}

/** Scatter cosmetic clutter on open grass; density follows the wildness field
 *  (same field as trees) so thickets are lush and plains are sparse. */
function scatterDecor(
  tiles: number[],
  w: number,
  h: number,
  reserved: Set<number>,
  wildness: Noise2D,
  rng: Rng
): DecorSpot[] {
  const decor: DecorSpot[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      if (tiles[i] !== Terrain.Grass || reserved.has(i)) continue;
      const localChance = DELVE_CONFIG.decorChance * (0.3 + 1.4 * wildness(x, y));
      if (rng() >= localChance) continue;
      decor.push({ x, y, kind: pick(rng, DECOR_KINDS) });
    }
  }
  return decor;
}

function makeMonster(
  id: string,
  kind: MonsterKind,
  p: Point,
  depthMul: number
): Monster {
  const base =
    kind === 'grunt'
      ? { hp: 12, attack: 4, defense: 5, xp: 8, gold: 3 }
      : { hp: 5, attack: 2, defense: 0, xp: 3, gold: 1 };
  return {
    id,
    kind,
    x: p.x,
    y: p.y,
    hp: Math.round(base.hp * depthMul),
    attack: Math.round(base.attack * depthMul),
    defense: base.defense,
    xp: Math.round(base.xp * depthMul),
    gold: Math.round(base.gold * depthMul),
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Region tile nearest the top-left corner — a stable spawn anchor. */
function topLeft(region: Point[]): Point {
  return region.reduce((a, b) => (b.x + b.y < a.x + a.y ? b : a));
}

function allTiles(w: number, h: number): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push({ x, y });
  return out;
}
