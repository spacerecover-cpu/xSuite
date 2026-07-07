import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The pdfmake render path embeds these exact local TTFs (fontLoader.ts:90-116).
// A font subset without U+20B9 would print a tofu box on every Indian invoice —
// this is the WP-L1 "₹ on the PDF path" verification, parsing the TrueType cmap
// directly (no font library; formats 4 and 12 cover Roboto).
const RUPEE = 0x20b9;

function lookupFormat4(buf: Buffer, sub: number, cp: number): boolean {
  const segCountX2 = buf.readUInt16BE(sub + 6);
  const endCodes = sub + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;
  for (let i = 0; i < segCountX2 / 2; i++) {
    const end = buf.readUInt16BE(endCodes + i * 2);
    if (cp > end) continue;
    const start = buf.readUInt16BE(startCodes + i * 2);
    if (cp < start) return false;
    const idRangeOffset = buf.readUInt16BE(idRangeOffsets + i * 2);
    if (idRangeOffset === 0) return ((cp + buf.readInt16BE(idDeltas + i * 2)) & 0xffff) !== 0;
    return buf.readUInt16BE(idRangeOffsets + i * 2 + idRangeOffset + (cp - start) * 2) !== 0;
  }
  return false;
}

function lookupFormat12(buf: Buffer, sub: number, cp: number): boolean {
  const numGroups = buf.readUInt32BE(sub + 12);
  for (let i = 0; i < numGroups; i++) {
    const g = sub + 16 + i * 12;
    const start = buf.readUInt32BE(g);
    if (cp >= start && cp <= buf.readUInt32BE(g + 4)) return buf.readUInt32BE(g + 8) + (cp - start) !== 0;
  }
  return false;
}

function hasGlyphFor(buf: Buffer, cp: number): boolean {
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) !== 'cmap') continue;
    const cmap = buf.readUInt32BE(rec + 8);
    const numSub = buf.readUInt16BE(cmap + 2);
    for (let j = 0; j < numSub; j++) {
      const enc = cmap + 4 + j * 8;
      const platformID = buf.readUInt16BE(enc);
      const encodingID = buf.readUInt16BE(enc + 2);
      const unicode = platformID === 0 || (platformID === 3 && (encodingID === 1 || encodingID === 10));
      if (!unicode) continue;
      const sub = cmap + buf.readUInt32BE(enc + 4);
      const format = buf.readUInt16BE(sub);
      if ((format === 4 && lookupFormat4(buf, sub, cp)) || (format === 12 && lookupFormat12(buf, sub, cp))) {
        return true;
      }
    }
    return false;
  }
  return false;
}

describe('U+20B9 (₹) glyph coverage — PDF font files (WP-L1)', () => {
  it.each(['Roboto-Regular.ttf', 'Roboto-Bold.ttf', 'Roboto-Italic.ttf', 'Roboto-BoldItalic.ttf'])(
    'public/fonts/%s maps a real glyph for U+20B9',
    (file) => {
      const buf = readFileSync(resolve(process.cwd(), 'public/fonts', file));
      expect(hasGlyphFor(buf, RUPEE)).toBe(true);
    },
  );
});
