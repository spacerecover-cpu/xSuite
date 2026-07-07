import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useToast } from '../../hooks/useToast';
import { Checkbox } from '../ui/Checkbox';
import { getEInvoiceReadiness, setEInvoiceApplicable } from '../../lib/einvoiceReadinessService';
import { einvoiceReadinessKeys } from '../../lib/queryKeys';

/**
 * GST e-invoicing (IRN) applicability — IRN-READINESS ONLY (Phase 4 D3).
 * xSuite does not generate IRNs; this flag drives the loud invoice-surface
 * warning and the reserved IRN QR caption on the printed invoice. Gated by the
 * regime.tax data key (in_gst), never a country-code literal.
 */
export const EInvoiceReadinessCard: React.FC = () => {
  const { config } = useTenantConfig();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const inGst = config.regime.tax === 'in_gst';

  const { data } = useQuery({
    queryKey: einvoiceReadinessKeys.tenant(),
    queryFn: getEInvoiceReadiness,
    enabled: inGst,
  });

  if (!inGst) return null;
  const applicable = data?.applicable === true;

  const onToggle = async (next: boolean) => {
    setIsSaving(true);
    try {
      await setEInvoiceApplicable(next);
      await queryClient.invalidateQueries({ queryKey: einvoiceReadinessKeys.all });
      toast.success(
        next
          ? 'E-invoicing marked applicable — invoice surfaces will warn about manual IRP registration'
          : 'E-invoicing marked not applicable',
      );
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save e-invoicing applicability');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">GST e-Invoicing (IRN)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Businesses above the government-notified aggregate-turnover threshold must register
        B2B invoices on the Invoice Registration Portal (IRP) and print the signed IRN QR code.
      </p>
      <div className="mt-5">
        <Checkbox
          label="E-invoicing is applicable to this business"
          hint="Set this once your aggregate annual turnover crosses the notified e-invoicing threshold. Confirm the current threshold with your CA."
          checked={applicable}
          disabled={isSaving}
          onChange={(e) => void onToggle(e.target.checked)}
        />
      </div>
      {applicable && (
        <div role="alert" className="mt-4 rounded-lg border border-warning/30 bg-warning-muted p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm text-warning">
              xSuite does not yet generate IRNs. Every B2B tax invoice must be registered on the
              IRP manually (portal or offline utility) and the signed QR affixed before the
              invoice is delivered to the buyer. Space for the IRN QR is reserved on the printed
              invoice.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
