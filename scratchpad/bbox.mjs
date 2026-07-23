// Decode a non-interlaced 8-bit RGBA PNG, find the opaque bounding box, and
// print the LaneScene CharSpec origin (horizontal center, feet baseline) plus
// nativeH (opaque height). Origin discipline per ART_BIBLE §2.5.
//   node scratchpad/bbox.mjs <file.png> [alphaThreshold]
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
const ALPHA = Number(process.argv[3] ?? 16);
const buf = readFileSync(file);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');

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
if (bitDepth !== 8 || colorType !== 6) throw new Error(`need 8-bit RGBA, got depth=${bitDepth} colorType=${colorType}`);

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
      default: throw new Error('bad filter ' + ft);
    }
    out[y * stride + x] = val & 0xff;
  }
}

let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (out[y * stride + x * bpp + 3] > ALPHA) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error('fully transparent');
const centerX = (minX + maxX + 1) / 2;
const feetY = maxY + 1;
const nativeH = maxY - minY + 1;
console.log(JSON.stringify({
  file, width, height,
  bbox: { minX, minY, maxX, maxY },
  originX: +(centerX / width).toFixed(4),
  originY: +(feetY / height).toFixed(4),
  nativeH,
}));
