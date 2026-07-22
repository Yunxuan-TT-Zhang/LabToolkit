/* Generates LabToolkit's PNG app icons with no image dependencies — just a hand-rolled
   truecolor PNG encoder and a supersampled polygon rasteriser. Run: node tools/make-icons.js
   Draws a lab flask (glass + liquid) on the brand green, which the OS masks/rounds itself. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const BG    = [31, 122, 82];    // #1f7a52 brand green
const GLASS = [247, 248, 247];  // near-white
const LIQ   = [79, 188, 134];   // #4fbc86 lighter green

// Flask silhouette and liquid, in a 0..1 square (y increases downward).
const FLASK = [
  [0.43, 0.20], [0.57, 0.20], [0.57, 0.44], [0.76, 0.80],
  [0.76, 0.82], [0.24, 0.82], [0.24, 0.80], [0.43, 0.44],
];
const LIQUID = [[0.365, 0.60], [0.635, 0.60], [0.745, 0.795], [0.255, 0.795]];
const RIM = { x0: 0.40, x1: 0.60, y0: 0.185, y1: 0.225 };

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Colour at a normalised point, layering liquid over glass over background. */
function sample(nx, ny, glyphScale) {
  const x = 0.5 + (nx - 0.5) / glyphScale;   // shrink glyph -> divide coords
  const y = 0.5 + (ny - 0.5) / glyphScale;
  if (x >= RIM.x0 && x <= RIM.x1 && y >= RIM.y0 && y <= RIM.y1) return GLASS;
  if (inPoly(x, y, LIQUID)) return LIQ;
  if (inPoly(x, y, FLASK)) return GLASS;
  return BG;
}

function render(size, glyphScale = 1) {
  const SS = 4;                               // 4x supersampling for smooth edges
  const buf = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (px + (sx + 0.5) / SS) / size;
          const ny = (py + (sy + 0.5) / SS) / size;
          const c = sample(nx, ny, glyphScale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, o = (py * size + px) * 3;
      buf[o] = Math.round(r / n); buf[o + 1] = Math.round(g / n); buf[o + 2] = Math.round(b / n);
    }
  }
  return buf;
}

function encodePNG(size, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0, 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor RGB

  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-180.png', 180, 1],           // apple-touch-icon
  ['icon-maskable-512.png', 512, 0.78], // extra padding for Android maskable safe zone
  ['icon-32.png', 32, 1],
];

for (const [name, size, gs] of targets) {
  fs.writeFileSync(path.join(OUT, name), encodePNG(size, render(size, gs)));
  console.log('wrote', name, `(${size}×${size})`);
}
