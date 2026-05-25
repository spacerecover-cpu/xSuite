import React, { useState, useEffect } from 'react';
import {
  FileText,
  Check,
  AlertCircle,
  Layers,
  User,
  HardDrive,
  Sparkles,
  Clock,
  DollarSign,
  Shield,
  AlertTriangle,
  CheckCircle,
  Circle,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { RichTextEditor } from '../ui/RichTextEditor';
import { Badge } from '../ui/Badge';
import { reportsService } from '../../lib/reportsService';
import { reportSectionService, type ReportSection, type SectionPreset } from '../../lib/reportSectionService';
import { REPORT_TYPES, type ReportType } from '../../lib/reportTypes';
import { logger } from '../../lib/logger';

interface ProfessionalReportFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseData: {
    case_number: string;
    case_no: string;
    title: string;
    service_type?: { id: string; name: string };
    customer?: {
      first_name: string;
      last_name?: string;
      email?: string;
      mobile_number?: string;
      company_name?: string;
    };
    company?: {
      company_name: string;
    };
    priority?: string;
    status?: string;
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
    interface?: string;
    dom?: string;
  };
  onSuccess: () => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; tint: string; icon: React.ElementType }> = {
  general: { label: 'General', color: '#3b82f6', tint: '#3b82f620', icon: User },
  diagnostic: { label: 'Diagnostic', color: '#ef4444', tint: '#ef444420', icon: AlertCircle },
  solution: { label: 'Solution', color: '#10b981', tint: '#10b98120', icon: Sparkles },
  timeline: { label: 'Timeline', color: '#f59e0b', tint: '#f59e0b20', icon: Clock },
  technical: { label: 'Technical', color: 'rgb(var(--color-accent))', tint: 'rgb(var(--color-accent) / 0.12)', icon: HardDrive },
  financial: { label: 'Financial', color: 'rgb(var(--color-accent))', tint: 'rgb(var(--color-accent) / 0.12)', icon: DollarSign },
  compliance: { label: 'Compliance', color: 'rgb(var(--color-accent))', tint: 'rgb(var(--color-accent) / 0.12)', icon: Shield },
  risk: { label: 'Risk', color: '#dc2626', tint: '#dc262620', icon: AlertTriangle },
};

export function ProfessionalReportFormModal({
  isOpen,
  onClose,
  caseId,
  caseData,
  deviceData,
  onSuccess,
}: ProfessionalReportFormModalProps) {
  const [selectedType, setSelectedType] = useState<ReportType>('evaluation');
  const [reportTitle, setReportTitle] = useState('');
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [sectionContents, setSectionContents] = useState<Record<string, string>>({});
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [presets, setPresets] = useState<Record<string, SectionPreset[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [showPresets, setShowPresets] = useState(true);

  useEffect(() => {
    if (isOpen) {
      resetForm();
      loadSectionsForType('evaluation');
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedType) {
      loadSectionsForType(selectedType);
      setReportTitle(REPORT_TYPES[selectedType].name);
    }
  }, [selectedType]);

  const resetForm = () => {
    setSelectedType('evaluation');
    setReportTitle('');
    setSections([]);
    setSectionContents({});
    setActiveSectionKey(null);
    setPresets({});
  };

  const loadSectionsForType = async (type: ReportType) => {
    setLoadingSections(true);
    try {
      const template = await reportsService.getDefaultTemplate(type);
      if (template) {
        const mappings = await reportSectionService.getTemplateSections(template.id);
        const sectionsData = mappings
          .sort((a, b) => a.section_order - b.section_order)
          .map((m) => m.section);
        setSections(sectionsData);

        // Auto-populate device and case info for general sections
        const initialContents: Record<string, string> = {};
        sectionsData.forEach((section) => {
          if (section.section_key === 'general_details') {
            initialContents[section.section_key] = generateGeneralDetails();
          } else if (section.section_key === 'case_details') {
            initialContents[section.section_key] = generateCaseDetails();
          } else if (section.section_key === 'device_details' && deviceData) {
            initialContents[section.section_key] = generateDeviceDetails();
          } else {
            initialContents[section.section_key] = '';
          }
        });
        setSectionContents(initialContents);

        // Set active section to first incomplete section or first section
        const firstIncomplete = sectionsData.find(
          (s) => !initialContents[s.section_key] || initialContents[s.section_key].trim().length === 0
        );
        setActiveSectionKey(firstIncomplete?.section_key || sectionsData[0]?.section_key || null);

        // Load presets for each section
        const presetsData: Record<string, SectionPreset[]> = {};
        for (const section of sectionsData) {
          const sectionPresets = await reportSectionService.getPresetsBySection(section.id);
          presetsData[section.section_key] = sectionPresets || [];
        }
        setPresets(presetsData);
      }
    } catch (error) {
      logger.error('Error loading sections:', error);
    } finally {
      setLoadingSections(false);
    }
  };

  const generateGeneralDetails = () => {
    const customer = caseData.customer;
    const company = caseData.company || customer?.company_name;

    return `Name: ${customer?.first_name || 'N/A'} ${customer?.last_name || ''}
Company: ${typeof company === 'string' ? company : company?.company_name || 'N/A'}
Phone: ${customer?.mobile_number || 'N/A'}
Email: ${customer?.email || 'N/A'}
Client Ref: ${caseData.case_no || caseData.case_number}`;
  };

  const generateCaseDetails = () => {
    return `Case ID: ${caseData.case_no || caseData.case_number}
Service: ${typeof caseData.service_type === 'string' ? caseData.service_type : caseData.service_type?.name || 'Data Recovery'}
Priority: ${caseData.priority || 'Normal'}
Date: ${new Date(caseData.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
Engineer: ${caseData.assigned_engineer?.full_name || 'Not Assigned'}`;
  };

  const generateDeviceDetails = () => {
    if (!deviceData) return '';

    return `Type: ${deviceData.device_type || 'N/A'}
Brand: ${deviceData.brand || 'N/A'}
Model No: ${deviceData.model || 'N/A'}
Capacity: ${deviceData.capacity || 'N/A'}
Serial No: ${deviceData.serial_number || 'N/A'}
Interface: ${deviceData.interface || 'N/A'}
DOM: ${deviceData.dom || 'N/A'}`;
  };

  const handleSectionContentChange = (sectionKey: string, content: string) => {
    setSectionContents((prev) => ({
      ...prev,
      [sectionKey]: content,
    }));
  };

  const handlePresetSelect = async (sectionKey: string, preset: SectionPreset) => {
    handleSectionContentChange(sectionKey, preset.preset_content);
    try {
      await reportSectionService.incrementPresetUsage(preset.id);
    } catch (error) {
      logger.error('Error incrementing preset usage:', error);
    }
  };

  const validateForm = (): boolean => {
    if (!selectedType || !reportTitle.trim()) {
      alert('Please select a report type and enter a title');
      return false;
    }

    const missingSections = sections.filter((s) => {
      const content = sectionContents[s.section_key];
      return !content || content.trim().length === 0;
    });

    if (missingSections.length > 0) {
      alert(
        `Please fill in all required sections: ${missingSections
          .map((s) => s.section_name)
          .join(', ')}`
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !selectedType) return;

    setLoading(true);
    try {
      const template = await reportsService.getDefaultTemplate(selectedType);
      if (!template) {
        alert('Template not found');
        return;
      }

      const sectionsData = sections.map((section, index) => ({
        key: section.section_key,
        title: section.section_name,
        content: sectionContents[section.section_key] || '',
        order: index + 1,
        required: true,
      }));

      await reportsService.createReport(
        caseId,
        selectedType,
        reportTitle,
        template.id,
        sectionsData
      );

      onSuccess();
      onClose();
      resetForm();
    } catch (error) {
      logger.error('Error creating report:', error);
      alert('Failed to create report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getCompletionPercentage = () => {
    const totalSections = sections.length;
    if (totalSections === 0) return 0;

    const completedSections = sections.filter(
      (s) => sectionContents[s.section_key]?.trim().length > 0
    ).length;

    return Math.round((completedSections / totalSections) * 100);
  };

  const completedCount = sections.filter(
    (s) => sectionContents[s.section_key]?.trim().length > 0
  ).length;

  const activeSectionData = sections.find((s) => s.section_key === activeSectionKey);
  const activeSectionPresets = activeSectionKey ? presets[activeSectionKey] || [] : [];
  const categoryConfig = activeSectionData
    ? CATEGORY_CONFIG[activeSectionData.category]
    : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="7xl">
      <div className="h-[85vh] overflow-hidden flex flex-col">
        {/* Compact Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex-1 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-slate-900">Create Professional Report</h2>
            </div>
            <div className="h-4 w-px bg-slate-300" />
            <p className="text-sm text-slate-600">
              {caseData.case_no || caseData.case_number} • {caseData.title}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-500">Progress:</div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${getCompletionPercentage()}%` }}
                  />
                </div>
                <div className="text-xs font-semibold text-slate-900 min-w-[3rem]">
                  {getCompletionPercentage()}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Three Column Layout */}
        <div className="flex-1 flex gap-4 pt-4 overflow-hidden">
          {/* Left Column - Report Type Selector (20%) */}
          <div className="w-1/5 flex flex-col border-r border-slate-200 pr-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Report Type
            </h3>
            <div className="space-y-1 overflow-y-auto flex-1">
              {Object.values(REPORT_TYPES).map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType === type.key;
                return (
                  <button
                    key={type.key}
                    onClick={() => setSelectedType(type.key)}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-2 border-primary/60'
                        : 'border-2 border-transparent hover:bg-slate-50'
                    }`}
                    title={type.description}
                  >
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: isSelected ? `${type.color}20` : '#f1f5f9',
                        color: type.color,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                        {type.name}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Middle Column - Section List (28%) */}
          <div className="w-[28%] flex flex-col border-r border-slate-200 pr-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Sections
              </h3>
              <div className="text-xs text-slate-500">
                {completedCount} / {sections.length}
              </div>
            </div>
            {loadingSections ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block w-6 h-6 border-3 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                  <p className="text-xs text-slate-500 mt-2">Loading sections...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1 overflow-y-auto flex-1">
                {sections.map((section, index) => {
                  const hasContent = sectionContents[section.section_key]?.trim().length > 0;
                  const isActive = activeSectionKey === section.section_key;
                  const config = CATEGORY_CONFIG[section.category];
                  const presetCount = presets[section.section_key]?.length || 0;

                  return (
                    <button
                      key={section.section_key}
                      onClick={() => setActiveSectionKey(section.section_key)}
                      className={`w-full flex items-start gap-2 p-2.5 rounded-lg text-left transition-all ${
                        isActive
                          ? 'bg-slate-100 border-l-4'
                          : 'border-l-4 border-transparent hover:bg-slate-50'
                      }`}
                      style={{
                        borderLeftColor: isActive ? config.color : undefined,
                      }}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {hasContent ? (
                          <CheckCircle className="w-4 h-4 text-success" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {section.section_name}
                          </div>
                        </div>
                        {section.section_name_ar && (
                          <div className="text-xs text-slate-500 truncate" dir="rtl">
                            {section.section_name_ar}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: config.color }}
                          />
                          <span className="text-xs text-slate-500">{config.label}</span>
                          {presetCount > 0 && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {presetCount} presets
                            </Badge>
                          )}
                        </div>
                        {hasContent && (
                          <div className="text-xs text-slate-400 mt-1">
                            {sectionContents[section.section_key]?.length || 0} chars
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column - Content Editor (52%) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeSectionData ? (
              <>
                {/* Section Header */}
                <div className="mb-3 pb-3 border-b border-slate-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {categoryConfig && (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: categoryConfig.tint,
                            color: categoryConfig.color,
                          }}
                        >
                          <categoryConfig.icon className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {activeSectionData.section_name}
                        </h3>
                        {activeSectionData.section_name_ar && (
                          <div className="text-sm text-slate-500" dir="rtl">
                            {activeSectionData.section_name_ar}
                          </div>
                        )}
                      </div>
                    </div>
                    {activeSectionPresets.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowPresets(!showPresets)}
                      >
                        <Layers className="w-3.5 h-3.5 mr-1" />
                        {showPresets ? 'Hide' : 'Show'} Presets ({activeSectionPresets.length})
                      </Button>
                    )}
                  </div>
                  {activeSectionData.section_description && (
                    <p className="text-sm text-slate-600 ml-13">
                      {activeSectionData.section_description}
                    </p>
                  )}
                </div>

                {/* Presets Panel - Collapsible */}
                {activeSectionPresets.length > 0 && showPresets && (
                  <div className="mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex flex-wrap gap-2">
                      {activeSectionPresets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handlePresetSelect(activeSectionKey!, preset)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-md hover:border-primary/40 hover:bg-primary/10 transition-colors text-left"
                          title={preset.preset_content}
                        >
                          <div className="text-xs font-medium text-slate-900">
                            {preset.preset_name}
                          </div>
                          {preset.usage_count > 0 && (
                            <div className="text-xs text-slate-500">
                              Used {preset.usage_count}x
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content Editor */}
                {activeSectionKey && (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <RichTextEditor
                      value={sectionContents[activeSectionKey] || ''}
                      onChange={(content) => handleSectionContentChange(activeSectionKey, content)}
                      placeholder={`Enter ${activeSectionData.section_name.toLowerCase()} content...`}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">Select a section to edit</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-200">
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <div className="text-sm text-slate-600">
              {completedCount} / {sections.length} sections completed
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={loading || completedCount < sections.length}>
            {loading ? 'Creating...' : 'Create Report'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
