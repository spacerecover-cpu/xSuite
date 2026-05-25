import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RichTextEditor } from '../ui/RichTextEditor';
import { reportsService } from '../../lib/reportsService';
import {
  REPORT_TYPES,
  type ReportType,
  type ReportTemplate,
  type ReportSection,
} from '../../lib/reportTypes';
import { logger } from '../../lib/logger';

interface ReportFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  serviceType?: string;
  onSuccess: () => void;
  existingReportId?: string;
  isNewVersion?: boolean;
}

export default function ReportFormModal({
  isOpen,
  onClose,
  caseId,
  caseNumber,
  serviceType,
  onSuccess,
  existingReportId,
  isNewVersion = false,
}: ReportFormModalProps) {
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [sectionData, setSectionData] = useState<
    Record<string, { content: string; section: ReportSection }>
  >({});
  const [versionNotes, setVersionNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingTemplateList, setLoadingTemplateList] = useState(false);
  const [chainOfCustodyId, setChainOfCustodyId] = useState<string | undefined>();

  // Load existing report for versioning
  useEffect(() => {
    if (existingReportId && isNewVersion) {
      loadExistingReport();
    }
  }, [existingReportId, isNewVersion]);

  const loadExistingReport = async () => {
    if (!existingReportId) return;

    try {
      setLoading(true);
      const report = await reportsService.getReportById(existingReportId);
      const sections = await reportsService.getReportSections(existingReportId);

      if (report) {
        setSelectedType(report.report_type);
        setReportTitle(report.title);
        setChainOfCustodyId(report.forensic_chain_of_custody_id || undefined);

        // Load sections
        const sectionMap: Record<string, { content: string; section: ReportSection }> = {};
        sections.forEach((s) => {
          sectionMap[s.section_key] = {
            content: s.section_content,
            section: {
              key: s.section_key,
              title: s.section_title,
              description: '',
              order: s.section_order,
              required: s.is_required,
              type: 'rich_text',
            },
          };
        });
        setSectionData(sectionMap);

        // Load available templates for this report type
        if (report.report_template_id) {
          loadAvailableTemplates(report.report_type);
        }
      }
    } catch (error) {
      logger.error('Error loading existing report:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTemplates = async (reportType: ReportType) => {
    try {
      setLoadingTemplateList(true);
      const templates = await reportsService.getTemplatesForReportType(reportType);
      setAvailableTemplates(templates);

      // Set default to blank
      setSelectedTemplateId('blank');

      // Get default template structure for blank sections
      const defaultTemplate = templates.find(t => t.is_default) || templates[0];
      if (defaultTemplate) {
        setTemplate(defaultTemplate);

        // Initialize with blank sections
        const initialSections: Record<string, { content: string; section: ReportSection }> = {};
        if (defaultTemplate.template_structure && defaultTemplate.template_structure.sections) {
          defaultTemplate.template_structure.sections.forEach((section) => {
            initialSections[section.key] = {
              content: '',
              section,
            };
          });
        }
        setSectionData(initialSections);
      }
    } catch (error) {
      logger.error('Error loading templates:', error);
      alert('Failed to load templates. Please try again.');
    } finally {
      setLoadingTemplateList(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    if (templateId === 'blank') {
      // Keep sections but clear content
      const clearedSections = { ...sectionData };
      Object.keys(clearedSections).forEach(key => {
        clearedSections[key] = {
          ...clearedSections[key],
          content: '',
        };
      });
      setSectionData(clearedSections);
      return;
    }

    try {
      setLoadingTemplate(true);
      const selectedTemplate = availableTemplates.find(t => t.id === templateId);

      if (!selectedTemplate) {
        alert('Template not found');
        return;
      }

      setTemplate(selectedTemplate);

      // Populate sections with template content
      const populatedSections: Record<string, { content: string; section: ReportSection }> = {};

      if (selectedTemplate.template_structure && selectedTemplate.template_structure.sections) {
        selectedTemplate.template_structure.sections.forEach((section) => {
          populatedSections[section.key] = {
            content: '',
            section,
          };
        });
      }

      setSectionData(populatedSections);
    } catch (error) {
      logger.error('Error applying template:', error);
      alert('Failed to apply template. Please try again.');
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleTypeSelect = (type: ReportType) => {
    setSelectedType(type);
    setReportTitle(REPORT_TYPES[type].name);
    loadAvailableTemplates(type);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    applyTemplate(templateId);
  };

  const handleSectionChange = (key: string, content: string) => {
    setSectionData((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        content,
      },
    }));
  };

  const validateForm = (): boolean => {
    if (!selectedType || !reportTitle.trim()) {
      alert('Please select a report type and enter a title');
      return false;
    }

    if (!template) {
      alert('Template not loaded. Please try again.');
      return false;
    }

    if (!template.template_structure || !template.template_structure.sections) {
      alert('Invalid template structure. Please contact administrator.');
      return false;
    }

    // Check required sections (only if content exists or marked required)
    const requiredSections = template.template_structure.sections.filter((s) => s.required);
    const missingSections = requiredSections.filter(
      (s) => s.type !== 'chain_of_custody' && s.required && !sectionData[s.key]?.content?.trim()
    );

    if (missingSections.length > 0) {
      const missingTitles = missingSections
        .map((s) => (typeof s.title === 'string' ? s.title : 'Unknown Section'))
        .join(', ');
      alert(`Please fill in all required sections: ${missingTitles}`);
      return false;
    }

    if (isNewVersion && !versionNotes.trim()) {
      alert('Please provide version notes explaining the changes');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !template || !selectedType) {
      return;
    }

    try {
      setLoading(true);

      const sections = template.template_structure.sections.map((section) => ({
        key: section.key,
        title: section.title,
        content: sectionData[section.key]?.content || '',
        order: section.order,
        required: section.required,
      }));

      if (isNewVersion && existingReportId) {
        // Create new version
        await reportsService.createReportVersion(existingReportId, versionNotes, sections);
      } else {
        // Create new report
        await reportsService.createReport(
          caseId,
          selectedType,
          reportTitle,
          template.id,
          sections,
          selectedType === 'forensic' ? chainOfCustodyId : undefined
        );
      }

      onSuccess();
      handleClose();
    } catch (error) {
      logger.error('Error creating report:', error);
      alert('Failed to create report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedType(null);
    setReportTitle('');
    setTemplate(null);
    setSectionData({});
    setVersionNotes('');
    setChainOfCustodyId(undefined);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="">
      <div className="max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold text-gray-900">
                {isNewVersion ? 'Create New Report Version' : 'Create New Report'}
              </h2>
            </div>
            {serviceType && (
              <p className="text-sm text-gray-600">Service: {serviceType}</p>
            )}
            <p className="text-sm text-gray-600">Case: {caseNumber}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Report Type Selection */}
          {!isNewVersion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Report Type <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <select
                  value={selectedType || ''}
                  onChange={(e) => handleTypeSelect(e.target.value as ReportType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                >
                  <option value="">Choose the type of report to create...</option>
                  {Object.values(REPORT_TYPES).map((type) => {
                    return (
                      <option key={type.key} value={type.key}>
                        {type.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Display type options with icons and descriptions */}
              {!selectedType && (
                <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                  {Object.values(REPORT_TYPES).map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.key}
                        type="button"
                        onClick={() => handleTypeSelect(type.key)}
                        className="w-full flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-primary/40 transition-colors text-left"
                      >
                        <Icon className="w-5 h-5 mt-0.5" style={{ color: type.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{type.name}</div>
                          <div className="text-sm text-gray-600">{type.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Report Title */}
          {selectedType && (
            <>
              <Input
                label="Report Title"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                required
                placeholder="Enter report title"
              />

              {/* Template Selection */}
              {!isNewVersion && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Template
                  </label>
                  {loadingTemplateList ? (
                    <div className="text-sm text-gray-600">Loading templates...</div>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => handleTemplateChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      >
                        <option value="blank">None (Blank Report)</option>
                        {availableTemplates.map((tmpl) => (
                          <option key={tmpl.id} value={tmpl.id}>
                            {tmpl.template_name}
                            {tmpl.is_default && ' (Default)'}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500">
                        Select a template to pre-populate sections with content, or choose &quot;None&quot; to start with blank sections.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Version Notes */}
              {isNewVersion && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Version Notes <span className="text-danger">*</span>
                  </label>
                  <textarea
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    rows={3}
                    placeholder="Describe what changes were made in this version..."
                    required
                  />
                </div>
              )}

              {/* Report Sections */}
              {loadingTemplate ? (
                <div className="text-center py-8 text-gray-600">Loading template...</div>
              ) : template ? (
                <div className="space-y-6">
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Report Sections</h3>
                    {template.template_structure.sections.map((section) => (
                      <div key={section.key} className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {typeof section.title === 'string' ? section.title : 'Untitled Section'}
                          {section.required && <span className="text-danger ml-1">*</span>}
                        </label>
                        {section.description && typeof section.description === 'string' && (
                          <p className="text-sm text-gray-600 mb-2">{section.description}</p>
                        )}
                        {section.type === 'chain_of_custody' ? (
                          <div className="p-4 bg-info-muted border border-info/30 rounded-lg">
                            <p className="text-sm text-info">
                              Chain of Custody timeline will be automatically populated from case
                              records when the report is generated.
                            </p>
                          </div>
                        ) : section.type === 'certification' ? (
                          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="text-sm text-gray-700">
                              Certification section will be formatted for signature during PDF
                              generation.
                            </p>
                            <RichTextEditor
                              value={sectionData[section.key]?.content || ''}
                              onChange={(content) => handleSectionChange(section.key, content)}
                              placeholder="Enter certification details and examiner credentials..."
                            />
                          </div>
                        ) : (
                          <RichTextEditor
                            value={sectionData[section.key]?.content || ''}
                            onChange={(content) => handleSectionChange(section.key, content)}
                            placeholder={`Enter ${section.title.toLowerCase()} content...`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-600">
                  Select a report type to begin
                </div>
              )}
            </>
          )}

          {/* Actions */}
          {selectedType && template && (
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading
                  ? 'Creating...'
                  : isNewVersion
                  ? 'Create Version'
                  : 'Create Report'}
              </Button>
            </div>
          )}
        </form>
      </div>
    </Modal>
  );
}
