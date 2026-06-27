import React from 'react';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { FieldGroup, NumberField, SegmentedControl, ToggleRow } from '../controls';
import { resolveSecondary, type OrganizationConfig } from '../../../../lib/pdf/templateConfig';
import { isRTLLanguage } from '../../../../lib/documentTranslations';
import { languageName } from '../languageOptions';
import type { StudioApi } from '../TemplateStudio';

type ShowKey = keyof NonNullable<OrganizationConfig['show']>;
/** Identity rows that are always offered (single-language). */
const BASE_SHOW_ROWS: { key: ShowKey; label: string }[] = [
  { key: 'logo', label: 'Logo' },
  { key: 'legalName', label: 'Legal name' },
  { key: 'name', label: 'Trading name' },
  { key: 'address', label: 'Address' },
  { key: 'taxId', label: 'Tax / VAT number' },
];
/** The secondary-language identity rows — offered only when a secondary language
 *  is selected. The `legalNameAr` / `nameAr` slots store the SECONDARY-language
 *  org name (legacy field names; their semantics generalize to any secondary). */
const SECONDARY_SHOW_ROWS: { key: ShowKey; suffix: 'Legal name' | 'Trading name' }[] = [
  { key: 'legalNameAr', suffix: 'Legal name' },
  { key: 'nameAr', suffix: 'Trading name' },
];

const SHOW_DEFAULT: Record<ShowKey, boolean> = {
  logo: true, legalName: true, legalNameAr: false, name: false, nameAr: false, address: true, taxId: true,
};

export const TransactionTab: React.FC<{ api: StudioApi }> = ({ api }) => {
  const org = api.resolved.organization;
  const show = org?.show;
  const manual = org?.source === 'manual';
  const taxBar = api.resolved.taxBar;
  const language = api.resolved.language;
  const secondary = language.mode === 'en' ? null : resolveSecondary(language);
  const secondaryName = languageName(secondary);
  const secondaryRTL = secondary ? isRTLLanguage(secondary) : false;

  return (
    <div className="space-y-7">
      <FieldGroup title="Organization details" description="Control which identity lines print in the letterhead.">
        <SegmentedControl<'company_info' | 'manual'>
          label="Source"
          value={org?.source ?? 'company_info'}
          onChange={(v) => api.setOrganization({ source: v })}
          options={[
            { value: 'company_info', label: 'From settings' },
            { value: 'manual', label: 'Manual' },
          ]}
          columns={2}
        />
        <div className="space-y-2">
          {BASE_SHOW_ROWS.map(({ key, label }) => (
            <ToggleRow
              key={key}
              label={label}
              checked={show?.[key] ?? SHOW_DEFAULT[key]}
              onChange={(v) => api.setOrgShow(key, v)}
            />
          ))}
          {secondary &&
            SECONDARY_SHOW_ROWS.map(({ key, suffix }) => (
              <ToggleRow
                key={key}
                label={`${suffix} (${secondaryName})`}
                checked={show?.[key] ?? SHOW_DEFAULT[key]}
                onChange={(v) => api.setOrgShow(key, v)}
              />
            ))}
        </div>
        <NumberField
          label="Address font size"
          suffix="pt"
          value={org?.addressFontSize ?? 8}
          min={5}
          max={14}
          onChange={(v) => api.setOrganization({ addressFontSize: v })}
        />
      </FieldGroup>

      {manual && (
        <FieldGroup title="Manual identity" description="Override the letterhead identity for this document.">
          <Input label="Legal name" value={org?.manual?.legalName ?? ''} onChange={(e) => api.setOrgManual('legalName', e.target.value)} />
          {secondary && (
            <Input
              label={`Legal name (${secondaryName})`}
              dir={secondaryRTL ? 'rtl' : undefined}
              value={org?.manual?.legalNameAr ?? ''}
              onChange={(e) => api.setOrgManual('legalNameAr', e.target.value)}
            />
          )}
          <Input label="Trading name" value={org?.manual?.name ?? ''} onChange={(e) => api.setOrgManual('name', e.target.value)} />
          {secondary && (
            <Input
              label={`Trading name (${secondaryName})`}
              dir={secondaryRTL ? 'rtl' : undefined}
              value={org?.manual?.nameAr ?? ''}
              onChange={(e) => api.setOrgManual('nameAr', e.target.value)}
            />
          )}
          <Input label="Address" value={org?.manual?.address ?? ''} onChange={(e) => api.setOrgManual('address', e.target.value)} />
          <Input label="Tax / VAT number" value={org?.manual?.taxId ?? ''} onChange={(e) => api.setOrgManual('taxId', e.target.value)} />
        </FieldGroup>
      )}

      <FieldGroup title="VAT / GST identification bar" description="A full-width tax-registration band above the items (GCC compliant).">
        <ToggleRow
          label="Show identification bar"
          checked={taxBar?.enabled ?? false}
          onChange={(v) => {
            api.setTaxBar({ enabled: v });
            api.patchSection('taxBar', { visible: v });
          }}
        />
        {taxBar?.enabled && (
          <>
            <Input
              label="Bar label"
              value={taxBar?.label?.en ?? ''}
              placeholder="e.g. VAT Reg. No."
              onChange={(e) => api.setTaxBar({ label: { ...taxBar?.label, en: e.target.value } })}
            />
            <Select
              label="Number source"
              value={taxBar?.source ?? 'company_info'}
              onChange={(e) => api.setTaxBar({ source: e.target.value as 'company_info' | 'manual' })}
              options={[
                { value: 'company_info', label: 'From settings' },
                { value: 'manual', label: 'Manual value' },
              ]}
            />
            {taxBar?.source === 'manual' && (
              <Input label="Registration number" value={taxBar?.value ?? ''} onChange={(e) => api.setTaxBar({ value: e.target.value })} />
            )}
          </>
        )}
      </FieldGroup>
    </div>
  );
};
