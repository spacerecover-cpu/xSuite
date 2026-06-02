import { useState, useEffect, useRef, useId } from 'react';
import { Search, Filter, Save, X, Star, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { supabase, getTenantId } from '../../lib/supabaseClient';
import { logger } from '../../lib/logger';
import type { Database, Json } from '../../types/database.types';

interface DonorSearchCriteria {
  brand_id: string;
  model: string;
  capacity_id: string;
  pcb_number: string;
  dcm: string;
  firmware_version: string;
  interface_id: string;
}

type DonorDrive = Database['public']['Functions']['search_donor_drives']['Returns'][number];
type SearchTemplateRow = Database['public']['Tables']['inventory_search_templates']['Row'];

export default function DonorSearchPage() {
  const [criteria, setCriteria] = useState<DonorSearchCriteria>({
    brand_id: '',
    model: '',
    capacity_id: '',
    pcb_number: '',
    dcm: '',
    firmware_version: '',
    interface_id: '',
  });

  const [results, setResults] = useState<DonorDrive[]>([]);
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [capacities, setCapacities] = useState<Array<{ id: string; name: string }>>([]);
  const [interfaces, setInterfaces] = useState<Array<{ id: string; name: string }>>([]);
  const [searchTemplates, setSearchTemplates] = useState<SearchTemplateRow[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const templateNameRef = useRef<HTMLInputElement>(null);
  const templateNameId = useId();
  const templateDescriptionId = useId();

  useEffect(() => {
    loadMasterData();
    loadSearchTemplates();
  }, []);

  const loadMasterData = async () => {
    try {
      const [brandsRes, capacitiesRes, interfacesRes] = await Promise.all([
        supabase.from('catalog_device_brands').select('*').eq('is_active', true).order('name'),
        supabase.from('catalog_device_capacities').select('*').eq('is_active', true).order('gb_value'),
        supabase.from('catalog_interfaces').select('*').eq('is_active', true).order('sort_order'),
      ]);

      if (brandsRes.data) setBrands(brandsRes.data);
      if (capacitiesRes.data) setCapacities(capacitiesRes.data);
      if (interfacesRes.data) setInterfaces(interfacesRes.data);
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
      const p_criteria: Json = {
        brand_id: criteria.brand_id || null,
        model: criteria.model || null,
        capacity_id: criteria.capacity_id || null,
        pcb_number: criteria.pcb_number || null,
        dcm: criteria.dcm || null,
        firmware: criteria.firmware_version || null,
        interface_id: criteria.interface_id || null,
        limit: 50,
      };

      const { data, error } = await supabase.rpc('search_donor_drives', { p_criteria });

      if (error) throw error;
      setResults(data ?? []);
    } catch (error) {
      logger.error('Error searching donor drives:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCriteria = () => {
    setCriteria({
      brand_id: '',
      model: '',
      capacity_id: '',
      pcb_number: '',
      dcm: '',
      firmware_version: '',
      interface_id: '',
    });
    setResults([]);
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

  const handleLoadTemplate = async (template: SearchTemplateRow) => {
    const raw = template.criteria as Record<string, unknown> | null;
    if (raw && typeof raw === 'object') {
      const loaded: DonorSearchCriteria = {
        brand_id: typeof raw.brand_id === 'string' ? raw.brand_id : '',
        model: typeof raw.model === 'string' ? raw.model : '',
        capacity_id: typeof raw.capacity_id === 'string' ? raw.capacity_id : '',
        pcb_number: typeof raw.pcb_number === 'string' ? raw.pcb_number : '',
        dcm: typeof raw.dcm === 'string' ? raw.dcm : '',
        firmware_version: typeof raw.firmware_version === 'string' ? raw.firmware_version : '',
        interface_id: typeof raw.interface_id === 'string' ? raw.interface_id : '',
      };
      setCriteria(loaded);
    }
  };

  const renderUsableParts = (parts: Json | null) => {
    if (!parts || typeof parts !== 'object' || Array.isArray(parts)) return null;
    const usableParts = Object.entries(parts)
      .filter(([, value]) => value === true)
      .map(([key]) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));

    if (usableParts.length === 0) return <span className="text-sm text-slate-400">No parts marked</span>;

    return (
      <div className="flex flex-wrap gap-1">
        {usableParts.map((part, index) => (
          <Badge key={index} variant="default" className="text-xs">
            {part}
          </Badge>
        ))}
      </div>
    );
  };

  const activeCriteriaCount = Object.values(criteria).filter(v => v !== '').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Advanced Donor Drive Search</h1>
          <p className="text-slate-600 mt-1">
            Find compatible donor drives by technical specifications
          </p>
        </div>
        <Button
          onClick={() => setShowSaveTemplate(true)}
          variant="secondary"
          disabled={activeCriteriaCount === 0}
        >
          <Save className="w-4 h-4 mr-2" />
          Save Search
        </Button>
      </div>

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
            <label className="block text-sm font-medium text-slate-700 mb-2">DCM/MLC</label>
            <Input
              type="text"
              value={criteria.dcm}
              onChange={(e) => setCriteria(prev => ({ ...prev, dcm: e.target.value }))}
              placeholder="Enter DCM or MLC"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Firmware</label>
            <Input
              type="text"
              value={criteria.firmware_version}
              onChange={(e) => setCriteria(prev => ({ ...prev, firmware_version: e.target.value }))}
              placeholder="Enter firmware version"
            />
          </div>

          <div>
            <SearchableSelect
              label="Interface"
              options={interfaces.map(i => ({ id: i.id.toString(), name: i.name }))}
              value={criteria.interface_id}
              onChange={(value) => setCriteria(prev => ({ ...prev, interface_id: value }))}
              placeholder="Select interface"
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
            {results.map((drive) => (
              <div
                key={drive.id}
                className="border border-slate-200 rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <div className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-12 lg:col-span-3">
                    <div className="bg-info-muted border-l-4 border-info rounded px-3 py-2 mb-2">
                      <div className="text-xs font-semibold text-info uppercase tracking-wider mb-0.5">Inventory ID</div>
                      <div className="text-base font-bold text-info font-mono tracking-wide">
                        {drive.item_number ?? drive.id.slice(0, 8)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{drive.name}</div>
                  </div>

                  <div className="col-span-12 lg:col-span-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-slate-500">Model:</dt>
                      <dd className="font-medium text-slate-900">{drive.model || 'N/A'}</dd>

                      <dt className="text-slate-500">Serial:</dt>
                      <dd className="font-medium text-slate-900 font-mono text-xs">
                        {drive.serial_number || 'N/A'}
                      </dd>
                    </dl>
                  </div>

                  <div className="col-span-12 lg:col-span-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-slate-500">PCB:</dt>
                      <dd className="font-medium text-slate-900 font-mono text-xs">
                        {drive.pcb_number || 'N/A'}
                      </dd>

                      <dt className="text-slate-500">Firmware:</dt>
                      <dd className="font-medium text-slate-900">{drive.firmware_version || 'N/A'}</dd>
                    </dl>
                  </div>

                  <div className="col-span-12 lg:col-span-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Quantity:</span>
                        <span className={`font-bold ${(drive.quantity ?? 0) > 0 ? 'text-success' : 'text-danger'}`}>
                          {drive.quantity ?? 0}
                        </span>
                      </div>
                      <Button size="sm" className="w-full">
                        View Details
                      </Button>
                    </div>
                  </div>

                  <div className="col-span-12 border-t border-slate-100 pt-3">
                    <div className="text-xs text-slate-600 mb-2">Usable Donor Parts:</div>
                    {renderUsableParts(drive.donor_parts_available)}
                  </div>
                </div>
              </div>
            ))}
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
