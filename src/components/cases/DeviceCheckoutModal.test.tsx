import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeviceCheckoutModal } from './DeviceCheckoutModal';
import { supabase } from '../../lib/supabaseClient';

// Faithful supabase-js stub: `rpc` reads `this.rest`, so a DETACHED call
// (const rpc = supabase.rpc; rpc()) throws the exact production error
// "Cannot read properties of undefined (reading 'rest')". A method call
// (supabase.rpc(...)) keeps `this` and succeeds. This is what makes the test a
// real regression guard for the binding bug.
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    rest: {},
    rpc: vi.fn(function (this: { rest?: unknown } | undefined) {
      if (!this?.rest) {
        throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      }
      return Promise.resolve({ error: null });
    }),
  },
}));

vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const devices = [
  {
    id: 'dev-1',
    device_type: { name: 'M.2 SSD' },
    brand: { name: 'SanDisk' },
    model: 'FASTPRO',
    serial_number: 'CVVN3QTJ',
  },
];

function renderModal(overrides: Record<string, unknown> = {}) {
  const onCheckoutComplete = vi.fn();
  const onShowCheckoutPreview = vi.fn();
  render(
    <DeviceCheckoutModal
      isOpen
      onClose={vi.fn()}
      caseId="case-1"
      caseNumber="C-0032"
      devices={devices}
      customerName="Acme"
      customerMobileNumber="12345"
      onCheckoutComplete={onCheckoutComplete}
      onShowCheckoutPreview={onShowCheckoutPreview}
      {...overrides}
    />,
  );
  return { onCheckoutComplete, onShowCheckoutPreview };
}

describe('DeviceCheckoutModal', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockClear();
  });

  it('checks out the selected device via log_case_checkout and completes', async () => {
    const { onCheckoutComplete } = renderModal();

    // Select the (prefilled-collector) device and submit.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));

    // The discriminating assertion: completion only happens if the RPC call did
    // NOT throw — i.e. `this` was preserved.
    await waitFor(() => expect(onCheckoutComplete).toHaveBeenCalled());

    expect(supabase.rpc).toHaveBeenCalledWith(
      'log_case_checkout',
      expect.objectContaining({
        p_case_id: 'case-1',
        p_collector_name: 'Acme',
        p_collector_mobile: '12345',
        p_recovery_outcome: 'full',
        p_device_ids: ['dev-1'],
      }),
    );
    expect(screen.queryByText(/Checkout failed/i)).not.toBeInTheDocument();
  });
});
