import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));

import { computeTotalSpent } from './PortalPurchasesPage';

describe('computeTotalSpent', () => {
  it('sums only fully-paid sales, excluding pending (invoiced-unpaid) rows', () => {
    // record_stock_sale stamps 'pending' for added_to_invoice (unpaid); it must not
    // inflate "Total Spent".
    const rows = [
      { status: 'paid', total_amount: 500 },
      { status: 'pending', total_amount: 300 },
    ];
    expect(computeTotalSpent(rows)).toBe(500);
  });

  it('excludes refunded and cancelled sales', () => {
    const rows = [
      { status: 'paid', total_amount: 200 },
      { status: 'refunded', total_amount: 150 },
      { status: 'cancelled', total_amount: 100 },
      { status: 'partial', total_amount: 80 },
    ];
    expect(computeTotalSpent(rows)).toBe(200);
  });

  it('prefers total_amount_base when present (baseAmount contract)', () => {
    const rows = [{ status: 'paid', total_amount: 500, total_amount_base: 450 }];
    expect(computeTotalSpent(rows)).toBe(450);
  });

  it('returns 0 for an empty list', () => {
    expect(computeTotalSpent([])).toBe(0);
  });
});
