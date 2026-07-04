import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, unknown[]> = {};

vi.mock('../../supabaseClient', () => {
  const chain = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const self: Record<string, unknown> = {};
    const ret = () => self;
    for (const m of ['select', 'eq', 'is', 'lte', 'or', 'order', 'limit']) self[m] = vi.fn(ret);
    (self as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
    self.maybeSingle = vi.fn(async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }));
    return self;
  };
  return { supabase: { from: vi.fn((t: string) => chain(t)) } };
});

import { resolveComplianceRenderInputs, clearComplianceRenderCache } from './profileResolver';

beforeEach(() => {
  clearComplianceRenderCache();
  rows['legal_entities'] = [{
    id: 'le-1', country_id: 'om-uuid', tax_identifier: 'OM1100000000',
    is_primary: true, tenant_id: 't-1',
  }];
  rows['legal_entity_tax_registrations'] = [];
  rows['tenants'] = [{
    id: 't-1', timezone: 'Asia/Muscat',
    resolved_country_config: { 'regime.documents': 'gcc_tax_invoice' },
  }];
  rows['geo_countries'] = [{
    code: 'OM', tax_system: 'VAT', tax_label: 'VAT', tax_number_label: 'VATIN',
    tax_invoice_required: true, language_code: 'ar', decimal_places: 3,
    date_format: 'DD/MM/YYYY', decimal_separator: '.', thousands_separator: ',',
    digit_grouping: '3',
  }];
});

describe('resolveComplianceRenderInputs', () => {
  it('resolves facts + gcc profile + registered seller from the primary entity', async () => {
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.facts?.code).toBe('OM');
    expect(inputs.profile.key).toBe('gcc_tax_invoice');
    expect(inputs.sellerRegistered).toBe(true);
    expect(inputs.sellerTaxNumber).toBe('OM1100000000');
  });

  it('falls back to generic_invoice when regime.documents is unset', async () => {
    rows['tenants'] = [{ id: 't-1', timezone: 'Asia/Muscat', resolved_country_config: {} }];
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.profile.key).toBe('generic_invoice');
  });

  it('is unregistered when the entity has no tax_identifier and no active registration', async () => {
    rows['legal_entities'] = [{ id: 'le-1', country_id: 'om-uuid', tax_identifier: null, is_primary: true, tenant_id: 't-1' }];
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.sellerRegistered).toBe(false);
    expect(inputs.sellerTaxNumber).toBeNull();
  });

  it('returns null facts (never fabricates) when no legal entity exists', async () => {
    rows['legal_entities'] = [];
    const inputs = await resolveComplianceRenderInputs();
    expect(inputs.facts).toBeNull();
    expect(inputs.profile.key).toBe('generic_invoice');
  });
});
