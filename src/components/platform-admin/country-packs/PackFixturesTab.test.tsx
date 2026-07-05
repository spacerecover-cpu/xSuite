import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { runPackFixtures } = vi.hoisted(() => ({
  runPackFixtures: vi.fn().mockResolvedValue({
    total: 1, passed: 0,
    results: [{ name: 'sa_standard', pass: false,
      diffs: [{ path: 'totals.taxTotal', expected: 150, actual: 149.99 }], trace: null }],
  }),
}));
vi.mock('../../../lib/countryPackService', () => ({
  runPackFixtures: (...a: unknown[]) => runPackFixtures(...a),
  upsertPackTest: vi.fn(),
}));

import { PackFixturesTab } from './PackFixturesTab';

const detail = {
  country: { id: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT',
    configStatus: 'formatting_ready', countryConfig: {} },
  versions: [], rates: [], requirements: [], regimes: [], numbering: [],
  tests: [{ id: 't1', name: 'sa_standard', input_document: {}, expected: {},
    last_run_at: null, last_result: null, country_id: 'c-sa', pack_version_id: 'v1' }],
} as never;

describe('PackFixturesTab (P3)', () => {
  it('runs fixtures via runPackFixtures and renders per-fixture diffs', async () => {
    render(<PackFixturesTab detail={detail} disabled={false} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /run fixtures/i }));
    await waitFor(() => expect(runPackFixtures).toHaveBeenCalledWith('c-sa', 'SA'));
    expect(await screen.findByText(/0 \/ 1 passed/i)).toBeInTheDocument();
    expect(screen.getByText('totals.taxTotal')).toBeInTheDocument();
  });
});
