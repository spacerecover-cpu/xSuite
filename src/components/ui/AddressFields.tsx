import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listSubdivisions, type Subdivision } from '../../lib/geoSubdivisionService';
import { useLocaleConfig } from '../../contexts/TenantConfigContext';
import { FLOATING_LABEL_CLS } from './Input';

export interface AddressValue {
  address_line1: string;
  address_line2: string;
  subdivision_id: string | null;
  postal_code: string;
}

/** Structured address capture (line1/line2/subdivision/postal) shared by the
 *  party forms (customer/company/supplier). The subdivision select is
 *  data-driven off `geo_subdivisions` and hides itself entirely when the
 *  selected country has none seeded (e.g. no OM-style governorates). */
export function AddressFields({ value, onChange, countryId, disabled, floatingLabel = false }: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  countryId: string | null;
  disabled?: boolean;
  /** Opt-in: render labels as notches on each field's top border, matching
   *  the shared Input `floatingLabel` variant. */
  floatingLabel?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocaleConfig();
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!countryId) { setSubdivisions([]); return; }
    listSubdivisions(countryId)
      .then((rows) => { if (!cancelled) setSubdivisions(rows); })
      .catch(() => { if (!cancelled) setSubdivisions([]); });
    return () => { cancelled = true; };
  }, [countryId]);

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });
  const inputCls = `h-9 w-full rounded-md border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-ring${floatingLabel ? ' placeholder:text-xs' : ''}`;
  const labelCls = floatingLabel ? FLOATING_LABEL_CLS : 'mb-1 block text-sm font-medium';

  return (
    // Compact 2-col layout: line1 | line2 on one row, then subdivision | postal —
    // keeps the party-form modals within the viewport (no scrolling) per the
    // modal width/height standard in ui/Modal.tsx.
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${floatingLabel ? 'gap-4' : 'gap-3'}`}>
      <div className="relative">
        <label htmlFor="addr-line1" className={labelCls}>
          {t('ui.addressLine1', 'Address line 1')}
        </label>
        <input id="addr-line1" className={inputCls} disabled={disabled}
          placeholder={t('ui.addressLine1Placeholder', 'Street address, P.O. box, etc.')}
          value={value.address_line1} onChange={(e) => set({ address_line1: e.target.value })} />
      </div>
      <div className="relative">
        <label htmlFor="addr-line2" className={labelCls}>
          {t('ui.addressLine2', 'Address line 2')}
        </label>
        <input id="addr-line2" className={inputCls} disabled={disabled}
          placeholder={t('ui.addressLine2Placeholder', 'Apartment, suite, unit, floor, etc.')}
          value={value.address_line2} onChange={(e) => set({ address_line2: e.target.value })} />
      </div>
      {subdivisions.length > 0 && (
        <div className="relative">
          <label htmlFor="addr-subdivision" className={labelCls}>
            {t('ui.stateRegion', 'State / Region')}
          </label>
          <select id="addr-subdivision" className={inputCls} disabled={disabled}
            value={value.subdivision_id ?? ''}
            onChange={(e) => set({ subdivision_id: e.target.value || null })}>
            <option value="">{t('ui.selectStateRegion', 'Select state / region')}</option>
            {subdivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="relative">
        <label htmlFor="addr-postal" className={labelCls}>{locale.postalCodeLabel}</label>
        <input id="addr-postal" className={inputCls} disabled={disabled}
          value={value.postal_code} onChange={(e) => set({ postal_code: e.target.value })} />
      </div>
    </div>
  );
}
