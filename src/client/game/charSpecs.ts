// Character render specs — the single source of truth for every fighter the
// lane can draw (hero classes + the monster roster). Pure data + pure helpers:
// NO phaser import, so the asset-integrity tests can read these tables and check
// them against the real PNGs on disk (tests/char-specs.test.ts).
//
// Art pipeline (ART_BIBLE §2.5/§5): every sprite is generated with PixelLab
// `create_character` (+ `animate_character` per animation), then the per-
// animation frames are composited into ONE horizontal strip PNG by
// `scratchpad/sheet.mjs`, which reports the origin numbers recorded here.
// Origins come from the BASE POSE's opaque bbox (frame 0), never the union
// across frames — a swing throws the weapon sideways and would drag the body
// off-center. Record every PixelLab character id in
// game_design/art/asset-manifest.md.

/** Animation ids a sheet can carry, in the order they appear in the strip.
 *  `signature` is the boss-only wind-up pose (D31/D39) played on `bossWindUp`. */
export const ANIM_ORDER = ['idle', 'attack', 'signature'] as const;
export type AnimId = (typeof ANIM_ORDER)[number];

/** An animated character sheet: one horizontal strip PNG of square frames, with
 *  the animations laid out back to back in ANIM_ORDER. Frame ranges are derived
 *  from the counts, so adding an animation is one number — never a hand-counted
 *  frame index. */
export interface AnimSheet {
  /** Square frame size in the source PNG (also the strip's row height). */
  frameSize: number;
  /** Frame count per animation, in strip order. `idle` is required — it is the
   *  resting loop every actor falls back to; the rest are optional so a
   *  character whose attack hasn't been generated yet still animates. */
  counts: { idle: number } & Partial<Record<AnimId, number>>;
}

/** Per-character render spec, derived from each PixelLab sprite's opaque bounds:
 *  origin = (horizontal center, feet) in 0..1 so the sprite stands on GROUND_Y;
 *  displayH = on-screen height in design px; scale = displayH / nativeH.
 *  With `sheet` the texture is an animated strip; without it, a single static
 *  image (pre-Phase-3 `create_map_object` art, valid until regenerated). */
export interface CharSpec {
  key: string;
  originX: number;
  originY: number;
  /** Opaque height of the base pose in source px — the scale denominator. */
  nativeH: number;
  displayH: number;
  sheet?: AnimSheet;
  /** Path under `public/`. Defaults to `monsters/<key>.png` (the roster rule:
   *  a template's sprite key IS its id), so only odd ones out name a file. */
  file?: string;
}

/** Path under `public/` for a spec's texture. */
export const specFile = (s: CharSpec): string => s.file ?? `monsters/${s.key}.png`;

/** On-screen scale factor: how much the source art is resized in the lane. */
export const specScale = (s: CharSpec): number => s.displayH / s.nativeH;

/** Phaser animation key for a spec's animation, e.g. `hero_squire-idle`. */
export const animKey = (spec: CharSpec, id: AnimId): string => `${spec.key}-${id}`;

/** Total frames in a spec's strip — must equal the PNG width / frameSize. */
export function sheetFrameCount(sheet: AnimSheet): number {
  let total = 0;
  for (const a of ANIM_ORDER) total += sheet.counts[a] ?? 0;
  return total;
}

/** Frame range of `id` within a strip: animations are concatenated in
 *  ANIM_ORDER, so each start is the sum of the counts before it. Returns
 *  undefined when this character has no such animation generated yet. */
export function animRange(sheet: AnimSheet, id: AnimId): { start: number; end: number } | undefined {
  let start = 0;
  for (const a of ANIM_ORDER) {
    const n = sheet.counts[a];
    if (n === undefined) continue; // not generated yet — occupies no frames
    if (a === id) return { start, end: start + n - 1 };
    start += n;
  }
  return undefined;
}

// ---- Heroes -------------------------------------------------------------------

/** Hero sprite per class (D12) — `classDef.sprite` holds 'squire'/'archer'/
 *  'apprentice'. Heroes face EAST (ART_BIBLE §1: no runtime flipping). Classes
 *  whose grim-glow character isn't generated yet fall back to the legacy static
 *  hero image, so the lane always renders. */
export const HERO_SPECS: Record<string, CharSpec> = {
  squire: {
    key: 'hero_squire', file: 'heroes/squire.png',
    originX: 0.5404, originY: 0.875, nativeH: 103, displayH: 150,
    sheet: { frameSize: 136, counts: { idle: 5, attack: 5 } },
  },
};

/** Fallback hero art (pre-D29 static sprite) for classes not yet regenerated. */
export const HERO_FALLBACK: CharSpec = {
  key: 'hero', file: 'spr_hero.png', originX: 0.5136, originY: 0.75, nativeH: 90, displayH: 150,
};

export const heroSpecFor = (heroClass: string): CharSpec => HERO_SPECS[heroClass] ?? HERO_FALLBACK;

// ---- Monsters -----------------------------------------------------------------

/** Kind-based fallback art for templates without a bespoke sprite. */
export const MONSTER_SPECS: Record<string, CharSpec> = {
  grunt: { key: 'goblin', file: 'spr_goblin.png', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
  swarm: { key: 'rat', file: 'spr_rat.png', originX: 0.5221, originY: 0.8676, nativeH: 97, displayH: 140 },
  brute: { key: 'goblin', file: 'spr_goblin.png', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 140 },
  caster: { key: 'goblin', file: 'spr_goblin.png', originX: 0.5147, originY: 0.8824, nativeH: 101, displayH: 124 },
};

/** Per-TEMPLATE sprite specs, keyed by a monster template's `sprite` field
 *  (roster.md). Monsters face WEST. Entries with `sheet` have been regenerated
 *  as animated characters (Phase 3); the rest are still the static Phase-2 art
 *  and fall back to the bob/lunge tweens. */
export const SPRITE_SPECS: Record<string, CharSpec> = {
  goblin_scout: {
    key: 'goblin_scout', originX: 0.4743, originY: 0.875, nativeH: 96, displayH: 128,
    sheet: { frameSize: 136, counts: { idle: 5, attack: 5 } },
  },
  goblin_brute: {
    key: 'goblin_brute', originX: 0.4963, originY: 0.875, nativeH: 97, displayH: 150,
    sheet: { frameSize: 136, counts: { idle: 5, attack: 5 } },
  },
  goblin_shaman: {
    key: 'goblin_shaman', originX: 0.5257, originY: 0.875, nativeH: 104, displayH: 134,
    sheet: { frameSize: 136, counts: { idle: 5, attack: 5 } },
  },
  goblin_chief: {
    key: 'goblin_chief', file: 'monsters/goblin_chieftain.png',
    originX: 0.5, originY: 0.8676, nativeH: 102, displayH: 150,
    // BOSS: the third animation is the War Cry telegraph (roster.md), played on
    // the engine's bossWindUp event.
    sheet: { frameSize: 136, counts: { idle: 5, attack: 5, signature: 5 } },
  },
  // Crypt (11-20)
  skeleton: { key: 'skeleton', originX: 0.3789, originY: 0.9688, nativeH: 120, displayH: 130 },
  skeleton_capt: { key: 'skeleton_capt', originX: 0.4961, originY: 0.9609, nativeH: 112, displayH: 148 },
  ghoul: { key: 'ghoul', originX: 0.4961, originY: 0.9766, nativeH: 121, displayH: 128 },
  necromancer: { key: 'necromancer', originX: 0.475, originY: 0.9563, nativeH: 144, displayH: 150 },
  // Warrens (21-30)
  giant_rat: { key: 'giant_rat', originX: 0.5195, originY: 0.9063, nativeH: 95, displayH: 112 },
  plague_rat: { key: 'plague_rat', originX: 0.5586, originY: 0.9063, nativeH: 99, displayH: 112 },
  tunnel_horror: { key: 'tunnel_horror', originX: 0.4922, originY: 0.9609, nativeH: 117, displayH: 148 },
  broodmother: { key: 'broodmother', originX: 0.5125, originY: 0.9187, nativeH: 134, displayH: 150 },
  // Deep (31-40)
  wraith: { key: 'wraith', originX: 0.5195, originY: 0.9063, nativeH: 106, displayH: 138 },
  deep_stalker: { key: 'deep_stalker', originX: 0.4766, originY: 0.9922, nativeH: 122, displayH: 132 },
  gloom_caller: { key: 'gloom_caller', originX: 0.4883, originY: 0.9609, nativeH: 109, displayH: 132 },
  hollow_king: { key: 'hollow_king', originX: 0.5156, originY: 0.9563, nativeH: 148, displayH: 155 },
  // Volcanic (41-50)
  magma_imp: { key: 'magma_imp', originX: 0.4922, originY: 0.9453, nativeH: 118, displayH: 122 },
  cinder_brute: { key: 'cinder_brute', originX: 0.4961, originY: 0.9609, nativeH: 116, displayH: 150 },
  flame_adept: { key: 'flame_adept', originX: 0.4375, originY: 0.9531, nativeH: 119, displayH: 134 },
  pyre_tyrant: { key: 'pyre_tyrant', originX: 0.5, originY: 0.9563, nativeH: 146, displayH: 158 },
  // Abyss (51-60)
  void_spawn: { key: 'void_spawn', originX: 0.5117, originY: 0.8203, nativeH: 85, displayH: 120 },
  abyss_knight: { key: 'abyss_knight', originX: 0.4023, originY: 0.9609, nativeH: 119, displayH: 150 },
  null_witch: { key: 'null_witch', originX: 0.4922, originY: 0.9375, nativeH: 112, displayH: 136 },
  herald_abyss: { key: 'herald_abyss', originX: 0.5563, originY: 0.9688, nativeH: 153, displayH: 158 },
};

/** Every character the lane can draw, deduped by texture key. Drives BOTH the
 *  preload (animated strip vs single image) and the animation registration, so
 *  a regenerated monster is one spec edit — no parallel key list to forget. */
export const ALL_CHAR_SPECS: CharSpec[] = (() => {
  const byKey = new Map<string, CharSpec>();
  for (const s of [...Object.values(HERO_SPECS), HERO_FALLBACK,
    ...Object.values(MONSTER_SPECS), ...Object.values(SPRITE_SPECS)]) {
    if (!byKey.has(s.key)) byKey.set(s.key, s);
  }
  return [...byKey.values()];
})();
