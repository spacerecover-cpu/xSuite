// src/components/cases/device-form/DeviceHistoryForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const fetchDeviceActivity = vi.fn();
vi.mock('../../../lib/devices/deviceActivityService', () => ({
  fetchDeviceActivity: (...args: unknown[]) => fetchDeviceActivity(...args),
}));
vi.mock('../../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));
// Author lookup reads the client directly; stub it to resolve empty.
vi.mock('../../../lib/supabaseClient', () => {
  const builder = { select: () => builder, in: () => Promise.resolve({ data: [], error: null }) };
  return { supabase: { from: () => builder } };
});

import { DeviceHistoryForm } from './DeviceHistoryForm';

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DeviceHistoryForm caseId="case-1" deviceId="dev-1" />
    </QueryClientProvider>,
  );
}

describe('DeviceHistoryForm', () => {
  it('renders timeline events and a detail panel', async () => {
    fetchDeviceActivity.mockResolvedValue([
      { id: 'a1', activity_type: 'component_status_updated', title: 'Component Status Updated',
        description: 'PCB marked as Failed', status: 'Failed', component_key: 'pcb',
        old_value: 'Good', new_value: 'Failed', metadata: {}, created_by: null,
        created_at: '2026-06-27T10:00:00Z' },
      { id: 'a2', activity_type: 'device_received', title: 'Device Received',
        description: 'Device received and logged in.', status: null, component_key: null,
        old_value: null, new_value: null, metadata: {}, created_by: null,
        created_at: '2026-06-26T09:00:00Z' },
    ]);
    renderForm();
    // Wait for the activity query to resolve (a row title appears).
    expect(await screen.findByText('Device Received')).toBeInTheDocument();
    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText('Activity Details')).toBeInTheDocument();
    expect(screen.getAllByText('Component Status Updated').length).toBeGreaterThan(0);
    // The first event is auto-selected → its detail (the changed-from value) shows.
    expect(screen.getByText(/Good → Failed/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no activity', async () => {
    fetchDeviceActivity.mockResolvedValue([]);
    renderForm();
    expect(await screen.findByText(/No activity recorded/i)).toBeInTheDocument();
  });
});
