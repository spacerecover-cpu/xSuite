import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppConsentBlock, type ConsentDraft } from './WhatsAppConsentBlock';

vi.mock('../../lib/whatsappService', () => ({
  getConsentState: vi.fn(async () => []),
  summarizeConsent: () => ({ utility: false, marketing: false }),
}));

vi.mock('../../lib/companySettingsService', () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({ basic_info: { company_name: 'Acme Lab' } })),
}));

vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantConfig: () => ({ config: { tenantId: 'tenant-1' } }),
}));

function Harness() {
  const [value, setValue] = useState<ConsentDraft>({ utility: false, marketing: false });
  const [noise, setNoise] = useState('');
  return (
    <>
      <input data-testid="noise" value={noise} onChange={(e) => setNoise(e.target.value)} />
      <WhatsAppConsentBlock value={value} onChange={setValue} />
    </>
  );
}

function renderBlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('WhatsAppConsentBlock', () => {
  it('keeps the checkbox DOM node and focus across parent re-renders', async () => {
    const user = userEvent.setup();
    renderBlock();

    const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[];
    const utilityBefore = boxes()[0];

    await user.click(utilityBefore);

    expect(boxes()[0]).toBe(utilityBefore);
    expect(utilityBefore.checked).toBe(true);
    expect(document.activeElement).toBe(utilityBefore);

    // A re-render driven by an unrelated sibling field must not remount either box.
    const marketingBefore = boxes()[1];
    await user.type(screen.getByTestId('noise'), 'abc');
    expect(boxes()[0]).toBe(utilityBefore);
    expect(boxes()[1]).toBe(marketingBefore);
  });
});
