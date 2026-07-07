import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeviceCheckoutModal } from './DeviceCheckoutModal';
import { supabase } from '../../lib/supabaseClient';
import {
  getCheckoutBatchId,
  issueDeliveryChallan,
} from '../../lib/deliveryChallanService';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ error: null })) },
}));
vi.mock('../../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../../lib/deliveryChallanService', () => ({
  fetchDeviceRolePartition: vi.fn(() =>
    Promise.resolve({
      customerOwned: [{ id: 'dev-1', roleName: 'Patient' }],
      labSupplied: [{ id: 'dev-2', roleName: 'Clone' }],
    }),
  ),
  getCheckoutBatchId: vi.fn(() => Promise.resolve('batch-1')),
  issueDeliveryChallan: vi.fn(() =>
    Promise.resolve({
      caseId: 'case-1', batchId: 'batch-1', challanNo: 'DC/25-26/0007',
      issuedAt: '2026-07-05T10:00:00.000Z',
      lines: [{ deviceId: 'dev-1', declaredValue: 60000 }], totalDeclaredValue: 60000,
    }),
  ),
}));

const devices = [
  { id: 'dev-1', device_type: { name: 'HDD' }, brand: { name: 'Seagate' }, model: 'ST4000', serial_number: 'SER-1' },
  { id: 'dev-2', device_type: { name: 'HDD' }, brand: { name: 'WD' }, model: 'Clone', serial_number: 'CLONE-1' },
];

function renderModal(challanEnabled: boolean) {
  render(
    <DeviceCheckoutModal
      isOpen
      onClose={vi.fn()}
      caseId="case-1"
      caseNumber="CASE-0042"
      devices={devices}
      customerName="Acme"
      customerMobileNumber="12345"
      onCheckoutComplete={vi.fn()}
      onShowCheckoutPreview={vi.fn()}
      challanEnabled={challanEnabled}
    />,
  );
}

function selectDevice(serial: string) {
  fireEvent.click(screen.getByText(new RegExp(serial)).closest('label')!.querySelector('input')!);
}

describe('DeviceCheckoutModal — Rule 55 challan integration', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockClear();
    vi.mocked(issueDeliveryChallan).mockClear();
    vi.mocked(getCheckoutBatchId).mockClear();
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('shows no challan section when the regime does not require one', async () => {
    renderModal(false);
    selectDevice('SER-1');
    expect(screen.queryByText(/Delivery Challan/i)).toBeNull();
  });

  it('requires a declared value per selected customer-owned device before checkout', async () => {
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));
    expect(await screen.findByText(/declared value/i)).toBeTruthy();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('checks out, issues ONE challan for the batch, and opens the challan print route', async () => {
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));

    await waitFor(() => expect(issueDeliveryChallan).toHaveBeenCalledTimes(1));
    expect(supabase.rpc).toHaveBeenCalledWith('log_case_checkout', expect.objectContaining({ p_device_ids: ['dev-1'] }));
    expect(getCheckoutBatchId).toHaveBeenCalledWith('dev-1');
    expect(issueDeliveryChallan).toHaveBeenCalledWith({
      caseId: 'case-1',
      batchId: 'batch-1',
      lines: [{ deviceId: 'dev-1', declaredValue: 60000 }],
    });
    expect(window.open).toHaveBeenCalledWith('/print/delivery-challan/case-1/batch-1', '_blank');
  });

  it('excludes a lab-supplied clone from challan lines and shows the goods-invoice guidance', async () => {
    renderModal(true);
    selectDevice('SER-1');
    selectDevice('CLONE-1');
    await screen.findByText(/supply of goods/i); // LAB_SUPPLIED_GOODS_GUIDANCE
    // Only the customer-owned device gets a declared-value input.
    expect(screen.getAllByPlaceholderText(/Declared value/i)).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));
    await waitFor(() => expect(issueDeliveryChallan).toHaveBeenCalled());
    expect(issueDeliveryChallan).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ deviceId: 'dev-1', declaredValue: 20000 }] }),
    );
  });

  it('shows the manual e-way guidance when declared total reaches ₹50,000', async () => {
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '50000' } });
    expect(await screen.findByText(/e-way bill/i)).toBeTruthy();
  });

  it('challan failure keeps the modal open for an issuance-only retry — checkout is never re-run', async () => {
    vi.mocked(issueDeliveryChallan)
      .mockRejectedValueOnce(new Error('numbering unavailable'))
      .mockResolvedValueOnce({
        caseId: 'case-1', batchId: 'batch-1', challanNo: 'DC/25-26/0007',
        issuedAt: '2026-07-05T10:00:00.000Z',
        lines: [{ deviceId: 'dev-1', declaredValue: 60000 }], totalDeclaredValue: 60000,
      });
    renderModal(true);
    selectDevice('SER-1');
    await screen.findByText(/Delivery Challan \(Rule 55\)/i);
    fireEvent.change(screen.getByPlaceholderText(/Declared value/i), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: /Print Checkout Form/i }));

    expect(await screen.findByText(/challan could not be issued/i)).toBeTruthy();
    const checkoutCalls = vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'log_case_checkout').length;

    fireEvent.click(screen.getByRole('button', { name: /Retry Delivery Challan/i }));
    await waitFor(() => expect(issueDeliveryChallan).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'log_case_checkout').length,
    ).toBe(checkoutCalls); // custody-stamped checkout ran exactly once
  });
});
