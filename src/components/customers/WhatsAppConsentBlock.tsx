import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { whatsappKeys } from '../../lib/queryKeys';
import { getConsentState, summarizeConsent } from '../../lib/whatsappService';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { getOrCreateCompanySettings } from '../../lib/companySettingsService';

export interface ConsentDraft { utility: boolean; marketing: boolean; }

// Callers MUST build whatsapp_consents.consent_text from these same builders —
// the ledger must hold the exact string that was rendered to the customer.
export const utilityConsentLabel = (companyName: string) =>
  `Receive case & service updates from ${companyName} on WhatsApp`;
export const marketingConsentLabel = (companyName: string) =>
  `Receive feedback & review requests from ${companyName}`;

export function useCompanyName(): string {
  const { data } = useQuery({
    queryKey: ['company_settings', 'company_name'],
    queryFn: getOrCreateCompanySettings,
  });
  return data?.basic_info?.company_name || 'our lab';
}

interface Props {
  customerId?: string;              // absent during create — state is draft-only, written after save
  value: ConsentDraft;
  onChange: (v: ConsentDraft) => void;
}

interface RowProps {
  scope: keyof ConsentDraft;
  label: string;
  hint: string;
  value: ConsentDraft;
  current: ConsentDraft | null;
  onChange: (v: ConsentDraft) => void;
}

// Module scope on purpose: declaring this inside WhatsAppConsentBlock would give it a
// new component type on every render, remounting the checkbox inputs (and dropping
// focus) each time the customer form re-renders.
function Row({ scope, label, hint, value, current, onChange }: RowProps) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={value[scope]}
        onChange={(e) => onChange({ ...value, [scope]: e.target.checked })}
      />
      <span>
        <span className="text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
        {current && current[scope] && (
          <span className="text-xxs text-success">Already opted in</span>
        )}
      </span>
    </label>
  );
}

export function WhatsAppConsentBlock({ customerId, value, onChange }: Props) {
  const { config } = useTenantConfig();
  const companyName = useCompanyName();
  const { data: existing } = useQuery({
    queryKey: whatsappKeys.consents(customerId ?? 'new'),
    queryFn: () => getConsentState(config.tenantId, customerId!),
    enabled: Boolean(customerId && config.tenantId),
  });
  const current = existing ? summarizeConsent(existing) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp updates
      </div>
      <div className="space-y-2">
        <Row scope="utility" label={utilityConsentLabel(companyName)}
          hint="Status changes, quotes, invoices, collection reminders"
          value={value} current={current} onChange={onChange} />
        <Row scope="marketing" label={marketingConsentLabel(companyName)}
          hint="Occasional post-service messages; opt out any time by replying STOP"
          value={value} current={current} onChange={onChange} />
      </div>
    </div>
  );
}
