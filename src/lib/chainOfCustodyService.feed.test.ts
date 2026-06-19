import { describe, it, expect, vi, beforeEach } from 'vitest';

const range = vi.fn();
const order = vi.fn(() => ({ range }));
const orFn = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ order, or: orFn }));
vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({ select })) },
}));
vi.mock('./postgrestSanitizer', () => ({ sanitizeFilterValue: (s: string) => s }));
vi.mock('./logger', () => ({ logger: { error: vi.fn() } }));

import { fetchCustodyFeed } from './chainOfCustodyService';

describe('fetchCustodyFeed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps the embedded case_no and returns the count', async () => {
    range.mockResolvedValueOnce({
      data: [{ id: 'c1', case_id: 'k1', device_id: 'd1', action: 'DEVICE_CHECKED_OUT',
               action_category: 'transfer', description: 'released', actor_name: 'Tech A',
               custody_status: 'checked_out', created_at: '2026-06-19T00:00:00Z',
               cases: { case_no: 'C-0032' } }],
      error: null, count: 1,
    });
    const res = await fetchCustodyFeed({ page: 0, pageSize: 50 });
    expect(res.total).toBe(1);
    expect(res.rows[0].case_no).toBe('C-0032');
    expect(res.rows[0].action).toBe('DEVICE_CHECKED_OUT');
  });
});
