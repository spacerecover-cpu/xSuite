import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DepositorSection } from './DepositorSection';

const base = {
  value: { name: 'Dana Reed', mobile: '', nationalId: '', relationship: 'self' as const },
  customerName: 'Dana Reed',
  onChange: vi.fn(),
};

const courier = {
  name: 'Ali Courier',
  mobile: '+968 9111 1111',
  nationalId: 'ID-42',
  relationship: 'courier' as const,
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
    render(
      <DepositorSection
        {...base}
        value={{ name: 'Dana Reed', mobile: '+968 9000 0000', nationalId: 'STALE-ID', relationship: 'self' }}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/relationship/i), 'courier');
    expect(onChange).toHaveBeenCalledWith({
      relationship: 'courier',
      name: '',
      mobile: '',
      nationalId: '',
    });
  });

  it('clears the courier identity when switching back to self', async () => {
    const onChange = vi.fn();
    render(<DepositorSection {...base} value={courier} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/relationship/i), 'self');
    expect(onChange).toHaveBeenCalledWith({
      relationship: 'self',
      name: 'Dana Reed',
      mobile: '',
      nationalId: '',
    });
  });

  it('keeps the depositor identity when relabelling between non-self relationships', async () => {
    const onChange = vi.fn();
    render(<DepositorSection {...base} value={courier} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/relationship/i), 'authorized_agent');
    expect(onChange).toHaveBeenCalledWith({
      relationship: 'authorized_agent',
      name: 'Ali Courier',
      mobile: '+968 9111 1111',
      nationalId: 'ID-42',
    });
  });
});
