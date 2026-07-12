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

describe('issueDeliveryChallan — idempotent per checkout batch', () => {
  it('allocates a number from the delivery_challan scope and appends one history row', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: [], error: null })); // no prior issuance
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'get_next_number') return Promise.resolve({ data: 'DC/25-26/0007', error: null });
      return Promise.resolve({ data: undefined, error: null }); // log_case_history
    }) as never);

    const issued = await issueDeliveryChallan({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
    });

    expect(issued.challanNo).toBe('DC/25-26/0007');
    expect(issued.totalDeclaredValue).toBe(12000);
    expect(supabase.rpc).toHaveBeenCalledWith('get_next_number', { p_scope: 'delivery_challan' });
    const histCall = vi.mocked(supabase.rpc).mock.calls.find((c) => c[0] === 'log_case_history');
    expect(histCall).toBeDefined();
    const args = histCall![1] as { p_action: string; p_case_id: string; p_details: string };
    expect(args.p_action).toBe('delivery_challan_issued');
    expect(args.p_case_id).toBe('case-1');
    expect(JSON.parse(args.p_details)).toMatchObject({
      kind: 'delivery_challan',
      batch_id: 'batch-1',
      challan_no: 'DC/25-26/0007',
      lines: [{ device_id: 'dev-1', declared_value: 12000 }],
      total_declared_value: 12000,
    });
  });

  it('re-issuing the same batch returns the recorded number and consumes NO new number', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: [HISTORY_ROW], error: null }));

    const issued = await issueDeliveryChallan({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
    });

    expect(issued.challanNo).toBe('DC/25-26/0007');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('reconciles to the canonical (earliest) row when a concurrent same-batch checkout already appended one', async () => {
    // Pre-mint existence check finds nothing, so this caller proceeds to mint
    // 0008. Between the check and the post-write re-read, a truly-concurrent
    // checkout of the SAME batch landed an earlier row (0007). Reconciliation
    // must return 0007 — the number this caller minted must NOT reach the
    // customer, or the same handover would carry two statutory challans.
    vi.mocked(supabase.from)
      .mockReturnValueOnce(chain({ data: [], error: null })) // pre-mint check: none yet
      .mockReturnValueOnce(chain({ data: [HISTORY_ROW], error: null })); // post-write reconcile: 0007
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'get_next_number') return Promise.resolve({ data: 'DC/25-26/0008', error: null });
      return Promise.resolve({ data: undefined, error: null }); // log_case_history
    }) as never);

    const issued = await issueDeliveryChallan({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 12000 }],
    });

    expect(issued.challanNo).toBe('DC/25-26/0007');
    expect(issued.challanNo).not.toBe('DC/25-26/0008');
  });

  it('refuses an empty line set', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: [], error: null }));
    await expect(
      issueDeliveryChallan({ caseId: 'case-1', batchId: 'batch-1', lines: [] }),
    ).rejects.toThrow(/at least one customer-owned device/i);
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

describe('assembleDeliveryChallanData — per-transfer device set only', () => {
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

  it('itemizes ONLY the batch devices — a partial 12-drive checkout yields 3 lines', () => {
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

  it('drops a lab-supplied clone even if a declared value slipped into the lines', () => {
    const withClone: IssuedDeliveryChallan = {
      ...issued,
      lines: [...issued.lines, { deviceId: 'clone-1', declaredValue: 5000 }],
      totalDeclaredValue: 65000,
    };
    const data = assembleDeliveryChallanData(receipt, withClone, {
      name: 'Acme Films', address: null, gstin: null, phone: null,
    });
    expect(data.lines.map((l) => l.serialNumber)).not.toContain('CLONE-1');
    expect(data.totalDeclaredValue).toBe(60000);
  });

  it('sets the e-way note at/above ₹50,000 total', () => {
    const data = assembleDeliveryChallanData(receipt, issued, {
      name: 'Acme Films', address: null, gstin: null, phone: null,
    });
    expect(data.ewayNote).toMatch(/e-way bill/i);
  });
});
