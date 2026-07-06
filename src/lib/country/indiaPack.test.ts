import { describe, it, expect } from 'vitest';
import { REGISTRY_BY_KEY } from './registry';
import { INDIA_PACK_CONFIG } from './indiaPack';

describe('WP-S1b India pack bindings vs COUNTRY_CONFIG_REGISTRY', () => {
  it('every seeded config key exists in the registry and parses against its Zod schema', () => {
    for (const [key, value] of Object.entries(INDIA_PACK_CONFIG)) {
      const def = REGISTRY_BY_KEY[key];
      expect(def, `registry key missing: ${key}`).toBeDefined();
      const parsed = def.schema.safeParse(value);
      expect(parsed.success, `${key} rejected value ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('rounding is head-level whole-rupee (Section 170; requires the S1a level-enum widening)', () => {
    expect(INDIA_PACK_CONFIG['tax.rounding_policy']).toEqual({ mode: 'half_up', level: 'head', cash_increment: 1 });
  });

  it('e-invoice regime is no_einvoice — D3: no in_irn plugin/lifecycle this phase', () => {
    expect(INDIA_PACK_CONFIG['regime.einvoice']).toBe('no_einvoice');
  });

  it('return shape: gstr composer, monthly periods anchored 04-01, indian words scale', () => {
    expect(INDIA_PACK_CONFIG['tax.return_composer']).toBe('gstr');
    expect(INDIA_PACK_CONFIG['tax.filing_frequency']).toBe('monthly');
    expect(INDIA_PACK_CONFIG['tax.period_anchor']).toBe('04-01');
    expect(INDIA_PACK_CONFIG['format.amount_words_scale']).toBe('indian');
  });
});
