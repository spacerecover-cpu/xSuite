import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input, NO_AUTOFILL } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';

export interface CatalogOption { id: string; name: string }

export interface IntakeDeviceValue {
  key: string;
  device_type_id: string | null;
  brand_id: string | null;
  model: string;
  serial_number: string;
  capacity_id: string | null;
  condition_id: string | null;
  notes: string;
}

export function emptyDevice(key: string): IntakeDeviceValue {
  return {
    key,
    device_type_id: null, brand_id: null, model: '', serial_number: '',
    capacity_id: null, condition_id: null, notes: '',
  };
}

/**
 * Every device must have a recorded condition — the lab's only defense against
 * a later "it arrived damaged" claim. The parent disables submit on false.
 */
export function devicesAreComplete(devices: IntakeDeviceValue[]): boolean {
  return devices.length > 0 && devices.every((d) => d.condition_id !== null);
}

function toOptions(options: CatalogOption[]) {
  return [{ value: '', label: 'Select…' }, ...options.map((o) => ({ value: o.id, label: o.name }))];
}

interface IntakeDeviceRowsProps {
  value: IntakeDeviceValue[];
  deviceTypes: CatalogOption[];
  brands: CatalogOption[];
  capacities: CatalogOption[];
  conditions: CatalogOption[];
  onChange: (next: IntakeDeviceValue[]) => void;
}

export function IntakeDeviceRows({
  value, deviceTypes, brands, capacities, conditions, onChange,
}: IntakeDeviceRowsProps) {
  const headingId = useId();
  const keySeed = useId();

  function update(key: string, patch: Partial<IntakeDeviceValue>) {
    onChange(value.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <div>
        <h2 id={headingId} className="text-base font-semibold text-slate-900">
          Devices received
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Each device is tracked individually. Condition is required — it is what the
          receipt records the device arrived in.
        </p>
      </div>

      {value.map((d, i) => (
        <div key={d.key} className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Device {i + 1}</span>
            {value.length > 1 && (
              <button
                type="button"
                aria-label={`Remove device ${i + 1}`}
                onClick={() => onChange(value.filter((x) => x.key !== d.key))}
                className="rounded p-1.5 text-slate-400 transition-colors hover:bg-surface-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              floatingLabel
              label="Device type"
              options={toOptions(deviceTypes)}
              value={d.device_type_id ?? ''}
              onChange={(e) => update(d.key, { device_type_id: e.target.value || null })}
            />
            <Select
              floatingLabel
              label="Brand"
              options={toOptions(brands)}
              value={d.brand_id ?? ''}
              onChange={(e) => update(d.key, { brand_id: e.target.value || null })}
            />
            <Input
              {...NO_AUTOFILL}
              floatingLabel
              label="Model"
              value={d.model}
              onChange={(e) => update(d.key, { model: e.target.value })}
            />
            <Input
              {...NO_AUTOFILL}
              floatingLabel
              label="Serial number"
              value={d.serial_number}
              onChange={(e) => update(d.key, { serial_number: e.target.value })}
            />
            <Select
              floatingLabel
              label="Capacity"
              options={toOptions(capacities)}
              value={d.capacity_id ?? ''}
              onChange={(e) => update(d.key, { capacity_id: e.target.value || null })}
            />
            <Select
              floatingLabel
              required
              label="Condition"
              options={toOptions(conditions)}
              value={d.condition_id ?? ''}
              onChange={(e) => update(d.key, { condition_id: e.target.value || null })}
            />
          </div>

          <Textarea
            floatingLabel
            rows={2}
            label="Visible damage / notes"
            hint="Describe what you can see at the counter — scratches, dents, missing screws."
            value={d.notes}
            onChange={(e) => update(d.key, { notes: e.target.value })}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...value, emptyDevice(`${keySeed}-${value.length}-${Date.now()}`)])}
      >
        <Plus aria-hidden="true" className="me-1.5 h-4 w-4" /> Add device
      </Button>
    </section>
  );
}
