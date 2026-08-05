import { useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, PenLine } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { SignatureCaptureModal } from '../SignatureCaptureModal';
import type { CapturedSignature } from '../SignatureCaptureModal';
import { useCompanyName, utilityConsentLabel } from '../../customers/WhatsAppConsentBlock';

/** Receipt/signature attestation only — never the WhatsApp consent text. */
export const INTAKE_CONSENT_TEXT =
  'I confirm that I am the owner or authorized representative of the device(s) listed on this receipt and authorize the lab to proceed with the service.';

/**
 * The exact WhatsApp opt-in sentence rendered to the customer. `whatsapp_consents`
 * is append-only, so the caller writing the ledger row MUST take its `consent_text`
 * from this same hook — a ledger row quoting a statement the customer never saw
 * cannot be corrected later.
 */
export function useIntakeWhatsAppConsentText(): string {
  return utilityConsentLabel(useCompanyName());
}

export interface AcknowledgeValue {
  termsAccepted: boolean;
  whatsappUtility: boolean;
  destructiveAuthorized: boolean;
  signature: CapturedSignature | null;
}

type ConsentKey = keyof Omit<AcknowledgeValue, 'signature'>;

interface AcknowledgeSectionProps {
  value: AcknowledgeValue;
  onChange: (next: AcknowledgeValue) => void;
}

/**
 * Three INDEPENDENT consents plus the signature. They are never bundled into a
 * single "I agree": bundling is what makes each consent individually unprovable.
 * Only the service-authorization consent blocks completion, and capturing a
 * signature stays optional so a lab with no tablet can print and wet-sign.
 */
export function AcknowledgeSection({ value, onChange }: AcknowledgeSectionProps) {
  const headingId = useId();
  const [signing, setSigning] = useState(false);
  const [signatureCleared, setSignatureCleared] = useState(false);
  const whatsappConsentText = useIntakeWhatsAppConsentText();

  const consents: { key: ConsentKey; label: string; hint: string }[] = [
    {
      key: 'termsAccepted',
      label: 'I accept the terms of service and authorize the lab to proceed.',
      hint: 'Required — this is what the signed receipt records.',
    },
    {
      key: 'whatsappUtility',
      label: whatsappConsentText,
      hint: 'Optional — declining does not affect the service. Reply STOP any time to opt out.',
    },
    {
      key: 'destructiveAuthorized',
      label: 'I authorize recovery attempts that may permanently alter the media.',
      hint: 'Optional — can also be authorized later, before those attempts begin.',
    },
  ];

  // A signature attests to the terms; withdrawing the terms voids it.
  function setConsent(key: ConsentKey, checked: boolean) {
    if (key === 'termsAccepted' && !checked && value.signature) {
      setSignatureCleared(true);
      onChange({ ...value, termsAccepted: false, signature: null });
      return;
    }
    if (key === 'termsAccepted' && checked) setSignatureCleared(false);
    onChange({ ...value, [key]: checked });
  }

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <div>
        <h2 id={headingId} className="text-base font-semibold text-slate-900">
          Acknowledge &amp; sign
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Hand the tablet to the customer for this step.
        </p>
      </div>

      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-slate-700">
        {INTAKE_CONSENT_TEXT}
      </p>

      <div className="space-y-3">
        {consents.map(({ key, label, hint }) => (
          <div
            key={key}
            className={`rounded-lg border p-3 transition-colors ${
              value[key] ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface'
            }`}
          >
            <Checkbox
              label={label}
              hint={hint}
              checked={value[key]}
              onChange={(e) => setConsent(key, e.target.checked)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!value.termsAccepted} onClick={() => setSigning(true)}>
          <PenLine aria-hidden="true" className="me-2 h-4 w-4" />
          Capture signature
        </Button>
        {value.signature ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            Signature captured
          </span>
        ) : signatureCleared ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warning">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            Signature cleared — it attested to the terms that were just declined.
          </span>
        ) : (
          <p className="text-sm text-slate-500">
            {value.termsAccepted
              ? 'Optional — the receipt can also be printed and signed in wet ink.'
              : 'Accept the terms above to capture a signature.'}
          </p>
        )}
      </div>

      <SignatureCaptureModal
        open={signing}
        onClose={() => setSigning(false)}
        title="Customer signature"
        allowedMethods={['drawn', 'typed', 'click_to_accept']}
        onCapture={(sig) => {
          setSignatureCleared(false);
          onChange({ ...value, signature: sig });
        }}
      />
    </section>
  );
}
