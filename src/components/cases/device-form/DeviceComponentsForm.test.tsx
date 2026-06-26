// src/components/cases/device-form/DeviceComponentsForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

// The "Last Updated" footer resolves the author via the client; stub it so the
// form imports without Supabase env and renders without network.
vi.mock('../../../lib/supabaseClient', () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return { supabase: { from: () => builder } };
});
vi.mock('../../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));

import { DeviceComponentsForm } from './DeviceComponentsForm';

const HDD_ID = 'hdd-type-id';
const OTHER_ID = 'other-type-id';
const RAID_ID = 'raid-type-id';

const baseOptions = {
  device_types: [
    { id: HDD_ID, name: '3.5" HDD' },
    { id: OTHER_ID, name: 'DVR/Camera' },
    { id: RAID_ID, name: 'RAID Array' },
  ],
  brands: [], capacities: [], conditions: [], accessories: [], encryption: [],
  interfaces: [], made_in: [], head_counts: [], platter_counts: [],
  component_statuses: [
    { id: 'Good', name: 'Good' }, { id: 'Failed', name: 'Failed' },
    { id: 'Attention', name: 'Attention' }, { id: 'Not Tested', name: 'Not Tested' },
  ],
} as Record<string, CatalogOption[]>;

function renderForm(
  state: Record<string, unknown>,
  options: Record<string, CatalogOption[]> = baseOptions,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DeviceComponentsForm state={state} onChange={vi.fn()} options={options} />
    </QueryClientProvider>,
  );
}

describe('DeviceComponentsForm', () => {
  it('renders the overview, stat cards, and the HDD component list', () => {
    renderForm({ device_type_id: HDD_ID });
    expect(screen.getByText('Component Overview')).toBeInTheDocument();
    expect(screen.getByText('Attention')).toBeInTheDocument(); // a stat card label
    expect(screen.getAllByText('Heads').length).toBeGreaterThan(0);
    expect(screen.getByText('PCB')).toBeInTheDocument();
    expect(screen.getByText('Motor')).toBeInTheDocument();
    expect(screen.getByText('Service Area (SA)')).toBeInTheDocument();
    expect(screen.queryByText('Pre-Amp')).not.toBeInTheDocument();
  });

  it('shows the detail panel for the first component by default', () => {
    renderForm({ device_type_id: HDD_ID });
    expect(screen.getByText('Component Details')).toBeInTheDocument();
    expect(screen.getByText('Read/Write Heads Assembly')).toBeInTheDocument();
  });

  it('renders an empty-state when the family has no components', () => {
    renderForm(
      { device_type_id: OTHER_ID },
      { ...baseOptions, device_types: [{ id: OTHER_ID, name: 'DVR/Camera' }] },
    );
    expect(screen.getByText(/no component/i)).toBeInTheDocument();
  });

  it('renders family-specific extra fields (RAID member drive notes)', () => {
    renderForm({ device_type_id: RAID_ID });
    expect(screen.getByText('Member Drive Notes')).toBeInTheDocument();
  });
});
