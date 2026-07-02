import { useState, useEffect, useRef, useId } from 'react';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Search, Filter, Save, X, Star, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { supabase, getTenantId } from '../../lib/supabaseClient';
import { logger } from '../../lib/logger';
import { getDonorPartsForItems } from '../../lib/inventory/donorPartsService';
import type { DonorPartRow } from '../../lib/inventory/donorPartsService';
import { getDonorParts } from '../../lib/inventory/donorParts';
import { resolveDeviceFamily } from '../../lib/devices/deviceFamily';
import { useInventoryDeviceTypes } from '../../lib/inventory/inventoryCatalogQueries';
import type { Database, Json } from '../../types/database.types';

interface DonorSearchCriteria {
  device_type_id: string;
  brand_id: string;
  model: string;
  capacity_id: string;
  serial_number: string;
  pcb_number: string;
  firmware: string;
  dcm: string;
  head_map: string;
  controller: string;
  chipset: string;
}

type DonorDrive = Database['public']['Functions']['search_donor_drives']['Returns'][number];
type SearchTemplateRow = Database['public']['Tables']['inventory_search_templates']['Row'];

const EMPTY_CRITERIA: DonorSearchCriteria = {
  device_type_id: '',
  brand_id: '',
  model: '',
  capacity_id: '',
  serial_number: '',
  pcb_number: '',
  firmware: '',
  dcm: '',
  head_map: '',
  controller: '',
  chipset: '',
};

export default function DonorSearchPage() {
  const [criteria, setCriteria] = useState<DonorSearchCriteria>(EMPTY_CRITERIA);

  const [results, setResults] = useState<DonorDrive[]>([]);
  const [donorPartsMap, setDonorPartsMap] = useState<Map<string, DonorPartRow[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [capacities, setCapacities] = useState<Array<{ id: string; name: string }>>([]);
  const [searchTemplates, setSearchTemplates] = useState<SearchTemplateRow[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const templateNameRef = useRef<HTMLInputElement>(null);
  const templateNameId = useId();
  const templateDescriptionId = useId();

  const { data: deviceTypes = [] } = useInventoryDeviceTypes();

  useEffect(() => {
    loadMasterData();
    loadSearchTemplates();
  }, []);

  const loadMasterData = async () => {
    try {
      const [brandsRes, capacitiesRes] = await Promise.all([
        supabase.from('catalog_device_brands').select('*').eq('is_active', true).order('name'),
        supabase.from('catalog_device_capacities').select('*').eq('is_active', true).order('gb_value'),
      ]);

      if (brandsRes.data) setBrands(brandsRes.data);
      if (capacitiesRes.data) setCapacities(capacitiesRes.data);
    } catch (error) {
      logger.error('Error loading master data:', error);
    }
  };

  const loadSearchTemplates = async () => {
    try {
      const { data } = await supabase
        .from('inventory_search_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setSearchTemplates(data);
    } catch (error) {
      logger.error('Error loading search templates:', error);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const p_criteria: Json = Object.fromEntries(
        Object.entries({
          device_type_id: criteria.device_type_id || null,
          brand_id: criteria.brand_id || null,
          capacity_id: criteria.capacity_id || null,
          model: criteria.model || null,
          serial_number: criteria.serial_number || null,
          pcb_number: criteria.pcb_number || null,
          firmware: criteria.firmware || null,
          dcm: criteria.dcm || null,
          head_map: criteria.head_map || null,
          controller: criteria.controller || null,
          chipset: criteria.chipset || null,
        }).filter(([, v]) => v !== null),
      );

      const { data, error } = await supabase.rpc('search_donor_drives', { p_criteria });

      if (error) throw error;
      const rows = data ?? [];
      setResults(rows);

      if (rows.length > 0) {
        const partsMap = await getDonorPartsForItems(rows.map(r => r.id));
        setDonorPartsMap(partsMap);
      } else {
        setDonorPartsMap(new Map());
      }
    } catch (error) {
      logger.error('Error searching donor drives:', error);
      setResults([]);
      setDonorPartsMap(new Map());
    } finally {
      setLoading(false);
    }
  };

  const handleClearCriteria = () => {
    setCriteria(EMPTY_CRITERIA);
    setResults([]);
    setDonorPartsMap(new Map());
  };

  const handleSaveTemplate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const tenantId = getTenantId();
      if (!tenantId) return;

      await supabase.from('inventory_search_templates').insert({
        name: templateName,
        criteria: { ...criteria, description: templateDescription } as Json,
        created_by: user.id,
        tenant_id: tenantId,
      });

      setShowSaveTemplate(false);
      setTemplateName('');
      setTemplateDescription('');
      loadSearchTemplates();
    } catch (error) {
      logger.error('Error saving template:', error);
    }
  };

  const handleLoadTemplate = (template: SearchTemplateRow) => {
    const raw = template.criteria as Record<string, unknown> | null;
    if (raw && typeof raw === 'object') {
      const loaded: DonorSearchCriteria = {
        device_type_id: typeof raw.device_type_id === 'string' ? raw.device_type_id : '',
        brand_id: typeof raw.brand_id === 'string' ? raw.brand_id : '',
        model: typeof raw.model === 'string' ? raw.model : '',
        capacity_id: typeof raw.capacity_id === 'string' ? raw.capacity_id : '',
        serial_number: typeof raw.serial_number === 'string' ? raw.serial_number : '',
        pcb_number: typeof raw.pcb_number === 'string' ? raw.pcb_number : '',
        firmware: typeof raw.firmware === 'string' ? raw.firmware : '',
        dcm: typeof raw.dcm === 'string' ? raw.dcm : '',
        head_map: typeof raw.head_map === 'string' ? raw.head_map : '',
        controller: typeof raw.controller === 'string' ? raw.controller : '',
        chipset: typeof raw.chipset === 'string' ? raw.chipset : '',
      };
      setCriteria(loaded);
    }
  };

  /** Determine if a result row is an exact PCB/firmware match for the searched values. */
  const isBestMatch = (drive: DonorDrive): boolean => {
    const searchedPcb = criteria.pcb_number.trim();
    const searchedFirmware = criteria.firmware.trim();
    if (!searchedPcb && !searchedFirmware) return false;
    const td = drive.technical_details as Record<string, unknown> | null;
    const pcbMatch = searchedPcb
      ? (drive.pcb_number ?? td?.pcb_number ?? '') === searchedPcb
      : true;
    const fwMatch = searchedFirmware
      ? (td?.firmware_version ?? '') === searchedFirmware
      : true;
    return pcbMatch && fwMatch;
  };

  /** Resolve the device family for a result row using the device_type_id → name lookup. */
  const resolveFamily = (drive: DonorDrive) => {
    const dt = deviceTypes.find(d => d.id === drive.device_type_id);
    return resolveDeviceFamily(dt?.name ?? null);
  };

  const renderTechSpec = (label: string, value: string | null | undefined) => {
    if (!value) return null;
    return (
      <div className="flex flex-col">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-medium text-slate-800 font-mono">{value}</span>
      </div>
    );
  };

  const renderDonorParts = (drive: DonorDrive) => {
    const parts = donorPartsMap.get(drive.id) ?? [];
    const family = resolveFamily(drive);
    const partDefs = getDonorParts(family);
    const labelMap = new Map(partDefs.map(d => [d.key, d.label]));

    if (parts.length === 0) {
      return <span className="text-xs text-slate-400">No donor parts recorded</span>;
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {parts.map(part => {
          const label = labelMap.get(part.part_type) ?? part.part_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return (
            <Badge key={part.id} variant="default" className="text-xs">
              {label}{part.quantity > 1 ? ` ×${part.quantity}` : ''}
            </Badge>
          );
        })}
      </div>
    );
  };

  const activeCriteriaCount = Object.values(criteria).filter(v => v !== '').length;

  return (
    <div className="p-6 space-y-6">
      <PageHeaderSlot
        title="Advanced Donor Drive Search"
        actions={
          <Button
            onClick={() => setShowSaveTemplate(true)}
            variant="secondary"
            size="sm"
            disabled={activeCriteriaCount === 0}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Search
          </Button>
        }
      />

      {searchTemplates.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center">
              <Star className="w-4 h-4 mr-2 text-warning" />
              Saved Search Templates
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {searchTemplates.slice(0, 5).map((template) => (
              <button
                key={template.id}
                onClick={() => handleLoadTemplate(template)}
                className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>{template.name}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Search Criteria
            {activeCriteriaCount > 0 && (
              <Badge variant="default" className="ml-3">
                {activeCriteriaCount} active
              </Badge>
            )}
          </h3>
          <Button variant="secondary" size="sm" onClick={handleClearCriteria}>
            <X className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <SearchableSelect
              label="Device Type"
              options={deviceTypes.map(dt => ({ id: dt.id, name: dt.name }))}
              value={criteria.device_type_id}
              onChange={(value) => setCriteria(prev => ({ ...prev, device_type_id: value }))}
              placeholder="Select device type"
            />
          </div>

          <div>
            <SearchableSelect
              label="Brand"
              options={brands.map(b => ({ id: b.id.toString(), name: b.name }))}
              value={criteria.brand_id}
              onChange={(value) => setCriteria(prev => ({ ...prev, brand_id: value }))}
              placeholder="Select brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Model</label>
            <Input
              type="text"
              value={criteria.model}
              onChange={(e) => setCriteria(prev => ({ ...prev, model: e.target.value }))}
              placeholder="Enter model number"
            />
          </div>

          <div>
            <SearchableSelect
              label="Capacity"
              options={capacities.map(c => ({ id: c.id.toString(), name: c.name }))}
              value={criteria.capacity_id}
              onChange={(value) => setCriteria(prev => ({ ...prev, capacity_id: value }))}
              placeholder="Select capacity"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Serial Number</label>
            <Input
              type="text"
              value={criteria.serial_number}
              onChange={(e) => setCriteria(prev => ({ ...prev, serial_number: e.target.value }))}
              placeholder="Enter serial number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              PCB Number
            </label>
            <Input
              type="text"
              value={criteria.pcb_number}
              onChange={(e) => setCriteria(prev => ({ ...prev, pcb_number: e.target.value }))}
              placeholder="Enter PCB number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Firmware</label>
            <Input
              type="text"
              value={criteria.firmware}
              onChange={(e) => setCriteria(prev => ({ ...prev, firmware: e.target.value }))}
              placeholder="Enter firmware version"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">DCM/MLC</label>
            <Input
              type="text"
              value={criteria.dcm}
              onChange={(e) => setCriteria(prev => ({ ...prev, dcm: e.target.value }))}
              placeholder="Enter DCM or MLC"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Head Map</label>
            <Input
              type="text"
              value={criteria.head_map}
              onChange={(e) => setCriteria(prev => ({ ...prev, head_map: e.target.value }))}
              placeholder="Enter head map"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Controller</label>
            <Input
              type="text"
              value={criteria.controller}
              onChange={(e) => setCriteria(prev => ({ ...prev, controller: e.target.value }))}
              placeholder="Enter controller"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Chipset</label>
            <Input
              type="text"
              value={criteria.chipset}
              onChange={(e) => setCriteria(prev => ({ ...prev, chipset: e.target.value }))}
              placeholder="Enter chipset"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
          <Button onClick={handleSearch} disabled={loading || activeCriteriaCount === 0}>
            <Search className="w-4 h-4 mr-2" />
            {loading ? 'Searching...' : 'Search Donors'}
          </Button>
        </div>
      </Card>

      {results.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Search Results ({results.length} found)
            </h3>
          </div>

          <div className="space-y-3">
            {results.map((drive) => {
              const bestMatch = isBestMatch(drive);
              const td = drive.technical_details as Record<string, unknown> | null;
              return (
                <div
                  key={drive.id}
                  className={`border rounded-lg p-4 hover:shadow-sm transition-all ${
                    bestMatch
                      ? 'border-success/50 bg-success-muted/30'
                      : 'border-slate-200 hover:border-primary/50'
                  }`}
                >
                  <div className="grid grid-cols-12 gap-4 items-start">
                    <div className="col-span-12 lg:col-span-3">
                      <div className="flex items-start gap-2 mb-2">
                        {bestMatch && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success text-success-foreground whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" />
                            Best match
                          </span>
                        )}
                      </div>
                      <div className="bg-info-muted border-l-4 border-info rounded px-3 py-2 mb-2">
                        <div className="text-xs font-semibold text-info uppercase tracking-wider mb-0.5">Inventory ID</div>
                        <div className="text-base font-bold text-info font-mono tracking-wide">
                          {drive.item_number ?? drive.id.slice(0, 8)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{drive.name}</div>
                    </div>

                    <div className="col-span-12 lg:col-span-4">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Identity</div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt className="text-slate-500">Model:</dt>
                        <dd className="font-medium text-slate-900">{drive.model || 'N/A'}</dd>

                        <dt className="text-slate-500">Serial:</dt>
                        <dd className="font-medium text-slate-900 font-mono text-xs">
                          {drive.serial_number || 'N/A'}
                        </dd>

                        <dt className="text-slate-500">Quantity:</dt>
                        <dd className={`font-bold ${(drive.quantity ?? 0) > 0 ? 'text-success' : 'text-danger'}`}>
                          {drive.quantity ?? 0}
                        </dd>
                      </dl>
                    </div>

                    <div className="col-span-12 lg:col-span-4">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Technical Specs</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {renderTechSpec('PCB', drive.pcb_number ?? (td?.pcb_number as string | null))}
                        {renderTechSpec('Firmware', td?.firmware_version as string | null)}
                        {renderTechSpec('DCM', td?.dcm as string | null)}
                        {renderTechSpec('Head Map', td?.physical_head_map as string | null)}
                        {renderTechSpec('Controller', td?.controller as string | null)}
                        {renderTechSpec('Chipset', td?.chipset as string | null)}
                      </div>
                    </div>

                    <div className="col-span-12 lg:col-span-1 flex lg:flex-col lg:items-end gap-2">
                      <Button size="sm" className="w-full lg:w-auto">
                        View Details
                      </Button>
                    </div>

                    <div className="col-span-12 border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Donor Parts Available</div>
                      {renderDonorParts(drive)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!loading && results.length === 0 && activeCriteriaCount > 0 && (
        <Card className="p-12">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-2 text-sm font-medium text-slate-900">No matching donors found</h3>
            <p className="mt-1 text-sm text-slate-500">
              Try adjusting your search criteria to find compatible donor drives.
            </p>
          </div>
        </Card>
      )}

      <Modal
        isOpen={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        title="Save Search Template"
        icon={Save}
        size="sm"
        initialFocusRef={templateNameRef}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveTemplate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor={templateNameId} className="block text-sm font-medium text-slate-700 mb-2">
              Template Name
            </label>
            <Input
              ref={templateNameRef}
              id={templateNameId}
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., WD 2TB SATA Drives"
            />
          </div>
          <div>
            <label htmlFor={templateDescriptionId} className="block text-sm font-medium text-slate-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              id={templateDescriptionId}
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Describe this search template..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={() => setShowSaveTemplate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!templateName.trim()}>
              Save Template
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
