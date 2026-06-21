import { describe, it, expect } from 'vitest';
import { toEngineData } from './checkoutAdapter';
import type { CaseData, DeviceData, ReceiptData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

const CONFIG = {} as DocumentTemplateConfig;

const baseCase: CaseData = {
  id: 'c1',
  case_no: 'C-0033',
  created_at: '2026-06-01T00:00:00Z',
  status: 'completed',
  priority: 'normal',
  customer: {
    id: 'cust1',
    customer_name: 'Satya Pratap A',
    email: 'projects.urbanedge@gmail.com',
    mobile_number: '+968 9497 1196',
  },
  company: { id: 'co1', company_name: 'Urban Edge Design Consultation' },
  service_type: { id: 's1', name: 'Data Recovery' },
  checkout_date: '2026-06-20T19:34:00Z',
  recovery_outcome: 'declined',
};

const dBatchLatest: DeviceData = {
  id: 'd1',
  device_type: '2.5" HDD',
  brand: 'Western Digital',
  capacity: '500GB',
  serial_number: 'CND9242CRV',
  role: 'Patient',
  checked_out_at: '2026-06-20T19:34:00Z',
  checkout_batch_id: 'B1',
  checkout_collector_name: 'Ramcharan',
  checkout_collector_mobile: '+968 1111 2222',
  checkout_collector_id: 'OM-ID-555',
  checkout_collector_relationship: 'authorized_agent',
};

const dBatchEarlier: DeviceData = {
  id: 'd0',
  device_type: '3.5" HDD',
  brand: 'Seagate',
  capacity: '1TB',
  serial_number: 'WS10SSNM25',
  role: 'Patient',
  checked_out_at: '2026-06-19T10:00:00Z',
  checkout_batch_id: 'B0',
  checkout_collector_name: 'Satya Pratap A',
  checkout_collector_relationship: 'self',
};

const companySettings = { legal_compliance: {}, branding: {} } as ReceiptData['companySettings'];

const make = (devices: DeviceData[], caseOverrides: Partial<CaseData> = {}): ReceiptData => ({
  caseData: { ...baseCase, ...caseOverrides },
  devices,
  companySettings,
});

const values = (rows?: { value: string }[]): string[] => (rows ?? []).map((r) => r.value);
const labels = (rows?: { label: { en?: string } }[]): string[] => (rows ?? []).map((r) => r.label.en ?? '');

describe('checkoutAdapter — per-device handover + dedupe + collector', () => {
  it('prints only the devices collected in the latest batch', () => {
    const out = toEngineData(make([dBatchLatest, dBatchEarlier]), CONFIG);
    const serials = (out.devices?.rows ?? []).map((r) => r.serial);
    expect(serials).toContain('CND9242CRV'); // latest batch B1
    expect(serials).not.toContain('WS10SSNM25'); // earlier batch B0 — already collected
  });

  it('Case Details no longer duplicates the customer name / company', () => {
    const out = toEngineData(make([dBatchLatest, dBatchEarlier]), CONFIG);
    const caseVals = values(out.caseInfo?.rows);
    expect(caseVals).not.toContain('Satya Pratap A');
    expect(caseVals).not.toContain('Urban Edge Design Consultation');
    expect(caseVals).toContain('C-0033'); // case id stays
    expect(caseVals).toContain('Data Recovery'); // service stays
    expect(caseVals.some((v) => v.includes('1 of 2'))).toBe(true); // partial-collection count
  });

  it('Customer Information still carries the customer identity', () => {
    const out = toEngineData(make([dBatchLatest]), CONFIG);
    expect(out.parties.to?.name).toBe('Satya Pratap A');
    const vals = values(out.parties.to?.rows);
    expect(vals).toContain('Urban Edge Design Consultation');
    expect(vals.some((v) => v.includes('9497 1196'))).toBe(true);
    expect(vals).toContain('projects.urbanedge@gmail.com');
  });

  it('shows the collector as a distinct party "on behalf of" the customer, with National ID', () => {
    const out = toEngineData(make([dBatchLatest]), CONFIG);
    expect(values(out.collector?.rows)).toContain('Ramcharan'); // collector name
    expect(labels(out.collector?.rows).some((l) => /On Behalf Of/i.test(l))).toBe(true);
    expect(values(out.collector?.rows)).toContain('Satya Pratap A'); // on behalf of the customer
    expect(values(out.collector?.rows)).toContain('OM-ID-555'); // National ID shown
  });

  it('labels a self-collection as the customer (no on-behalf-of)', () => {
    const selfDevice: DeviceData = {
      ...dBatchLatest,
      checkout_collector_relationship: 'self',
      checkout_collector_name: 'Satya Pratap A',
      checkout_collector_id: undefined,
    };
    const out = toEngineData(make([selfDevice]), CONFIG);
    expect(labels(out.collector?.rows).some((l) => /On Behalf Of/i.test(l))).toBe(false);
    expect(values(out.collector?.rows)).toContain('Satya Pratap A');
  });

  it('falls back to all devices when none are checked out (preview/sample)', () => {
    const d1 = { ...dBatchLatest, checked_out_at: undefined, checkout_batch_id: undefined };
    const d2 = { ...dBatchEarlier, checked_out_at: undefined, checkout_batch_id: undefined };
    const out = toEngineData(make([d1, d2]), CONFIG);
    expect((out.devices?.rows ?? []).length).toBe(2);
  });
});
