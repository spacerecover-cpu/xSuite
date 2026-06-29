import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before module imports so vi.mock factory is available at parse
// time. We mock supabaseClient (avoids env-key throw) and postgrestSanitizer
// (identity pass-through so assertions match the raw value).
// ---------------------------------------------------------------------------
const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('./supabaseClient', () => ({
  supabase: { from },
  getTenantId: () => 'tenant-abc',
}));

vi.mock('./postgrestSanitizer', () => ({
  sanitizeFilterValue: (v: string) => v,
}));

import { getInventoryItems, getInventoryItemsPage } from './inventoryService';

// ---------------------------------------------------------------------------
// Minimal Thenable query builder that records every chained method call and
// resolves to { data: [], error: null } when awaited.
// ---------------------------------------------------------------------------
function makeQuery() {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};

  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return builder;
    };

  for (const method of [
    'select', 'is', 'eq', 'ilike', 'or', 'order', 'range',
  ]) {
    builder[method] = record(method);
  }

  // Thenable so `await query` works
  builder.then = (resolve: (v: { data: unknown[]; error: null; count: null }) => void) =>
    resolve({ data: [], error: null, count: null });

  return { builder, calls };
}

beforeEach(() => from.mockReset());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyInventoryFilters — spec field filters', () => {
  it('applies barcode ilike when barcode filter is set', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ barcode: 'BC-12345' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const barcodeCall = ilikeCalls.find(([, col]) => col === 'barcode');
    expect(barcodeCall).toBeDefined();
    expect(barcodeCall?.[2]).toBe('%BC-12345%');
  });

  it('applies pcb_number ilike when pcb_number filter is set', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ pcb_number: '2060-800001' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const pcbCall = ilikeCalls.find(([, col]) => col === 'pcb_number');
    expect(pcbCall).toBeDefined();
    expect(pcbCall?.[2]).toBe('%2060-800001%');
  });

  it('applies firmware_version ilike when firmware filter is set', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ firmware: 'CC49' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const fwCall = ilikeCalls.find(([, col]) => col === 'firmware_version');
    expect(fwCall).toBeDefined();
    expect(fwCall?.[2]).toBe('%CC49%');
  });

  it('applies dcm ilike when dcm filter is set', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ dcm: 'HARNXT0' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const dcmCall = ilikeCalls.find(([, col]) => col === 'dcm');
    expect(dcmCall).toBeDefined();
    expect(dcmCall?.[2]).toBe('%HARNXT0%');
  });

  it('applies technical_details->>controller ilike for controller filter', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ controller: 'Marvell' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const ctrlCall = ilikeCalls.find(([, col]) => col === 'technical_details->>controller');
    expect(ctrlCall).toBeDefined();
    expect(ctrlCall?.[2]).toBe('%Marvell%');
  });

  it('applies technical_details->>physical_head_map ilike for head_map filter', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ head_map: '0-3' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const headCall = ilikeCalls.find(([, col]) => col === 'technical_details->>physical_head_map');
    expect(headCall).toBeDefined();
    expect(headCall?.[2]).toBe('%0-3%');
  });

  it('applies technical_details->>chipset ilike for chipset filter', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ chipset: 'Samsung' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const chipCall = ilikeCalls.find(([, col]) => col === 'technical_details->>chipset');
    expect(chipCall).toBeDefined();
    expect(chipCall?.[2]).toBe('%Samsung%');
  });

  it('applies device_type_id eq when device_type_id filter is set', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ device_type_id: 'type-uuid-1' });

    const eqCalls = calls.filter(([m]) => m === 'eq');
    const dtCall = eqCalls.find(([, col]) => col === 'device_type_id');
    expect(dtCall).toBeDefined();
    expect(dtCall?.[2]).toBe('type-uuid-1');
  });

  it('applies serial_number ilike when serial_number filter is set', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ serial_number: 'WD-12345' });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    const snCall = ilikeCalls.find(([, col]) => col === 'serial_number');
    expect(snCall).toBeDefined();
    expect(snCall?.[2]).toBe('%WD-12345%');
  });

  it('includes barcode in the global search .or() clause', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({ search: 'BC-999' });

    const orCalls = calls.filter(([m]) => m === 'or');
    expect(orCalls.length).toBeGreaterThan(0);
    const orString = orCalls[0]?.[1] as string;
    expect(orString).toContain('barcode.ilike.%BC-999%');
  });

  it('does not call ilike or eq for spec fields when filters are empty', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItems({});

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    expect(ilikeCalls.length).toBe(0);
    const eqCalls = calls.filter(([m, col]) => m === 'eq' && col !== 'deleted_at');
    expect(eqCalls.length).toBe(0);
  });
});

describe('getInventoryItemsPage — spec filters propagate', () => {
  it('passes pcb_number and firmware filters through page query', async () => {
    const { builder, calls } = makeQuery();
    from.mockReturnValue(builder);

    await getInventoryItemsPage({ pcb_number: '2060', firmware: 'CC49', page: 0, pageSize: 50 });

    const ilikeCalls = calls.filter(([m]) => m === 'ilike');
    expect(ilikeCalls.find(([, col]) => col === 'pcb_number')).toBeDefined();
    expect(ilikeCalls.find(([, col]) => col === 'firmware_version')).toBeDefined();
  });
});
