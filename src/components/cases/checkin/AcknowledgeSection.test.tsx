import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AcknowledgeSection } from './AcknowledgeSection';

vi.mock('../SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture }: { open: boolean; onCapture: (s: unknown) => void }) =>
    open ? <button onClick={() => onCapture({ method: 'typed', typedValue: 'Dana Reed' })}>capture</button> : null,
}));

const base = {
  value: { termsAccepted: false, whatsappUtility: false, destructiveAuthorized: false, signature: null },
  onChange: vi.fn(),
};

describe('AcknowledgeSection', () => {
  it('blocks signing until the terms checkbox is ticked', () => {
    render(<AcknowledgeSection {...base} />);
    expect(screen.getByRole('button', { name: /capture signature/i })).toBeDisabled();
  });

  it('enables signing once terms are accepted', () => {
    render(<AcknowledgeSection {...base} value={{ ...base.value, termsAccepted: true }} />);
    expect(screen.getByRole('button', { name: /capture signature/i })).toBeEnabled();
  });

  it('records each consent independently', async () => {
    const onChange = vi.fn();
    render(<AcknowledgeSection {...base} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText(/whatsapp/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappUtility: true, termsAccepted: false }),
    );
  });

  it('records the captured signature without touching the consents', async () => {
    const onChange = vi.fn();
    render(
      <AcknowledgeSection
        {...base}
        value={{ ...base.value, termsAccepted: true }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /capture signature/i }));
    await userEvent.click(screen.getByRole('button', { name: 'capture' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: { method: 'typed', typedValue: 'Dana Reed' },
        termsAccepted: true,
        whatsappUtility: false,
        destructiveAuthorized: false,
      }),
    );
  });
});
