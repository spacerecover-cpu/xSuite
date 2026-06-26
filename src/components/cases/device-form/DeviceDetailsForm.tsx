// src/components/cases/device-form/DeviceDetailsForm.tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceFieldRenderer } from './DeviceFieldRenderer';
import { BASIC_FIELDS, getDeviceFamilyConfig, type DeviceFieldDef } from '../../../lib/devices/deviceFieldConfig';
import { resolveDeviceFamily } from '../../../lib/devices/deviceFamily';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

interface Props {
  state: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options: Record<string, CatalogOption[]>;
  errors?: Record<string, string>;
  extraFooter?: ReactNode;
}

const SECTION_HEADING = 'text-sm font-bold uppercase tracking-[0.04em] text-primary';
const FIELD_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3';

export function DeviceDetailsForm({ state, onChange, options, errors, extraFooter }: Props) {
  const { t } = useTranslation();
  const typeName = options.device_types?.find(o => o.id === state.device_type_id)?.name ?? '';
  const family = resolveDeviceFamily(typeName);
  const cfg = getDeviceFamilyConfig(family);

  const renderField = (def: DeviceFieldDef) => (
    <div key={def.key} className={def.colSpan === 2 ? 'lg:col-span-2' : undefined}>
      <DeviceFieldRenderer
        def={def}
        value={state[def.key]}
        onChange={onChange}
        options={def.optionsSource ? (options[def.optionsSource] ?? []) : []}
        error={errors?.[def.key]}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className={SECTION_HEADING}>
          {t('devices.section.basic', { defaultValue: 'Basic Information' })}
        </h3>
        <div className={FIELD_GRID}>
          {BASIC_FIELDS.map(renderField)}
        </div>
      </section>

      {cfg.technical.length > 0 && (
        <section className="space-y-3 border-t border-border pt-5">
          <h3 className={SECTION_HEADING}>
            {t('devices.section.technical', { defaultValue: 'Technical Information' })}
          </h3>
          <div className={FIELD_GRID}>
            {cfg.technical.map(renderField)}
          </div>
        </section>
      )}

      {extraFooter}
    </div>
  );
}
