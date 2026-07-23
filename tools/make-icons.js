/* Generates LabToolkit's PNG app icons from the "TLT" smiley logo, with no image
   dependencies — a hand-rolled truecolor PNG encoder plus a supersampled rasteriser.
   Run: node tools/make-icons.js
   The logo is drawn in white on the brand green; the OS masks/rounds the square itself.

   Logo geometry lives in a 720 x 620 space and matches the inline SVG in index.html:
   two T's (eyes), an L (nose) and a smile. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const BG   = [93, 115, 137];    // #5d7389 brand dark blue
const MARK = [247, 248, 247];   // near-white logo

const STROKE = 30;              // matches the SVG stroke-width
const LOGO_W = 720, LOGO_H = 620;

// Stroke segments as { x1, y1, x2, y2 } in logo space (round caps).
const SEGMENTS = [
  { x1: 22, y1: 24, x2: 278, y2: 24 },   // left T bar
  { x1: 150, y1: 24, x2: 150, y2: 270 }, // left T stem
  { x1: 442, y1: 24, x2: 698, y2: 24 },  // right T bar
  { x1: 570, y1: 24, x2: 570, y2: 270 }, // right T stem
  { x1: 300, y1: 205, x2: 300, y2: 385 },// L stem
  { x1: 300, y1: 385, x2: 398, y2: 385 },// L foot
];
// Smile as a cubic Bézier, sampled to points that we treat as a poly-line.
const SMILE = cubicPoints([64, 435], [200, 615], [520, 615], [656, 435], 40);

function cubicPoints(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
      u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
    ]);
  }
  return pts;
}

// Distance from a point to a segment (for round-capped stroke testing).
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx*dx + dy*dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t*dx, cy = y1 + t*dy;
  return Math.hypot(px - cx, py - cy);
}

// True if a logo-space point falls within the stroked logo.
function inMark(lx, ly) {
  const r = STROKE / 2;
  for (const s of SEGMENTS) if (distToSeg(lx, ly, s.x1, s.y1, s.x2, s.y2) <= r) return true;
  for (let i = 0; i < SMILE.length - 1; i++) {
    if (distToSeg(lx, ly, SMILE[i][0], SMILE[i][1], SMILE[i+1][0], SMILE[i+1][1]) <= r) return true;
  }
  return false;
}

function render(size, padFrac) {
  const SS = 4;
  const inner = size * (1 - 2 * padFrac);
  const scale = inner / LOGO_W;                       // fit by width (logo is wider than tall)
  const offX = (size - LOGO_W * scale) / 2;
  const offY = (size - LOGO_H * scale) / 2;

  const buf = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const cx = px + (sx + 0.5) / SS, cy = py + (sy + 0.5) / SS;
          const lx = (cx - offX) / scale, ly = (cy - offY) / scale;
          const c = inMark(lx, ly) ? MARK : BG;
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, o = (py * size + px) * 3;
      buf[o] = Math.round(r / n); buf[o+1] = Math.round(g / n); buf[o+2] = Math.round(b / n);
    }
  }
  return buf;
}

/* ---- minimal truecolor PNG encoder ---- */

function encodePNG(size, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0, 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
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
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

const targets = [
  ['icon-192.png', 192, 0.14],
  ['icon-512.png', 512, 0.14],
  ['icon-180.png', 180, 0.14],
  ['icon-maskable-512.png', 512, 0.22],
  ['icon-32.png', 32, 0.10],
];
for (const [name, size, pad] of targets) {
  fs.writeFileSync(path.join(OUT, name), encodePNG(size, render(size, pad)));
  console.log('wrote', name, `(${size}×${size})`);
}
