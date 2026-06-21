import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Copy, Edit2, Eye, FileText, ListOrdered, Plus, Star } from 'lucide-react';
import { reportsService } from '../../lib/reportsService';
import {
  REPORT_TYPES,
  getReportTypeConfig,
  type ReportTemplate,
  type ReportType,
} from '../../lib/reportTypes';
import { reportKeys } from '../../lib/queryKeys';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import { TemplateSectionsEditor } from './TemplateSectionsEditor';

type TypeFilter = ReportType | 'all';

interface TemplateFormValues {
  name: string;
  description: string;
  reportType: ReportType;
  isDefault: boolean;
}

const REPORT_TYPE_OPTIONS = Object.values(REPORT_TYPES).map((config) => ({
  value: config.key,
  label: config.name,
}));

const TemplateFormModal: React.FC<{
  /** null = create mode; a tenant template = edit mode (report type locked). */
  template: ReportTemplate | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: TemplateFormValues) => void;
}> = ({ template, isSaving, onClose, onSubmit }) => {
  const [name, setName] = useState(template?.template_name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [reportType, setReportType] = useState<ReportType>(template?.report_type ?? 'evaluation');
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [nameError, setNameError] = useState('');

  const isEdit = template !== null;
  const typeConfig = getReportTypeConfig(reportType);
  const TypeIcon = typeConfig.icon;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('Template name is required');
      return;
    }
    onSubmit({ name: name.trim(), description: description.trim(), reportType, isDefault });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit Template' : 'New Report Template'}
      icon={FileText}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Template name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError('');
          }}
          error={nameError}
          placeholder="e.g. RAID Evaluation — Enterprise"
        />

        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="When should engineers pick this template?"
        />

        {isEdit ? (
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1">Report type</span>
            <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md bg-surface-muted">
              <TypeIcon className="w-4 h-4" style={{ color: typeConfig.color }} />
              <span className="text-sm text-slate-700">{typeConfig.name}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              The report type cannot be changed after creation.
            </p>
          </div>
        ) : (
          <Select
            label="Report type"
            required
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            options={REPORT_TYPE_OPTIONS}
            hint={typeConfig.description}
          />
        )}

        <Checkbox
          label="Set as the default template for this report type"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const ReportTemplatesTab: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [sectionsTemplate, setSectionsTemplate] = useState<ReportTemplate | null>(null);
  const [deactivatingTemplate, setDeactivatingTemplate] = useState<ReportTemplate | null>(null);

  const activeFilter = typeFilter === 'all' ? undefined : typeFilter;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: reportKeys.templates(activeFilter),
    queryFn: () => reportsService.getReportTemplates(activeFilter),
  });

  const invalidateTemplates = () =>
    queryClient.invalidateQueries({ queryKey: [...reportKeys.all, 'templates'] });

  const createMutation = useMutation({
    mutationFn: (values: TemplateFormValues & { tenantId: string }) =>
      reportsService.createReportTemplate({
        name: values.name,
        description: values.description || undefined,
        reportType: values.reportType,
        isDefault: values.isDefault,
        tenantId: values.tenantId,
      }),
    onSuccess: () => {
      toast.success('Template created');
      invalidateTemplates();
      setIsFormOpen(false);
    },
    onError: (error) => {
      logger.error('Error creating report template:', error);
      toast.error('Failed to create template');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TemplateFormValues }) =>
      reportsService.updateReportTemplate(id, {
        name: values.name,
        description: values.description,
        isDefault: values.isDefault,
      }),
    onSuccess: () => {
      toast.success('Template updated');
      invalidateTemplates();
      setIsFormOpen(false);
      setEditingTemplate(null);
    },
    onError: (error) => {
      logger.error('Error updating report template:', error);
      toast.error('Failed to update template');
    },
  });

  const cloneMutation = useMutation({
    mutationFn: ({ templateId, tenantId: tid }: { templateId: string; tenantId: string }) =>
      reportsService.cloneTemplateToTenant(templateId, tid),
    onSuccess: () => {
      toast.success('Template cloned — you can now customize it');
      invalidateTemplates();
    },
    onError: (error) => {
      logger.error('Error cloning report template:', error);
      toast.error('Failed to clone template');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (templateId: string) =>
      reportsService.updateReportTemplate(templateId, { isActive: false }),
    onSuccess: () => {
      toast.success('Template deactivated');
      invalidateTemplates();
      setDeactivatingTemplate(null);
    },
    onError: (error) => {
      logger.error('Error deactivating report template:', error);
      toast.error('Failed to deactivate template');
    },
  });

  const handleFormSubmit = (values: TemplateFormValues) => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, values });
      return;
    }
    if (!tenantId) {
      toast.error('Templates can only be created from a tenant workspace');
      return;
    }
    createMutation.mutate({ ...values, tenantId });
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="w-full sm:w-72">
          <Select
            aria-label="Filter templates by report type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            options={[{ value: 'all', label: 'All report types' }, ...REPORT_TYPE_OPTIONS]}
          />
        </div>
        <Button
          onClick={() => {
            setEditingTemplate(null);
            setIsFormOpen(true);
          }}
          disabled={!tenantId}
          title={!tenantId ? 'Templates can only be created from a tenant workspace' : undefined}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {/* Templates grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-9" />
              </div>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">
            {typeFilter === 'all'
              ? 'No report templates yet'
              : `No templates for ${getReportTypeConfig(typeFilter).name.toLowerCase()}s`}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Create a template or clone a system one to get started
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const typeConfig = getReportTypeConfig(template.report_type);
            const TypeIcon = typeConfig.icon;
            const isSystem = template.tenant_id == null;
            const isCloning =
              cloneMutation.isPending && cloneMutation.variables?.templateId === template.id;

            return (
              <Card key={template.id} className="p-5 flex flex-col hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${typeConfig.color}20`, color: typeConfig.color }}
                  >
                    <TypeIcon className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {template.is_default && (
                      <Badge variant="warning" size="sm" className="gap-1">
                        <Star className="w-3 h-3" aria-hidden="true" />
                        Default
                      </Badge>
                    )}
                    {isSystem ? (
                      <Badge variant="default" size="sm">
                        System
                      </Badge>
                    ) : (
                      <Badge
                        variant="custom"
                        size="sm"
                        className="bg-primary/10 text-primary ring-1 ring-primary/30"
                      >
                        Custom
                      </Badge>
                    )}
                  </div>
                </div>

                <h3 className="font-semibold text-slate-900 mb-1.5">{template.template_name}</h3>
                <Badge variant="custom" size="sm" color={typeConfig.badgeColor} className="self-start mb-2">
                  {typeConfig.name}
                </Badge>
                <p className="text-sm text-slate-600 line-clamp-2 mb-4 flex-1">
                  {template.description || 'No description'}
                </p>

                <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                  {isSystem ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        disabled={!tenantId}
                        isLoading={isCloning}
                        title={
                          !tenantId
                            ? 'Cloning is only available from a tenant workspace'
                            : undefined
                        }
                        onClick={() =>
                          tenantId &&
                          cloneMutation.mutate({ templateId: template.id, tenantId })
                        }
                      >
                        {!isCloning && <Copy className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
                        Clone to customize
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`View sections of ${template.template_name}`}
                        title="View sections"
                        onClick={() => setSectionsTemplate(template)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setSectionsTemplate(template)}
                      >
                        <ListOrdered className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        Manage sections
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Edit ${template.template_name}`}
                        title="Edit template"
                        onClick={() => {
                          setEditingTemplate(template);
                          setIsFormOpen(true);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Deactivate ${template.template_name}`}
                        title="Deactivate template"
                        className="text-danger hover:bg-danger-muted"
                        onClick={() => setDeactivatingTemplate(template)}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit modal */}
      {isFormOpen && (
        <TemplateFormModal
          template={editingTemplate}
          isSaving={createMutation.isPending || updateMutation.isPending}
          onClose={() => {
            setIsFormOpen(false);
            setEditingTemplate(null);
          }}
          onSubmit={handleFormSubmit}
        />
      )}

      {/* Sections editor (editable for tenant rows, read-only for system rows) */}
      {sectionsTemplate && (
        <TemplateSectionsEditor
          template={sectionsTemplate}
          isOpen
          onClose={() => setSectionsTemplate(null)}
        />
      )}

      {/* Deactivate confirmation */}
      <ConfirmDialog
        isOpen={deactivatingTemplate !== null}
        onClose={() => setDeactivatingTemplate(null)}
        onConfirm={() =>
          deactivatingTemplate && deactivateMutation.mutate(deactivatingTemplate.id)
        }
        title="Deactivate Template"
        message={`"${deactivatingTemplate?.template_name ?? ''}" will no longer be offered when creating reports. Existing reports are not affected.`}
        confirmText="Deactivate"
        variant="warning"
        isLoading={deactivateMutation.isPending}
      />
    </div>
  );
};
