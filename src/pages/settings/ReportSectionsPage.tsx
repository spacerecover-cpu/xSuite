import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Search,
  Edit2,
  Trash2,
  ArrowLeft,
  Layers,
  LayoutTemplate,
  Info,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { reportSectionService, type ReportSection, type SectionPreset } from '../../lib/reportSectionService';
import { ReportTemplatesTab } from '../../components/reports/ReportTemplatesTab';
import { settingsKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTranslation } from 'react-i18next';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';

const CATEGORY_CONFIG = {
  general: { label: 'General', color: '#3b82f6', bgColor: '#eff6ff' },
  diagnostic: { label: 'Diagnostic', color: '#ef4444', bgColor: '#fef2f2' },
  solution: { label: 'Solution', color: '#10b981', bgColor: '#f0fdf4' },
  timeline: { label: 'Timeline', color: '#f59e0b', bgColor: '#fffbeb' },
  technical: { label: 'Technical', color: 'rgb(var(--color-accent))', bgColor: 'rgb(var(--color-accent) / 0.1)' },
  financial: { label: 'Financial', color: 'rgb(var(--color-accent))', bgColor: 'rgb(var(--color-accent) / 0.1)' },
  compliance: { label: 'Compliance', color: 'rgb(var(--color-accent))', bgColor: 'rgb(var(--color-accent) / 0.1)' },
  risk: { label: 'Risk', color: '#dc2626', bgColor: '#fef2f2' },
};

type StudioTab = 'templates' | 'sections' | 'presets';

const STUDIO_TABS: Array<{ key: StudioTab; label: string; icon: React.ElementType }> = [
  { key: 'templates', label: 'Templates', icon: LayoutTemplate },
  { key: 'sections', label: 'Section Library', icon: Layers },
  { key: 'presets', label: 'Presets', icon: Zap },
];

function parseStudioTab(value: string | null): StudioTab {
  return value === 'templates' || value === 'sections' || value === 'presets'
    ? value
    : 'templates';
}

/**
 * Tab 2 — the pre-existing report section library management UI, moved under
 * the Report Studio tab shell with its behavior unchanged.
 */
const SectionLibraryTab: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  useTranslation();
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [filteredSections, setFilteredSections] = useState<ReportSection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setShowSectionModal] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [selectedSection, setSelectedSection] = useState<ReportSection | null>(null);
  const [presets, setPresets] = useState<SectionPreset[]>([]);

  useEffect(() => {
    loadSections();
  }, []);

  useEffect(() => {
    filterSections();
  }, [sections, searchTerm, selectedCategory]);

  const loadSections = async () => {
    setIsLoading(true);
    try {
      const data = await reportSectionService.getSections();
      setSections(data);
    } catch (error) {
      logger.error('Error loading sections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterSections = () => {
    let filtered = sections;

    if (selectedCategory) {
      filtered = filtered.filter((s) => s.category === selectedCategory);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.section_name.toLowerCase().includes(term) ||
          s.section_description?.toLowerCase().includes(term) ||
          s.section_key.toLowerCase().includes(term)
      );
    }

    setFilteredSections(filtered);
  };

  const handleViewPresets = async (section: ReportSection) => {
    setSelectedSection(section);
    try {
      const data = await reportSectionService.getPresetsBySection(section.id);
      setPresets(data);
      setShowPresetsModal(true);
    } catch (error) {
      logger.error('Error loading presets:', error);
    }
  };

  const handleDeleteSection = async (section: ReportSection) => {
    if (section.is_system) {
      toast.error('System sections cannot be deleted');
      return;
    }

    const ok = await confirm({
      title: 'Delete Section',
      message: `Are you sure you want to delete "${section.section_name}"?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }

    try {
      await reportSectionService.deleteSection(section.id);
      await loadSections();
    } catch (error) {
      logger.error('Error deleting section:', error);
      toast.error('Failed to delete section');
    }
  };

  const getCategoryStats = () => {
    const stats: Record<string, number> = {};
    sections.forEach((section) => {
      stats[section.category] = (stats[section.category] || 0) + 1;
    });
    return stats;
  };

  const categoryStats = getCategoryStats();

  return (
    <div>
      {/* Info Banner + Add */}
      <div className="flex items-start gap-3 mb-6">
        <Card className="p-4 flex-1 bg-info-muted border-info/30">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-info mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-info mb-1">About Report Sections</h3>
              <p className="text-sm text-info">
                Report sections are reusable building blocks for creating professional reports.
                Each section can have predefined content snippets (presets) that speed up report
                creation. Configure sections here, then use them when building report templates.
              </p>
            </div>
          </div>
        </Card>

        <Button
          onClick={() => {
            setSelectedSection(null);
            setShowSectionModal(true);
          }}
          className="flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Section
        </Button>
      </div>

      {/* Category Filters */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Filter by Category</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedCategory === null
                ? 'bg-slate-900 text-white shadow-lg'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            All Sections <span className="ml-1">({sections.length})</span>
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === key
                  ? 'text-white shadow-lg'
                  : 'bg-white border border-slate-200 hover:border-slate-300'
              }`}
              style={{
                backgroundColor: selectedCategory === key ? config.color : undefined,
                color: selectedCategory === key ? 'white' : config.color,
              }}
            >
              {config.label}{' '}
              <span className="ml-1">({categoryStats[key] || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search sections by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Sections Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-9" />
                <Skeleton className="h-8 w-9" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredSections.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">No sections found</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSections.map((section) => {
            const categoryConfig = CATEGORY_CONFIG[section.category];
            return (
              <Card key={section.id} className="p-5 hover:shadow-lg transition-shadow">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: categoryConfig.bgColor,
                      color: categoryConfig.color,
                    }}
                  >
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {section.is_system && (
                      <Badge variant="default" className="text-xs">
                        System
                      </Badge>
                    )}
                    <Badge
                      className="text-xs"
                      style={{ backgroundColor: categoryConfig.bgColor, color: categoryConfig.color }}
                    >
                      {categoryConfig.label}
                    </Badge>
                  </div>
                </div>

                {/* Content */}
                <h3 className="font-semibold text-slate-900 mb-1">{section.section_name}</h3>
                {section.section_name_ar && (
                  <p className="text-sm text-slate-600 mb-2" dir="rtl">
                    {section.section_name_ar}
                  </p>
                )}
                <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                  {section.section_description || 'No description'}
                </p>

                {/* Meta Info */}
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                  <span>Key: {section.section_key}</span>
                  <span>•</span>
                  <span>Order: {section.display_order}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleViewPresets(section)}
                    className="flex-1"
                  >
                    <Layers className="w-3.5 h-3.5 mr-1.5" />
                    Presets
                  </Button>
                  {!section.is_system && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedSection(section);
                          setShowSectionModal(true);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeleteSection(section)}
                        className="text-danger hover:bg-danger-muted"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Presets Modal */}
      {showPresetsModal && selectedSection && (
        <Modal
          isOpen={showPresetsModal}
          onClose={() => {
            setShowPresetsModal(false);
            setSelectedSection(null);
            setPresets([]);
          }}
          title={`Content Presets: ${selectedSection.section_name}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Quick-fill content snippets for "{selectedSection.section_name}" section
            </p>

            {presets.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No presets available for this section yet</p>
                <p className="text-sm text-slate-400 mt-1">
                  Presets will appear here once they are created
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {presets.map((preset) => (
                  <Card key={preset.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-slate-900">{preset.preset_name}</h4>
                      <Badge className="text-xs">
                        Used {preset.usage_count} {preset.usage_count === 1 ? 'time' : 'times'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {preset.preset_content}
                    </p>
                  </Card>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPresetsModal(false);
                  setSelectedSection(null);
                  setPresets([]);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

interface PresetGroup {
  section: ReportSection;
  presets: SectionPreset[];
}

const PRESETS_QUERY_KEY = [...settingsKeys.reportSections(), 'presets'] as const;

/**
 * Tab 3 — flat, read-only list of every content preset grouped by its library
 * section. Tenant presets can be deleted here; system presets are read-only
 * (RLS would silently reject the delete anyway).
 */
const PresetsTab: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: PRESETS_QUERY_KEY,
    queryFn: async (): Promise<PresetGroup[]> => {
      const sections = await reportSectionService.getSections();
      const presetsPerSection = await Promise.all(
        sections.map((section) => reportSectionService.getPresetsBySection(section.id))
      );
      return sections
        .map((section, index) => ({ section, presets: presetsPerSection[index] }))
        .filter((group) => group.presets.length > 0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (presetId: string) => reportSectionService.deletePreset(presetId),
    onSuccess: () => {
      toast.success('Preset deleted');
      queryClient.invalidateQueries({ queryKey: PRESETS_QUERY_KEY });
    },
  });

  const handleDeletePreset = async (preset: SectionPreset) => {
    await confirm({
      title: 'Delete Preset',
      message: `Are you sure you want to delete "${preset.preset_name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => deleteMutation.mutateAsync(preset.id),
    });
  };

  const totalPresets = groups.reduce((sum, group) => sum + group.presets.length, 0);

  return (
    <div>
      <Card className="p-4 mb-6 bg-info-muted border-info/30">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-info mt-0.5 flex-shrink-0" />
          <p className="text-sm text-info">
            Presets are quick-fill content snippets attached to a library section. This view
            lists every preset across all sections
            {totalPresets > 0 ? ` (${totalPresets} total)` : ''}. To browse a single section's
            presets in context, use the Section Library tab.
          </p>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              <Skeleton className="h-5 w-48 mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="p-12 text-center">
          <Zap className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">No presets yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Presets created for library sections will appear here
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map(({ section, presets }) => (
            <section key={section.id} aria-label={`Presets for ${section.section_name}`}>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4" style={{ color: section.color }} aria-hidden="true" />
                <h3 className="font-semibold text-slate-900">{section.section_name}</h3>
                <Badge variant="default" size="sm">
                  {presets.length} {presets.length === 1 ? 'preset' : 'presets'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {presets.map((preset) => {
                  const isSystemPreset = preset.tenant_id == null;
                  return (
                    <Card key={preset.id} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-medium text-slate-900">{preset.preset_name}</h4>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isSystemPreset && (
                            <Badge variant="default" size="sm">
                              System
                            </Badge>
                          )}
                          <Badge variant="default" size="sm">
                            Used {preset.usage_count} {preset.usage_count === 1 ? 'time' : 'times'}
                          </Badge>
                          {!isSystemPreset && (
                            <button
                              aria-label={`Delete preset ${preset.preset_name}`}
                              title="Delete preset"
                              className="p-1.5 rounded-md text-danger hover:bg-danger-muted transition-colors"
                              onClick={() => handleDeletePreset(preset)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-4">
                        {preset.preset_content}
                      </p>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export const ReportSectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<StudioTab>(() =>
    parseStudioTab(searchParams.get('tab'))
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTabChange = (tab: StudioTab) => {
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!direction) return;
    e.preventDefault();
    const nextIndex = (index + direction + STUDIO_TABS.length) % STUDIO_TABS.length;
    handleTabChange(STUDIO_TABS[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Settings</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
            <LayoutTemplate className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Report Studio</h1>
            <p className="text-slate-600 text-sm">
              Define the report templates, sections, and quick-fill presets your lab uses.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Report Studio"
        className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit"
      >
        {STUDIO_TABS.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              id={`studio-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`studio-panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.key)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <TabIcon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <div
        role="tabpanel"
        id={`studio-panel-${activeTab}`}
        aria-labelledby={`studio-tab-${activeTab}`}
      >
        {activeTab === 'templates' && <ReportTemplatesTab />}
        {activeTab === 'sections' && <SectionLibraryTab />}
        {activeTab === 'presets' && <PresetsTab />}
      </div>
    </div>
  );
};
