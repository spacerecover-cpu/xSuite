import { describe, it, expect } from 'vitest';
import {
  INDIA_SAC_DEFAULTS, resolveLineItemSac, buildIndiaSacMetadataPatch,
} from './sacDefaults';
import { validateHsnSac } from './hsn';

describe('India SAC line-item defaults (tenant metadata, not global catalog)', () => {
  it('defaults to data-recovery SAC 998319, offers 998713 as selectable', () => {
    expect(INDIA_SAC_DEFAULTS.default).toBe('998319');
    expect(INDIA_SAC_DEFAULTS.selectable).toEqual(['998319', '998713']);
  });

  it('every seeded SAC is a valid 6-digit code', () => {
    for (const code of INDIA_SAC_DEFAULTS.selectable) {
      expect(validateHsnSac(code).ok).toBe(true);
    }
  });

  it('buildIndiaSacMetadataPatch nests under an in_gst namespace (no catalog write)', () => {
    expect(buildIndiaSacMetadataPatch()).toEqual({
      in_gst: { sac_defaults: { default: '998319', selectable: ['998319', '998713'] } },
    });
  });

  it('resolveLineItemSac: explicit override wins, else tenant default, else hard default', () => {
    const meta = { in_gst: { sac_defaults: { default: '998319', selectable: ['998319', '998713'] } } };
    expect(resolveLineItemSac(meta, '998713')).toBe('998713');
    expect(resolveLineItemSac(meta, null)).toBe('998319');
    expect(resolveLineItemSac({}, null)).toBe('998319');
    expect(resolveLineItemSac(null, undefined)).toBe('998319');
  });
});
