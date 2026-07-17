import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { logger } from './logger';

type CaseStatusRow = Database['public']['Tables']['master_case_statuses']['Row'];
type TransitionRow = Database['public']['Tables']['case_status_transitions']['Row'];

export type CasePhase =
  | 'intake'
  | 'diagnosis'
  | 'quoting'
  | 'awaiting_approval'
  | 'approved'
  | 'recovery'
  | 'qa'
  | 'ready'
  | 'delivered'
  | 'closed'
  | 'no_solution'
  | 'cancelled';

export const PHASE_LABEL: Record<CasePhase, string> = {
  intake: 'Intake',
  diagnosis: 'Diagnosis',
  quoting: 'Quoting',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  recovery: 'Recovery',
  qa: 'QA',
  ready: 'Ready',
  delivered: 'Delivered',
  closed: 'Closed',
  no_solution: 'No Solution',
  cancelled: 'Cancelled',
};

// Linear order used by the stage banner. cancelled is rendered separately as
// a terminal off-track state and isn't in this list.
export const PHASE_ORDER: CasePhase[] = [
  'intake',
  'diagnosis',
  'quoting',
  'awaiting_approval',
  'approved',
  'recovery',
  'qa',
  'ready',
  'delivered',
  'closed',
];

export interface AllowedTransition {
  to_status: CaseStatusRow;
  to_phase: CasePhase;
  requires: string[];
  description: string | null;
  is_reopen: boolean;
}

export interface TransitionResult {
  ok: boolean;
  case_id: string;
  no_op?: boolean;
  from_status_id?: string;
  from_phase?: CasePhase;
  to_status_id: string;
  to_phase: CasePhase;
}

export async function listCaseStatuses(): Promise<CaseStatusRow[]> {
  const { data, error } = await supabase
    .from('master_case_statuses')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as CaseStatusRow[];
}

export interface TransitionOptions {
  /** When false, qa-phase destinations are removed (tenant QA feature off). */
  qaEnabled?: boolean;
}

export async function getAllowedTransitions(
  currentStatusId: string | null,
  callerRole: string | null,
  options: TransitionOptions = {},
): Promise<AllowedTransition[]> {
  const qaEnabled = options.qaEnabled ?? true;
  // Read the current phase first; if currentStatusId is null we treat as intake.
  let currentPhase: CasePhase = 'intake';
  if (currentStatusId) {
    const { data: status, error: statusErr } = await supabase
      .from('master_case_statuses')
      .select('type')
      .eq('id', currentStatusId)
      .maybeSingle();
    if (statusErr) throw statusErr;
    if (status?.type && isCasePhase(status.type)) currentPhase = status.type;
  }

  const { data: edges, error: edgesErr } = await supabase
    .from('case_status_transitions')
    .select('*')
    .eq('from_phase', currentPhase)
    .eq('is_active', true)
    .order('sort_order');
  if (edgesErr) throw edgesErr;

  // Role filter happens client-side; DB also blocks at the RPC layer.
  // The QA filter mirrors the server's tenant gate (qa_disabled).
  const allowedEdges = (edges ?? []).filter(
    (e: TransitionRow) =>
      (callerRole ? e.allowed_roles.includes(callerRole) : false) &&
      (qaEnabled || e.to_phase !== 'qa'),
  );

  if (allowedEdges.length === 0) return [];

  // Pull the destination statuses. Multiple statuses may share a phase
  // (e.g. cancelled and closed each have variants). Return all of them so
  // the UI can let the user pick.
  const toPhases = Array.from(new Set(allowedEdges.map((e) => e.to_phase as CasePhase)));
  const { data: statuses, error: stErr } = await supabase
    .from('master_case_statuses')
    .select('*')
    .in('type', toPhases)
    .eq('is_active', true)
    .order('sort_order');
  if (stErr) throw stErr;

  // Cancellation reopens are special — flag for the UI so they can show in
  // a destructive-style action group.
  const reopenPhases = new Set<CasePhase>(['intake', 'diagnosis', 'recovery']);
  const isReopenEdge =
    currentPhase === 'delivered' ||
    currentPhase === 'cancelled' ||
    currentPhase === 'closed' ||
    currentPhase === 'no_solution';

  return (statuses ?? []).map((s) => {
    const matchingEdge = allowedEdges.find((e) => e.to_phase === s.type);
    return {
      to_status: s as CaseStatusRow,
      to_phase: s.type as CasePhase,
      requires: matchingEdge?.requires ?? [],
      description: matchingEdge?.description ?? null,
      is_reopen: isReopenEdge && reopenPhases.has(s.type as CasePhase),
    };
  });
}

export async function transitionCaseStatus(args: {
  caseId: string;
  toStatusId: string;
  reason?: string;
  notes?: string;
}): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc('transition_case_status', {
    p_case_id: args.caseId,
    p_to_status_id: args.toStatusId,
    p_reason: args.reason ?? undefined,
    p_notes: args.notes ?? undefined,
  });
  if (error) {
    logger.error('transition_case_status failed', error, args);
    throw error;
  }
  return data as unknown as TransitionResult;
}

// "Next Action" suggestion — given a current phase + role, returns the
// most-likely-intended forward transition. Used by the CaseDetail header
// primary CTA. Returns null when no clean primary exists (cancelled,
// delivered, ambiguous fan-out).
export function suggestNextAction(
  currentPhase: CasePhase | null,
  callerRole: string | null,
  allowed: AllowedTransition[],
): AllowedTransition | null {
  if (!currentPhase || !callerRole) return null;
  if (allowed.length === 0) return null;

  // Prefer the canonical forward edge. getAllowedTransitions orders entries by
  // destination-status sort_order, not edge direction, so the first non-cancel
  // non-reopen entry can be a BACKWARD move (e.g. awaiting_approval lists
  // quoting before approved, qa lists recovery before ready). Resolve direction
  // from the linear PHASE_ORDER pipeline and pick the nearest on-track phase
  // ahead of the current one.
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const forward = allowed
    .filter(
      (a) =>
        a.to_phase !== 'cancelled' &&
        !a.is_reopen &&
        PHASE_ORDER.indexOf(a.to_phase) > currentIdx,
    )
    .sort(
      (a, b) => PHASE_ORDER.indexOf(a.to_phase) - PHASE_ORDER.indexOf(b.to_phase),
    );
  return forward[0] ?? null;
}

function isCasePhase(value: string): value is CasePhase {
  // PHASE_ORDER is the on-track linear pipeline; cancelled and no_solution are
  // off-track terminal states rendered separately, so accept them explicitly.
  return (PHASE_ORDER as string[]).includes(value) || value === 'cancelled' || value === 'no_solution';
}
