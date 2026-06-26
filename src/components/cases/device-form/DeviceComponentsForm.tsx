// src/components/cases/device-form/DeviceComponentsForm.tsx
import { useTranslation } from 'react-i18next';
import { DeviceFieldRenderer } from './DeviceFieldRenderer';
import { getDeviceFamilyConfig } from '../../../lib/devices/deviceFieldConfig';
import { resolveDeviceFamily } from '../../../lib/devices/deviceFamily';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

interface Props {
  state: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options: Record<string, CatalogOption[]>;
  errors?: Record<string, string>;
}

export function DeviceComponentsForm({ state, onChange, options, errors }: Props) {
  const { t } = useTranslation();
  const typeName = options.device_types?.find(o => o.id === state.device_type_id)?.name ?? '';
  const family = resolveDeviceFamily(typeName);
  const cfg = getDeviceFamilyConfig(family);

  if (cfg.components.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {t('devices.section.noComponents', { defaultValue: 'No component checks for this device type.' })}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
      {cfg.components.map(def => (
        <div
          key={def.key}
          className={
            def.colSpan === 3 ? 'lg:col-span-3' :
            def.colSpan === 2 ? 'lg:col-span-2' :
            undefined
          }
        >
          <DeviceFieldRenderer
            def={def}
            value={state[def.key]}
            onChange={onChange}
            options={def.optionsSource ? (options[def.optionsSource] ?? []) : []}
            error={errors?.[def.key]}
          />
        </div>
      ))}
    </div>
  );
}
