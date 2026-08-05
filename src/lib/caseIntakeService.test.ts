import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, from, uploadSignature, uploadDocumentSignature, sha256Hex } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  uploadSignature: vi.fn(),
  uploadDocumentSignature: vi.fn(),
  sha256Hex: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({ supabase: { rpc, from } }));
vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./fileStorageService', () => ({ uploadSignature, uploadDocumentSignature }));
vi.mock('./pdf/contentHash', () => ({ sha256Hex }));

import {
  captureIntakeConsents,
  createCaseWithDevices,
  DevicesInCustodyError,
  logCaseIntake,
  requireDepositorId,
  signIntakeReceipt,
} from './caseIntakeService';

/** The capture session's user agent, recorded alongside every signature. */
const expectedUserAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

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

  // A rejected insert and an insert whose response was lost look identical from
  // here, and the lost-response case has already fired the DEVICE_RECEIVED
  // custody trigger. Both must carry the case identity so no caller can retry.
  it('carries the case identity when the device insert fails', async () => {
    devicesChain = mockDevicesInsert({ data: null, error: { message: 'Failed to fetch' } });

    await expect(createCaseWithDevices(baseInput({ devices: [device()] }))).rejects.toMatchObject({
      name: 'DevicesInCustodyError',
      created: { caseId: 'case-1', caseNumber: 'CASE-0042', deviceIds: [] },
    });
  });

  it('carries the case identity when the retryable primary promotion fails', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'get_next_number') return Promise.resolve({ data: 'CASE-0042', error: null });
      if (fn === 'promote_device_to_primary') {
        return Promise.resolve({ data: null, error: { code: '40001', message: 'serialization' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const failure = await createCaseWithDevices(
      baseInput({ devices: [device({ isPrimary: true })] }),
    ).catch((e: unknown) => e);

    // The devices are ALREADY in custody at this point — the retry this error
    // text invites would append a second set of DEVICE_RECEIVED events.
    expect(failure).toBeInstanceOf(DevicesInCustodyError);
    expect((failure as DevicesInCustodyError).message).toMatch(/please retry/i);
    expect((failure as DevicesInCustodyError).created).toEqual({
      caseId: 'case-1',
      caseNumber: 'CASE-0042',
      deviceIds: ['dev-a', 'dev-b'],
    });
  });

  it('leaves failures before the device insert plainly retryable', async () => {
    casesChain = mockCasesInsert({ data: null, error: { message: 'rls denied' } });

    const failure = await createCaseWithDevices(
      baseInput({ devices: [device()] }),
    ).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(DevicesInCustodyError);
  });
});

describe('requireDepositorId', () => {
  it('is false for the customer themselves', () => {
    expect(requireDepositorId('self')).toBe(false);
  });

  it('is true for every other relationship', () => {
    expect(requireDepositorId('courier')).toBe(true);
    expect(requireDepositorId('authorized_agent')).toBe(true);
    expect(requireDepositorId('company_rep')).toBe(true);
  });
});

describe('logCaseIntake', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('rejects a non-self depositor with no ID before hitting the network', async () => {
    await expect(logCaseIntake({
      caseId: 'c1', deviceIds: ['d1'], depositorName: 'Sam',
      depositorRelationship: 'courier', depositorId: '  ',
    })).rejects.toThrow(/National ID is required/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends the whole depositor identity, not just the case and devices', async () => {
    rpc.mockResolvedValue({ data: 'batch-1', error: null });

    const batch = await logCaseIntake({
      caseId: 'c1',
      deviceIds: ['d1', 'd2'],
      depositorName: 'Dana',
      depositorMobile: '+971500000000',
      depositorId: 'ID-9',
      depositorRelationship: 'courier',
      receiptInstanceId: 'i1',
    });

    expect(batch).toBe('batch-1');
    expect(rpc).toHaveBeenCalledWith('log_case_intake', {
      p_case_id: 'c1',
      p_device_ids: ['d1', 'd2'],
      p_depositor_name: 'Dana',
      p_depositor_mobile: '+971500000000',
      p_depositor_id: 'ID-9',
      p_depositor_relationship: 'courier',
      p_receipt_instance_id: 'i1',
    });
  });
});

describe('signIntakeReceipt', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    uploadSignature.mockReset();
    uploadDocumentSignature.mockReset();
    sha256Hex.mockReset();
    rpc.mockResolvedValue({ data: { ok: true, signature_id: 'sig-1' }, error: null });
  });

  it('records a typed signature in the customer slot, naming the signer from what they typed', async () => {
    const id = await signIntakeReceipt('inst-1', { method: 'typed', typedValue: 'Dana Depositor' }, 'cust-1');

    expect(id).toBe('sig-1');
    expect(uploadSignature).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('staff_sign_off_document', {
      p_instance_id: 'inst-1',
      p_slot: 'customer',
      p_method: 'typed',
      p_signer_name: 'Dana Depositor',
      p_typed_value: 'Dana Depositor',
      p_signer_customer_id: 'cust-1',
      p_image_path: undefined,
      p_image_bucket: undefined,
      p_signature_sha256: undefined,
      p_user_agent: expectedUserAgent,
    });
  });

  it('uploads and hashes a drawn mark so the receipt prints a signature, not just a name', async () => {
    uploadDocumentSignature.mockResolvedValue({ success: true, filePath: 'signatures/inst-1/1700000000.png' });
    sha256Hex.mockResolvedValue('deadbeef');
    const imageBlob = new Blob(['ink']);

    const id = await signIntakeReceipt(
      'inst-1',
      { method: 'drawn', signerName: 'Dana Depositor', imageBlob },
      'cust-1',
    );

    expect(id).toBe('sig-1');
    expect(sha256Hex).toHaveBeenCalledWith(imageBlob);
    const [uploaded] = uploadDocumentSignature.mock.calls[0] as [File];
    expect(uploaded.type).toBe('image/png');
    expect(rpc).toHaveBeenCalledWith('staff_sign_off_document', {
      p_instance_id: 'inst-1',
      p_slot: 'customer',
      p_method: 'drawn',
      p_signer_name: 'Dana Depositor',
      p_typed_value: undefined,
      p_signer_customer_id: 'cust-1',
      p_image_path: 'signatures/inst-1/1700000000.png',
      p_image_bucket: 'document-signatures',
      p_signature_sha256: 'deadbeef',
      p_user_agent: expectedUserAgent,
    });
  });

  // company-assets is a PUBLIC bucket that legitimately holds branding art. A
  // customer's handwritten signature on a proof-of-receipt must never land there.
  it('never writes a customer signature to the public branding bucket', async () => {
    uploadDocumentSignature.mockResolvedValue({ success: true, filePath: 'signatures/inst-1/1700000000.png' });
    sha256Hex.mockResolvedValue('deadbeef');

    await signIntakeReceipt(
      'inst-1',
      { method: 'drawn', signerName: 'Dana Depositor', imageBlob: new Blob(['ink']) },
      'cust-1',
    );

    expect(uploadSignature).not.toHaveBeenCalled();
    const [, params] = rpc.mock.calls[0] as [string, { p_image_bucket?: string }];
    expect(params.p_image_bucket).not.toBe('company-assets');
  });

  it('names a click-to-accept signer from the captured name and sends no image', async () => {
    await signIntakeReceipt('inst-1', { method: 'click_to_accept', signerName: 'Dana Depositor' }, 'cust-1');

    expect(uploadDocumentSignature).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('staff_sign_off_document', expect.objectContaining({
      p_slot: 'customer',
      p_method: 'click_to_accept',
      p_signer_name: 'Dana Depositor',
      p_image_path: undefined,
      p_signature_sha256: undefined,
    }));
  });

  it('refuses to record a drawn signature whose image failed to upload', async () => {
    uploadDocumentSignature.mockResolvedValue({ success: false, error: 'bucket denied' });

    await expect(
      signIntakeReceipt('inst-1', { method: 'drawn', signerName: 'Dana', imageBlob: new Blob(['ink']) }, 'cust-1'),
    ).rejects.toThrow('bucket denied');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces an RPC failure instead of reporting an unsigned receipt as signed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Only staff may capture a signature' } });

    await expect(
      signIntakeReceipt('inst-1', { method: 'typed', typedValue: 'Dana' }, 'cust-1'),
    ).rejects.toMatchObject({ message: 'Only staff may capture a signature' });
  });

  it('throws when the sign-off returns no signature id', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(
      signIntakeReceipt('inst-1', { method: 'typed', typedValue: 'Dana' }, 'cust-1'),
    ).rejects.toThrow(/signature id/);
  });
});

describe('captureIntakeConsents', () => {
  /** Records every table written and the row it received. */
  let writes: Array<{ table: string; row: Record<string, unknown> }>;

  const baseConsents = {
    tenantId: 't1',
    customerId: 'cust-1',
    caseId: 'case-1',
    phoneE164: '+971500000000',
    whatsappUtility: false,
    destructiveAuthorized: false,
    consentText: 'I agree to receive case updates on WhatsApp.',
  };

  beforeEach(() => {
    writes = [];
    rpc.mockReset();
    from.mockReset();
    rpc.mockResolvedValue({ data: 'coc-1', error: null });
    from.mockImplementation((table: string) => ({
      insert: (row: Record<string, unknown>) => {
        writes.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
    }));
  });

  it('writes nothing and does not throw when the customer declines everything', async () => {
    await expect(captureIntakeConsents(baseConsents)).resolves.toBeUndefined();

    expect(writes).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('appends a utility opt-in and never a marketing scope', async () => {
    await captureIntakeConsents({ ...baseConsents, whatsappUtility: true });

    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe('whatsapp_consents');
    expect(writes[0].row).toEqual({
      tenant_id: 't1',
      customer_id: 'cust-1',
      scope: 'utility',
      action: 'opt_in',
      source: 'intake_form',
      phone_e164: '+971500000000',
      consent_text: baseConsents.consentText,
    });
  });

  it('records destructive-attempt authorization as both an internal note and a custody event', async () => {
    await captureIntakeConsents({ ...baseConsents, destructiveAuthorized: true });

    expect(writes.map((w) => w.table)).toEqual(['case_internal_notes']);
    expect(writes[0].row).toEqual(
      expect.objectContaining({ tenant_id: 't1', case_id: 'case-1' }),
    );
    expect(writes[0].row.content).toEqual(expect.any(String));
    expect(rpc).toHaveBeenCalledWith('log_chain_of_custody', expect.objectContaining({
      p_case_id: 'case-1',
      p_action_category: 'evidence_handling',
      p_action: 'DESTRUCTIVE_ATTEMPT_AUTHORIZED',
    }));
  });

  it('surfaces a consent write failure instead of silently losing the record', async () => {
    from.mockImplementation(() => ({
      insert: () => Promise.resolve({ data: null, error: { message: 'rls denied' } }),
    }));

    await expect(
      captureIntakeConsents({ ...baseConsents, whatsappUtility: true }),
    ).rejects.toMatchObject({ message: 'rls denied' });
  });
});

// A browser reload between the case_devices INSERT and its response used to
// re-arm the duplicate the in-memory guard existed to prevent. Uniqueness has to
// live in the database, so the key is what makes a resubmit return the ORIGINAL
// case rather than append a second set of DEVICE_RECEIVED events.
describe('createCaseWithDevices — intake idempotency', () => {
  const EXISTING = { id: 'case-OLD', case_number: 'CASE-0001' };

  function lookupChain(row: unknown) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      calls.push('cases-lookup');
      return Promise.resolve({ data: row, error: null });
    });
    return chain;
  }

  function deviceListChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => {
      calls.push('devices-list');
      return Promise.resolve({ data: rows, error: null });
    });
    return chain;
  }

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
  });

  it('returns the original case instead of creating a second one when the key was already used', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'cases') return lookupChain(EXISTING);
      if (table === 'case_devices') return deviceListChain([{ id: 'dev-x' }, { id: 'dev-y' }]);
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createCaseWithDevices(baseInput({ idempotencyKey: 'attempt-1' }));

    expect(result).toEqual({
      caseId: 'case-OLD',
      caseNumber: 'CASE-0001',
      deviceIds: ['dev-x', 'dev-y'],
      reused: true,
    });
    // No second case, no second custody hand-over, and no burnt case number.
    expect(calls).not.toContain('cases-insert');
    expect(calls).not.toContain('devices-insert');
    expect(calls).not.toContain('get_next_number');
  });

  it('stamps the key on the case so a later resubmit can find it', async () => {
    let inserted: Record<string, unknown> | null = null;
    const cases: Record<string, unknown> = {};
    cases.select = vi.fn(() => cases);
    cases.eq = vi.fn(() => cases);
    cases.is = vi.fn(() => cases);
    cases.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: inserted ? { id: 'case-1' } : null, error: null }),
    );
    cases.insert = vi.fn((payload: Record<string, unknown>) => {
      inserted = payload;
      calls.push('cases-insert');
      return cases;
    });
    from.mockImplementation((table: string) => {
      if (table === 'master_case_statuses') return mockIntakeStatuses();
      if (table === 'cases') return cases;
      throw new Error(`unexpected table ${table}`);
    });

    await createCaseWithDevices(baseInput({ idempotencyKey: 'attempt-1' }));

    expect(inserted).toMatchObject({ intake_idempotency_key: 'attempt-1' });
  });

  it('recovers the original case when a concurrent submit already won the unique index', async () => {
    let seen = 0;
    from.mockImplementation((table: string) => {
      if (table === 'master_case_statuses') return mockIntakeStatuses();
      if (table === 'case_devices') return deviceListChain([{ id: 'dev-x' }]);
      if (table === 'cases') {
        seen += 1;
        if (seen === 1) return lookupChain(null);
        if (seen === 2) {
          const chain: Record<string, unknown> = {};
          chain.insert = vi.fn(() => {
            calls.push('cases-insert');
            return chain;
          });
          chain.select = vi.fn(() => chain);
          chain.maybeSingle = vi.fn(() =>
            Promise.resolve({
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            }),
          );
          return chain;
        }
        return lookupChain(EXISTING);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createCaseWithDevices(baseInput({ idempotencyKey: 'attempt-1' }));

    expect(result).toMatchObject({ caseId: 'case-OLD', caseNumber: 'CASE-0001', reused: true });
  });

  it('creates normally when no key is supplied, and never looks one up', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'master_case_statuses') return mockIntakeStatuses();
      if (table === 'cases') return mockCasesInsert({ data: { id: 'case-1' }, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createCaseWithDevices(baseInput());

    expect(calls).not.toContain('cases-lookup');
    expect(result).toMatchObject({ caseId: 'case-1', caseNumber: 'CASE-0042' });
  });
});
