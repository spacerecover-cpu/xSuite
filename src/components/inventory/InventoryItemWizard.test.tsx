import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The component pulls in supabaseClient transitively; stub it so importing the
// module for the pure helper under test has no side effects (no real client /
// env access). We only exercise familyFromDeviceType, which is pure.
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) },
  getTenantId: () => 't1',
}));

// Catalog hooks return module-level constants so their identities stay stable
// across renders (a fresh array each render would re-fire the load effect).
const DEVICE_TYPES = [{ id: 'dt-1', name: 'HDD', family: 'hdd' }];
const EMPTY: never[] = [];

vi.mock('../../lib/inventoryService', () => ({
  getInventoryItemById: vi.fn(),
  createInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
}));
vi.mock('../../lib/inventory/inventoryCatalogQueries', () => ({
  useInventoryDeviceTypes: () => ({ data: DEVICE_TYPES, isLoading: false }),
  useInventoryLocations: () => ({ data: EMPTY }),
  useInventorySuppliers: () => ({ data: EMPTY }),
}));
vi.mock('../../lib/devices/deviceCatalogQueries', () => ({
  useDeviceFormCatalogs: () => ({ options: {}, isLoading: false }),
}));
vi.mock('../../lib/inventory/inventorySequenceService', () => ({
  useInventorySequences: () => ({ data: EMPTY }),
}));
vi.mock('../../lib/inventory/deviceTypeSettingsService', () => ({
  useDeviceTypeSettings: () => ({ data: undefined }),
}));
vi.mock('../../lib/inventory/donorPartsService', () => ({
  getItemDonorParts: vi.fn(async () => []),
  setItemDonorParts: vi.fn(async () => {}),
}));
vi.mock('../../lib/labelPrefsService', () => ({
  shouldAutoPrintLabel: vi.fn(async () => false),
}));
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ currencyFormat: { currencyCode: 'AED' } }),
}));
vi.mock('./HierarchicalLocationPicker', () => ({
  HierarchicalLocationPicker: () => <div data-testid="location-picker" />,
}));

import { getInventoryItemById } from '../../lib/inventoryService';
import { familyFromDeviceType, InventoryItemWizard } from './InventoryItemWizard';

describe('familyFromDeviceType', () => {
  // Regression: catalog_device_types.family holds canonical underscore KEYS
  // (migration 20260629215312). These MUST pass through untouched — routing them
  // through the name resolver previously collapsed exactly these two to 'other',
  // selecting the wrong technical fields and wiping donor parts on edit/save.
  it('returns the canonical family KEY directly (head_stack)', () => {
    expect(familyFromDeviceType({ family: 'head_stack', name: 'Head Stack' })).toBe('head_stack');
  });

  it('returns the canonical family KEY directly (memory_card)', () => {
    expect(familyFromDeviceType({ family: 'memory_card', name: 'SD Card' })).toBe('memory_card');
  });

  it.each(['hdd', 'ssd', 'nvme', 'usb_flash', 'mobile', 'raid', 'nas', 'pcb', 'other'])(
    'preserves other canonical family key %s',
    (key) => {
      expect(familyFromDeviceType({ family: key, name: 'irrelevant' })).toBe(key);
    },
  );

  it('is tolerant of casing/whitespace on the family key', () => {
    expect(familyFromDeviceType({ family: '  Head_Stack ', name: 'Head Stack' })).toBe('head_stack');
  });

  it('falls back to name-based resolution when family is null/empty', () => {
    expect(familyFromDeviceType({ family: null, name: 'Head Stack' })).toBe('head_stack');
    expect(familyFromDeviceType({ family: '', name: 'SD Card' })).toBe('memory_card');
    expect(familyFromDeviceType({ family: null, name: '3.5" HDD' })).toBe('hdd');
  });

  it('defensively resolves a legacy display-name family through the name resolver', () => {
    expect(familyFromDeviceType({ family: 'Head Stack', name: 'ignored' })).toBe('head_stack');
  });

  it('returns other for an unknown, unresolvable device type', () => {
    expect(familyFromDeviceType({ family: null, name: 'Smart Fridge' })).toBe('other');
    expect(familyFromDeviceType(undefined)).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// Edit-mode load races
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

function itemRow(id: string, legacyRef: string) {
  return {
    id,
    item_number: `INV-${id}`,
    item_number_device_type_id: 'dt-1',
    device_type_id: 'dt-1',
    category_id: null,
    brand_id: null,
    model: `model-${id}`,
    serial_number: null,
    capacity_id: null,
    interface_id: null,
    condition_id: null,
    legacy_case_ref: legacyRef,
    status_id: null,
    quantity: 1,
    min_quantity: 0,
    purchase_price: null,
    purchase_date: null,
    supplier_id: null,
    is_donor: false,
    notes: null,
    location_id: null,
    technical_details: null,
  };
}

const LEGACY_REF_PLACEHOLDER = 'e.g. old ERP case ref';

function renderWizard(itemId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (id: string | null) => (
    <QueryClientProvider client={client}>
      <InventoryItemWizard isOpen onClose={() => {}} onSuccess={() => {}} itemId={id} />
    </QueryClientProvider>
  );
  const utils = render(ui(itemId));
  return { ...utils, setItemId: (id: string | null) => utils.rerender(ui(id)) };
}

/** Run `fn`, then drain pending microtasks/timers so any resulting state write is applied. */
async function flush(fn: () => void) {
  await act(async () => {
    fn();
    await new Promise(r => setTimeout(r, 0));
  });
}

function legacyRefInput() {
  return screen.getByPlaceholderText(LEGACY_REF_PLACEHOLDER) as HTMLInputElement;
}

describe('InventoryItemWizard — edit-mode load race', () => {
  const mockGet = vi.mocked(getInventoryItemById);

  beforeEach(() => {
    mockGet.mockReset();
  });

  // Regression: a superseded item load used to apply unconditionally, so the
  // slower response won the form and the user edited the wrong record.
  it('ignores a stale item response after switching to another item', async () => {
    const slowA = deferred<unknown>();
    mockGet.mockImplementation((async (id: string) =>
      (id === 'A' ? slowA.promise : itemRow('B', 'B-ref'))) as never);

    const { setItemId } = renderWizard('A');
    setItemId('B');
    await waitFor(() => expect(legacyRefInput().value).toBe('B-ref'));

    // Let A's now-superseded response settle completely before asserting —
    // waitFor would pass on its first tick, before the stale write lands.
    await flush(() => slowA.resolve(itemRow('A', 'A-ref')));
    expect(legacyRefInput().value).toBe('B-ref');
  });

  it('ignores a stale item response after switching to Add (blank form)', async () => {
    const slowA = deferred<unknown>();
    mockGet.mockImplementation((async () => slowA.promise) as never);

    const { setItemId } = renderWizard('A');
    setItemId(null);
    await waitFor(() => expect(legacyRefInput().value).toBe(''));

    await flush(() => slowA.resolve(itemRow('A', 'A-ref')));
    expect(legacyRefInput().value).toBe('');
  });
});
