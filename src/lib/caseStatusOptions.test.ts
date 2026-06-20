import { describe, it, expect } from 'vitest';
import { buildCaseStatusOptions, type StatusLite } from './caseStatusOptions';
import type { AllowedTransition } from './caseStateMachineService';
import type { Database } from '../types/database.types';

type CaseStatusRow = Database['public']['Tables']['master_case_statuses']['Row'];

// Minimal master_case_statuses fixtures (only id/name/type are read by the picker).
const REGISTERED: StatusLite = { id: 's-registered', name: 'Registered', type: 'intake' };
const RECEIVED: StatusLite = { id: 's-received', name: 'Received', type: 'intake' };
const INITIAL_ASSESSMENT: StatusLite = { id: 's-initial', name: 'Initial Assessment', type: 'diagnosis' };
const CANCELLED_CLIENT: StatusLite = { id: 's-cancel', name: 'Cancelled by Client', type: 'cancelled' };
const DELIVERED: StatusLite = { id: 's-delivered', name: 'Delivered', type: 'delivered' };

const ALL: StatusLite[] = [REGISTERED, RECEIVED, INITIAL_ASSESSMENT, CANCELLED_CLIENT, DELIVERED];

function edge(to: StatusLite, over: Partial<AllowedTransition> = {}): AllowedTransition {
  return {
    to_status: to as unknown as CaseStatusRow,
    to_phase: to.type as AllowedTransition['to_phase'],
    requires: [],
    description: null,
    is_reopen: false,
    ...over,
  };
}

describe('buildCaseStatusOptions', () => {
  it('offers a same-phase sibling as a lateral move (the intra-phase fix)', () => {
    // From Registered (intake), the cross-phase edges go to diagnosis + cancelled.
    const opts = buildCaseStatusOptions({
      current: REGISTERED,
      allActiveStatuses: ALL,
      allowedTransitions: [edge(INITIAL_ASSESSMENT), edge(CANCELLED_CLIENT)],
    });
    const received = opts.find((o) => o.value === 'Received');
    expect(received).toBeDefined();
    expect(received?.group).toBe('lateral');
  });

  it('marks the current status as current and lists it first', () => {
    const opts = buildCaseStatusOptions({
      current: REGISTERED,
      allActiveStatuses: ALL,
      allowedTransitions: [edge(INITIAL_ASSESSMENT)],
    });
    expect(opts[0]).toEqual({ value: 'Registered', label: 'Registered', group: 'current' });
  });

  it('groups cross-phase destinations: forward as advance, cancelled as cancel', () => {
    const opts = buildCaseStatusOptions({
      current: REGISTERED,
      allActiveStatuses: ALL,
      allowedTransitions: [edge(INITIAL_ASSESSMENT), edge(CANCELLED_CLIENT)],
    });
    expect(opts.find((o) => o.value === 'Initial Assessment')?.group).toBe('advance');
    expect(opts.find((o) => o.value === 'Cancelled by Client')?.group).toBe('cancel');
  });

  it('flags reopen edges as reopen', () => {
    const opts = buildCaseStatusOptions({
      current: DELIVERED,
      allActiveStatuses: ALL,
      allowedTransitions: [edge(INITIAL_ASSESSMENT, { is_reopen: true })],
    });
    expect(opts.find((o) => o.value === 'Initial Assessment')?.group).toBe('reopen');
  });

  it('never offers an unreachable status (not current, not a sibling, not an allowed edge)', () => {
    const opts = buildCaseStatusOptions({
      current: REGISTERED,
      allActiveStatuses: ALL,
      allowedTransitions: [edge(INITIAL_ASSESSMENT)],
    });
    // Delivered is neither the current status, an intake sibling, nor an allowed edge.
    expect(opts.find((o) => o.value === 'Delivered')).toBeUndefined();
  });

  it('does not duplicate the current status if an edge points back at it', () => {
    const opts = buildCaseStatusOptions({
      current: REGISTERED,
      allActiveStatuses: ALL,
      allowedTransitions: [edge(REGISTERED), edge(INITIAL_ASSESSMENT)],
    });
    expect(opts.filter((o) => o.value === 'Registered')).toHaveLength(1);
  });

  it('is null-current safe (returns only the allowed edges)', () => {
    const opts = buildCaseStatusOptions({
      current: null,
      allActiveStatuses: ALL,
      allowedTransitions: [edge(INITIAL_ASSESSMENT)],
    });
    expect(opts.map((o) => o.value)).toEqual(['Initial Assessment']);
  });
});
