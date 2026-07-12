import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } },
}));

vi.mock('../../lib/chainOfCustodyService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/chainOfCustodyService')>()),
  getChainOfCustody: vi.fn(async () => [
    {
      id: 'e1',
      case_id: 'k1',
      entry_number: 1,
      action_category: 'creation',
      action_type: 'DEVICE_RECEIVED',
      action_description: 'Device Alpha received at intake',
      actor_name: 'Tech One',
      device_id: 'd1',
      occurred_at: '2026-06-19T10:00:00Z',
      created_at: '2026-06-19T10:00:00Z',
    },
    {
      id: 'e2',
      case_id: 'k1',
      entry_number: 2,
      action_category: 'transfer',
      action_type: 'CUSTODY_TRANSFER',
      action_description: 'Device Beta transferred to cleanroom',
      actor_name: 'Tech Two',
      device_id: 'd2',
      occurred_at: '2026-06-19T11:00:00Z',
      created_at: '2026-06-19T11:00:00Z',
    },
  ]),
  getCustodyTransfers: vi.fn(async () => []),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { full_name: 'Test User', role: 'viewer' }, user: { id: 'u1' } }),
}));

vi.mock('../../contexts/TenantConfigContext', () => ({
  useDateTimeConfig: () => ({}),
}));

vi.mock('../../lib/format', () => ({
  formatDateTime: (v: string) => v,
}));

vi.mock('./CustodyTransferModal', () => ({
  CustodyTransferModal: () => null,
}));

vi.mock('./IntegrityCheckModal', () => ({
  IntegrityCheckModal: () => null,
}));

import { ChainOfCustodyTab, isTerminalCase } from './ChainOfCustodyTab';

describe('ChainOfCustodyTab terminal-case transfer guard', () => {
  it('treats terminal lifecycle phase types as terminal', () => {
    expect(isTerminalCase('delivered')).toBe(true);
    expect(isTerminalCase('closed')).toBe(true);
    expect(isTerminalCase('no_solution')).toBe(true);
    expect(isTerminalCase('cancelled')).toBe(true);
  });

  it('treats active lifecycle phase types as non-terminal', () => {
    expect(isTerminalCase('intake')).toBe(false);
    expect(isTerminalCase('recovery')).toBe(false);
    expect(isTerminalCase('qa')).toBe(false);
    expect(isTerminalCase('ready')).toBe(false);
  });

  // Regression for bug #4: transition_case_status writes status = the human
  // status NAME, never the phase token. The old guard compared the NAME against
  // {'delivered','cancelled'} and so never matched a terminal case — the
  // Transfer Custody button stayed enabled on delivered/closed/cancelled cases.
  it('recognizes the canonical terminal status NAMES when no phase is supplied', () => {
    expect(isTerminalCase(null, 'Data Delivered')).toBe(true);
    expect(isTerminalCase(null, 'Cancelled — Customer Declined')).toBe(true);
    expect(isTerminalCase(null, 'Cancelled — Unrecoverable')).toBe(true);
    expect(isTerminalCase(null, 'Closed — Device Returned')).toBe(true);
    expect(isTerminalCase(null, 'Closed — Media Disposed')).toBe(true);
    expect(isTerminalCase(null, 'No Solution — Future Follow-up')).toBe(true);
  });

  it('does not flag active status names or missing input as terminal', () => {
    expect(isTerminalCase(null, 'In Recovery')).toBe(false);
    expect(isTerminalCase(null, 'Awaiting Approval')).toBe(false);
    expect(isTerminalCase(null, null)).toBe(false);
    expect(isTerminalCase(null, undefined)).toBe(false);
    expect(isTerminalCase(undefined, undefined)).toBe(false);
  });

  it('lets the authoritative phase win over the free-text status name', () => {
    // Phase says active even though a stale/odd name looks delivered.
    expect(isTerminalCase('recovery', 'Data Delivered')).toBe(false);
    // Phase says terminal regardless of the name.
    expect(isTerminalCase('delivered', 'In Recovery')).toBe(true);
  });
});

describe('ChainOfCustodyTab per-device filter', () => {
  function makeClient() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }

  it('shows only device d1 events when deviceId="d1" is passed', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <ChainOfCustodyTab
          caseId="k1"
          caseNumber="CASE-0001"
          deviceId="d1"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Device Alpha received at intake')).toBeInTheDocument();
    });

    expect(screen.queryByText('Device Beta transferred to cleanroom')).not.toBeInTheDocument();
  });

  it('shows all events when deviceId is not passed', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <ChainOfCustodyTab
          caseId="k1"
          caseNumber="CASE-0001"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Device Alpha received at intake')).toBeInTheDocument();
    });

    expect(screen.getByText('Device Beta transferred to cleanroom')).toBeInTheDocument();
  });
});
