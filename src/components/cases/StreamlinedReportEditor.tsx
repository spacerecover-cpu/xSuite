import { useState, useEffect } from 'react';
import {
  X,
  Save,
  FileText,
  Check,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RichTextEditor } from '../ui/RichTextEditor';
import { Badge } from '../ui/Badge';
import { reportsService } from '../../lib/reportsService';
import { reportSectionService, type ReportSection, type SectionPreset, type TemplateSectionMapping } from '../../lib/reportSectionService';
import { REPORT_TYPES, type ReportType } from '../../lib/reportTypes';
import { getIconComponent } from '../../lib/iconMapper';
import { logger } from '../../lib/logger';
import { Dialog } from '../ui/Dialog';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../../hooks/useToast';

interface StreamlinedReportEditorProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: ReportType;
  caseId: string;
  caseData: {
    case_no: string;
    title: string;
    summary?: string;
    important_data?: string;
    service_type?: { id: string; name: string };
    customer?: {
      first_name: string;
      last_name?: string;
    };
    assigned_engineer?: {
      full_name: string;
    };
    created_at: string;
  };
  deviceData?: {
    device_type?: string;
    brand?: string;
    model?: string;
    capacity?: string;
    serial_number?: string;
    symptoms?: string;
    diagnostic_notes?: string;
  };
  reportId?: string;
  existingReport?: {
    id?: string;
    report_type?: string;
    report_template_id?: string;
    [key: string]: unknown;
  };
  onSuccess: () => void;
}

interface DynamicSectionConfig {
  key: string;
  title: string;
  icon: LucideIcon;
  color: string;
  description: string;
  order: number;
  required: boolean;
  hidden?: boolean;
}

interface SectionPresetMap {
  [sectionKey: string]: SectionPreset[];
}

export function StreamlinedReportEditor({
  isOpen,
  onClose,
  reportType,
  caseId,
  caseData,
  deviceData,
  reportId,
  existingReport,
  onSuccess,
}: StreamlinedReportEditorProps) {
  const toast = useToast();
  const [reportTitle, setReportTitle] = useState('');
  const [sections, setSections] = useState<Record<string, string>>({});
  const [sectionConfigs, setSectionConfigs] = useState<DynamicSectionConfig[]>([]);
  const [allSectionConfigs, setAllSectionConfigs] = useState<DynamicSectionConfig[]>([]);
  const [sectionPresets, setSectionPresets] = useState<SectionPresetMap>({});
  const [activeSection, setActiveSection] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [forensicCocId, setForensicCocId] = useState('');
  const [cocOptions, setCocOptions] = useState<Array<{ id: string; label: string }>>([]);

  const isEditMode = !!(reportId || existingReport);

  useEffect(() => {
    if (isOpen) {
      if (reportId || existingReport) {
        loadExistingReport();
      } else {
        initializeReport();
      }
    }
  }, [isOpen, reportType, reportId, existingReport]);

  // Forensic reports embed a chain-of-custody section; let the author pick the
  // custody record to anchor it instead of requiring a manual DB update.
  useEffect(() => {
    if (!isOpen || reportType !== 'forensic' || isEditMode) return;
    let cancelled = false;
    reportsService
      .getChainOfCustodyForReport(caseId)
      .then((events) => {
        if (cancelled) return;
        setCocOptions(
          events.map((event) => ({
            id: event.id,
            label: `${event.action}${event.actor_name ? ` — ${event.actor_name}` : ''} (${new Date(event.created_at).toLocaleDateString()})`,
          }))
        );
      })
      .catch((error) => logger.error('Error loading custody records:', error));
    return () => {
      cancelled = true;
    };
  }, [isOpen, reportType, isEditMode, caseId]);

  const loadSectionsFromDatabase = async (templateId: string): Promise<void> => {
    try {
      const templateSections = await reportSectionService.getTemplateSections(templateId);

      if (!templateSections || templateSections.length === 0) {
        logger.error('No sections found for template');
        throw new Error('No sections configured for this report type');
      }

      const allConfigs: DynamicSectionConfig[] = templateSections
        .sort((a, b) => a.section_order - b.section_order)
        .map((mapping: TemplateSectionMapping & { section: ReportSection }) => ({
          key: mapping.section.section_key,
          title: mapping.custom_label || mapping.section.section_name,
          icon: getIconComponent(mapping.section.icon),
          color: mapping.section.color,
          description: mapping.section.section_description || '',
          order: mapping.section_order,
          required: mapping.is_required,
          hidden: mapping.section.is_hidden_in_editor,
        }));

      const visibleConfigs = allConfigs.filter((config) => !config.hidden);

      setAllSectionConfigs(allConfigs);
      setSectionConfigs(visibleConfigs);

      const initialSections: Record<string, string> = {};
      allConfigs.forEach((config) => {
        initialSections[config.key] = '';
      });
      setSections(initialSections);

      const firstRequiredSection = visibleConfigs.find((c) => c.required);
      if (firstRequiredSection) {
        setActiveSection(firstRequiredSection.key);
      } else if (visibleConfigs.length > 0) {
        setActiveSection(visibleConfigs[0].key);
      }

      const presetPromises = visibleConfigs.map(async (config) => {
        try {
          const sectionInLibrary = await reportSectionService.getSectionByKey(config.key);
          if (sectionInLibrary) {
            const presets = await reportSectionService.getPresetsBySection(sectionInLibrary.id);
            return { key: config.key, presets };
          }
        } catch (err) {
          logger.error(`Error loading presets for section ${config.key}:`, err);
        }
        return { key: config.key, presets: [] };
      });

      const presetResults = await Promise.all(presetPromises);
      const presetMap: SectionPresetMap = {};
      presetResults.forEach((result) => {
        if (result) {
          presetMap[result.key] = result.presets;
        }
      });
      setSectionPresets(presetMap);
    } catch (error) {
      logger.error('Error loading sections from database:', error);
      throw error;
    }
  };

  const loadExistingReport = async () => {
    if (!reportId && !existingReport) return;

    try {
      setInitialLoading(true);

      const [reportData, sectionsData] = await Promise.all([
        reportId ? reportsService.getReportById(reportId) : Promise.resolve(existingReport),
        reportId ? reportsService.getReportSections(reportId) : Promise.resolve([]),
      ]);

      if (reportData) {
        const effectiveReportType = (reportData.report_type as ReportType | undefined) || reportType;
        const reportConfig = REPORT_TYPES[effectiveReportType];
        setReportTitle(reportConfig.name);

        if (reportData.report_template_id) {
          await loadSectionsFromDatabase(reportData.report_template_id as string);

          const loadedSections: Record<string, string> = {};
          sectionsData.forEach((section: { section_key: string; section_content?: string }) => {
            loadedSections[section.section_key] = section.section_content || '';
          });

          setSections((prev) => ({
            ...prev,
            ...loadedSections,
          }));
        }
      }
    } catch (error) {
      logger.error('Error loading existing report:', error);
      toast.error('Failed to load report. Please try again.');
      onClose();
    } finally {
      setInitialLoading(false);
    }
  };

  const initializeReport = async () => {
    try {
      setInitialLoading(true);

      const reportConfig = REPORT_TYPES[reportType];
      setReportTitle(reportConfig.name);

      const template = await reportsService.getDefaultTemplate(reportType);
      if (!template) {
        toast.error('No template found for this report type');
        onClose();
        return;
      }

      await loadSectionsFromDatabase(template.id);

      // Recovered-files reports prefill their summary section from the case's
      // recovery manifests (the lab's delivery artifact — lifecycle stage 12).
      if (reportType === 'recovered_files') {
        try {
          const [{ manifestService }, { formatFileSize }] = await Promise.all([
            import('../../lib/manifestService'),
            import('../../lib/format'),
          ]);
          const manifests = await manifestService.listManifests(caseId);
          if (manifests.length > 0) {
            const escapeHtml = (value: string) =>
              value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const lines = manifests
              .map(
                (manifest) =>
                  `<p><strong>${escapeHtml(manifest.title ?? 'Manifest')}</strong>` +
                  `${manifest.tool_name ? ` (${escapeHtml(manifest.tool_name)})` : ''} — ` +
                  `${manifest.total_files ?? 0} files, ${manifest.total_folders ?? 0} folders, ` +
                  `${formatFileSize(manifest.total_bytes ?? 0)} · ${manifest.status}</p>`
              )
              .join('\n');
            setSections((prev) => ({
              ...prev,
              recovered_files_summary: `<p>Recovery manifest summary:</p>\n${lines}`,
            }));
          }
        } catch (manifestError) {
          logger.error('Error prefilling manifest summary:', manifestError);
        }
      }
    } catch (error) {
      logger.error('Error initializing report:', error);
      toast.error('Failed to initialize report. Please try again.');
      onClose();
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSectionChange = (sectionKey: string, content: string) => {
    setSections((prev) => ({
      ...prev,
      [sectionKey]: content,
    }));
    setAutoSaveStatus('unsaved');
  };

  const insertPreset = async (preset: SectionPreset) => {
    const currentContent = sections[activeSection];
    const newContent = currentContent
      ? `${currentContent}\n\n${preset.preset_content}`
      : preset.preset_content;
    handleSectionChange(activeSection, newContent);

    try {
      await reportSectionService.incrementPresetUsage(preset.id);
    } catch (err) {
      logger.error('Error incrementing preset usage:', err);
    }
  };

  const getPresetsForSection = (sectionKey: string): SectionPreset[] => {
    const presets = sectionPresets[sectionKey] || [];

    const deviceType = deviceData?.device_type?.toLowerCase() || '';
    const serviceType = caseData.service_type?.name?.toLowerCase() || '';

    return presets.filter((preset) => {
      if (preset.device_type_filter && preset.device_type_filter.length > 0) {
        const matches = preset.device_type_filter.some((filter) =>
          deviceType.includes(filter.toLowerCase())
        );
        if (!matches) return false;
      }

      if (preset.service_type_filter && preset.service_type_filter.length > 0) {
        const matches = preset.service_type_filter.some((filter) =>
          serviceType.includes(filter.toLowerCase())
        );
        if (!matches) return false;
      }

      return true;
    });
  };

  const handleSubmit = async () => {
    if (!reportTitle.trim()) {
      toast.warning('Please enter a report title');
      return;
    }

    const requiredSections = sectionConfigs.filter((c) => c.required);
    const incompleteSections = requiredSections.filter(
      (config) => !sections[config.key]?.trim()
    );

    if (incompleteSections.length > 0) {
      toast.warning(
        `Please complete all required sections: ${incompleteSections
          .map((s) => s.title)
          .join(', ')}`
      );
      return;
    }

    setLoading(true);
    try {
      const sectionsData = allSectionConfigs.map((config) => ({
        key: config.key,
        title: config.title,
        content: sections[config.key] || '',
        order: config.order,
        required: config.required,
      }));

      if (isEditMode) {
        const reportIdToUpdate = reportId || existingReport?.id;
        if (!reportIdToUpdate) {
          throw new Error('Report ID is required for update');
        }

        await reportsService.updateReportSections(reportIdToUpdate, sectionsData);
      } else {
        const template = await reportsService.getDefaultTemplate(reportType);
        if (!template) {
          toast.error('Template not found');
          return;
        }

        await reportsService.createReport(
          caseId,
          reportType,
          reportTitle,
          template.id,
          sectionsData,
          forensicCocId || undefined
        );
      }

      onSuccess();
      onClose();
    } catch (error) {
      logger.error(`Error ${reportId || existingReport ? 'updating' : 'creating'} report:`, error);
      toast.error(`Failed to ${reportId || existingReport ? 'update' : 'create'} report. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const getCompletionStatus = () => {
    const requiredSections = sectionConfigs.filter((c) => c.required);
    const completed = requiredSections.filter(
      (config) => sections[config.key]?.trim().length > 0
    ).length;
    return { completed, total: requiredSections.length };
  };

  if (!isOpen) return null;

  if (initialLoading) {
    return (
      <Dialog
        open={isOpen}
        onClose={onClose}
        label="Loading report"
        closeOnBackdrop={false}
        closeOnEscape={false}
        className="w-[28rem] max-w-none bg-white p-8 flex flex-col gap-4"
      >
        <Skeleton className="h-6 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <p className="text-slate-600 text-center pt-2">Loading report sections...</p>
      </Dialog>
    );
  }

  const { completed, total } = getCompletionStatus();
  const isComplete = completed === total;

  const activeSectionConfig = sectionConfigs.find((c) => c.key === activeSection);
  if (!activeSectionConfig) {
    return null;
  }

  const ActiveIcon = activeSectionConfig.icon;
  const presets = getPresetsForSection(activeSection);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      label="Report editor"
      closeOnBackdrop={false}
      closeOnEscape={false}
      className="mx-8 h-[90vh] max-h-[90vh] w-full max-w-[1400px] overflow-hidden bg-white p-0 flex flex-col"
    >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" style={{ color: REPORT_TYPES[reportType].color }} />
              <Input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="text-lg font-semibold border-0 focus:ring-0 px-0 w-64"
                placeholder="Report Title"
              />
            </div>
            <div className="h-5 w-px bg-slate-300" />
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span>Case #{caseData.case_no}</span>
              <span>•</span>
              <span>
                {caseData.customer?.first_name} {caseData.customer?.last_name}
              </span>
              {deviceData && (
                <>
                  <span>•</span>
                  <span>
                    {deviceData.brand} {deviceData.model}
                  </span>
                </>
              )}
              <span>•</span>
              <span>{new Date(caseData.created_at).toLocaleDateString()}</span>
              {caseData.assigned_engineer && (
                <>
                  <span>•</span>
                  <span>{caseData.assigned_engineer.full_name}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isComplete ? 'success' : 'secondary'}>
              {completed}/{total} Required
            </Badge>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {reportType === 'forensic' && !isEditMode && (
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
            <label className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Chain of custody record
            </label>
            <select
              value={forensicCocId}
              onChange={(e) => setForensicCocId(e.target.value)}
              className="flex-1 max-w-md px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">
                {cocOptions.length === 0
                  ? 'No custody records on this case'
                  : 'Link a custody record (optional)'}
              </option>
              {cocOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              Anchors the forensic report's custody section
            </span>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Report Sections
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {sectionConfigs.map((config) => {
                const hasContent = sections[config.key]?.trim().length > 0;
                const isActive = activeSection === config.key;

                return (
                  <button
                    key={config.key}
                    onClick={() => setActiveSection(config.key)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg transition-all mb-1 ${
                      isActive
                        ? 'bg-white shadow-sm border-l-4'
                        : 'hover:bg-white border-l-4 border-transparent'
                    }`}
                    style={{
                      borderLeftColor: isActive ? config.color : undefined,
                    }}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {hasContent ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-slate-900 mb-0.5">
                        {config.title}
                      </div>
                      {config.required && (
                        <div className="text-xs text-danger font-medium">Required</div>
                      )}
                      {hasContent && (
                        <div className="text-xs text-slate-500 mt-1">
                          {sections[config.key].length} chars
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${activeSectionConfig.color}20` }}
                  >
                    <ActiveIcon className="w-5 h-5" style={{ color: activeSectionConfig.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {activeSectionConfig.title}
                    </h3>
                    <p className="text-sm text-slate-600">{activeSectionConfig.description}</p>
                  </div>
                </div>
              </div>

              {presets.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-500 mr-1">Quick Presets:</span>
                  {presets.slice(0, 4).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => insertPreset(preset)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 rounded-md transition-colors"
                      title={preset.preset_content}
                    >
                      {preset.preset_name.length > 30
                        ? `${preset.preset_name.substring(0, 30)}...`
                        : preset.preset_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden p-6">
              <RichTextEditor
                value={sections[activeSection] || ''}
                onChange={(content) => handleSectionChange(activeSection, content)}
                placeholder={`Enter ${activeSectionConfig.title.toLowerCase()}...`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <div className="text-sm text-slate-500">
              {autoSaveStatus === 'saved' && 'All changes saved'}
              {autoSaveStatus === 'saving' && 'Saving...'}
              {autoSaveStatus === 'unsaved' && 'Unsaved changes'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleSubmit} disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              Save as Draft
            </Button>
            <Button onClick={handleSubmit} disabled={loading || !isComplete}>
              {loading ? (reportId || existingReport ? 'Updating...' : 'Creating...') : (reportId || existingReport ? 'Update Report' : 'Create Report')}
            </Button>
          </div>
        </div>
    </Dialog>
  );
}
