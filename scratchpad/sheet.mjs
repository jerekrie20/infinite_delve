// Composite N equally-sized RGBA PNG frames into ONE horizontal strip
// spritesheet (Phaser `load.spritesheet`, frameWidth = frameHeight = the source
// frame size), and report the CharSpec origin from the UNION opaque bbox across
// every frame — so a sprite that lifts a weapon mid-swing keeps a stable footing
// instead of jittering per frame. Extends the decoder in bbox.mjs (ART_BIBLE §2.5).
//
//   node scratchpad/sheet.mjs <out.png> <frame0.png> <frame1.png> ...
//
// Prints JSON: { out, frames, frameW, frameH, originX, originY, nativeH }
// where originX/originY are in FRAME-local 0..1 (Phaser sprite origin) and
// nativeH is the union opaque height in px (feeds CharSpec.nativeH).
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const ALPHA = 16;

/** Decode a non-interlaced 8-bit RGBA PNG to { width, height, pixels }. */
function decodePng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a png: ${file}`);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.subarray(pos, pos + len); pos += len; pos += 4; // skip CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`need 8-bit RGBA, got depth=${bitDepth} colorType=${colorType} in ${file}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let val;
      switch (ft) {
        case 0: val = v; break;
        case 1: val = v + a; break;
        case 2: val = v + b; break;
        case 3: val = v + ((a + b) >> 1); break;
        case 4: val = v + paeth(a, b, c); break;
        default: throw new Error(`bad filter ${ft} in ${file}`);
      }
      out[y * stride + x] = val & 0xff;
    }
  }
  return { width, height, pixels: out };
}

// ---- PNG encode (8-bit RGBA, filter 0 rows) ---------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- composite --------------------------------------------------------------

const [outFile, ...frameFiles] = process.argv.slice(2);
if (!outFile || frameFiles.length === 0) {
  throw new Error('usage: node sheet.mjs <out.png> <frame0.png> [frame1.png ...]');
}

const decoded = frameFiles.map(decodePng);
const frameW = decoded[0].width;
const frameH = decoded[0].height;
for (const [i, d] of decoded.entries()) {
  if (d.width !== frameW || d.height !== frameH) {
    throw new Error(`frame ${frameFiles[i]} is ${d.width}x${d.height}, expected ${frameW}x${frameH}`);
  }
}

const sheetW = frameW * decoded.length;
const sheet = Buffer.alloc(sheetW * frameH * 4);
const sheetStride = sheetW * 4;
decoded.forEach((d, f) => {
  const srcStride = frameW * 4;
  for (let y = 0; y < frameH; y++) {
    d.pixels.copy(sheet, y * sheetStride + f * srcStride, y * srcStride, y * srcStride + srcStride);
  }
});
writeFileSync(outFile, encodePng(sheetW, frameH, sheet));

/** Opaque bbox of one decoded frame, in frame-local coordinates. */
function bboxOf(frames) {
  let minX = frameW, minY = frameH, maxX = -1, maxY = -1;
  const stride = frameW * 4;
  for (const d of frames) {
    for (let y = 0; y < frameH; y++) {
      for (let x = 0; x < frameW; x++) {
        if (d.pixels[y * stride + x * 4 + 3] > ALPHA) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
  }
  if (maxX < 0) throw new Error('fully transparent');
  return { minX, minY, maxX, maxY };
}

// The CharSpec origin comes from the BASE POSE (frame 0), never the union: a
// swing throws the weapon far to one side, and anchoring on the union would
// shove the body off-center and lift the idle pose off the floor. The union is
// reported alongside so an obviously broken frame is still visible.
const base = bboxOf([decoded[0]]);
const union = bboxOf(decoded);

console.log(JSON.stringify({
  out: outFile,
  frames: decoded.length,
  frameW, frameH,
  bbox: base,
  union,
  originX: +((((base.minX + base.maxX + 1) / 2) / frameW).toFixed(4)),
  originY: +(((base.maxY + 1) / frameH).toFixed(4)),
  nativeH: base.maxY - base.minY + 1,
}));
