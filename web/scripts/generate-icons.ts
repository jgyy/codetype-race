/**
 * Placeholder PWA icon generator. Zero-dep PNG encoder for solid-color
 * + centered wordmark squares. Replace outputs with branded art later.
 *
 * Usage: bun run web/scripts/generate-icons.ts
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type RGBA = [number, number, number, number];

const BG: RGBA = [10, 10, 10, 255];        // matches globals.css body bg
const FG: RGBA = [99, 179, 237, 255];      // accent (sky-400-ish)
const MASK_BG: RGBA = [99, 179, 237, 255]; // maskable safe-zone fill

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(8 + len + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + len);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  dv.setUint32(8 + len, crc32(crcInput));
  return out;
}

function encodePng(width: number, height: number, pixel: (x: number, y: number) => RGBA): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const raw = new Uint8Array(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const idat = deflateSync(raw);

  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

// Renders a stylised "C" glyph (codetype-race) inside `inner` square of `size`.
function makePixel(size: number, inner: number, bg: RGBA, fg: RGBA): (x: number, y: number) => RGBA {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = inner / 2;
  const rInner = rOuter * 0.62;
  // mouth: an angular wedge cut from the right side
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    const inRing = d2 <= rOuter * rOuter && d2 >= rInner * rInner;
    const inMouth = dx > rInner * 0.5 && Math.abs(dy) < rOuter * 0.32;
    if (inRing && !inMouth) return fg;
    return bg;
  };
}

function main() {
  const outDir = join(import.meta.dir, "..", "public", "icons");
  mkdirSync(outDir, { recursive: true });

  // Standard square icons: art fills ~80% of canvas.
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.72);
    const png = encodePng(size, size, makePixel(size, inner, BG, FG));
    writeFileSync(join(outDir, `icon-${size}.png`), png);
  }

  // Maskable: art fits inside 80% safe zone, edge-to-edge accent fill so the OS
  // can crop to circle/squircle without losing the glyph.
  const size = 512;
  const inner = Math.round(size * 0.56); // glyph smaller, centered in safe zone
  const png = encodePng(size, size, makePixel(size, inner, MASK_BG, BG));
  writeFileSync(join(outDir, `icon-${size}-maskable.png`), png);

  console.log(`wrote 3 icons to ${outDir}`);
}

main();
