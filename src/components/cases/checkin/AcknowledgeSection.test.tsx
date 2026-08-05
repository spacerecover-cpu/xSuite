import type { ReactElement } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { AcknowledgeSection, useIntakeWhatsAppConsentText } from './AcknowledgeSection';

vi.mock('../SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture }: { open: boolean; onCapture: (s: unknown) => void }) =>
    open ? <button onClick={() => onCapture({ method: 'typed', typedValue: 'Dana Reed' })}>capture</button> : null,
}));

vi.mock('../../../lib/companySettingsService', () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({ basic_info: { company_name: 'Nova Data Labs' } })),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection(ui: ReactElement) {
  return render(ui, { wrapper });
}

const base = {
  value: { termsAccepted: false, whatsappUtility: false, destructiveAuthorized: false, signature: null },
  onChange: vi.fn(),
};

const signature = { method: 'typed' as const, typedValue: 'Dana Reed' };

describe('AcknowledgeSection', () => {
  it('blocks signing until the terms checkbox is ticked', () => {
    renderSection(<AcknowledgeSection {...base} />);
    expect(screen.getByRole('button', { name: /capture signature/i })).toBeDisabled();
  });

  it('enables signing once terms are accepted', () => {
    renderSection(<AcknowledgeSection {...base} value={{ ...base.value, termsAccepted: true }} />);
    expect(screen.getByRole('button', { name: /capture signature/i })).toBeEnabled();
  });

  it('records each consent independently', async () => {
    const onChange = vi.fn();
    renderSection(<AcknowledgeSection {...base} onChange={onChange} />);
    await userEvent.click(await screen.findByLabelText(/whatsapp/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappUtility: true, termsAccepted: false }),
    );
  });

  it('records the captured signature without touching the consents', async () => {
    const onChange = vi.fn();
    renderSection(
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

  it('renders the WhatsApp consent label the ledger will store verbatim', async () => {
    renderSection(<AcknowledgeSection {...base} />);
    const { result } = renderHook(() => useIntakeWhatsAppConsentText(), { wrapper });
    await vi.waitFor(() => expect(result.current).toContain('Nova Data Labs'));
    expect(await screen.findByLabelText(result.current)).toBeInTheDocument();
  });

  it('clears a captured signature when the terms are withdrawn', async () => {
    const onChange = vi.fn();
    renderSection(
      <AcknowledgeSection
        {...base}
        value={{ ...base.value, termsAccepted: true, signature }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText(/accept the terms/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ termsAccepted: false, signature: null }),
    );
  });

  it('keeps the signature when an optional consent is withdrawn', async () => {
    const onChange = vi.fn();
    renderSection(
      <AcknowledgeSection
        {...base}
        value={{ ...base.value, termsAccepted: true, destructiveAuthorized: true, signature }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText(/permanently alter the media/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ destructiveAuthorized: false, signature }),
    );
  });
});
