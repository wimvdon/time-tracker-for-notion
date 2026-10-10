// Generates every app icon from one vector definition, without image dependencies:
//   assets/icon.svg         – master artwork (Windows tile), for reference
//   assets/icon.ico         – Windows app/installer icon, 16–256 px (PNG-in-ICO)
//   assets/icon-256.png     – window icon on non-Windows platforms
//   assets/tray-idle.png    – tray icon, idle (stopwatch badge)
//   assets/tray-running.png – tray icon, running (red dot)
//   ../android/app/src/main/res/drawable/ic_launcher_*.xml – Android adaptive icon layers
// Every size is rendered straight from the vectors, so small sizes stay crisp.
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

// PNG-in-ICO container (supported since Windows Vista), one entry per size
function encodeICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // 0 means 256
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

// ---- Artwork ----
// Drawn on Android's 108×108 adaptive-icon grid; the launcher shows the middle 72 units and
// keeps everything within a radius of 33 from the centre. Angles run clockwise from 12 o'clock.

const WHITE = '#FAFAFA';
const RED = '#E53935';
const SLATE = '#CBD5E1';
const BG_TOP = '#34343A';
const BG_BOTTOM = '#18181B'; // zinc-900, the app's dark background

const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

// Scales a shape drawn at design size into place on the grid (keeps the art inside the safe zone)
const ART = { from: [56, 56], to: [54, 54], scale: 0.88 };
const px = (x) => ART.to[0] + (x - ART.from[0]) * ART.scale;
const py = (y) => ART.to[1] + (y - ART.from[1]) * ART.scale;
const pl = (l) => l * ART.scale;
function place(s) {
  const out = { ...s };
  for (const k of ['x', 'x1', 'x2', 'cx']) if (k in s) out[k] = px(s[k]);
  for (const k of ['y', 'y1', 'y2', 'cy']) if (k in s) out[k] = py(s[k]);
  for (const k of ['w', 'h', 'r', 'width']) if (k in s) out[k] = pl(s[k]);
  if (s.points) out.points = s.points.map(([x, y]) => [px(x), py(y)]);
  if (s.rotate) out.rotate = { ...s.rotate, cx: px(s.rotate.cx), cy: py(s.rotate.cy) };
  return out;
}

// A time log: a tilted sheet with three entries
const SHEET_TILT = { deg: -7, cx: 50, cy: 52 };
const SHEET = { type: 'rrect', x: 31, y: 29, w: 38, h: 46, r: 7, rotate: SHEET_TILT };
const ENTRIES = [
  { type: 'rrect', x: 37.5, y: 38, w: 25, h: 5, r: 2.5, rotate: SHEET_TILT },
  { type: 'rrect', x: 37.5, y: 48, w: 18, h: 5, r: 2.5, rotate: SHEET_TILT },
  { type: 'rrect', x: 37.5, y: 58, w: 11, h: 5, r: 2.5, rotate: SHEET_TILT },
];
// ...with a running stopwatch badge on its corner
const BADGE = { cx: 68, cy: 70 };
const HOUR_END = polar(BADGE.cx, BADGE.cy, 7, 110);
const BADGE_CROWN = { type: 'rrect', x: 65, y: 49.5, w: 6, h: 4, r: 1.5 };
const BADGE_HALO = { type: 'circle', ...BADGE, r: 16.5 };
const BADGE_FACE = { type: 'circle', ...BADGE, r: 14 };
const HANDS = [
  { type: 'line', x1: BADGE.cx, y1: BADGE.cy, x2: BADGE.cx, y2: 61.5, width: 3.6 },
  { type: 'line', x1: BADGE.cx, y1: BADGE.cy, x2: HOUR_END[0], y2: HOUR_END[1], width: 3.6 },
];

const FOREGROUND = [
  { ...SHEET, color: WHITE },
  { ...ENTRIES[0], color: '#3F3F46' }, // zinc-700
  { ...ENTRIES[1], color: '#A1A1AA' }, // zinc-400
  { ...ENTRIES[2], color: '#A1A1AA' },
  { ...BADGE_HALO, color: BG_BOTTOM },
  { ...BADGE_CROWN, color: RED },
  { ...BADGE_FACE, color: RED },
  ...HANDS.map((s) => ({ ...s, color: WHITE })),
].map(place);
// Android 13+ themed icon: the launcher tints this single-colour layer, so depth comes from alpha
const MONOCHROME = [
  { ...SHEET, color: '#FFFFFF', alpha: 0.35 },
  ...ENTRIES.map((s) => ({ ...s, color: '#FFFFFF' })),
  { ...BADGE_CROWN, color: '#FFFFFF' },
  { type: 'ring', ...BADGE, r: 12.5, width: 3, color: '#FFFFFF' },
  ...HANDS.map((s) => ({ ...s, color: '#FFFFFF' })),
].map(place);
// Tray: the stopwatch badge alone
const TRAY_GLYPH = [
  BADGE_CROWN,
  { type: 'ring', ...BADGE, r: 12.5, width: 3.4 },
  ...HANDS,
].map((s) => ({ ...s, color: SLATE }));

// Windows tile: a rounded square cut from the adaptive grid, artwork inset slightly
const TILE = { x: 20, y: 20, size: 68, radius: 15 };
const TILE_VIEW = { x: 19, y: 19, size: 70 };
const TILE_ART_SCALE = 0.92;
// Tray view is in design units, framing the badge
const TRAY_VIEW = { x: 50, y: 49, size: 36 };

// ---- Signed distance per shape (negative inside), in grid units ----

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function polygonDistance(pts) {
  return (px, py) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      d = Math.min(d, segmentDistance(px, py, xj, yj, xi, yi));
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? -d : d;
  };
}

function distanceFn(s) {
  if (s.rotate) {
    // Evaluate the unrotated shape at the point rotated back
    const d = distanceFn({ ...s, rotate: null });
    const a = (-s.rotate.deg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const { cx, cy } = s.rotate;
    return (x, y) => d(cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos);
  }
  switch (s.type) {
    case 'circle':
      return (x, y) => Math.hypot(x - s.cx, y - s.cy) - s.r;
    case 'ring':
      return (x, y) => Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) - s.width / 2;
    case 'line':
      return (x, y) => segmentDistance(x, y, s.x1, s.y1, s.x2, s.y2) - s.width / 2;
    case 'rrect': {
      const hw = s.w / 2 - s.r;
      const hh = s.h / 2 - s.r;
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      return (x, y) => {
        const qx = Math.abs(x - cx) - hw;
        const qy = Math.abs(y - cy) - hh;
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.r;
      };
    }
    case 'poly':
      return polygonDistance(s.points);
    default:
      throw new Error(`Unknown shape ${s.type}`);
  }
}

// ---- Rasterizer (anti-aliased via signed distance, supersampled) ----

const hexRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

class Canvas {
  constructor(size) {
    this.size = size;
    this.data = Buffer.alloc(size * size * 4);
  }

  // Composites colorAt(x, y) → [r,g,b] over each pixel with alpha from coverage(x, y) → 0..1
  paint(coverage, colorAt) {
    const { size, data } = this;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = coverage(x + 0.5, y + 0.5);
        if (a <= 0) continue;
        const [r, g, b] = colorAt(x + 0.5, y + 0.5);
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
}

// Box-downsample by an integer factor
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
  return out;
}

// Renders shapes seen through a square view of the grid. `art` maps canvas grid units to
// artwork units (for the tile inset); `clip` optionally limits everything to a shape.
function render(size, view, { background, shapes, artScale = 1, clip }) {
  const SS = size <= 32 ? 8 : 4;
  const c = new Canvas(size * SS);
  const k = (size * SS) / view.size; // pixels per grid unit
  const toGrid = (p, origin) => origin + p / k;
  const clipD = clip ? distanceFn(clip) : null;
  const clipCov = (gx, gy) => (clipD ? 0.5 - clipD(gx, gy) * k : 1);

  if (background) {
    const top = hexRGB(background.top);
    const bottom = hexRGB(background.bottom);
    const y0 = clip ? clip.y : view.y;
    const h = clip ? clip.h : view.size;
    c.paint(
      (x, y) => clipCov(toGrid(x, view.x), toGrid(y, view.y)),
      (x, y) => {
        const t = Math.max(0, Math.min(1, (toGrid(y, view.y) - y0) / h));
        return top.map((v, i) => v + (bottom[i] - v) * t);
      }
    );
  }
  for (const s of shapes) {
    const d = distanceFn(s);
    const rgb = hexRGB(s.color);
    const alpha = s.alpha ?? 1;
    c.paint((x, y) => {
      const gx = toGrid(x, view.x);
      const gy = toGrid(y, view.y);
      const ax = 54 + (gx - 54) / artScale;
      const ay = 54 + (gy - 54) / artScale;
      const cov = Math.min(1, 0.5 - d(ax, ay) * artScale * k) * alpha;
      return Math.min(cov, clipCov(gx, gy));
    }, () => rgb);
  }
  return encodePNG(size, size, downsample(c, SS));
}

const tileClip = { type: 'rrect', x: TILE.x, y: TILE.y, w: TILE.size, h: TILE.size, r: TILE.radius };
const renderTile = (size) =>
  render(size, TILE_VIEW, {
    background: { top: BG_TOP, bottom: BG_BOTTOM },
    shapes: FOREGROUND,
    artScale: TILE_ART_SCALE,
    clip: tileClip,
  });

function drawDot(size, color) {
  const mid = size / 2;
  return render(size, { x: 0, y: 0, size }, { shapes: [{ type: 'circle', cx: mid, cy: mid, r: mid * 0.82, color }] });
}

// ---- Vector output (SVG + Android VectorDrawable) ----

const n = (v) => +v.toFixed(2);
const circlePath = (cx, cy, r) =>
  `M${n(cx - r)},${n(cy)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`;

// Returns { d, fill } or { d, stroke, width, cap } for one shape
function vectorPath(s) {
  switch (s.type) {
    case 'circle':
      return { d: circlePath(s.cx, s.cy, s.r) };
    case 'ring':
      return { d: circlePath(s.cx, s.cy, s.r), stroke: true, width: s.width };
    case 'line':
      return { d: `M${n(s.x1)},${n(s.y1)}L${n(s.x2)},${n(s.y2)}`, stroke: true, width: s.width, cap: 'round' };
    case 'rrect': {
      const { x, y, w, h, r } = s;
      return {
        d: `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0,1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0,1 ${-r},${r}` +
          `h${-(w - 2 * r)}a${r},${r} 0 0,1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0,1 ${r},${-r}z`,
      };
    }
    case 'poly':
      return { d: 'M' + s.points.map(([x, y]) => `${n(x)},${n(y)}`).join('L') + 'z' };
    default:
      throw new Error(`Unknown shape ${s.type}`);
  }
}

function svgShape(s) {
  const p = vectorPath(s);
  const alpha = s.alpha != null ? ` opacity="${s.alpha}"` : '';
  const rotate = s.rotate ? ` transform="rotate(${s.rotate.deg} ${n(s.rotate.cx)} ${n(s.rotate.cy)})"` : '';
  return (p.stroke
    ? `<path d="${p.d}" fill="none" stroke="${s.color}" stroke-width="${p.width}"${p.cap ? ` stroke-linecap="${p.cap}"` : ''}${alpha}/>`
    : `<path d="${p.d}" fill="${s.color}"${alpha}/>`).replace('/>', `${rotate}/>`);
}

function iconSVG() {
  const { y, size } = TILE;
  const tile = vectorPath(tileClip).d;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="${TILE_VIEW.x} ${TILE_VIEW.y} ${TILE_VIEW.size} ${TILE_VIEW.size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="${y}" x2="0" y2="${y + size}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOTTOM}"/>
    </linearGradient>
  </defs>
  <path d="${tile}" fill="url(#bg)"/>
  <g transform="translate(54 54) scale(${TILE_ART_SCALE}) translate(-54 -54)">
    ${FOREGROUND.map(svgShape).join('\n    ')}
  </g>
</svg>
`;
}

function vectorDrawable(shapes) {
  const paths = shapes.map((s) => {
    const p = vectorPath(s);
    const attrs = p.stroke
      ? [`android:strokeColor="${s.color}"`, `android:strokeWidth="${p.width}"`, ...(p.cap ? [`android:strokeLineCap="${p.cap}"`] : [])]
      : [`android:fillColor="${s.color}"`];
    if (s.alpha != null) attrs.push(`android:${p.stroke ? 'strokeAlpha' : 'fillAlpha'}="${s.alpha}"`);
    const xml = `    <path\n        ${attrs.join('\n        ')}\n        android:pathData="${p.d}"/>`;
    if (!s.rotate) return xml;
    const { deg, cx, cy } = s.rotate;
    return `    <group\n        android:rotation="${deg}"\n        android:pivotX="${n(cx)}"\n        android:pivotY="${n(cy)}">\n${xml.replace(/^/gm, '    ')}\n    </group>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by windows/scripts/generate-icons.cjs (npm run icons). Do not edit by hand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${paths.join('\n')}
</vector>
`;
}

const androidBackground = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by windows/scripts/generate-icons.cjs (npm run icons). Do not edit by hand. -->
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <gradient
        android:angle="270"
        android:startColor="${BG_TOP}"
        android:endColor="${BG_BOTTOM}"/>
</shape>
`;

// ---- Write files ----

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
const tiles = ICO_SIZES.map((size) => ({ size, png: renderTile(size) }));
fs.writeFileSync(path.join(assetsDir, 'icon.svg'), iconSVG());
fs.writeFileSync(path.join(assetsDir, 'icon-256.png'), tiles.at(-1).png);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), encodeICO(tiles));
fs.writeFileSync(
  path.join(assetsDir, 'tray-idle.png'),
  render(32, TRAY_VIEW, { shapes: TRAY_GLYPH })
);
fs.writeFileSync(path.join(assetsDir, 'tray-running.png'), drawDot(32, RED));

const androidRes = path.join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'res', 'drawable');
fs.writeFileSync(path.join(androidRes, 'ic_launcher_background.xml'), androidBackground);
fs.writeFileSync(path.join(androidRes, 'ic_launcher_foreground.xml'), vectorDrawable(FOREGROUND));
fs.writeFileSync(path.join(androidRes, 'ic_launcher_monochrome.xml'), vectorDrawable(MONOCHROME));

console.log('Icons written to assets/ and android/app/src/main/res/drawable/');
