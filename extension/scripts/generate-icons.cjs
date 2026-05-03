#!/usr/bin/env node
/**
 * XMeet AI Extension — PNG Icon Generator
 *
 * Creates icon16/32/48/128.png with zero native dependencies.
 * Uses raw PNG encoding via Node.js built-in `zlib`.
 *
 * Design: rounded-rect background (#7B2FFF) with white "X" lettermark.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 32, 48, 128];
const BG    = [0x7B, 0x2F, 0xFF]; // #7B2FFF — XMeet purple
const FG    = [0xFF, 0xFF, 0xFF]; // white

// ── CRC32 ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);  len.writeUInt32BE(data.length, 0);
  const tb  = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([tb, data]);
  const crcBuf   = Buffer.alloc(4);  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, tb, data, crcBuf]);
}

// ── Pixel drawing ─────────────────────────────────────────────────────────────

/**
 * Returns true if pixel (x,y) belongs to the "X" lettermark
 * within a canvas of `size × size`.
 */
function isXPixel(x, y, size) {
  const pad  = Math.round(size * 0.20);          // margin from edge
  const arm  = Math.max(2, Math.round(size * 0.16)); // stroke width
  const s    = size - 1 - 2 * pad;               // inner span

  if (x < pad || x > size - 1 - pad) return false;
  if (y < pad || y > size - 1 - pad) return false;

  const xn = x - pad;
  const yn = y - pad;

  // diagonal top-left → bottom-right
  const d1 = Math.abs(yn - xn);
  // diagonal top-right → bottom-left
  const d2 = Math.abs(yn - (s - xn));

  return d1 < arm || d2 < arm;
}

/**
 * Rounded-rectangle corner mask: returns false for pixels outside the
 * rounded area (those become transparent).
 */
function inRoundRect(x, y, size, r) {
  const cx = Math.min(x, size - 1 - x);
  const cy = Math.min(y, size - 1 - y);
  if (cx >= r || cy >= r) return true;                       // interior
  const dist = Math.hypot(r - cx - 0.5, r - cy - 0.5);
  return dist <= r;
}

// ── PNG encoder ───────────────────────────────────────────────────────────────

function makePNG(size) {
  const radius = Math.round(size * 0.22);
  const raw    = [];

  for (let y = 0; y < size; y++) {
    raw.push(0); // PNG filter byte: None
    for (let x = 0; x < size; x++) {
      if (!inRoundRect(x, y, size, radius)) {
        raw.push(0, 0, 0, 0);                  // transparent
      } else if (isXPixel(x, y, size)) {
        raw.push(FG[0], FG[1], FG[2], 255);   // white lettermark
      } else {
        raw.push(BG[0], BG[1], BG[2], 255);   // purple background
      }
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(raw), { level: 9 });

  // IHDR: width(4) height(4) bitdepth(1) colortype(1=RGBA=6) comp(1) filter(1) interlace(1)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const buf  = makePNG(size);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`  ✓  icon${size}.png  (${buf.length} B)`);
}

console.log(`\nIcons written → ${outDir}\n`);
