// Pure builder for the case status picker's options. Kept free of the Supabase
// client (unlike caseStateMachineService) so it is unit-testable without env,
// mirroring the caseReleaseGate companion pattern.
//
// The old picker offered every active status, so any same-phase or non-adjacent
// pick hit transition_case_status's phase guard and returned HTTP 400. This
// builds only the *reachable* set the state machine accepts:
//   - current : the case's present status (shown selected, never a 400)
//   - lateral : sibling sub-statuses of the SAME phase — intra-phase moves that
//               transition_case_status now allows (e.g. Registered -> Received)
//   - advance / cancel / reopen : role-filtered CROSS-phase destinations from
//               getAllowedTransitions(), grouped by intent for the optgroups.
import type { AllowedTransition } from './caseStateMachineService';

export type StatusOptionGroup = 'current' | 'lateral' | 'advance' | 'cancel' | 'reopen';

export interface CaseStatusOption {
  /** Status NAME — the legacy value transition mutations resolve to a status id. */
  value: string;
  label: string;
  group: StatusOptionGroup;
}

/** Just the fields the picker reads off a master_case_statuses row. */
export interface StatusLite {
  id: string;
  name: string;
  type: string;
}

export interface BuildCaseStatusOptionsParams {
  current: StatusLite | null;
  allActiveStatuses: StatusLite[];
  allowedTransitions: AllowedTransition[];
}

export function buildCaseStatusOptions({
  current,
  allActiveStatuses,
  allowedTransitions,
}: BuildCaseStatusOptionsParams): CaseStatusOption[] {
  const options: CaseStatusOption[] = [];
  const seen = new Set<string>();

  const push = (value: string, label: string, group: StatusOptionGroup) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({ value, label, group });
  };

  if (current) {
    push(current.name, current.name, 'current');

    // Same-phase siblings — intra-phase lateral moves, now accepted by the DB.
    for (const s of allActiveStatuses) {
      if (s.type === current.type && s.id !== current.id) {
        push(s.name, s.name, 'lateral');
      }
    }
  }

  // Cross-phase destinations from the state machine, grouped by intent.
  for (const t of allowedTransitions) {
    if (current && t.to_status.id === current.id) continue;
    const group: StatusOptionGroup =
      t.to_phase === 'cancelled' ? 'cancel' : t.is_reopen ? 'reopen' : 'advance';
    push(t.to_status.name, t.to_status.name, group);
  }

  return options;
}
