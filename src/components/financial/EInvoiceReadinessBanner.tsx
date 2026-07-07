import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { getEInvoiceReadiness } from '../../lib/einvoiceReadinessService';
import { einvoiceReadinessKeys } from '../../lib/queryKeys';

/**
 * Loud IRN-readiness warning (Phase 4 D3): shown on invoice surfaces when the
 * tenant marked GST e-invoicing applicable. xSuite does not generate IRNs, so
 * the lab must register each B2B invoice on the IRP manually. Gated by the
 * regime.tax data key — never a country literal.
 */
export const EInvoiceReadinessBanner: React.FC = () => {
  const { config } = useTenantConfig();
  const inGst = config.regime.tax === 'in_gst';
  const { data } = useQuery({
    queryKey: einvoiceReadinessKeys.tenant(),
    queryFn: getEInvoiceReadiness,
    enabled: inGst,
  });
  if (!inGst || data?.applicable !== true) return null;
  return (
    <div role="alert" className="rounded-lg border border-warning/30 bg-warning-muted p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="flex-1">
          <h4 className="mb-1 text-sm font-semibold text-warning">
            E-invoicing (IRN) applies — manual IRP registration required
          </h4>
          <p className="text-sm text-warning">
            This business is marked as e-invoicing applicable, but xSuite does not yet generate
            IRNs. Register this invoice on the Invoice Registration Portal and affix the signed
            QR before delivering it to a registered (B2B) buyer — without an IRN it is not a
            valid tax invoice for an e-invoicing-mandated supplier.
          </p>
        </div>
      </div>
    </div>
  );
};
