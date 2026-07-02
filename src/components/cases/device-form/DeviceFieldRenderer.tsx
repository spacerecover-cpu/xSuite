import { useTranslation } from 'react-i18next';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { MultiSelectDropdown } from '../../ui/MultiSelectDropdown';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import type { DeviceFieldDef } from '../../../lib/devices/deviceFieldConfig';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

interface Props {
  def: DeviceFieldDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  options: CatalogOption[];
  error?: string;
}

export function DeviceFieldRenderer({ def, value, onChange, options, error }: Props) {
  const { t } = useTranslation();
  const label = t(def.labelKey, { defaultValue: def.labelFallback });
  const str = typeof value === 'string' ? value : value == null ? '' : String(value);

  switch (def.control) {
    case 'select':
    case 'component-status': {
      const baseOpts = def.staticOptions ?? options;
      // Optional attribute fields get an explicit "Not specified" sentinel so a
      // value can be cleared by selection — no in-field clear (×) affordance.
      const opts = def.required
        ? baseOpts
        : [{ id: '', name: t('ui.select.notSpecified', { defaultValue: 'Not specified' }) }, ...baseOpts];
      return (
        <SearchableSelect
          label={label} value={str} onChange={(v) => onChange(def.key, v)}
          options={opts} required={def.required} error={error}
          placeholder={t('ui.select.placeholder', { defaultValue: 'Select...' })}
          size="sm" usePortal
        />
      );
    }
    case 'multiselect':
      return (
        <MultiSelectDropdown
          label={label} value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(ids) => onChange(def.key, ids)} options={options}
          required={def.required} error={error} size="sm" usePortal
        />
      );
    case 'textarea':
      return (
        <Textarea label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} rows={3} size="sm" />
      );
    case 'number':
      return (
        <Input type="number" label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} size="sm" />
      );
    case 'date':
      return (
        <Input type="date" label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} size="sm" />
      );
    case 'json':
      // Opaque object fields (e.g. component_meta) are managed by bespoke forms;
      // the generic renderer has no control for them.
      return null;
    case 'text':
    default:
      return (
        <Input type="text" label={label} value={str} required={def.required} error={error}
          onChange={(e) => onChange(def.key, e.target.value)} size="sm" />
      );
  }
}
