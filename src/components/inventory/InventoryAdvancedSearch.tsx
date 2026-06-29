import { useState, useEffect, useId } from 'react';
import { ChevronDown, ChevronUp, Search, Save, Star, Trash2, ScanBarcode, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { logger } from '../../lib/logger';
import {
  getInventorySearchTemplates,
  saveInventorySearchTemplate,
  deleteInventorySearchTemplate,
  touchInventorySearchTemplate,
  type InventorySearchTemplate,
  type InventorySpecFilters,
} from '../../lib/inventoryService';

export interface AdvancedSearchValues extends InventorySpecFilters {
  search?: string;
  category_id?: string;
  status_id?: string;
  location_id?: string;
}

interface Props {
  values: AdvancedSearchValues;
  onChange: (values: AdvancedSearchValues) => void;
  deviceTypes: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
}

function hasAdvancedValues(v: AdvancedSearchValues): boolean {
  const advancedKeys: (keyof AdvancedSearchValues)[] = [
    'device_type_id', 'pcb_number', 'firmware', 'controller',
    'head_map', 'dcm', 'chipset', 'barcode', 'serial_number', 'location_id',
  ];
  return advancedKeys.some(k => Boolean(v[k]));
}

function countActiveAdvanced(v: AdvancedSearchValues): number {
  return [
    v.device_type_id, v.pcb_number, v.firmware, v.controller,
    v.head_map, v.dcm, v.chipset, v.barcode, v.serial_number, v.location_id,
  ].filter(Boolean).length;
}

export function InventoryAdvancedSearch({ values, onChange, deviceTypes, locations }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<InventorySearchTemplate[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const saveNameId = useId();

  const activeCount = countActiveAdvanced(values);

  useEffect(() => {
    if (open) loadTemplates();
  }, [open]);

  const loadTemplates = async () => {
    const data = await getInventorySearchTemplates();
    setTemplates(data);
  };

  const handleField = (key: keyof AdvancedSearchValues, value: string) => {
    onChange({ ...values, [key]: value || undefined });
  };

  const handleClearAdvanced = () => {
    onChange({
      ...values,
      device_type_id: undefined,
      pcb_number: undefined,
      firmware: undefined,
      controller: undefined,
      head_map: undefined,
      dcm: undefined,
      chipset: undefined,
      barcode: undefined,
      serial_number: undefined,
      location_id: undefined,
    });
  };

  const handleLoadTemplate = async (template: InventorySearchTemplate) => {
    const raw = template.criteria as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return;

    const loaded: AdvancedSearchValues = {
      ...values,
      device_type_id: typeof raw.device_type_id === 'string' ? raw.device_type_id : undefined,
      pcb_number: typeof raw.pcb_number === 'string' ? raw.pcb_number : undefined,
      firmware: typeof raw.firmware === 'string' ? raw.firmware : undefined,
      controller: typeof raw.controller === 'string' ? raw.controller : undefined,
      head_map: typeof raw.head_map === 'string' ? raw.head_map : undefined,
      dcm: typeof raw.dcm === 'string' ? raw.dcm : undefined,
      chipset: typeof raw.chipset === 'string' ? raw.chipset : undefined,
      barcode: typeof raw.barcode === 'string' ? raw.barcode : undefined,
      serial_number: typeof raw.serial_number === 'string' ? raw.serial_number : undefined,
      location_id: typeof raw.location_id === 'string' ? raw.location_id : undefined,
    };
    onChange(loaded);
    await touchInventorySearchTemplate(template.id);
    await loadTemplates();
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteInventorySearchTemplate(id);
      await loadTemplates();
    } catch (err) {
      logger.error('Error deleting search template:', err);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const criteria: AdvancedSearchValues = {
        device_type_id: values.device_type_id,
        pcb_number: values.pcb_number,
        firmware: values.firmware,
        controller: values.controller,
        head_map: values.head_map,
        dcm: values.dcm,
        chipset: values.chipset,
        barcode: values.barcode,
        serial_number: values.serial_number,
        location_id: values.location_id,
      };
      await saveInventorySearchTemplate(saveName.trim(), criteria);
      setShowSave(false);
      setSaveName('');
      await loadTemplates();
    } catch (err) {
      logger.error('Error saving search template:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="advanced-search-panel"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none"
      >
        <Search className="w-4 h-4" />
        Advanced Search
        {activeCount > 0 && (
          <span
            aria-label={`${activeCount} advanced filters active`}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold"
          >
            {activeCount}
          </span>
        )}
        {open ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
      </button>

      {open && (
        <div
          id="advanced-search-panel"
          className="mt-3 border border-slate-200 rounded-xl bg-slate-50 overflow-hidden"
        >
          {templates.length > 0 && (
            <div className="px-4 pt-4 pb-3 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Saved Searches
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate(t)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white border border-slate-200 hover:border-primary/50 hover:bg-primary/5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring outline-none"
                    >
                      {t.name}
                      {t.usage_count > 0 && (
                        <span className="text-slate-400">·{t.usage_count}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTemplate(t.id, e)}
                      aria-label={`Delete saved search "${t.name}"`}
                      className="p-0.5 text-slate-300 hover:text-danger transition-colors focus-visible:ring-2 focus-visible:ring-ring outline-none rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label htmlFor="adv-device-type" className="block text-xs font-medium text-slate-600 mb-1">
                Device Type
              </label>
              <select
                id="adv-device-type"
                value={values.device_type_id ?? ''}
                onChange={e => handleField('device_type_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white"
              >
                <option value="">All Device Types</option>
                {deviceTypes.map(dt => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="adv-barcode" className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <ScanBarcode className="w-3.5 h-3.5" aria-hidden="true" />
                Barcode
              </label>
              <input
                id="adv-barcode"
                type="text"
                value={values.barcode ?? ''}
                onChange={e => handleField('barcode', e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                placeholder="Scan or type barcode…"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adv-serial" className="block text-xs font-medium text-slate-600 mb-1">
                Serial Number
              </label>
              <input
                id="adv-serial"
                type="text"
                value={values.serial_number ?? ''}
                onChange={e => handleField('serial_number', e.target.value)}
                placeholder="Part of serial…"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white"
              />
            </div>

            <div>
              <label htmlFor="adv-pcb" className="block text-xs font-medium text-slate-600 mb-1">
                PCB Number
              </label>
              <input
                id="adv-pcb"
                type="text"
                value={values.pcb_number ?? ''}
                onChange={e => handleField('pcb_number', e.target.value)}
                placeholder="e.g. 2060-800001"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adv-firmware" className="block text-xs font-medium text-slate-600 mb-1">
                Firmware Version
              </label>
              <input
                id="adv-firmware"
                type="text"
                value={values.firmware ?? ''}
                onChange={e => handleField('firmware', e.target.value)}
                placeholder="e.g. CC49"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adv-controller" className="block text-xs font-medium text-slate-600 mb-1">
                Controller
              </label>
              <input
                id="adv-controller"
                type="text"
                value={values.controller ?? ''}
                onChange={e => handleField('controller', e.target.value)}
                placeholder="e.g. Marvell 88SS1111"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white"
              />
            </div>

            <div>
              <label htmlFor="adv-head-map" className="block text-xs font-medium text-slate-600 mb-1">
                Head Map
              </label>
              <input
                id="adv-head-map"
                type="text"
                value={values.head_map ?? ''}
                onChange={e => handleField('head_map', e.target.value)}
                placeholder="e.g. 0-3"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adv-dcm" className="block text-xs font-medium text-slate-600 mb-1">
                DCM / MLC
              </label>
              <input
                id="adv-dcm"
                type="text"
                value={values.dcm ?? ''}
                onChange={e => handleField('dcm', e.target.value)}
                placeholder="e.g. HARNXT0"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white font-mono"
              />
            </div>

            <div>
              <label htmlFor="adv-chipset" className="block text-xs font-medium text-slate-600 mb-1">
                Chipset
              </label>
              <input
                id="adv-chipset"
                type="text"
                value={values.chipset ?? ''}
                onChange={e => handleField('chipset', e.target.value)}
                placeholder="e.g. Samsung K9LCG08U1M"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white"
              />
            </div>

            <div>
              <label htmlFor="adv-location" className="block text-xs font-medium text-slate-600 mb-1">
                Location
              </label>
              <select
                id="adv-location"
                value={values.location_id ?? ''}
                onChange={e => handleField('location_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white"
              >
                <option value="">All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="px-4 pb-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <div className="flex gap-2">
              {hasAdvancedValues(values) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleClearAdvanced}
                >
                  <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  Clear Filters
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowSave(true)}
              disabled={!hasAdvancedValues(values)}
            >
              <Save className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              Save Search
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={showSave}
        onClose={() => setShowSave(false)}
        title="Save Search"
        icon={Save}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-4"
        >
          <Input
            id={saveNameId}
            label="Search Name"
            required
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="e.g. WD 2TB SATA PCB 2060-…"
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={() => setShowSave(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!saveName.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
