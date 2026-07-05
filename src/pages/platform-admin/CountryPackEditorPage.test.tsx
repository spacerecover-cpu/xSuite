import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/countryPackService', () => ({
  getPackDetail: vi.fn().mockResolvedValue({
    country: { id: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT',
      configStatus: 'formatting_ready',
      countryConfig: { 'regime.tax': 'simple_vat', 'custody.unclaimed_property': { holding_period_days: 90 } },
      scalars: { currency_code: 'SAR', decimal_places: 2, timezone: 'Asia/Riyadh' } },
    versions: [{ id: 'v1', version: 1, status: 'draft', authored_by: 'u1', approved_by: null,
      changelog: 'SA launch', next_review_date: '2026-12-29', staleness_days: null,
      content_updated_at: '2026-07-02T10:00:00Z', country_id: 'c-sa' }],
    rates: [{ id: 'r1', component_code: 'VAT', component_label: 'VAT 15%', tax_category: 'standard',
      rate: 15, valid_from: '2020-07-01', valid_to: null, subdivision_id: null,
      component_label_i18n: { ar: 'ضريبة القيمة المضافة' }, sort_order: 3 }],
    requirements: [], regimes: [], numbering: [], tests: [],
  }),
  createPackDraft: vi.fn(), submitPackForReview: vi.fn(), publishPack: vi.fn(),
  upsertTaxRate: vi.fn(), upsertRequirement: vi.fn(), upsertEinvoiceRegime: vi.fn(),
  upsertNumberingPolicy: vi.fn(), upsertPackTest: vi.fn(), updatePackFacts: vi.fn(),
  runPackFixtures: vi.fn(),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u2' } }) }));

import { CountryPackEditorPage } from './CountryPackEditorPage';
import { updatePackFacts, upsertTaxRate } from '../../lib/countryPackService';   // the mocked vi.fn()s

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/platform-admin/countries/c-sa']}>
        <Routes><Route path="/platform-admin/countries/:countryId" element={<CountryPackEditorPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('CountryPackEditorPage (P3)', () => {
  it('shows the rates tab by default with the seeded SA rate', async () => {
    renderPage();
    expect(await screen.findByText('Saudi Arabia')).toBeInTheDocument();
    expect(screen.getByText('VAT 15%')).toBeInTheDocument();
  });
  it('reserved-keys tab shows E8/E9/privacy dimensions read-only, marked Reserved', async () => {
    renderPage();
    await screen.findByText('Saudi Arabia');
    await userEvent.click(screen.getByRole('tab', { name: /reserved/i }));
    expect(screen.getByText('custody.unclaimed_property')).toBeInTheDocument();
    expect(screen.getByText('compliance.audit_file_exports')).toBeInTheDocument();
    expect(screen.getByText('privacy.regime')).toBeInTheDocument();
    expect(screen.getAllByText(/reserved — not consumed yet/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /add row/i })).not.toBeInTheDocument();
  });
  it('Facts tab pre-fills regime/scalars and authors regime + rounding via updatePackFacts', async () => {
    renderPage();
    await screen.findByText('Saudi Arabia');
    await userEvent.click(screen.getByRole('tab', { name: /facts/i }));
    // pre-filled: regime.tax from countryConfig, currency_code from scalars
    expect(screen.getByLabelText('regime.tax', { exact: false })).toHaveValue('simple_vat');
    expect(screen.getByLabelText('currency_code', { exact: false })).toHaveValue('SAR');
    // author SA line-level rounding, then save
    await userEvent.selectOptions(screen.getByLabelText('tax.rounding_policy.level'), 'line');
    await userEvent.click(screen.getByRole('button', { name: /save facts/i }));
    expect(updatePackFacts).toHaveBeenCalledWith(
      'c-sa',
      expect.objectContaining({ currency_code: 'SAR' }),
      expect.objectContaining({
        'regime.tax': 'simple_vat',
        'tax.rounding_policy': { mode: 'half_up', level: 'line' },
      }),
    );
  });
  it('editing a rate round-trips unexposed columns (component_label_i18n, sort_order) — no silent wipe', async () => {
    // The upsert_* RPCs overwrite the whole column set, so an edit that sends only the
    // grid-visible fields would null the Arabic tax-component label + reset sort_order.
    // withCountry must spread the full existing row so untouched columns survive.
    renderPage();
    await screen.findByText('Saudi Arabia');
    await userEvent.click(screen.getByRole('button', { name: /edit r1/i }));
    const rateInput = screen.getByLabelText('Rate %');
    await userEvent.clear(rateInput);
    await userEvent.type(rateInput, '16');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(upsertTaxRate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'r1',
      country_id: 'c-sa',
      component_label_i18n: { ar: 'ضريبة القيمة المضافة' },
      sort_order: 3,
      rate: 16,
    }));
  });
});
