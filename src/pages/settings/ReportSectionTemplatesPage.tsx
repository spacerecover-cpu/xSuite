import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, Pencil, Plus, Star, StarOff, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { ReportTemplateEditorModal } from '../../components/settings/reports/ReportTemplateEditorModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { REPORT_TYPES, type ReportType } from '../../lib/reportTypes';
import { reportSectionTemplateKeys } from '../../lib/queryKeys';
import {
  clearDefaultReportSectionTemplate,
  listReportSectionPresets,
  listSectionLibrary,
  listTenantReportSectionTemplates,
  normalizeSections,
  setDefaultReportSectionTemplate,
  softDeleteReportSectionTemplate,
  type ReportSectionPresetRow,
  type ReportSectionTemplateRow,
  type TemplateSectionDescriptor,
} from '../../lib/reportSectionTemplateService';

/** Roles allowed to manage report section templates (manager and above). */
const EDITOR_ROLES = ['owner', 'admin', 'manager'] as const;

interface EditorState {
  reportType: ReportType;
  template: ReportSectionTemplateRow | null;
  initialSections?: TemplateSectionDescriptor[];
  initialName?: string;
  sourcePresetId?: string | null;
}

/**
 * Settings → Report Sections: the predefined (system) section templates per
 * report type plus the tenant's customized templates — duplicate a preset,
 * edit sections, set the per-type default, or start from scratch. The picker
 * in Case → Reports → New Document offers exactly these templates.
 */
export const ReportSectionTemplatesPage: React.FC = () => {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const canEdit = !!profile?.role && (EDITOR_ROLES as readonly string[]).includes(profile.role);

  const manageQuery = useQuery({
    queryKey: reportSectionTemplateKeys.manage(),
    queryFn: async () => {
      const [templates, presets] = await Promise.all([
        listTenantReportSectionTemplates(),
        listReportSectionPresets(),
      ]);
      return { templates, presets };
    },
  });
  const libraryQuery = useQuery({
    queryKey: reportSectionTemplateKeys.library(),
    queryFn: listSectionLibrary,
    staleTime: 5 * 60 * 1000,
  });

  const [editor, setEditor] = useState<EditorState | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: reportSectionTemplateKeys.all });

  const setDefaultMutation = useMutation({
    mutationFn: ({ id, reportType }: { id: string; reportType: string }) =>
      setDefaultReportSectionTemplate(id, reportType),
    onSuccess: () => {
      toast.success('Default template updated');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to set default'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteReportSectionTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete template'),
  });

  const clearDefaultMutation = useMutation({
    mutationFn: (reportType: string) => clearDefaultReportSectionTemplate(reportType),
    onSuccess: () => {
      toast.success('Back to the system default');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to clear default'),
  });

  const byType = useMemo(() => {
    const templates = manageQuery.data?.templates ?? [];
    const presets = manageQuery.data?.presets ?? [];
    const map = new Map<
      string,
      { presets: ReportSectionPresetRow[]; templates: ReportSectionTemplateRow[] }
    >();
    for (const key of Object.keys(REPORT_TYPES)) map.set(key, { presets: [], templates: [] });
    for (const p of presets) map.get(p.report_type)?.presets.push(p);
    for (const t of templates) map.get(t.report_type)?.templates.push(t);
    return map;
  }, [manageQuery.data]);

  const duplicatePreset = (reportType: ReportType, preset: ReportSectionPresetRow) => {
    setEditor({
      reportType,
      template: null,
      initialSections: normalizeSections(preset.sections),
      initialName: `${preset.name} (Custom)`,
      sourcePresetId: preset.id,
    });
  };

  const newTemplate = (reportType: ReportType) => {
    const defaults = byType.get(reportType)?.presets.find((p) => p.is_default);
    setEditor({
      reportType,
      template: null,
      initialSections: defaults ? normalizeSections(defaults.sections) : [],
      initialName: '',
      sourcePresetId: defaults?.id ?? null,
    });
  };

  const confirmDelete = (t: ReportSectionTemplateRow) => {
    void confirm({
      title: 'Delete template?',
      message: `"${t.name}" will no longer be offered when creating a ${REPORT_TYPES[t.report_type as ReportType]?.name ?? 'report'}. Existing documents are unaffected.`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => deleteMutation.mutateAsync(t.id),
    });
  };

  const sectionsCount = (sections: unknown) => normalizeSections(sections).length;

  return (
    <div className="space-y-6 p-6">
      <SettingsPageHeader categoryId="report-sections" />
      <p className="max-w-3xl text-sm text-slate-600">
        Every report type ships with predefined section templates. Duplicate one to customize it
        for your lab — rename, add, remove or reorder sections — and mark your version as the
        default used when engineers create that report.
        {!canEdit && ' You have read-only access; a manager can make changes.'}
      </p>

      {manageQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {(Object.keys(REPORT_TYPES) as ReportType[]).map((typeKey) => {
            const cfg = REPORT_TYPES[typeKey];
            const group = byType.get(typeKey) ?? { presets: [], templates: [] };
            const hasTenantDefault = group.templates.some((t) => t.is_default);
            const TypeIcon = cfg.icon;
            return (
              <Card key={typeKey}>
                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <TypeIcon className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-slate-900">{cfg.name}</h2>
                        <p className="truncate text-xs text-slate-500">{cfg.description}</p>
                      </div>
                    </div>
                    {canEdit && (
                      <Button variant="secondary" size="sm" onClick={() => newTemplate(typeKey)}>
                        <Plus className="mr-1 h-4 w-4" />
                        New
                      </Button>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {group.presets.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-800">{p.name}</span>
                            <Badge variant="secondary" size="sm">System</Badge>
                            {p.is_default && !hasTenantDefault && (
                              <Badge variant="info" size="sm">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {sectionsCount(p.sections)} sections
                          </p>
                        </div>
                        {canEdit && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => duplicatePreset(typeKey, p)}
                            title="Duplicate this predefined template to customize it"
                          >
                            <Copy className="mr-1 h-4 w-4" />
                            Customize
                          </Button>
                        )}
                      </li>
                    ))}

                    {group.templates.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-slate-900">
                              {t.name}
                            </span>
                            <Badge variant="accent" size="sm">Custom</Badge>
                            {t.is_default && (
                              <Badge variant="info" size="sm">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {sectionsCount(t.sections)} sections
                            {t.description ? ` · ${t.description}` : ''}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0 items-center gap-1">
                            {!t.is_default ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Set ${t.name} as default`}
                                title="Use for every new report of this type"
                                disabled={setDefaultMutation.isPending}
                                onClick={() =>
                                  setDefaultMutation.mutate({ id: t.id, reportType: typeKey })
                                }
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Stop using ${t.name} as default`}
                                title="Revert to the system default template"
                                disabled={clearDefaultMutation.isPending}
                                onClick={() => clearDefaultMutation.mutate(typeKey)}
                              >
                                <StarOff className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Edit ${t.name}`}
                              onClick={() => setEditor({ reportType: typeKey, template: t })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Delete ${t.name}`}
                              disabled={deleteMutation.isPending}
                              onClick={() => confirmDelete(t)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editor && (
        <ReportTemplateEditorModal
          isOpen={!!editor}
          onClose={() => setEditor(null)}
          reportType={editor.reportType}
          library={libraryQuery.data ?? []}
          template={editor.template}
          initialSections={editor.initialSections}
          initialName={editor.initialName}
          sourcePresetId={editor.sourcePresetId}
          onSaved={invalidate}
        />
      )}
    </div>
  );
};
