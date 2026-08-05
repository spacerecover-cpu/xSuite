import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { rpc, from } }));
vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createCaseWithDevices } from './caseIntakeService';

/** Ordered log of the side effects the creation sequence performs. */
let calls: string[] = [];

function mockIntakeStatuses() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => {
    calls.push('intake-status');
    return Promise.resolve({
      data: [
        { id: 'st-registered', name: 'Registered' },
        { id: 'st-received', name: 'Device Received' },
      ],
      error: null,
    });
  });
  return chain;
}

function mockCasesInsert(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => {
    calls.push('cases-insert');
    return chain;
  });
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

function mockDevicesInsert(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => {
    calls.push('devices-insert');
    return chain;
  });
  chain.select = vi.fn(() => Promise.resolve(result));
  return chain;
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 't1',
    profileId: 'u1',
    profileRole: 'manager',
    customerId: 'cust-1',
    customerName: 'Acme Ltd',
    priority: 'high',
    devices: [],
    ...overrides,
  } as Parameters<typeof createCaseWithDevices>[0];
}

const device = (over: Record<string, unknown> = {}) => ({
  device_type_id: 'dt-1',
  serial_number: 'SN-1',
  ...over,
});

describe('createCaseWithDevices', () => {
  let casesChain: Record<string, unknown>;
  let devicesChain: Record<string, unknown>;

  beforeEach(() => {
    calls = [];
    rpc.mockReset();
    from.mockReset();
    rpc.mockImplementation((fn: string) => {
      if (fn === 'get_next_number') {
        calls.push('get_next_number');
        return Promise.resolve({ data: 'CASE-0042', error: null });
      }
      calls.push(`rpc:${fn}`);
      return Promise.resolve({ data: null, error: null });
    });
    casesChain = mockCasesInsert({ data: { id: 'case-1' }, error: null });
    devicesChain = mockDevicesInsert({ data: [{ id: 'dev-a' }, { id: 'dev-b' }], error: null });
    from.mockImplementation((table: string) => {
      if (table === 'master_case_statuses') return mockIntakeStatuses();
      if (table === 'cases') return casesChain;
      if (table === 'case_devices') return devicesChain;
      throw new Error(`unexpected table ${table}`);
    });
  });

  it('reserves the number, resolves intake status, inserts the case, then the devices, then promotes the primary', async () => {
    const result = await createCaseWithDevices(
      baseInput({ devices: [device(), device({ serial_number: 'SN-2', isPrimary: true })] }),
    );

    expect(calls).toEqual([
      'get_next_number',
      'intake-status',
      'cases-insert',
      'devices-insert',
      'rpc:promote_device_to_primary',
    ]);
    expect(rpc).toHaveBeenCalledWith('get_next_number', { p_scope: 'case' });
    expect(result).toEqual({
      caseId: 'case-1',
      caseNumber: 'CASE-0042',
      deviceIds: ['dev-a', 'dev-b'],
    });
  });

  it('stamps the matched active intake status_id + name pair the cases guard trigger requires', async () => {
    await createCaseWithDevices(baseInput());

    expect(casesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 't1',
        case_number: 'CASE-0042',
        customer_id: 'cust-1',
        subject: 'Case for Acme Ltd',
        priority: 'high',
        status: 'Device Received',
        status_id: 'st-received',
        created_by: 'u1',
      }),
    );
    const [row] = (casesChain.insert as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(row.phase_entered_at).toEqual(expect.any(String));
    expect(row).not.toHaveProperty('assigned_to');
    expect(row).not.toHaveProperty('contact_id');
    expect(row).not.toHaveProperty('company_id');
  });

  it('auto-assigns a technician to the case they create', async () => {
    await createCaseWithDevices(baseInput({ profileRole: 'technician' }));

    expect(casesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 'u1', assigned_to: 'u1' }),
    );
  });

  it('carries the optional case fields through only when set', async () => {
    await createCaseWithDevices(
      baseInput({
        contactId: 'ct-1',
        clientReference: 'PO-9',
        serviceTypeId: 'svc-1',
        serviceLocationId: 'loc-1',
        companyId: 'co-1',
      }),
    );

    expect(casesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 'ct-1',
        client_reference: 'PO-9',
        service_type_id: 'svc-1',
        service_location_id: 'loc-1',
        company_id: 'co-1',
      }),
    );
  });

  it('stamps tenant_id and case_id on every device row and drops the isPrimary marker', async () => {
    await createCaseWithDevices(
      baseInput({ devices: [device({ isPrimary: true }), device({ serial_number: 'SN-2' })] }),
    );

    expect(devicesChain.insert).toHaveBeenCalledWith([
      { device_type_id: 'dt-1', serial_number: 'SN-1', tenant_id: 't1', case_id: 'case-1' },
      { device_type_id: 'dt-1', serial_number: 'SN-2', tenant_id: 't1', case_id: 'case-1' },
    ]);
  });

  it('promotes the flagged device at its own index', async () => {
    await createCaseWithDevices(
      baseInput({ devices: [device(), device({ serial_number: 'SN-2', isPrimary: true })] }),
    );

    expect(rpc).toHaveBeenCalledWith('promote_device_to_primary', {
      p_device_id: 'dev-b',
      p_case_id: 'case-1',
    });
  });

  it('falls back to the first device when none is flagged primary', async () => {
    await createCaseWithDevices(
      baseInput({ devices: [device(), device({ serial_number: 'SN-2' })] }),
    );

    expect(rpc).toHaveBeenCalledWith('promote_device_to_primary', {
      p_device_id: 'dev-a',
      p_case_id: 'case-1',
    });
  });

  it('skips the device insert and the promotion when no devices are supplied', async () => {
    const result = await createCaseWithDevices(baseInput({ devices: [] }));

    expect(calls).toEqual(['get_next_number', 'intake-status', 'cases-insert']);
    expect(result.deviceIds).toEqual([]);
  });

  it('explains an unconfigured numbering sequence instead of leaking the raw error', async () => {
    rpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: 'sequence "case" not found' } }),
    );

    await expect(createCaseWithDevices(baseInput())).rejects.toThrow(
      /Case numbering system is not configured/,
    );
    expect(casesChain.insert).not.toHaveBeenCalled();
  });

  it('rejects an empty case number before touching the cases table', async () => {
    rpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));

    await expect(createCaseWithDevices(baseInput())).rejects.toThrow(
      /Failed to generate case number/,
    );
    expect(casesChain.insert).not.toHaveBeenCalled();
  });

  it('surfaces a case insert failure and never inserts devices', async () => {
    casesChain = mockCasesInsert({ data: null, error: { message: 'rls denied' } });

    await expect(createCaseWithDevices(baseInput({ devices: [device()] }))).rejects.toThrow(
      'Failed to create case: rls denied',
    );
    expect(devicesChain.insert).not.toHaveBeenCalled();
  });

  it('surfaces a device insert failure', async () => {
    devicesChain = mockDevicesInsert({ data: null, error: { message: 'bad column' } });

    await expect(createCaseWithDevices(baseInput({ devices: [device()] }))).rejects.toThrow(
      'Failed to insert devices: bad column',
    );
    expect(rpc).not.toHaveBeenCalledWith('promote_device_to_primary', expect.anything());
  });
});
