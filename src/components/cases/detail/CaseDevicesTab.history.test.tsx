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

vi.mock('../ChainOfCustodyTab', () => ({
  ChainOfCustodyTab: ({ deviceId }: { deviceId?: string }) => (
    <div data-testid={`custody-for-${deviceId}`}>custody-for-{deviceId}</div>
  ),
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
      caseId="case-123"
      caseNumber="CASE-0042"
      devices={devices}
      expandedDevices={new Set()}
      showPassword={false}
      onToggleDeviceDetails={noop}
      onSetShowDeviceModal={noop}
      onSetEditingDevice={noop}
      onSetShowPassword={noop}
    />,
  );
}

describe('CaseDevicesTab per-device history disclosure', () => {
  it('renders "View history" button for each device card', () => {
    renderTab([makeDevice('d1', 'Barracuda'), makeDevice('d2', 'IronWolf')]);

    const buttons = screen.getAllByRole('button', { name: /view history/i });
    expect(buttons).toHaveLength(2);
  });

  it('shows the custody panel for a device when "View history" is clicked', () => {
    renderTab([makeDevice('d1', 'Barracuda')]);

    expect(screen.queryByTestId('custody-for-d1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view history/i }));

    expect(screen.getByTestId('custody-for-d1')).toBeInTheDocument();
  });

  it('toggles the button label to "Hide history" when the panel is open', () => {
    renderTab([makeDevice('d1', 'Barracuda')]);

    const btn = screen.getByRole('button', { name: /view history/i });
    fireEvent.click(btn);

    expect(screen.getByRole('button', { name: /hide history/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view history/i })).not.toBeInTheDocument();
  });

  it('collapses the panel when "Hide history" is clicked', () => {
    renderTab([makeDevice('d1', 'Barracuda')]);

    fireEvent.click(screen.getByRole('button', { name: /view history/i }));
    expect(screen.getByTestId('custody-for-d1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hide history/i }));
    expect(screen.queryByTestId('custody-for-d1')).not.toBeInTheDocument();
  });

  it('only opens the clicked device panel when multiple devices exist', () => {
    renderTab([makeDevice('d1', 'Barracuda'), makeDevice('d2', 'IronWolf')]);

    const [btn1] = screen.getAllByRole('button', { name: /view history/i });
    fireEvent.click(btn1);

    expect(screen.getByTestId('custody-for-d1')).toBeInTheDocument();
    expect(screen.queryByTestId('custody-for-d2')).not.toBeInTheDocument();
  });

  it('switches focus to a different device panel and closes the previous one', () => {
    renderTab([makeDevice('d1', 'Barracuda'), makeDevice('d2', 'IronWolf')]);

    const [btn1, btn2] = screen.getAllByRole('button', { name: /view history/i });
    fireEvent.click(btn1);
    expect(screen.getByTestId('custody-for-d1')).toBeInTheDocument();

    fireEvent.click(btn2);
    expect(screen.queryByTestId('custody-for-d1')).not.toBeInTheDocument();
    expect(screen.getByTestId('custody-for-d2')).toBeInTheDocument();
  });
});
