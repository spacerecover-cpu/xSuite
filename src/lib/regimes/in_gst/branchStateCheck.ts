// src/lib/regimes/in_gst/branchStateCheck.ts
// Single-GSTIN v1 invariant: every active branch operates in the GSTIN's state.
// A branch in another state legally needs its OWN GSTIN — the multi-state
// registration manager is a named Phase-4 deferral, so we DETECT and warn
// loudly instead of silently mis-taxing inter-state branch supplies.

export interface BranchForStateCheck {
  id: string;
  name: string;
  subdivision_id: string | null;
  is_active: boolean | null;
}

export interface BranchStateMismatch {
  branchId: string;
  branchName: string;
  branchSubdivisionId: string;
}

export function findBranchStateMismatches(
  branches: BranchForStateCheck[],
  registrationSubdivisionId: string | null,
): BranchStateMismatch[] {
  if (!registrationSubdivisionId) return [];
  return branches
    .filter((b) => b.is_active === true && b.subdivision_id !== null && b.subdivision_id !== registrationSubdivisionId)
    .map((b) => ({ branchId: b.id, branchName: b.name, branchSubdivisionId: b.subdivision_id as string }));
}
