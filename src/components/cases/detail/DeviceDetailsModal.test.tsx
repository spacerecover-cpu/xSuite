import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CaseDeviceWithEmbeds } from './CaseDevicesTab';

vi.mock('@/lib/deviceIconMapper', () => ({
  getDeviceIconComponent: () =>
    function MockIcon({ className }: { className?: string }) {
      return <svg className={className} data-testid="device-icon" />;
    },
}));

// AuditInfo depends on TenantConfig; stub it so the modal renders without that
// provider — the audit row is verified in its own suite.
vi.mock('../../ui/AuditInfo', () => ({ AuditInfo: () => <div data-testid="audit" /> }));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// The full-row fetch resolves via maybeSingle(); list queries resolve via the
// thenable chain to []. So technical_details flow through while selects stay empty
// (json technical fields render as their raw value).
vi.mock('../../../lib/supabaseClient', () => {
  const fullRow = { id: 'd1', interface_id: null, technical_details: { pre_amp: '454515' } };
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gt', 'is', 'order', 'limit', 'in']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: fullRow, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return chain;
  };
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

import { DeviceDetailsModal } from './DeviceDetailsModal';

function makeDevice(overrides: Partial<CaseDeviceWithEmbeds> = {}): CaseDeviceWithEmbeds {
  return {
    id: 'd1',
    model: 'ST500DM030',
    serial_number: 'WS10SSNM25',
    symptoms: 'Drive Not Spinning',
    notes: null,
    password: 'Space@2026',
    device_type_id: 'dt1',
    capacity_id: 'c1',
    accessories: null,
    device_role_id: 1,
    is_primary: true,
    role_notes: null,
    created_at: '2026-06-21T09:11:41Z',
    created_by: null,
    device_type: { id: 'dt1', name: '3.5" HDD' },
    brand: { name: 'Seagate' },
    capacity: { id: 'c1', name: '500 GB' },
    condition: { name: 'Powers On' },
    encryption_type: null,
    device_role: { id: 1, name: 'patient' },
    created_by_profile: null,
    ...overrides,
  };
}

function renderModal(device: CaseDeviceWithEmbeds | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeviceDetailsModal device={device} deviceIndex={0} caseId="case-1" isOpen={!!device} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('DeviceDetailsModal', () => {
  it('renders the device identity from the embed', () => {
    renderModal(makeDevice());

    expect(screen.getByText(/Device 1:/)).toBeInTheDocument();
    expect(screen.getByText('Serial Number')).toBeInTheDocument();
    expect(screen.getByText('WS10SSNM25')).toBeInTheDocument();
    expect(screen.getByText('500 GB')).toBeInTheDocument();
    expect(screen.getByText('Drive Not Spinning')).toBeInTheDocument();
  });

  it('reveals the device password on toggle', () => {
    renderModal(makeDevice());

    const input = screen.getByLabelText('Device Password') as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /show/i }));
    expect(input.type).toBe('text');
    expect(input.value).toBe('Space@2026');
  });

  it('surfaces technical details from the fetched full row', async () => {
    renderModal(makeDevice());

    await waitFor(() => expect(screen.getByText('Pre-Amplifier')).toBeInTheDocument());
    expect(screen.getByText('454515')).toBeInTheDocument();
  });

  it('hides role actions on the primary device', () => {
    renderModal(makeDevice({ is_primary: true }));

    expect(screen.queryByRole('button', { name: /set as primary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as backup/i })).not.toBeInTheDocument();
  });

  it('offers both role actions on a secondary patient device', () => {
    renderModal(makeDevice({ is_primary: false, device_role: { id: 1, name: 'patient' } }));

    expect(screen.getByRole('button', { name: /set as primary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as backup/i })).toBeInTheDocument();
  });

  it('offers only "Set as Primary" on a backup device (cannot re-backup)', () => {
    renderModal(makeDevice({ is_primary: false, device_role: { id: 2, name: 'backup' } }));

    expect(screen.getByRole('button', { name: /set as primary/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as backup/i })).not.toBeInTheDocument();
  });

  it('renders nothing when no device is provided', () => {
    const { container } = renderModal(null);
    expect(container).toBeEmptyDOMElement();
  });
});
