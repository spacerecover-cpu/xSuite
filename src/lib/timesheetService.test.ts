import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression lock: approve/reject must NOT clobber the employee's own note.
// timesheets has a single shared `notes` column and no review-notes column, so
// a blank reviewer note must leave the employee note intact, and a typed
// reviewer note must be appended, never overwrite it.

const captured: { update?: Record<string, unknown> } = {};
const state: { existingNotes: string | null } = { existingNotes: null };

vi.mock('./supabaseClient', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    let isSelectOnly = false;
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      captured.update = payload;
      return chain;
    });
    chain.select = vi.fn((cols?: string) => {
      if (cols === 'notes') isSelectOnly = true;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      if (isSelectOnly) {
        return Promise.resolve({ data: { notes: state.existingNotes }, error: null });
      }
      return Promise.resolve({ data: { id: 'ts-1' }, error: null });
    });
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
    },
  };
});

import { timesheetService } from './timesheetService';

describe('timesheetService — approve/reject preserve the employee note', () => {
  beforeEach(() => {
    captured.update = undefined;
    state.existingNotes = null;
  });

  it('does not overwrite the employee note when the reviewer leaves notes blank', async () => {
    state.existingNotes = 'Overtime due to 12-drive RAID rebuild';
    await timesheetService.approveTimesheet('ts-1', 'mgr-1');
    expect(captured.update?.status).toBe('approved');
    expect(captured.update).not.toHaveProperty('notes');
  });

  it('appends the reviewer note instead of replacing the employee note', async () => {
    state.existingNotes = 'Overtime due to 12-drive RAID rebuild';
    await timesheetService.rejectTimesheet('ts-1', 'mgr-1', 'Please split billable vs non-billable');
    expect(captured.update?.status).toBe('rejected');
    expect(captured.update?.notes).toBe(
      'Overtime due to 12-drive RAID rebuild\n\n[Rejected] Please split billable vs non-billable',
    );
  });

  it('writes only the labeled reviewer note when the employee left no note', async () => {
    state.existingNotes = null;
    await timesheetService.approveTimesheet('ts-1', 'mgr-1', 'Looks good');
    expect(captured.update?.notes).toBe('[Approved] Looks good');
  });
});
