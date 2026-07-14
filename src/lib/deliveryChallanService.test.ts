import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from './supabaseClient';
import {
  fetchDeviceRolePartition,
  getCheckoutBatchId,
  issueDeliveryChallan,
  getIssuedChallan,
  assembleDeliveryChallanData,
  type IssuedDeliveryChallan,
} from './deliveryChallanService';
import type { ReceiptData } from './pdf/types';

vi.mock('./supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

/** Minimal chainable PostgREST stub: every builder method returns itself; the
 *  chain is awaitable and resolves to `result`. */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'maybeSingle']) {
    c[m] = vi.fn(() => c);
  }
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return c as never;
}

const HISTORY_ROW = {
  details: JSON.stringify({
    kind: 'delivery_challan',
    batch_id: 'batch-1',
    challan_no: 'DC/25-26/0007',
    lines: [{ device_id: 'dev-1', declared_value: 12000 }],
    total_declared_value: 12000,
    issued_at: '2026-07-05T10:00:00.000Z',
  }),
  created_at: '2026-07-05T10:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset();
  vi.mocked(supabase.from).mockReset();
});

describe('fetchDeviceRolePartition', () => {
  it('splits customer-owned from lab-supplied via catalog_device_roles', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'case_devices') {
        return chain({
          data: [
            { id: 'dev-1', device_role_id: 1 },
            { id: 'dev-2', device_role_id: 2 },
            { id: 'dev-3', device_role_id: null },
          ],
          error: null,
        });
      }
      return chain({ data: [{ id: 1, name: 'Patient' }, { id: 2, name: 'Clone' }], error: null });
    }) as never);

    const p = await fetchDeviceRolePartition(['dev-1', 'dev-2', 'dev-3']);
    expect(p.customerOwned.map((d) => d.id).sort()).toEqual(['dev-1', 'dev-3']);
    expect(p.labSupplied.map((d) => d.id)).toEqual(['dev-2']);
  });
});

describe('getCheckoutBatchId', () => {
  it('reads the batch stamped by log_case_checkout off case_devices', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      chain({ data: { checkout_batch_id: 'batch-9' }, error: null }),
    );
    expect(await getCheckoutBatchId('dev-1')).toBe('batch-9');
  });
});

const CHALLAN_RESULT = {
  kind: 'delivery_challan',
  batch_id: 'batch-1',
  challan_no: 'DC/25-26/0007',
  lines: [{ device_id: 'dev-1', declared_value: 12000 }],
  total_declared_value: 12000,
  issued_at: '2026-07-05T10:00:00.000Z',
  already_issued: false,
};

describe('issueDeliveryChallan — atomic RPC issuance (bug #87)', () => {
  it('calls issue_delivery_challan with mapped lines and maps the returned jsonb', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: CHALLAN_RESULT, error: null } as never);

    const issued = await issueDeliveryChallan({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
    });

    expect(issued.challanNo).toBe('DC/25-26/0007');
    expect(issued.totalDeclaredValue).toBe(12000);
    expect(issued.issuedAt).toBe('2026-07-05T10:00:00.000Z');
    expect(issued.lines).toEqual([{ deviceId: 'dev-1', declaredValue: 12000 }]);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('issue_delivery_challan', {
      p_case_id: 'case-1',
      p_batch_id: 'batch-1',
      p_lines: [{ device_id: 'dev-1', declared_value: 12000 }],
    });
  });

  it('returns the already-issued challan idempotently in a single rpc round-trip', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { ...CHALLAN_RESULT, already_issued: true },
      error: null,
    } as never);

    const issued = await issueDeliveryChallan({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
    });

    expect(issued.challanNo).toBe('DC/25-26/0007');
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(vi.mocked(supabase.rpc).mock.calls.every((c) => c[0] === 'issue_delivery_challan')).toBe(true);
  });

  it('throws when the rpc reports an error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'lock timeout' } } as never);

    await expect(
      issueDeliveryChallan({
        caseId: 'case-1',
        batchId: 'batch-1',
        lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
      }),
    ).rejects.toBeTruthy();
  });

  it('refuses an empty line set before touching the rpc', async () => {
    await expect(
      issueDeliveryChallan({ caseId: 'case-1', batchId: 'batch-1', lines: [] }),
    ).rejects.toThrow(/at least one customer-owned device/i);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('getIssuedChallan', () => {
  it('finds the batch among history rows and skips malformed details', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      chain({ data: [{ details: 'not-json', created_at: 'x' }, HISTORY_ROW], error: null }),
    );
    const found = await getIssuedChallan('case-1', 'batch-1');
    expect(found?.challanNo).toBe('DC/25-26/0007');
    expect(await getIssuedChallan('case-1', 'batch-OTHER')).toBeNull();
  });
});

describe('assembleDeliveryChallanData — reprints the immutable issued record', () => {
  const issued: IssuedDeliveryChallan = {
    caseId: 'case-1',
    batchId: 'batch-1',
    challanNo: 'DC/25-26/0007',
    issuedAt: '2026-07-05T10:00:00.000Z',
    lines: [
      { deviceId: 'raid-1', declaredValue: 20000 },
      { deviceId: 'raid-2', declaredValue: 20000 },
      { deviceId: 'raid-3', declaredValue: 20000 },
    ],
    totalDeclaredValue: 60000,
  };

  /** 12-drive RAID case: 3 drives checked out in batch-1, 9 still in the lab,
   *  plus a lab-supplied clone handed over in the SAME batch. */
  const receipt = {
    caseData: {
      id: 'case-1', case_no: 'CASE-0042', created_at: '2026-06-01', status: 'ready',
      priority: 'high', checkout_collector_name: 'A. Kumar',
      checkout_collector_mobile: '+91 98765 43210',
    },
    devices: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `raid-${i + 1}`,
        device_type: 'HDD', brand: 'Seagate', model: 'ST4000',
        serial_number: `SER-${i + 1}`, role: 'Patient',
        checkout_batch_id: i < 3 ? 'batch-1' : undefined,
        checkout_collector_name: i < 3 ? 'A. Kumar' : undefined,
        checkout_collector_mobile: i < 3 ? '+91 98765 43210' : undefined,
        checkout_collector_relationship: i < 3 ? 'self' : undefined,
      })),
      {
        id: 'clone-1', device_type: 'HDD', brand: 'WD', serial_number: 'CLONE-1',
        role: 'Clone', checkout_batch_id: 'batch-1',
      },
    ],
    companySettings: {},
  } as unknown as ReceiptData;

  it('itemizes exactly the issued lines — a partial 12-drive checkout yields 3 lines', () => {
    const data = assembleDeliveryChallanData(receipt, issued, {
      name: 'Acme Films', address: '12 MG Road, Bengaluru 560001', gstin: '29ABCDE1234F1Z5', phone: null,
    });
    expect(data.lines).toHaveLength(3);
    expect(data.lines.map((l) => l.serialNumber)).toEqual(['SER-1', 'SER-2', 'SER-3']);
    expect(data.totalDeclaredValue).toBe(60000);
    expect(data.caseNo).toBe('CASE-0042');
    expect(data.challanNo).toBe('DC/25-26/0007');
    expect(data.consignee.gstin).toBe('29ABCDE1234F1Z5');
    expect(data.transport.collectorName).toBe('A. Kumar');
  });

  // Bug #45: a challan number is a statutory serial — a reprint must reproduce
  // exactly what was issued. A post-issuance role edit must NOT silently drop a
  // line / shrink the total / erase the e-way note on the reprinted document.
  it('reprints the immutable issued set after a device role is edited to lab-supplied (bug #45)', () => {
    const issuedTwo: IssuedDeliveryChallan = {
      caseId: 'case-1',
      batchId: 'batch-1',
      challanNo: 'DC/25-26/0011',
      issuedAt: '2026-07-05T10:00:00.000Z',
      lines: [
        { deviceId: 'dev-x', declaredValue: 30000 },
        { deviceId: 'dev-y', declaredValue: 25000 },
      ],
      totalDeclaredValue: 55000,
    };
    // dev-y's role has since been edited to a lab-supplied 'Clone Target'.
    const mutated = {
      caseData: {
        id: 'case-1', case_no: 'CASE-0099', created_at: '2026-06-01', status: 'ready', priority: 'high',
      },
      devices: [
        { id: 'dev-x', device_type: 'HDD', brand: 'Seagate', serial_number: 'SER-X', role: 'Patient', checkout_batch_id: 'batch-1' },
        { id: 'dev-y', device_type: 'SSD', brand: 'Samsung', serial_number: 'SER-Y', role: 'Clone Target', checkout_batch_id: 'batch-1' },
      ],
      companySettings: {},
    } as unknown as ReceiptData;

    const data = assembleDeliveryChallanData(mutated, issuedTwo, {
      name: 'Acme', address: null, gstin: null, phone: null,
    });
    expect(data.lines).toHaveLength(2);
    expect(data.lines.map((l) => l.serialNumber)).toEqual(['SER-X', 'SER-Y']);
    expect(data.totalDeclaredValue).toBe(55000);
    expect(data.ewayNote).toMatch(/e-way bill/i);
  });

  it('still renders an issued line whose device is gone (soft-deleted), with a fallback description', () => {
    const issuedGone: IssuedDeliveryChallan = {
      ...issued,
      lines: [...issued.lines, { deviceId: 'gone-1', declaredValue: 5000 }],
      totalDeclaredValue: 65000,
    };
    const data = assembleDeliveryChallanData(receipt, issuedGone, {
      name: 'Acme Films', address: null, gstin: null, phone: null,
    });
    expect(data.lines).toHaveLength(4);
    const goneLine = data.lines[3];
    expect(goneLine.description).toBe('Storage device');
    expect(goneLine.serialNumber).toBeNull();
    expect(goneLine.declaredValue).toBe(5000);
    // Total comes from the immutable issued record, not a live-derived subset.
    expect(data.totalDeclaredValue).toBe(65000);
  });

  it('sets the e-way note from the immutable issued total at/above ₹50,000', () => {
    const data = assembleDeliveryChallanData(receipt, issued, {
      name: 'Acme Films', address: null, gstin: null, phone: null,
    });
    expect(data.ewayNote).toMatch(/e-way bill/i);
  });
});
