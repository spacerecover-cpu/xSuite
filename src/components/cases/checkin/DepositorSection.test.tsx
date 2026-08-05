import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DepositorSection } from './DepositorSection';

const base = {
  value: { name: 'Dana Reed', mobile: '', nationalId: '', relationship: 'self' as const },
  customerName: 'Dana Reed',
  onChange: vi.fn(),
};

describe('DepositorSection', () => {
  it('hides the National ID field when the customer collects for themselves', () => {
    render(<DepositorSection {...base} />);
    expect(screen.queryByLabelText(/national id/i)).not.toBeInTheDocument();
  });

  it('requires National ID once the relationship is not self', () => {
    const onChange = vi.fn();
    render(<DepositorSection {...base} value={{ ...base.value, relationship: 'courier' }} onChange={onChange} />);
    const idField = screen.getByLabelText(/national id/i);
    expect(idField).toBeRequired();
  });

  it('clears the customer prefill when switching off self', async () => {
    const onChange = vi.fn();
    render(<DepositorSection {...base} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/relationship/i), 'courier');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ relationship: 'courier', name: '', nationalId: '' }),
    );
  });
});
