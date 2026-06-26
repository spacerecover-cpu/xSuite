// src/components/cases/device-form/DeviceComponentsForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceComponentsForm } from './DeviceComponentsForm';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

const HDD_ID = 'hdd-type-id';
const OTHER_ID = 'other-type-id';
const options = {
  device_types: [
    { id: HDD_ID, name: '3.5" HDD' },
    { id: OTHER_ID, name: 'DVR/Camera' },
  ] as CatalogOption[],
  brands: [], capacities: [], conditions: [], accessories: [], encryption: [],
  interfaces: [], made_in: [], head_counts: [], platter_counts: [], component_statuses: [],
} as Record<string, CatalogOption[]>;

describe('DeviceComponentsForm', () => {
  it('renders component-status fields for an HDD family', () => {
    render(<DeviceComponentsForm state={{ device_type_id: HDD_ID }} onChange={vi.fn()} options={options} />);
    expect(screen.getByText('Heads')).toBeInTheDocument();
    expect(screen.getByText('PCB')).toBeInTheDocument();
  });

  it('renders an empty-state when the family has no components', () => {
    render(
      <DeviceComponentsForm
        state={{ device_type_id: OTHER_ID }}
        onChange={vi.fn()}
        options={{ ...options, device_types: [{ id: OTHER_ID, name: 'DVR/Camera' }] }}
      />,
    );
    expect(screen.getByText(/no component/i)).toBeInTheDocument();
  });

  it('renders all HDD component fields in the grid', () => {
    render(<DeviceComponentsForm state={{ device_type_id: HDD_ID }} onChange={vi.fn()} options={options} />);
    expect(screen.getByText('Motor')).toBeInTheDocument();
    expect(screen.getByText('Pre-Amp')).toBeInTheDocument();
  });

  it('honors colSpan on component fields (raid member notes spans 2)', () => {
    const RAID_ID = 'raid-type-id';
    const raidOptions = {
      ...options,
      device_types: [{ id: RAID_ID, name: 'RAID Array' }],
    } as Record<string, CatalogOption[]>;
    render(<DeviceComponentsForm state={{ device_type_id: RAID_ID }} onChange={vi.fn()} options={raidOptions} />);
    expect(screen.getByText('Member Drive Notes')).toBeInTheDocument();
  });
});
