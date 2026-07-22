import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleHelp, Info, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { supabase } from '../../lib/supabaseClient';
import { caseQualityService } from '../../lib/caseQualityService';
import { transitionCaseStatus } from '../../lib/caseStateMachineService';
import { describeGateError } from '../../lib/caseReleaseGate';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

/** Default review horizon for a parked no-solution case. */
const DEFAULT_FOLLOWUP_MONTHS = 6;
function defaultFollowUpDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + DEFAULT_FOLLOWUP_MONTHS);
  return d.toISOString().slice(0, 10);
}

interface MarkNoSolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  tenantId: string;
  userId: string | null;
  assignedTo?: string | null;
  onDone: () => void;
}

/**
 * Park a case as "No Solution — Future Follow-up": capture the structured
 * reason + notes, transition the case into the no_solution phase (the reason is
 * the DB-enforced gate), and schedule a review follow-up so the device is not
 * forgotten when tools improve.
 */
export const MarkNoSolutionModal: React.FC<MarkNoSolutionModalProps> = ({
  isOpen,
  onClose,
  caseId,
  tenantId,
  userId,
  assignedTo,
  onDone,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduleFollowUp, setScheduleFollowUp] = useState(true);
  const [followUpDate, setFollowUpDate] = useState(defaultFollowUpDate);

  const { data: reasons = [] } = useQuery({
    queryKey: ['no_solution_reasons'],
    queryFn: () => caseQualityService.listNoSolutionReasons(),
    enabled: isOpen,
  });

  const { data: noSolutionStatus } = useQuery({
    queryKey: ['no_solution_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_statuses')
        .select('id, name')
        .eq('type', 'no_solution')
        .eq('is_active', true)
        .order('sort_order')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!reasonId) throw new Error('Select a reason first.');
      if (!noSolutionStatus?.id) throw new Error('No Solution status is not configured.');

      // 1. Record the structured reason (the transition gate reads this column).
      await caseQualityService.setNoSolutionReason(caseId, reasonId, notes.trim() || null);

      // 2. Transition into the no_solution phase.
      await transitionCaseStatus({
        caseId,
        toStatusId: noSolutionStatus.id,
        notes: notes.trim() || undefined,
      });

      // 3. Schedule a review follow-up (best-effort — the case is already parked).
      if (scheduleFollowUp) {
        const reasonName = reasons.find((r) => r.id === reasonId)?.name ?? 'No solution';
        const { error: fErr } = await supabase.from('case_follow_ups').insert({
          tenant_id: tenantId,
          case_id: caseId,
          follow_up_date: followUpDate,
          type: 'no_solution_review',
          status: 'pending',
          channel: 'internal',
          notes: `No-solution review — ${reasonName}. ${notes.trim()}`.trim(),
          assigned_to: assignedTo ?? userId ?? null,
          created_by: userId,
        });
        if (fErr) logger.error('Failed to schedule no-solution follow-up:', fErr);
      }
    },
    onSuccess: () => {
      toast.success('Case parked as No Solution — Future Follow-up');
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case_history', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      onDone();
      onClose();
    },
    onError: (err: unknown) => {
      toast.error(describeGateError(err) ?? `Could not park the case: ${(err as Error).message}`);
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark No Solution — Future Follow-up"
      icon={CircleHelp}
      size="md"
      titleSize="sm"
      showClose
      closeOnBackdrop={false}
    >
      <div className="mb-4 flex gap-2 rounded border-l-4 border-info bg-info-muted p-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-info" />
        <p className="text-sm text-info">
          Use this when the device is recoverable in principle but no method exists today.
          The device is returned to the customer and the case is parked for review — not
          permanently closed. It stays in the No-Solution queue and can be reopened or
          re-recovered later.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <SearchableSelect
            label="Reason"
            floatingLabel
            shrinkDefaultValue
            usePortal
            required
            value={reasonId}
            onChange={(value) => setReasonId(value)}
            options={[{ id: '', name: 'Not specified' }, ...reasons.map((r) => ({ id: r.id, name: r.name }))]}
            placeholder="Not specified"
          />
          {reasonId && reasons.find((r) => r.id === reasonId)?.description && (
            <p className="mt-1 text-xs text-slate-500">{reasons.find((r) => r.id === reasonId)?.description}</p>
          )}
        </div>

        <Textarea
          label="Notes"
          floatingLabel
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Controller SM2258 not yet supported; revisit when tooling lands."
          className="resize-none"
        />

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleFollowUp}
              onChange={(e) => setScheduleFollowUp(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900">Schedule a review follow-up</div>
              <div className="mt-0.5 text-xs text-slate-600">
                Adds a reminder to re-check this case when new methods or tools become available.
              </div>
            </div>
          </label>
          {scheduleFollowUp && (
            <div className="mt-3 pl-7">
              <label htmlFor="ns-followup" className="mb-1 block text-sm font-medium text-slate-700">
                Review on
              </label>
              <input
                id="ns-followup"
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2.5 border-t border-border pt-4">
        <Button variant="secondary" size="sm" className="text-xs" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="warning"
          size="sm"
          className="text-xs"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !reasonId}
        >
          {mutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <CircleHelp className="w-3.5 h-3.5 mr-1.5" />
          )}
          {mutation.isPending ? 'Parking…' : 'Mark No Solution'}
        </Button>
      </div>
    </Modal>
  );
};
