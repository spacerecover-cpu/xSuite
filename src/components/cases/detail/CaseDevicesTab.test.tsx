import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/deviceIconMapper', () => ({
  getDeviceIconComponent: () =>
    function MockIcon({ className }: { className?: string }) {
      return <svg className={className} data-testid="device-icon" />;
    },
}));

vi.mock('@/lib/format', () => ({
  formatDateTime: (v: string) => v,
}));

// The details modal carries its own data/provider dependencies; stub it so this
// suite stays focused on the card behaviour (which control opens it).
vi.mock('./DeviceDetailsModal', () => ({
  DeviceDetailsModal: ({ device, isOpen }: { device: { id: string } | null; isOpen: boolean }) =>
    isOpen && device ? <div data-testid={`details-for-${device.id}`}>details-for-{device.id}</div> : null,
}));

import { CaseDevicesTab, CaseDeviceWithEmbeds } from './CaseDevicesTab';

const noop = () => {};

function makeDevice(id: string, model: string): CaseDeviceWithEmbeds {
  return {
    id,
    model,
    serial_number: `SN-${id}`,
    symptoms: null,
    notes: null,
    password: null,
    device_type_id: null,
    capacity_id: null,
    accessories: null,
    device_role_id: null,
    is_primary: false,
    role_notes: null,
    created_at: '2026-06-19T10:00:00Z',
    created_by: null,
    device_type: { id: 'dt1', name: 'HDD' },
    brand: { name: 'Seagate' },
    capacity: null,
    condition: null,
    encryption_type: null,
    device_role: { id: 1, name: 'patient' },
    created_by_profile: null,
  };
}

function renderTab(devices: CaseDeviceWithEmbeds[]) {
  return render(
    <CaseDevicesTab
      caseData={{}}
      caseId="case-1"
      devices={devices}
      onSetShowDeviceModal={noop}
      onSetEditingDevice={noop}
    />,
  );
}

describe('CaseDevicesTab device cards', () => {
  it('no longer renders a per-card "View history" control', () => {
    renderTab([makeDevice('d1', 'Barracuda'), makeDevice('d2', 'IronWolf')]);

    expect(screen.queryByRole('button', { name: /history/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/view history/i)).not.toBeInTheDocument();
  });

  it('renders a "View details" button on each device card', () => {
    renderTab([makeDevice('d1', 'Barracuda'), makeDevice('d2', 'IronWolf')]);

    expect(screen.getAllByRole('button', { name: /view device details/i })).toHaveLength(2);
  });

  it('opens the details modal for the clicked device', () => {
    renderTab([makeDevice('d1', 'Barracuda')]);

    expect(screen.queryByTestId('details-for-d1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view device details/i }));

    expect(screen.getByTestId('details-for-d1')).toBeInTheDocument();
  });

  it('opens details for the correct device when multiple exist', () => {
    renderTab([makeDevice('d1', 'Barracuda'), makeDevice('d2', 'IronWolf')]);

    const buttons = screen.getAllByRole('button', { name: /view device details/i });
    fireEvent.click(buttons[1]);

    expect(screen.getByTestId('details-for-d2')).toBeInTheDocument();
    expect(screen.queryByTestId('details-for-d1')).not.toBeInTheDocument();
  });
});
