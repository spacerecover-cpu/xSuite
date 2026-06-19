import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));
vi.mock('../../lib/chainOfCustodyService', () => ({ formatActionType: (a: string) => a }));
vi.mock('../../lib/format', () => ({ formatDateTimeWithConfig: (v: string) => v }));
import { ActivityTimeline } from './ActivityTimeline';

describe('ActivityTimeline', () => {
  it('renders one entry per item with the action label, actor, and JSON details unpacked', () => {
    render(<ActivityTimeline entries={[
      { id: 'e1', action: 'checkout', details: '{"collector_name":"MARCELO"}', old_value: null, new_value: null, performed_by: 'u1', created_at: '2026-06-19T00:00:00Z', actor_name: 'Tech A' },
    ]} />);
    expect(screen.getByText(/MARCELO/)).toBeInTheDocument();
    expect(screen.getByText('Tech A', { exact: false })).toBeInTheDocument();
  });
});
