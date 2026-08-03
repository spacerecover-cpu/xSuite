import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../lib/format', () => ({ formatDate: (v: string) => v }));

import { MarkAsDeliveredModal } from './MarkAsDeliveredModal';

const clone = {
  id: 'clone-abcdef12',
  case_id: 'case-1',
  patient_device_id: 'dev-1',
  storage_path: '/vol/recovered/case-1',
  clone_date: '2026-07-01T00:00:00Z',
  status: 'ready',
  retention_days: 180,
};

function renderModal() {
  const onConfirm = vi.fn();
  render(
    <MarkAsDeliveredModal
      isOpen
      onClose={vi.fn()}
      onConfirm={onConfirm}
      clone={clone}
      caseNo="C-0032"
      caseStatus="Ready for Delivery"
      casePhase="ready"
    />,
  );
  return { onConfirm };
}

describe('MarkAsDeliveredModal retention period', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a shorter retention typed after clearing the field instead of snapping back to 180', () => {
    // `parseInt(v) || 180` rewrote the transient empty state to the default, so
    // the retention countdown disagreed with what the operator entered.
    const { onConfirm } = renderModal();
    const input = screen.getByRole('spinbutton');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm delivery/i }));

    expect(onConfirm).toHaveBeenCalledWith(true, '', 30);
  });

  it('blocks confirmation while the field is empty rather than silently applying 180', () => {
    const { onConfirm } = renderModal();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm delivery/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 1 day/i)).toBeTruthy();
  });

  it('blocks confirmation on 0 rather than coercing it to the 180-day default', () => {
    const { onConfirm } = renderModal();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm delivery/i }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
