import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { publishPack, authUser } = vi.hoisted(() => ({
  publishPack: vi.fn(),
  authUser: { id: 'author-1' } as { id: string },
}));

vi.mock('../../../lib/countryPackService', () => ({
  createPackDraft: vi.fn(),
  submitPackForReview: vi.fn(),
  publishPack,
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }));

import { PackPublishPanel } from './PackPublishPanel';

const detailWith = (authoredBy: string) => ({
  country: { id: 'c-sa', code: 'SA', name: 'Saudi Arabia', taxSystem: 'VAT',
    configStatus: 'formatting_ready', countryConfig: {} },
  versions: [{ id: 'v1', country_id: 'c-sa', version: 2, status: 'in_review',
    authored_by: authoredBy, approved_by: null, changelog: 'SA pack',
    next_review_date: null, staleness_days: null, content_updated_at: null }],
  rates: [], requirements: [], regimes: [], numbering: [], tests: [],
}) as never;

describe('PackPublishPanel dual control (P3)', () => {
  it('disables publish for the pack author with an explanation', () => {
    render(<PackPublishPanel detail={detailWith('author-1')} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /publish v2/i })).toBeDisabled();
    expect(screen.getByText(/dual control/i)).toBeInTheDocument();
  });
  it('enables publish for a different admin', () => {
    render(<PackPublishPanel detail={detailWith('someone-else')} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /publish v2/i })).toBeEnabled();
  });
});
