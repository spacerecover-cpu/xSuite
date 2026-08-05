import { describe, it, expect } from 'vitest';
import { depositorBlock, devicesForReceipt, toEngineData } from './receiptAdapter';
import type { CaseData, DeviceData, ReceiptData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

const dev = (id: string, batch?: string, receivedAt?: string): DeviceData => ({
  id,
  intake_batch_id: batch,
  received_at: receivedAt,
});

describe('devicesForReceipt', () => {
  it('returns only the latest intake batch', () => {
    const devices = [
      dev('a', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('b', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('c', 'batch-2', '2026-08-04T09:00:00Z'),
    ];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['c']);
  });

  it('falls back to every device when no batch has been recorded', () => {
    const devices = [dev('a'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('ignores unbatched devices when a batch exists', () => {
    const devices = [dev('a', 'batch-1', '2026-08-01T10:00:00Z'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a']);
  });

  it('returns EVERY device of the latest batch (a multi-drive RAID intake never collapses)', () => {
    const devices = [
      dev('c', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('a', 'batch-2', '2026-08-04T09:00:00Z'),
      dev('b', 'batch-2', '2026-08-04T09:00:00Z'),
    ];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a', 'b']);
  });
});

const CONFIG = {} as DocumentTemplateConfig;

const baseCase: CaseData = {
  id: 'c1',
  case_no: 'C-0044',
  created_at: '2026-08-01T00:00:00Z',
  status: 'intake',
  priority: 'normal',
  problem_description: 'Case-level fallback problem',
  customer: { id: 'cust1', customer_name: 'Satya Pratap A' },
};

const companySettings = { legal_compliance: {}, branding: {} } as ReceiptData['companySettings'];

const intakeDevice = (
  id: string,
  serial: string,
  batch: string,
  receivedAt: string,
  problem: string,
): DeviceData => ({
  id,
  serial_number: serial,
  intake_batch_id: batch,
  received_at: receivedAt,
  device_problem: problem,
});

describe('receiptAdapter.toEngineData — intake batch scoping', () => {
  const earlier = intakeDevice('d0', 'WS10SSNM25', 'B0', '2026-08-01T10:00:00Z', 'Clicking noise');
  const latestA = intakeDevice('d1', 'CND9242CRV', 'B1', '2026-08-04T09:00:00Z', 'Not detected');
  const latestB = intakeDevice('d2', 'ZA1B2C3D4E', 'B1', '2026-08-04T09:00:00Z', 'Not detected');

  const make = (devices: DeviceData[]): ReceiptData => ({
    caseData: baseCase,
    devices,
    companySettings,
  });

  it('prints only the devices received in the latest intake batch', () => {
    const out = toEngineData(make([earlier, latestA, latestB]), CONFIG, 'office');
    const serials = (out.devices?.rows ?? []).map((r) => r.serial);
    expect(serials).toEqual(['CND9242CRV', 'ZA1B2C3D4E']);
    expect(serials).not.toContain('WS10SSNM25');
  });

  it('reads the Case Details problem from the latest batch, not an earlier intake', () => {
    const out = toEngineData(make([earlier, latestA]), CONFIG, 'customer');
    const caseVals = (out.caseInfo?.rows ?? []).map((r) => r.value);
    expect(caseVals).toContain('Not detected');
    expect(caseVals).not.toContain('Clicking noise');
  });

  it('emits the depositor handover block as the collector section', () => {
    const deposited: DeviceData = {
      ...latestA,
      depositor_name: 'Sam Okafor',
      depositor_relationship: 'courier',
      depositor_id: 'P1234567',
      depositor_mobile: '+441234567890',
    };
    const out = toEngineData(make([earlier, deposited]), CONFIG, 'office');
    expect((out.collector?.rows ?? []).map((r) => `${r.label.en}=${r.value}`)).toEqual([
      'Delivered by=Sam Okafor — on behalf of Satya Pratap A',
      'Relationship=Courier',
      'National ID=P1234567',
      'Mobile=+441234567890',
      'Received on=04/08/2026',
    ]);
  });
});

describe('depositorBlock', () => {
  it('returns null when no depositor was recorded', () => {
    expect(depositorBlock([dev('a')], 'Acme Ltd')).toBeNull();
  });

  it('reads "Delivered by customer" when the depositor is the customer', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Dana Reed',
      depositor_relationship: 'self',
    };
    const block = depositorBlock([d], 'Dana Reed');
    expect(block?.rows.find((r) => r.label.en === 'Delivered by')?.value).toBe(
      'Delivered by customer',
    );
  });

  it('names the agent and the customer when the depositor is not the customer', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Sam Okafor',
      depositor_relationship: 'courier',
      depositor_id: 'P1234567',
      depositor_mobile: '+441234567890',
    };
    const block = depositorBlock([d], 'Acme Ltd');
    expect(block?.rows.find((r) => r.label.en === 'Delivered by')?.value).toBe(
      'Sam Okafor — on behalf of Acme Ltd',
    );
    expect(block?.rows.find((r) => r.label.en === 'Relationship')?.value).toBe('Courier');
    expect(block?.rows.find((r) => r.label.en === 'National ID')?.value).toBe('P1234567');
    expect(block?.rows.find((r) => r.label.en === 'Mobile')?.value).toBe('+441234567890');
    expect(block?.rows.find((r) => r.label.en === 'Received on')?.value).toBe('04/08/2026');
  });

  it('still names a depositor recorded WITHOUT a relationship', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Sam Okafor',
      depositor_id: 'P1234567',
      depositor_mobile: '+441234567890',
    };
    const block = depositorBlock([d], 'Acme Ltd');
    expect((block?.rows ?? []).map((r) => `${r.label.en}=${r.value}`)).toEqual([
      'Delivered by=Sam Okafor — on behalf of Acme Ltd',
      'National ID=P1234567',
      'Mobile=+441234567890',
      'Received on=04/08/2026',
    ]);
  });

  it('treats a blank or customer-named depositor with no relationship as the customer', () => {
    const blank: DeviceData = { ...dev('a', 'b1', '2026-08-04T09:00:00Z'), depositor_name: '  ' };
    expect(depositorBlock([blank], 'Acme Ltd')?.rows[0].value).toBe('Delivered by customer');

    const named: DeviceData = { ...dev('a', 'b1', '2026-08-04T09:00:00Z'), depositor_name: 'Acme Ltd' };
    expect(depositorBlock([named], 'Acme Ltd')?.rows[0].value).toBe('Delivered by customer');
  });

  it('falls back to the raw relationship when it is not in the label map', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Sam Okafor',
      depositor_relationship: 'neighbour',
    };
    const block = depositorBlock([d], 'Acme Ltd');
    expect(block?.rows.find((r) => r.label.en === 'Relationship')?.value).toBe('neighbour');
  });
});
