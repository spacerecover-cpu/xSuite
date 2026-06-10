import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, Star, UserMinus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Input } from '../ui/Input';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import {
  addCompanyRelationship,
  endCompanyRelationship,
  getCompanyRelationships,
  getOpenCasesForCompany,
  getOpenCompanyCasesForCustomer,
  makeCustomerIndividual,
  repointCaseCompany,
  setPrimaryCompany,
  type CompanyRelationshipRecord,
} from '../../lib/customerService';

interface ManageCompaniesModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
}

type PendingAction =
  | { type: 'set_primary'; relationship: CompanyRelationshipRecord }
  | { type: 'end'; relationship: CompanyRelationshipRecord }
  | { type: 'make_individual' };

const companyLabel = (rel: CompanyRelationshipRecord) =>
  rel.companies?.company_name ?? rel.companies?.name ?? 'Unknown company';

/**
 * Manage a customer's company links: add, set primary, end (soft delete with a
 * required reason). Changing links NEVER rewrites issued documents or closed
 * cases — their company snapshots are history. Open cases referencing an
 * affected company are surfaced and can be explicitly re-pointed (each
 * re-point keeps its own case-history entry).
 */
export const ManageCompaniesModal: React.FC<ManageCompaniesModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [endReason, setEndReason] = useState('');
  const [repointCases, setRepointCases] = useState(false);
  const [addCompanyId, setAddCompanyId] = useState('');
  const [addRole, setAddRole] = useState('');
  const [addAsPrimary, setAddAsPrimary] = useState(false);

  const { data: relationships = [], isLoading } = useQuery({
    queryKey: ['customer_company_relationships', customerId],
    queryFn: () => getCompanyRelationships(customerId),
    enabled: isOpen,
  });

  const { data: companyOptions = [] } = useQuery({
    queryKey: ['companies', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, company_name, company_number')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isOpen,
  });

  // Impact surface for a per-company action: open cases that reference the
  // affected company (terminal cases are never touched).
  const affected =
    pending?.type === 'set_primary'
      ? relationships.find((r) => r.is_primary) ?? null
      : pending?.type === 'end'
        ? pending.relationship
        : null;
  const { data: openCases = [] } = useQuery({
    queryKey: ['open_cases_for_company', customerId, affected?.company_id],
    queryFn: () => getOpenCasesForCompany(customerId, affected!.company_id),
    enabled: isOpen && !!affected,
  });

  // Impact surface for "make individual": every open case still pinned to any
  // company — all become personal.
  const { data: individualCases = [] } = useQuery({
    queryKey: ['open_company_cases_for_customer', customerId],
    queryFn: () => getOpenCompanyCasesForCustomer(customerId),
    enabled: isOpen && pending?.type === 'make_individual',
  });

  const linkedIds = useMemo(() => new Set(relationships.map((r) => r.company_id)), [relationships]);
  const addOptions = useMemo(
    () =>
      companyOptions
        .filter((c) => !linkedIds.has(c.id))
        .map((c) => ({ id: c.id, name: `${c.company_name ?? c.name}${c.company_number ? ` (${c.company_number})` : ''}` })),
    [companyOptions, linkedIds],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['customer_company_relationships', customerId] });
    queryClient.invalidateQueries({ queryKey: ['customer_companies', customerId] });
    queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    queryClient.invalidateQueries({ queryKey: ['company_contacts'] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['case_company'] });
  };

  const resetPending = () => {
    setPending(null);
    setEndReason('');
    setRepointCases(false);
  };

  const addMutation = useMutation({
    mutationFn: () =>
      addCompanyRelationship({
        customerId,
        companyId: addCompanyId,
        role: addRole.trim() || null,
        makePrimary: addAsPrimary || relationships.length === 0,
      }),
    onSuccess: () => {
      toast.success('Company linked');
      setAddCompanyId('');
      setAddRole('');
      setAddAsPrimary(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to link company'),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!pending) return;
      if (pending.type === 'make_individual') {
        await makeCustomerIndividual(customerId, endReason.trim());
        return;
      }
      const target = pending.relationship;
      if (pending.type === 'set_primary') {
        const oldPrimary = relationships.find((r) => r.is_primary) ?? null;
        await setPrimaryCompany(customerId, target.id);
        if (repointCases && oldPrimary) {
          for (const c of openCases) {
            await repointCaseCompany(c.id, oldPrimary.company_id, target.company_id);
          }
        }
      } else {
        if (relationships.length === 1) {
          throw new Error(
            'This is the only linked company. Use "Make individual" to remove it and set open cases to personal.',
          );
        }
        await endCompanyRelationship(target.id, endReason.trim());
        if (repointCases && openCases.length > 0) {
          const fallback = relationships.find((r) => r.id !== target.id && r.is_primary)
            ?? relationships.find((r) => r.id !== target.id);
          for (const c of openCases) {
            await repointCaseCompany(c.id, target.company_id, fallback?.company_id ?? null);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success(
        pending?.type === 'make_individual'
          ? `${customerName} is now an individual customer`
          : pending?.type === 'end'
            ? 'Company link ended'
            : 'Primary company updated',
      );
      resetPending();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Action failed'),
  });

  const confirmDisabled =
    confirmMutation.isPending ||
    ((pending?.type === 'end' || pending?.type === 'make_individual') && endReason.trim().length === 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Companies — ${customerName}`} icon={Building2} size="lg">
      <div className="space-y-5">
        {/* Current relationships */}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Linked companies</p>
          {isLoading ? (
            <p className="py-4 text-sm text-slate-500">Loading…</p>
          ) : relationships.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              No companies linked yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {relationships.map((rel) => (
                <li key={rel.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{companyLabel(rel)}</p>
                    <p className="text-xs text-slate-500">
                      {rel.companies?.company_number ?? ''}
                      {rel.role ? ` · ${rel.role}` : ''}
                    </p>
                  </div>
                  {rel.is_primary ? (
                    <Badge variant="secondary" size="sm">
                      <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                      Primary
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        resetPending();
                        setPending({ type: 'set_primary', relationship: rel });
                      }}
                    >
                      Set primary
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:text-danger"
                    onClick={() => {
                      resetPending();
                      setPending({ type: 'end', relationship: rel });
                    }}
                  >
                    End
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {relationships.length > 0 && (
            <button
              type="button"
              onClick={() => {
                resetPending();
                setPending({ type: 'make_individual' });
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-danger hover:underline"
            >
              <UserMinus className="h-4 w-4" aria-hidden="true" />
              Remove all companies — make individual
            </button>
          )}
        </div>

        {/* Confirm panel with impact analysis */}
        {pending && (
          <div className="rounded-lg border border-warning/40 bg-warning-muted p-4" role="alertdialog" aria-label="Confirm relationship change">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
              <div className="flex-1 space-y-3 text-sm">
                <p className="font-medium text-slate-900">
                  {pending.type === 'make_individual'
                    ? `Make ${customerName} an individual customer?`
                    : pending.type === 'set_primary'
                      ? `Make ${companyLabel(pending.relationship)} the primary company?`
                      : `End the link to ${companyLabel(pending.relationship)}?`}
                </p>
                <p className="text-slate-700">
                  {pending.type === 'make_individual'
                    ? 'All company links will be removed and future quotes and invoices will be issued to the individual. '
                    : ''}
                  Issued quotes, invoices and closed cases keep their original company — history is
                  never rewritten.
                </p>
                {(pending.type === 'end' || pending.type === 'make_individual') && (
                  <Input
                    label="Reason (recorded in the audit trail)"
                    value={endReason}
                    onChange={(e) => setEndReason(e.target.value)}
                    placeholder={
                      pending.type === 'make_individual'
                        ? 'e.g. No longer purchasing through a company'
                        : 'e.g. Contact moved to a different employer'
                    }
                    required
                  />
                )}
                {pending.type === 'make_individual' && individualCases.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-surface p-3">
                    <p className="mb-1 font-medium text-slate-800">
                      {individualCases.length} open case{individualCases.length === 1 ? '' : 's'} will be set to no
                      company (personal):
                    </p>
                    <p className="text-xs text-slate-500">
                      {individualCases.slice(0, 6).map((c) => c.case_no).filter(Boolean).join(', ')}
                      {individualCases.length > 6 ? '…' : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Each change is logged on the case.</p>
                  </div>
                )}
                {affected && openCases.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-surface p-3">
                    <p className="mb-1 font-medium text-slate-800">
                      {openCases.length} open case{openCases.length === 1 ? '' : 's'} currently reference{openCases.length === 1 ? 's' : ''}{' '}
                      {companyLabel(affected)}:
                    </p>
                    <p className="mb-2 text-xs text-slate-500">
                      {openCases.slice(0, 6).map((c) => c.case_no).filter(Boolean).join(', ')}
                      {openCases.length > 6 ? '…' : ''}
                    </p>
                    <label className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={repointCases}
                        onChange={(e) => setRepointCases(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      Also re-point these open cases{' '}
                      {pending.type === 'set_primary'
                        ? `to ${companyLabel(pending.relationship)}`
                        : 'to the remaining primary company'}{' '}
                      (each change is logged on the case)
                    </label>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={resetPending} disabled={confirmMutation.isPending}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => confirmMutation.mutate()} disabled={confirmDisabled}>
                    {confirmMutation.isPending ? 'Applying…' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add a company */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Link a company</p>
          <div className="space-y-3">
            <SearchableSelect
              label="Company"
              value={addCompanyId}
              onChange={setAddCompanyId}
              options={addOptions}
              placeholder="Select a company…"
              emptyMessage="No unlinked companies found"
            />
            <Input
              label="Role (optional)"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              placeholder="e.g. IT Manager, Procurement"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={addAsPrimary || relationships.length === 0}
                  disabled={relationships.length === 0}
                  onChange={(e) => setAddAsPrimary(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-60"
                />
                Set as primary company
              </label>
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={!addCompanyId || addMutation.isPending}
              >
                {addMutation.isPending ? 'Linking…' : 'Link Company'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
