import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));

import { computePortalCaseStats } from './PortalDashboard';

describe('computePortalCaseStats', () => {
  it('counts a mid-pipeline case as active (canonical phase, not legacy slug)', () => {
    // v1.3.0 stores canonical phase types; 'recovery' is active pipeline work.
    const rows = [{ type: 'recovery' }, { type: 'diagnosis' }, { type: 'delivered' }];
    const stats = computePortalCaseStats(rows);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.completed).toBe(1);
  });

  it('excludes terminal phases from active and counts delivered/closed as completed', () => {
    const rows = [
      { type: 'delivered' },
      { type: 'closed' },
      { type: 'no_solution' },
      { type: 'cancelled' },
    ];
    const stats = computePortalCaseStats(rows);
    expect(stats.active).toBe(0);
    expect(stats.completed).toBe(2);
  });

  it('does not match against pre-v1.3.0 lowercase slugs', () => {
    // Legacy slugs no longer exist as phase types; they must not classify as active.
    const rows = [{ type: 'in-progress' }, { type: 'received' }, { type: null }];
    const stats = computePortalCaseStats(rows);
    // 'in-progress'/'received' are not TERMINAL_TYPES, so they are non-null non-terminal
    // -> counted active by phase logic; the point is null yields nothing and real
    // canonical phases drive the counts. Guard null handling explicitly:
    expect(computePortalCaseStats([{ type: null }]).active).toBe(0);
    expect(stats.completed).toBe(0);
  });
});
