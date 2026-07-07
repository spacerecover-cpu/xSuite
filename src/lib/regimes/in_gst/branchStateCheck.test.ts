// src/lib/regimes/in_gst/branchStateCheck.test.ts
import { describe, it, expect } from 'vitest';
import { findBranchStateMismatches } from './branchStateCheck';

const branches = [
  { id: 'b1', name: 'HQ Lab — Bengaluru', subdivision_id: 's-ka', is_active: true },
  { id: 'b2', name: 'Mumbai Intake Desk', subdivision_id: 's-mh', is_active: true },
  { id: 'b3', name: 'Closed Pune Desk', subdivision_id: 's-mh', is_active: false },
  { id: 'b4', name: 'No-state branch', subdivision_id: null, is_active: true },
];

describe('findBranchStateMismatches', () => {
  it('flags active branches whose state differs from the GSTIN state', () => {
    const out = findBranchStateMismatches(branches, 's-ka');
    expect(out).toEqual([{ branchId: 'b2', branchName: 'Mumbai Intake Desk', branchSubdivisionId: 's-mh' }]);
  });

  it('ignores inactive branches and branches without a state', () => {
    const out = findBranchStateMismatches(branches, 's-mh');
    expect(out.map((m) => m.branchId)).toEqual(['b1']);
  });

  it('returns [] when the registration has no subdivision (nothing to compare)', () => {
    expect(findBranchStateMismatches(branches, null)).toEqual([]);
  });
});
