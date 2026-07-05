import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/countryPackService', () => ({
  listPackCountries: vi.fn().mockResolvedValue([
    { countryId: 'c-om', code: 'OM', name: 'Oman', taxSystem: 'VAT', configStatus: 'statutory_ready',
      publishedVersion: 1, openVersion: null, stalenessDays: 0, nextReviewDate: '2026-12-01' },
    { countryId: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT', configStatus: 'formatting_ready',
      publishedVersion: null, openVersion: null, stalenessDays: 12, nextReviewDate: '2026-06-20' },
  ]),
}));
vi.mock('../../lib/tax/capabilityManifest', () => ({ syncEngineCapabilities: vi.fn().mockResolvedValue(6) }));

import { CountryPacksPage } from './CountryPacksPage';

describe('CountryPacksPage (P3)', () => {
  it('lists countries with config status and flags overdue packs in the staleness strip', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><CountryPacksPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Oman')).toBeInTheDocument();
    expect(screen.getByText('statutory_ready')).toBeInTheDocument();
    expect(screen.getByText(/overdue for review/i)).toBeInTheDocument();   // SA at 12 days
    expect(screen.getByRole('button', { name: /sync capabilities/i })).toBeInTheDocument();
  });
});
