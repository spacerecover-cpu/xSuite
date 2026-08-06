import { useId } from 'react';
import { Input, NO_AUTOFILL } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { requireDepositorId, type DepositorRelationship } from '../../../lib/caseIntakeService';

export interface DepositorValue {
  name: string;
  mobile: string;
  nationalId: string;
  relationship: DepositorRelationship;
}

interface DepositorSectionProps {
  value: DepositorValue;
  customerName: string;
  onChange: (next: DepositorValue) => void;
}

const RELATIONSHIPS: { value: DepositorRelationship; label: string }[] = [
  { value: 'self', label: 'The customer themselves' },
  { value: 'authorized_agent', label: 'Authorized agent' },
  { value: 'company_rep', label: 'Company representative' },
  { value: 'courier', label: 'Courier' },
];

/**
 * Who physically handed the devices over. Crossing the `self` boundary in
 * either direction resets the identity fields, so neither a stale customer
 * prefill nor a courier's own contact details can end up printed on the
 * receipt as the other party. Relabelling between two non-self relationships
 * keeps what staff typed at the counter. Non-self also makes National ID
 * required — mirroring the log_case_intake gate.
 */
export function DepositorSection({ value, customerName, onChange }: DepositorSectionProps) {
  const headingId = useId();
  const idRequired = requireDepositorId(value.relationship);

  function handleRelationship(relationship: DepositorRelationship) {
    if (relationship === 'self') {
      onChange({ relationship, name: customerName, mobile: '', nationalId: '' });
      return;
    }
    if (value.relationship === 'self') {
      onChange({ relationship, name: '', mobile: '', nationalId: '' });
      return;
    }
    onChange({ ...value, relationship });
  }

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <div>
        <h2 id={headingId} className="text-base font-semibold text-slate-900">
          Who is handing the devices over?
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Recorded on the check-in receipt as proof of handover.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          floatingLabel
          label="Relationship"
          options={RELATIONSHIPS}
          value={value.relationship}
          onChange={(e) => handleRelationship(e.target.value as DepositorRelationship)}
        />

        <Input
          {...NO_AUTOFILL}
          floatingLabel
          label="Full name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          required
        />

        <Input
          {...NO_AUTOFILL}
          floatingLabel
          label="Mobile"
          type="tel"
          inputMode="tel"
          value={value.mobile}
          onChange={(e) => onChange({ ...value, mobile: e.target.value })}
        />

        {idRequired && (
          <Input
            {...NO_AUTOFILL}
            floatingLabel
            label="National ID"
            hint="Passport or national ID of the person handing the devices over."
            value={value.nationalId}
            onChange={(e) => onChange({ ...value, nationalId: e.target.value })}
            required
          />
        )}
      </div>
    </section>
  );
}
