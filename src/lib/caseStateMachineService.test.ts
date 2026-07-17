import { describe, it, expect, vi } from 'vitest';

// caseStateMachineService imports supabaseClient at module load (which throws
// when env vars are absent, as in the test runner); mock it out — these tests
// only exercise the pure suggestNextAction helper.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { suggestNextAction, type AllowedTransition, type CasePhase } from './caseStateMachineService';

function edge(toPhase: CasePhase, opts: Partial<AllowedTransition> = {}): AllowedTransition {
  return {
    to_status: { type: toPhase } as AllowedTransition['to_status'],
    to_phase: toPhase,
    requires: [],
    description: null,
    is_reopen: false,
    ...opts,
  };
}

describe('suggestNextAction', () => {
  it('picks the forward edge for awaiting_approval even when the backward edge sorts first', () => {
    // getAllowedTransitions orders by destination sort_order, so quoting (40)
    // precedes approved (60) in the array — the primary CTA must still advance.
    const allowed = [edge('quoting'), edge('approved')];
    const next = suggestNextAction('awaiting_approval', 'manager', allowed);
    expect(next?.to_phase).toBe('approved');
  });

  it('picks the forward edge for qa even when recovery sorts first', () => {
    const allowed = [edge('recovery'), edge('ready')];
    const next = suggestNextAction('qa', 'manager', allowed);
    expect(next?.to_phase).toBe('ready');
  });

  it('prefers the nearest forward phase (recovery -> qa over ready)', () => {
    const allowed = [edge('qa'), edge('ready')];
    const next = suggestNextAction('recovery', 'manager', allowed);
    expect(next?.to_phase).toBe('qa');
  });

  it('skips cancelled and reopen edges', () => {
    const allowed = [
      edge('cancelled'),
      edge('diagnosis', { is_reopen: true }),
      edge('approved'),
    ];
    const next = suggestNextAction('awaiting_approval', 'manager', allowed);
    expect(next?.to_phase).toBe('approved');
  });

  it('returns null when no forward edge exists', () => {
    const allowed = [edge('cancelled'), edge('quoting', { is_reopen: true })];
    const next = suggestNextAction('awaiting_approval', 'manager', allowed);
    expect(next).toBeNull();
  });

  it('returns null without a phase or role', () => {
    expect(suggestNextAction(null, 'manager', [edge('approved')])).toBeNull();
    expect(suggestNextAction('intake', null, [edge('diagnosis')])).toBeNull();
  });
});
