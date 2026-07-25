// Asset integrity: every CharSpec must agree with the PNG actually on disk.
//
// The art pass regenerates sprites as PixelLab characters (ART_BIBLE §5), and
// the failure mode is silent: a spec claims 5 idle + 5 attack frames but the
// composited strip holds 9, so Phaser slices the sheet wrong and every actor
// renders a sliver of the wrong frame. Nothing throws — it just looks broken.
// These checks read each PNG's IHDR and hold the tables honest.

import { readFileSync, existsSync } from 'node:fs';
import { assert, check, describe } from './helpers';
import {
  ALL_CHAR_SPECS,
  ANIM_ORDER,
  HERO_SPECS,
  SPRITE_SPECS,
  animRange,
  heroSpecFor,
  sheetFrameCount,
  specFile,
  type CharSpec,
} from '../src/client/game/charSpecs';
import { ACTIVES } from '../src/shared/content/actives';

describe('char-specs');

const PUBLIC_DIR = 'src/client/public';
const pathOf = (spec: CharSpec): string => `${PUBLIC_DIR}/${specFile(spec)}`;

/** Read a PNG's dimensions straight from its IHDR chunk (bytes 16..24). */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a png: ${file}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

await check('every character spec points at a PNG that exists', () => {
  for (const spec of ALL_CHAR_SPECS) {
    assert.ok(existsSync(pathOf(spec)), `missing art for '${spec.key}': ${pathOf(spec)}`);
  }
});

await check('animated strips are exactly frameSize x (frameSize x total frames)', () => {
  for (const spec of ALL_CHAR_SPECS) {
    if (!spec.sheet) continue;
    const { width, height } = pngSize(pathOf(spec));
    const frames = sheetFrameCount(spec.sheet);
    assert.equal(height, spec.sheet.frameSize, `${spec.key}: strip height != frameSize`);
    assert.equal(
      width, spec.sheet.frameSize * frames,
      `${spec.key}: strip is ${width / spec.sheet.frameSize} frames, spec declares ${frames}`,
    );
  }
});

await check('static sprites are NOT sliced as sheets (width would be a frame multiple)', () => {
  for (const spec of ALL_CHAR_SPECS) {
    if (spec.sheet) continue;
    const { width, height } = pngSize(pathOf(spec));
    // A static sprite is a single square frame. If a regenerated strip ever
    // lands on a spec that forgot its `sheet`, this catches it.
    assert.equal(width, height, `${spec.key}: non-square static sprite — was it regenerated as a strip?`);
  }
});

await check('a spec never claims more opaque height than its frame holds', () => {
  for (const spec of ALL_CHAR_SPECS) {
    const { height } = pngSize(pathOf(spec));
    const frameH = spec.sheet ? spec.sheet.frameSize : height;
    assert.ok(spec.nativeH > 0 && spec.nativeH <= frameH, `${spec.key}: nativeH ${spec.nativeH} vs frame ${frameH}`);
  }
});

await check('origins sit inside the sprite (0..1), feet in the lower half', () => {
  for (const spec of ALL_CHAR_SPECS) {
    assert.ok(spec.originX > 0 && spec.originX < 1, `${spec.key}: originX ${spec.originX}`);
    // originY is the feet baseline — always well below the middle of the frame.
    assert.ok(spec.originY > 0.5 && spec.originY <= 1, `${spec.key}: originY ${spec.originY}`);
    assert.ok(spec.displayH > 0, `${spec.key}: displayH ${spec.displayH}`);
  }
});

await check('animation frame ranges are contiguous, in order, and inside the strip', () => {
  for (const spec of ALL_CHAR_SPECS) {
    if (!spec.sheet) continue;
    const total = sheetFrameCount(spec.sheet);
    let expectedStart = 0;
    for (const id of ANIM_ORDER) {
      const range = animRange(spec.sheet, id);
      if (spec.sheet.counts[id] === undefined) {
        assert.equal(range, undefined, `${spec.key}: ${id} has no frames but returned a range`);
        continue;
      }
      assert.ok(range !== undefined, `${spec.key}: ${id} has frames but no range`);
      assert.equal(range!.start, expectedStart, `${spec.key}: ${id} start`);
      assert.equal(range!.end, expectedStart + spec.sheet.counts[id]! - 1, `${spec.key}: ${id} end`);
      assert.ok(range!.end < total, `${spec.key}: ${id} runs past the strip`);
      expectedStart = range!.end + 1;
    }
    assert.equal(expectedStart, total, `${spec.key}: frame counts don't sum to the strip length`);
  }
});

await check('every animated character has an idle loop to fall back to', () => {
  for (const spec of ALL_CHAR_SPECS) {
    if (!spec.sheet) continue;
    assert.ok(spec.sheet.counts.idle >= 2, `${spec.key}: idle needs at least 2 frames`);
  }
});

await check('texture keys are unique per file — one key never names two sprites', () => {
  const fileByKey = new Map<string, string>();
  for (const spec of ALL_CHAR_SPECS) {
    const prev = fileByKey.get(spec.key);
    assert.ok(prev === undefined || prev === specFile(spec), `key '${spec.key}' maps to two files`);
    fileByKey.set(spec.key, specFile(spec));
  }
});

await check('hero class lookup: known classes resolve, unknown fall back (never undefined)', () => {
  assert.equal(heroSpecFor('squire').key, HERO_SPECS.squire!.key);
  // Classes whose character art isn't generated yet must still render.
  assert.equal(heroSpecFor('archer').key, 'hero');
  assert.equal(heroSpecFor('apprentice').key, 'hero');
  assert.equal(heroSpecFor('not-a-class').key, 'hero');
});

await check('the Phase-3 slice IS animated (squire + goblin scout)', () => {
  assert.ok(HERO_SPECS.squire?.sheet !== undefined, 'squire should be an animated character');
  assert.ok(SPRITE_SPECS.goblin_scout?.sheet !== undefined, 'goblin scout should be an animated character');
});

// ---- ability icons (D27) ------------------------------------------------------

await check('every ability has a 64px icon, in the abilities/ folder', () => {
  for (const id of Object.keys(ACTIVES)) {
    const file = `${PUBLIC_DIR}/icons/abilities/${id}.png`;
    assert.ok(existsSync(file), `ability '${id}' has no icon: ${file}`);
    const { width, height } = pngSize(file);
    assert.equal(width, 64, `${id}: icon width`);
    assert.equal(height, 64, `${id}: icon height`);
  }
});

await check('ability icons never collide with status icons (both define "fortify")', () => {
  // Ability art lives in icons/abilities/; the status set lives in icons/.
  // A bare-id ability icon would silently clobber the status icon of the same
  // name — this pins the namespacing that prevents it.
  const collide = Object.keys(ACTIVES).filter((id) => existsSync(`${PUBLIC_DIR}/icons/${id}.png`));
  assert.deepEqual(collide, ['fortify'], 'expected exactly the known fortify overlap');
  // ...and the status icon must still be its own distinct file.
  assert.ok(existsSync(`${PUBLIC_DIR}/icons/fortify.png`), 'status fortify icon went missing');
  assert.ok(existsSync(`${PUBLIC_DIR}/icons/abilities/fortify.png`), 'ability fortify icon went missing');
});

await check('every ability keeps an emoji fallback for a texture that fails to load', () => {
  for (const [id, def] of Object.entries(ACTIVES)) {
    assert.ok(def.icon.length > 0, `ability '${id}' lost its emoji fallback`);
  }
});
