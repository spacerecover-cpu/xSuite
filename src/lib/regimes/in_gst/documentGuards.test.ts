import { describe, it, expect } from 'vitest';
import { whollyExemptGuard, goodsInHandoverGuidance } from './documentGuards';
import type { DocumentTaxLine } from '../../pdf/types';

const line = (treatment: string): DocumentTaxLine => ({
  line_item_id: 'l', component_code: 'GST', component_label: 'GST', rate: 0,
  taxable_base: 100, tax_amount: 0, tax_treatment: treatment, treatment_reason_code: null,
  sequence: 1, backfilled: false, rule_trace: null,
});

describe('whollyExemptGuard (Rule 49 Bill of Supply)', () => {
  it('BLOCKS a tax-invoice issue when every line is exempt (needs a Bill of Supply, not supported)', () => {
    const f = whollyExemptGuard([line('exempt'), line('exempt')]);
    expect(f?.level).toBe('block');
    expect(f?.field_key).toBe('wholly_exempt_bill_of_supply');
    expect(f?.message).toMatch(/Bill of Supply/i);
    expect(f?.message).toMatch(/consult/i);
  });
  it('passes when any line is taxable', () => {
    expect(whollyExemptGuard([line('exempt'), line('standard')])).toBeNull();
  });
  it('does NOT block zero-rated (export/SEZ) supplies — they are taxable-at-0% and need a tax invoice', () => {
    expect(whollyExemptGuard([line('zero_rated'), line('zero_rated')])).toBeNull();
    expect(whollyExemptGuard([line('exempt'), line('zero_rated')])).toBeNull();
  });
  it('passes on an empty set (no lines yet — nothing to guard)', () => {
    expect(whollyExemptGuard([])).toBeNull();
  });
});

describe('goodsInHandoverGuidance (two-document flow — banner only)', () => {
  it('shows the split-document banner when lab-supplied goods are in the handover', () => {
    const g = goodsInHandoverGuidance(['service', 'goods']);
    expect(g?.show).toBe(true);
    expect(g?.message).toMatch(/separate goods tax invoice/i);
  });
  it('returns null for a services-only document', () => {
    expect(goodsInHandoverGuidance(['service', 'service'])).toBeNull();
  });
});
