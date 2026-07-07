// src/pages/settings/TaxRegistrationSettings.tsx
// D6 surface: the tenant-visible GST registration status. SINGLE-registration
// UX (multi-state GSTIN manager is a named Phase-4 deferral). Registered =
// active legal_entity_tax_registrations row; Unregistered = explicit declared
// flag with a LOUD warning; neither = "action required" (the compute-path dev
// assertion fires until this page is answered). Semantic tokens only (DESIGN.md).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, AlertTriangle, ShieldCheck, ShieldOff } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';
import { useTaxConfig } from '../../contexts/TenantConfigContext';
import { settingsKeys } from '../../lib/queryKeys';
import { geoCountryService, type CountrySubdivision } from '../../lib/geoCountryService';
import { validateGSTIN } from '../../lib/regimes/in_gst/gstin';
import { gstinMatchesSubdivision } from '../../lib/regimes/in_gst/registrationStatus';
import { validateTaxNumber } from '../auth/onboarding/onboardingValidation';
import {
  getPrimaryLegalEntity, getActiveTaxRegistration, createTaxRegistration,
  endTaxRegistration, getDeclaredRegistrationStatus, setDeclaredRegistrationStatus,
  getBranchStateMismatches,
} from '../../lib/taxRegistrationService';

const today = () => new Date().toISOString().slice(0, 10);

export const TaxRegistrationSettings: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const tax = useTaxConfig();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [taxNumber, setTaxNumber] = useState('');
  const [subdivisionId, setSubdivisionId] = useState('');

  const { data: view, isLoading } = useQuery({
    queryKey: settingsKeys.taxRegistration(),
    queryFn: async () => {
      const [entity, registration, declared] = await Promise.all([
        getPrimaryLegalEntity(), getActiveTaxRegistration(today()), getDeclaredRegistrationStatus(),
      ]);
      return { entity, registration, declared };
    },
  });

  const { data: mismatches = [] } = useQuery({
    queryKey: settingsKeys.branchStateCheck(),
    queryFn: getBranchStateMismatches,
  });

  const { data: subdivisions = [] } = useQuery<CountrySubdivision[]>({
    queryKey: ['settings', 'tax-subdivisions', view?.entity?.country_id ?? ''],
    queryFn: () => geoCountryService.listCountrySubdivisions(view!.entity!.country_id),
    enabled: !!view?.entity?.country_id,
  });

  const status: 'registered' | 'unregistered' | 'unset' =
    view?.registration ? 'registered' : view?.declared === 'unregistered' ? 'unregistered' : 'unset';

  const selected = subdivisions.find((s) => s.id === subdivisionId) ?? null;
  // Regime gate (DATA key, never a country literal): GST-coded subdivisions carry
  // a tax_authority_code. Only India-style GST tenants get the GSTIN checksum +
  // state cross-check; VAT/TRN/other regimes validate with the soft country regex,
  // so a valid non-GSTIN number is not blocked from saving.
  const hasGstSubdivisions = subdivisions.some((s) => s.tax_authority_code);
  const trimmed = taxNumber.trim().toUpperCase();
  let formError: string | null = null;
  if (trimmed.length > 0) {
    if (hasGstSubdivisions) {
      const check = validateGSTIN(trimmed);
      if (!check.ok) formError = check.error ?? `Invalid ${tax.numberLabel}`;
      else if (selected && !gstinMatchesSubdivision(trimmed, selected.tax_authority_code)) {
        formError = `This ${tax.numberLabel} does not match the selected state (expected state code ${selected.tax_authority_code}).`;
      }
    } else {
      const soft = validateTaxNumber(tax.numberFormat, trimmed);
      if (!soft.ok) formError = soft.message ?? `Invalid ${tax.numberLabel}`;
    }
  }
  const canSave = trimmed.length > 0 && !formError && (subdivisions.length === 0 || !!subdivisionId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: settingsKeys.taxRegistration() });
    queryClient.invalidateQueries({ queryKey: settingsKeys.branchStateCheck() });
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!view?.entity) throw new Error('No primary legal entity configured for this workspace.');
      if (view.registration) await endTaxRegistration(view.registration.id, today());
      await createTaxRegistration({
        legal_entity_id: view.entity.id,
        country_id: view.entity.country_id,
        subdivision_id: subdivisionId || null,
        tax_number: trimmed,
        registered_from: today(),
      });
      await setDeclaredRegistrationStatus('registered');
    },
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setTaxNumber('');
      setSubdivisionId('');
      toast.success(`${tax.numberLabel} registration saved`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save registration'),
  });

  const unregisterMutation = useMutation({
    mutationFn: async () => {
      // End the registration YESTERDAY (clamped so it never precedes
      // registered_from) so the inclusive `registered_to >= today` active-filter
      // excludes it immediately and status resolves to 'unregistered' the SAME
      // day — matching the success toast and rendering the loud banner. The >=
      // filter is a deliberate convention shared with tax-rate validity; we do
      // NOT change it, and we do NOT let the declared flag override an active row
      // (D6: evidence beats declaration).
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (view?.registration) {
        const endDate =
          view.registration.registered_from > yesterday ? view.registration.registered_from : yesterday;
        await endTaxRegistration(view.registration.id, endDate);
      }
      await setDeclaredRegistrationStatus('unregistered');
    },
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      toast.success(`Workspace marked as not ${tax.label} registered`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update status'),
  });

  const subdivisionName = (id: string | null) =>
    subdivisions.find((s) => s.id === id)?.name ?? '—';

  const selectClasses =
    'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

  if (isLoading) return <div className="min-h-screen p-6"><SettingsPageHeader categoryId="tax-registration" /></div>;

  return (
    <div className="min-h-screen p-6">
      <SettingsPageHeader categoryId="tax-registration" />
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Back to settings"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {mismatches.length > 0 && (
        <div role="status" className="mb-6 rounded-xl border border-warning/40 bg-warning-muted p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Branch state does not match this {tax.numberLabel}
              </p>
              <p className="text-sm text-slate-700 mt-1">
                {mismatches.map((m) => m.branchName).join(', ')}{' '}
                {mismatches.length === 1 ? 'is' : 'are'} in a different state than your registration
                ({subdivisionName(view?.registration?.subdivision_id ?? null)}). A branch operating in
                another state legally needs its own {tax.numberLabel}. Multi-state GSTIN management is
                not yet available — until it ships, do not issue {tax.label} documents from those branches
                under this registration.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'unset' && (
        <div role="alert" className="mb-6 rounded-xl border border-danger/40 bg-danger-muted p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Your {tax.label} registration status is not set
              </p>
              <p className="text-sm text-slate-700 mt-1">
                Documents cannot be taxed correctly until you choose one of the options below.
                This is required — the platform never assumes a registration status silently.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'unregistered' && (
        <div role="alert" className="mb-6 rounded-xl border border-danger/40 bg-danger-muted p-4">
          <div className="flex items-start gap-3">
            <ShieldOff className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Not {tax.label} registered
              </p>
              <p className="text-sm text-slate-700 mt-1">
                This workspace issues documents WITHOUT {tax.label} — plain invoices, no tax lines,
                no {tax.numberLabel} band. If your lab is actually registered, add your {tax.numberLabel} now:
                issuing untaxed invoices while registered is a compliance violation.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'registered' && view?.registration && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-success" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-success">Registered</p>
                <p className="font-mono text-lg font-semibold text-slate-900">{view.registration.tax_number}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {subdivisionName(view.registration.subdivision_id)} · effective from {view.registration.registered_from}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
              Change {tax.numberLabel}
            </Button>
          </div>
        </div>
      )}

      {(status !== 'registered' || formOpen) && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4 max-w-xl">
          <h2 className="text-lg font-semibold text-slate-900">
            {status === 'registered' ? `Update ${tax.numberLabel}` : `Set your ${tax.label} registration status`}
          </h2>

          {subdivisions.length > 0 && (
            <div>
              <label htmlFor="tax-reg-subdivision" className="block text-sm font-medium text-slate-700 mb-1">
                State / Union Territory <span className="text-danger">*</span>
              </label>
              <select
                id="tax-reg-subdivision"
                value={subdivisionId}
                onChange={(e) => setSubdivisionId(e.target.value)}
                className={selectClasses}
              >
                <option value="">Select a state…</option>
                {subdivisions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.tax_authority_code ? ` (${s.tax_authority_code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="tax-reg-number" className="block text-sm font-medium text-slate-700 mb-1">
              {tax.numberLabel} <span className="text-danger">*</span>
            </label>
            <input
              id="tax-reg-number"
              type="text"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder={tax.numberPlaceholder ?? ''}
              className={selectClasses}
              aria-invalid={!!formError}
              aria-describedby={formError ? 'tax-reg-number-error' : undefined}
            />
            {formError && <p id="tax-reg-number-error" role="alert" className="text-xs text-danger mt-1">{formError}</p>}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              onClick={() => registerMutation.mutate()}
              disabled={!canSave}
              isLoading={registerMutation.isPending}
            >
              Save as registered
            </Button>
            {status !== 'unregistered' && (
              <Button
                variant="danger"
                onClick={() => unregisterMutation.mutate()}
                isLoading={unregisterMutation.isPending}
              >
                We are not {tax.label} registered
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Marking the workspace as unregistered ends the current registration and issues all
            future documents without {tax.label}. One registration per workspace — multi-state
            registrations are coming later.
          </p>
        </div>
      )}
    </div>
  );
};
