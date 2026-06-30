import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  LayoutGrid,
  List as ListIcon,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { seedTemplates, checkIfSeededTemplates } from '../../lib/seedService';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LineItemTemplateFormModal } from '../../components/templates/LineItemTemplateFormModal';
import { SeedingResultsDisplay } from '../../components/settings/SeedingResultsDisplay';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type DocumentTemplateInsert = Database['public']['Tables']['document_templates']['Insert'];

interface TemplateType {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  template_count: number;
}

export const TemplatesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [templateTypes, setTemplateTypes] = useState<TemplateType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [seedingResults, setSeedingResults] = useState<any>(null);
  const [showSeedingResults, setShowSeedingResults] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSeeded, setIsSeeded] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [createTypeId, setCreateTypeId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: typesData } = await supabase
        .from('master_template_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      const { data: templatesData } = await supabase
        .from('document_templates')
        .select('id, template_type_id')
        .eq('is_active', true);

      const typeCounts: Record<string, number> = {};
      templatesData?.forEach((t) => {
        if (t.template_type_id) {
          typeCounts[t.template_type_id] = (typeCounts[t.template_type_id] || 0) + 1;
        }
      });

      const enrichedTypes: TemplateType[] = typesData?.map(type => ({
        id: type.id,
        name: type.name,
        code: type.code,
        description: type.description,
        template_count: typeCounts[type.id] || 0,
      })) || [];

      setTemplateTypes(enrichedTypes);
      setIsSeeded(await checkIfSeededTemplates());
    } catch (error) {
      logger.error('Error loading templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedTemplates = async () => {
    setIsSeeding(true);
    try {
      const result = await seedTemplates();
      setSeedingResults(result);
      setShowSeedingResults(true);

      if (result.success) {
        await loadData();
      }
    } catch (error) {
      logger.error('Error seeding templates:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const openCreateFlow = () => {
    setCreateTypeId(templateTypes[0]?.id ?? '');
    setShowTypePicker(true);
  };

  const handleContinueToForm = () => {
    if (!createTypeId) return;
    setShowTypePicker(false);
    setShowFormModal(true);
  };

  const handleSaveTemplate = async (templateData: Record<string, unknown>) => {
    if (!profile?.tenant_id) throw new Error('No active tenant');
    const insertPayload = {
      ...(templateData as Omit<DocumentTemplateInsert, 'tenant_id'>),
      tenant_id: profile.tenant_id,
    } as DocumentTemplateInsert;
    const { error } = await supabase.from('document_templates').insert(insertPayload);
    if (error) throw error;
    await loadData();
    setShowFormModal(false);
    setCreateTypeId('');
  };

  const filteredTypes = templateTypes.filter(type => {
    const matchesSearch = type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         type.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalTemplates = templateTypes.reduce((sum, type) => sum + type.template_count, 0);

  const createType = templateTypes.find((type) => type.id === createTypeId) ?? null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SettingsPageHeader categoryId="templates" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader categoryId="templates" />

      {showSeedingResults && seedingResults && (
        <SeedingResultsDisplay
          details={seedingResults.details}
          message={seedingResults.message}
          onClose={() => setShowSeedingResults(false)}
        />
      )}

      {/* Compact toolbar: at-a-glance counts, search, and primary actions in one row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <FileText className="w-4 h-4 text-cat-7" />
            <span className="font-bold text-slate-900">{totalTemplates}</span>
            <span className="text-slate-500">templates</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <ListIcon className="w-4 h-4 text-accent-foreground" />
            <span className="font-bold text-slate-900">{templateTypes.length}</span>
            <span className="text-slate-500">types</span>
          </span>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          {!isSeeded && (
            <Button
              variant="secondary"
              onClick={handleSeedTemplates}
              disabled={isSeeding}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isSeeding ? 'Seeding...' : 'Seed Sample Templates'}
            </Button>
          )}
          <Button onClick={openCreateFlow}>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
          <div className="flex border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}
              aria-label="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 border-l border-slate-300 ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}
              aria-label="List view"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Template Types</h2>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTypes.map((type) => (
              <Card
                key={type.id}
                className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/templates/type/${type.code}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-900">{type.name}</h3>
                  <Badge variant={type.template_count > 0 ? 'success' : 'secondary'}>
                    {type.template_count}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600 mb-4">{type.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Code: {type.code}</span>
                  {type.template_count === 0 && (
                    <span className="text-warning">No templates</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTypes.map((type) => (
              <Card
                key={type.id}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/templates/type/${type.code}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-slate-900">{type.name}</h3>
                      <Badge variant={type.template_count > 0 ? 'success' : 'secondary'}>
                        {type.template_count}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{type.description}</p>
                  </div>
                  <div className="text-sm text-slate-500">
                    {type.code}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {filteredTypes.length === 0 && (
          <Card className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No templates found</h3>
            <p className="text-slate-600 mb-4">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'Get started by creating your first template'}
            </p>
            <Button onClick={openCreateFlow}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </Card>
        )}
      </div>

      {showTypePicker && (
        <Modal
          isOpen={showTypePicker}
          onClose={() => setShowTypePicker(false)}
          title="New Template"
          size="sm"
        >
          <div className="space-y-4">
            {templateTypes.length === 0 ? (
              <p className="text-sm text-slate-600">
                No template types are available yet. Seed sample templates to get started.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Choose the type of template you want to create. The editor adapts to the type you pick.
                </p>
                <Select
                  label="Template Type"
                  value={createTypeId}
                  onChange={(e) => setCreateTypeId(e.target.value)}
                  options={templateTypes.map((type) => ({ value: type.id, label: type.name }))}
                />
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowTypePicker(false)}>
                Cancel
              </Button>
              <Button onClick={handleContinueToForm} disabled={!createTypeId}>
                Continue
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showFormModal && createType && (
        <LineItemTemplateFormModal
          isOpen={showFormModal}
          onClose={() => {
            setShowFormModal(false);
            setCreateTypeId('');
          }}
          onSave={handleSaveTemplate}
          templateTypeId={createType.id}
          isLineItemType={false}
          typeCode={createType.code}
        />
      )}
    </div>
  );
};
