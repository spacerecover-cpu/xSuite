import { describe, it, expect } from 'vitest';
import { createTranslationContext } from '../translationContext';
import { buildDeliveryChallanDocument, formatInr } from './DeliveryChallanDocument';
import { CHALLAN_COPY_LABELS } from '../../regimes/in_gst/deliveryChallan';
import type { DeliveryChallanDocumentData } from '../types';

const ctx = createTranslationContext('english_only', null);

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

function makeData(overrides: Partial<DeliveryChallanDocumentData['challanData']> = {}): DeliveryChallanDocumentData {
  return {
    challanData: {
      challanNo: 'DC/25-26/0007',
      challanDate: '2026-07-05T10:00:00.000Z',
      caseNo: 'CASE-0042',
      consignee: { name: 'Acme Films', address: '12 MG Road, Bengaluru 560001', gstin: '29ABCDE1234F1Z5', phone: '+91 98765 43210' },
      transport: { collectorName: 'A. Kumar', collectorMobile: '+91 98765 43210', relationship: 'self' },
      lines: [
        { description: 'HDD Seagate ST4000', hsnCode: '847170', quantity: 1, unitCode: 'NOS', serialNumber: 'SER-1', declaredValue: 20000 },
        { description: 'HDD Seagate ST4000', hsnCode: '847170', quantity: 1, unitCode: 'NOS', serialNumber: 'SER-2', declaredValue: 20000 },
      ],
      totalDeclaredValue: 40000,
      ewayNote: null,
      notation: 'Goods dispatched for reasons other than supply (Rule 55(1)). This is not a tax invoice.',
      ...overrides,
    },
    companySettings: {
      basic_info: { company_name: 'Space Recovery', legal_name: 'Space Recovery Labs Pvt Ltd', vat_number: '29AAACS1234A1Z2' },
      location: { address_line1: '4 Residency Rd', city: 'Bengaluru' },
    },
  };
}

describe('buildDeliveryChallanDocument — Rule 55 triplicate', () => {
  it('renders exactly three copies, each with its statutory marking, split by two page breaks', () => {
    const doc = buildDeliveryChallanDocument(makeData(), ctx);
    const s = JSON.stringify(doc.content);
    for (const label of CHALLAN_COPY_LABELS) {
      expect(occurrences(s, label)).toBe(1);
    }
    expect(occurrences(s, 'DELIVERY CHALLAN')).toBe(3);
    expect(occurrences(s, 'DC/25-26/0007')).toBe(3);
    expect(occurrences(s, '"pageBreak":"after"')).toBe(2);
  });

  it('itemizes exactly the passed lines with serials, HSN, and declared values (3× for triplicate)', () => {
    const s = JSON.stringify(buildDeliveryChallanDocument(makeData(), ctx).content);
    expect(occurrences(s, 'SER-1')).toBe(3);
    expect(occurrences(s, 'SER-2')).toBe(3);
    expect(occurrences(s, '847170')).toBe(6); // 2 lines × 3 copies
    expect(s).toContain(formatInr(40000));
  });

  it('prints consigner GSTIN, consignee GSTIN, the non-supply notation, and case number', () => {
    const s = JSON.stringify(buildDeliveryChallanDocument(makeData(), ctx).content);
    expect(s).toContain('29AAACS1234A1Z2');
    expect(s).toContain('29ABCDE1234F1Z5');
    expect(s).toContain('other than supply');
    expect(s).toContain('CASE-0042');
  });

  it('shows the e-way note only when set', () => {
    const withNote = JSON.stringify(
      buildDeliveryChallanDocument(makeData({ ewayNote: 'E-way bill may be required — generate it manually.' }), ctx).content,
    );
    const without = JSON.stringify(buildDeliveryChallanDocument(makeData(), ctx).content);
    expect(withNote).toContain('E-way bill may be required');
    expect(without).not.toContain('E-way bill may be required');
  });
});

describe('formatInr', () => {
  it('uses Indian digit grouping with the rupee sign', () => {
    expect(formatInr(1234567.5)).toBe('₹12,34,567.50');
    expect(formatInr(40000)).toBe('₹40,000.00');
  });
});
