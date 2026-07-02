import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { HardDrive, Star } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { formatDate } from '../../lib/format';
import { formatCaseAge } from '../../lib/caseLifecycle';

interface CasePeekPanelProps {
  caseId: string | null;
  onClose: () => void;
}

/**
 * Slide-over case preview for triage: core facts, customer and every device
 * without leaving the list (list position and filters stay put). Opened via
 * Shift+click on a row or the `p` key on the keyboard-focused row.
 */
export const CasePeekPanel: React.FC<CasePeekPanelProps> = ({ caseId, onClose }) => {
  const navigate = useNavigate();

  const { data: peek, isLoading } = useQuery({
    queryKey: ['case_peek', caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select(
          `
          id, case_no, title, status, priority, client_reference, created_at, checkout_date,
          assigned_engineer_id,
          customer:customers_enhanced!customer_id (customer_name, mobile_number, email),
          devices:case_devices (id, serial_number, model, is_primary,
            catalog_device_types (name), catalog_device_brands (name), catalog_device_capacities (name))
        `,
        )
        .eq('id', caseId!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      let engineerName: string | null = null;
      if (data.assigned_engineer_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.assigned_engineer_id)
          .maybeSingle();
        engineerName = profile?.full_name ?? null;
      }
      return { ...data, engineerName };
    },
  });

  if (!caseId) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-overlay bg-slate-900/20"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Case preview ${peek?.case_no ?? ''}`}
        className="fixed inset-y-0 right-0 z-overlay flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Case preview</p>
            <h2 className="truncate text-lg font-bold text-slate-900">{peek?.case_no ?? '…'}</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading || !peek ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
                  {peek.status}
                </span>
                <span className="text-sm text-slate-500">
                  in for {formatCaseAge(peek.created_at, new Date())}
                </span>
              </div>

              {peek.title && <p className="text-sm text-slate-700">{peek.title}</p>}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Customer</h3>
                <p className="mt-1 font-medium text-slate-900">
                  {peek.customer?.customer_name ?? '—'}
                </p>
                {peek.customer?.mobile_number && (
                  <p className="text-sm tabular-nums text-slate-600">{peek.customer.mobile_number}</p>
                )}
                {peek.customer?.email && (
                  <p className="truncate text-sm text-slate-600">{peek.customer.email}</p>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Devices ({peek.devices?.length ?? 0})
                </h3>
                <ul className="mt-1.5 space-y-2">
                  {(peek.devices ?? []).map((d) => (
                    <li key={d.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5">
                      <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-slate-900">
                          {[d.catalog_device_types?.name, d.catalog_device_brands?.name, d.model]
                            .filter(Boolean)
                            .join(' · ') || 'Device'}
                          {d.is_primary && (
                            <Star
                              className="ml-1 inline h-3.5 w-3.5 fill-warning text-warning"
                              aria-label="Primary device"
                            />
                          )}
                        </p>
                        <p className="truncate tabular-nums text-slate-500">
                          {[d.catalog_device_capacities?.name, d.serial_number].filter(Boolean).join(' · ') || 'No serial'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Priority</dt>
                <dd className="text-slate-900">{peek.priority ?? '—'}</dd>
                <dt className="text-slate-500">Engineer</dt>
                <dd className="text-slate-900">{peek.engineerName ?? 'Unassigned'}</dd>
                <dt className="text-slate-500">Client ref</dt>
                <dd className="text-slate-900">{peek.client_reference ?? '—'}</dd>
                <dt className="text-slate-500">Received</dt>
                <dd className="text-slate-900">{formatDate(peek.created_at)}</dd>
                {peek.checkout_date && (
                  <>
                    <dt className="text-slate-500">Checked out</dt>
                    <dd className="text-slate-900">{formatDate(peek.checkout_date)}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => caseId && navigate(`/cases/${caseId}`)}>
            Open full case
          </Button>
        </div>
      </aside>
    </>
  );
};
