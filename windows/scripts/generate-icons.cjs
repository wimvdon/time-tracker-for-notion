// Generates the app + tray icons without any image dependencies:
//   assets/icon-256.png  – window icon (clock face)
//   assets/icon.ico      – Windows installer/app icon (PNG-in-ICO)
//   assets/tray-idle.png – tray icon, idle (clock)
//   assets/tray-running.png – tray icon, running (red dot)
// Run with: npm run icons

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---- Minimal PNG encoder ----

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // Raw image data: every scanline prefixed with filter byte 0
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// PNG-in-ICO container (supported since Windows Vista)
function encodeICO(pngBuffer, size) {
  const header = Buffer.from([0, 0, 1, 0, 1, 0]);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // 0 means 256
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12); // data offset
  return Buffer.concat([header, entry, pngBuffer]);
}

// ---- Tiny vector rasterizer (anti-aliased via signed distance) ----

class Canvas {
  constructor(size) {
    this.size = size;
    this.data = Buffer.alloc(size * size * 4);
  }

  // Composites color [r,g,b] over each pixel with per-pixel alpha from coverage(x, y) → 0..1
  paint(coverage, [r, g, b]) {
    const { size, data } = this;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = coverage(x + 0.5, y + 0.5);
        if (a <= 0) continue;
        const i = (y * size + x) * 4;
        const srcA = Math.min(1, a);
        const dstA = data[i + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA === 0) continue;
        data[i] = Math.round((r * srcA + data[i] * dstA * (1 - srcA)) / outA);
        data[i + 1] = Math.round((g * srcA + data[i + 1] * dstA * (1 - srcA)) / outA);
        data[i + 2] = Math.round((b * srcA + data[i + 2] * dstA * (1 - srcA)) / outA);
        data[i + 3] = Math.round(outA * 255);
      }
    }
  }

  circle(cx, cy, radius, color) {
    this.paint((x, y) => radius - Math.hypot(x - cx, y - cy) + 0.5, color);
  }

  ring(cx, cy, radius, thickness, color) {
    this.paint((x, y) => {
      const d = Math.abs(Math.hypot(x - cx, y - cy) - radius);
      return thickness / 2 - d + 0.5;
    }, color);
  }

  line(x1, y1, x2, y2, thickness, color) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    this.paint((x, y) => {
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      return thickness / 2 - d + 0.5;
    }, color);
  }
}

// Box-downsample by an integer factor (renders are supersampled for smooth edges)
function downsample(canvas, factor) {
  const src = canvas.data;
  const srcSize = canvas.size;
  const size = srcSize / factor;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * srcSize + x * factor + sx) * 4;
          const pa = src[i + 3];
          r += src[i] * pa;
          g += src[i + 1] * pa;
          b += src[i + 2] * pa;
          a += pa;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / (factor * factor));
      }
    }
  }
  return { size, data: out };
}

// ---- Icon drawings ----

const DARK = [24, 24, 27]; // zinc-900
const RED = [239, 68, 68]; // red-500
const WHITE = [244, 244, 245];
const SLATE = [203, 213, 225];

function drawClock(size, { face, ringColor, hands }) {
  const SS = 4; // supersample factor
  const c = new Canvas(size * SS);
  const mid = (size * SS) / 2;
  const r = mid * 0.92;
  c.circle(mid, mid, r, face);
  c.ring(mid, mid, r * 0.88, r * 0.16, ringColor);
  // minute hand to 12, hour hand to ~2 o'clock
  c.line(mid, mid, mid, mid - r * 0.62, r * 0.11, hands);
  c.line(mid, mid, mid + r * 0.42, mid - r * 0.26, r * 0.11, hands);
  c.circle(mid, mid, r * 0.09, hands);
  const { data } = downsample(c, SS);
  return encodePNG(size, size, data);
}

function drawDot(size, color) {
  const SS = 4;
  const c = new Canvas(size * SS);
  const mid = (size * SS) / 2;
  c.circle(mid, mid, mid * 0.82, color);
  const { data } = downsample(c, SS);
  return encodePNG(size, size, data);
}

// ---- Write files ----

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const icon256 = drawClock(256, { face: DARK, ringColor: RED, hands: WHITE });
fs.writeFileSync(path.join(assetsDir, 'icon-256.png'), icon256);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), encodeICO(icon256, 256));
fs.writeFileSync(
  path.join(assetsDir, 'tray-idle.png'),
  drawClock(32, { face: DARK, ringColor: SLATE, hands: SLATE })
);
fs.writeFileSync(path.join(assetsDir, 'tray-running.png'), drawDot(32, RED));

console.log('Icons written to assets/');
