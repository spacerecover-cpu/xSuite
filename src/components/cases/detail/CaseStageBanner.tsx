import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, AlertCircle, Loader2, XCircle } from 'lucide-react';
import {
  getAllowedTransitions,
  transitionCaseStatus,
  suggestNextAction,
  PHASE_LABEL,
  PHASE_ORDER,
  type CasePhase,
  type AllowedTransition,
} from '../../../lib/caseStateMachineService';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../../hooks/useToast';
import { useAuth } from '../../../contexts/AuthContext';
import { useTenantFeatures } from '../../../contexts/TenantConfigContext';
import { STAGE_FEATURE_BY_PHASE } from '../../../lib/features/registry';

interface CaseStageBannerProps {
  caseId: string;
  currentStatusId: string | null;
  currentStatusName: string | null;
  currentPhase: CasePhase | null;
}

export function CaseStageBanner({
  caseId,
  currentStatusId,
  currentStatusName,
  currentPhase,
}: CaseStageBannerProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const callerRole = profile?.role ?? null;

  // Per-tenant pipeline display: hide stage chips the tenant disabled. Display-only —
  // transitions are unaffected (the global state machine stays intact).
  const { isEnabled } = useTenantFeatures();
  const visiblePhases = useMemo(
    () => PHASE_ORDER.filter((p) => {
      const key = STAGE_FEATURE_BY_PHASE[p];
      return !key || isEnabled(key);
    }),
    [isEnabled],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingTarget, setPendingTarget] = useState<AllowedTransition | null>(null);

  const { data: allowed = [], isLoading } = useQuery({
    queryKey: ['case-allowed-transitions', currentStatusId, callerRole],
    queryFn: () => getAllowedTransitions(currentStatusId, callerRole),
    enabled: Boolean(callerRole),
  });

  const nextAction = useMemo(
    () => suggestNextAction(currentPhase, callerRole, allowed),
    [currentPhase, callerRole, allowed],
  );

  const cancelEdges = useMemo(
    () => allowed.filter((a) => a.to_phase === 'cancelled'),
    [allowed],
  );
  const reopenEdges = useMemo(() => allowed.filter((a) => a.is_reopen), [allowed]);
  const otherForwardEdges = useMemo(
    () =>
      allowed.filter(
        (a) => a.to_phase !== 'cancelled' && !a.is_reopen && a !== nextAction,
      ),
    [allowed, nextAction],
  );

  const transitionMutation = useMutation({
    mutationFn: async (input: {
      target: AllowedTransition;
      reason: string;
      notes: string;
    }) => {
      return transitionCaseStatus({
        caseId,
        toStatusId: input.target.to_status.id,
        reason: input.reason || undefined,
        notes: input.notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Case status updated');
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-allowed-transitions'] });
      queryClient.invalidateQueries({ queryKey: ['case_job_history', caseId] });
      setPickerOpen(false);
      setReason('');
      setNotes('');
      setPendingTarget(null);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Could not change status: ${message}`);
    },
  });

  const openConfirm = (target: AllowedTransition) => {
    setPendingTarget(target);
    setPickerOpen(true);
    setReason('');
    setNotes('');
  };

  const confirmTransition = () => {
    if (!pendingTarget) return;
    transitionMutation.mutate({ target: pendingTarget, reason, notes });
  };

  const isCancelled = currentPhase === 'cancelled';

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Current Stage
          </span>
          <span className="text-lg font-semibold text-slate-900">
            {currentStatusName ?? 'Unknown'}
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {visiblePhases.map((phase, idx) => {
              const reached = phaseReached(currentPhase, phase);
              const isCurrent = phase === currentPhase;
              return (
                <span key={phase} className="flex items-center gap-1">
                  <span
                    className={
                      isCurrent
                        ? 'rounded-md bg-primary px-2 py-0.5 font-medium text-primary-foreground'
                        : reached
                          ? 'text-slate-700'
                          : 'text-slate-400'
                    }
                  >
                    {PHASE_LABEL[phase]}
                  </span>
                  {idx < visiblePhases.length - 1 ? (
                    <ChevronRight className="h-3 w-3 text-slate-300" />
                  ) : null}
                </span>
              );
            })}
            {isCancelled ? (
              <span className="ml-2 rounded-md bg-danger-muted px-2 py-0.5 font-medium text-danger">
                Cancelled
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : null}
          {nextAction ? (
            <Button
              variant="primary"
              onClick={() => openConfirm(nextAction)}
              disabled={transitionMutation.isPending}
            >
              {nextAction.description ?? `Move to ${PHASE_LABEL[nextAction.to_phase]}`}
            </Button>
          ) : null}
          {otherForwardEdges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {otherForwardEdges.map((edge) => (
                <Button
                  key={edge.to_status.id}
                  variant="secondary"
                  onClick={() => openConfirm(edge)}
                  disabled={transitionMutation.isPending}
                >
                  {edge.to_status.name}
                </Button>
              ))}
            </div>
          ) : null}
          {cancelEdges.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => openConfirm(cancelEdges[0])}
              disabled={transitionMutation.isPending}
              className="text-danger"
            >
              <XCircle className="mr-1 h-4 w-4" />
              Cancel Case
            </Button>
          ) : null}
          {reopenEdges.map((edge) => (
            <Button
              key={edge.to_status.id}
              variant="ghost"
              onClick={() => openConfirm(edge)}
              disabled={transitionMutation.isPending}
            >
              Reopen → {PHASE_LABEL[edge.to_phase]}
            </Button>
          ))}
        </div>
      </div>

      {pendingTarget ? (
        <Modal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title={`Move to ${pendingTarget.to_status.name}`}
        >
          <div className="space-y-4">
            {pendingTarget.requires.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md bg-warning-muted p-3 text-sm text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  This transition expects the following before being applied:
                  <ul className="ml-4 list-disc">
                    {pendingTarget.requires.map((r) => (
                      <li key={r}>{r.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                  These are advisory — the RPC does not block on them today.
                </div>
              </div>
            ) : null}

            {pendingTarget.to_phase === 'cancelled' || pendingTarget.is_reopen ? (
              <div>
                <label
                  htmlFor="state-reason"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Reason {pendingTarget.to_phase === 'cancelled' ? '(required)' : '(optional)'}
                </label>
                <input
                  id="state-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    pendingTarget.to_phase === 'cancelled'
                      ? 'e.g. Customer declined quote'
                      : 'Why are we reopening?'
                  }
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ) : null}

            <div>
              <label
                htmlFor="state-notes"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Notes (optional)
              </label>
              <textarea
                id="state-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything the next person needs to know"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPickerOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={pendingTarget.to_phase === 'cancelled' ? 'danger' : 'primary'}
                onClick={confirmTransition}
                disabled={
                  transitionMutation.isPending ||
                  (pendingTarget.to_phase === 'cancelled' && reason.trim().length === 0)
                }
              >
                {transitionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function phaseReached(current: CasePhase | null, target: CasePhase): boolean {
  if (!current) return false;
  if (current === 'cancelled') return false;
  const currentIdx = PHASE_ORDER.indexOf(current);
  const targetIdx = PHASE_ORDER.indexOf(target);
  if (currentIdx === -1 || targetIdx === -1) return false;
  return currentIdx >= targetIdx;
}
