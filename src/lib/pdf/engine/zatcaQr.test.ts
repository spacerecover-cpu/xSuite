import { describe, it, expect } from 'vitest';
import { buildZatcaTlvBase64 } from './zatcaQr';

/** Decode a base64 ZATCA TLV back into a { tag: value } map for assertions. */
function parseTlv(b64: string): Record<number, string> {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const fields: Record<number, string> = {};
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i];
    const len = bytes[i + 1];
    fields[tag] = new TextDecoder().decode(bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return fields;
}

describe('buildZatcaTlvBase64', () => {
  it('encodes the 5 ZATCA Phase-1 fields as a base64 TLV', () => {
    const b64 = buildZatcaTlvBase64({
      sellerName: 'Future Space LLC',
      vatNumber: 'OM1100223344',
      timestamp: '2026-06-14T13:45:00Z',
      total: '105.00',
      vatAmount: '5.00',
    });
    expect(typeof b64).toBe('string');
    const f = parseTlv(b64);
    expect(f[1]).toBe('Future Space LLC');
    expect(f[2]).toBe('OM1100223344');
    expect(f[3]).toBe('2026-06-14T13:45:00Z');
    expect(f[4]).toBe('105.00');
    expect(f[5]).toBe('5.00');
  });

  it('round-trips UTF-8 (Arabic) seller names with correct byte lengths', () => {
    const b64 = buildZatcaTlvBase64({
      sellerName: 'فيوتشر سبيس',
      vatNumber: 'OM1',
      timestamp: '2026-01-01T00:00:00Z',
      total: '1',
      vatAmount: '0',
    });
    expect(parseTlv(b64)[1]).toBe('فيوتشر سبيس');
  });

  it('is deterministic for the same inputs', () => {
    const args = {
      sellerName: 'A',
      vatNumber: 'B',
      timestamp: '2026-01-01T00:00:00Z',
      total: '1.00',
      vatAmount: '0.00',
    };
    expect(buildZatcaTlvBase64(args)).toBe(buildZatcaTlvBase64(args));
  });
});
