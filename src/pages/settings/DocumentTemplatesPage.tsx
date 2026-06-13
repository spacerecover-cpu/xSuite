import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileStack,
  Pencil,
  Copy,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { logger } from '../../lib/logger';
import {
  documentTemplatePdfKeys,
  documentTemplateVersionKeys,
} from '../../lib/queryKeys';
import {
  createVersion,
  getDeployedVersionByType,
  getDocumentTemplateByType,
  publishVersion,
  readConfig,
  upsertDocumentTemplate,
  type DocumentTemplatePdf,
  type DocumentTemplateVersion,
} from '../../lib/documentTemplateService';
import type {
  TemplateConfigOverride,
  TemplateDocumentType,
} from '../../lib/pdf/templateConfig';
import { DOCUMENT_TYPES, DOC_TYPE_LABELS } from './documentTypeMeta';
import { DocumentTemplateEditor } from './DocumentTemplateEditor';

/** Roles allowed to edit document templates (manager and above). */
const EDITOR_ROLES = ['owner', 'admin', 'manager'] as const;

/** Per-type query result: the tenant's template + its deployed version (if any). */
interface DocTypeState {
  template: DocumentTemplatePdf | null;
  deployed: DocumentTemplateVersion | null;
}

/** Query: load every curated doc type's template + deployed version in parallel. */
const documentTemplatesOverviewKey = [
  ...documentTemplatePdfKeys.all,
  'overview',
  ...documentTemplateVersionKeys.all,
] as const;

async function loadOverview(): Promise<Record<string, DocTypeState>> {
  const entries = await Promise.all(
    DOCUMENT_TYPES.map(async ({ type }) => {
      const template = await getDocumentTemplateByType(type);
      const deployed = template ? await getDeployedVersionByType(type) : null;
      return [type, { template, deployed }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export const DocumentTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const canEdit = !!profile?.role && (EDITOR_ROLES as readonly string[]).includes(profile.role);

  const [editing, setEditing] = useState<TemplateDocumentType | null>(null);

  const {
    data: overview,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: documentTemplatesOverviewKey,
    queryFn: loadOverview,
  });

  /** Persist an override: upsert the per-type template, create + deploy a new version. */
  const saveMutation = useMutation({
    mutationFn: async ({
      docType,
      override,
    }: {
      docType: TemplateDocumentType;
      override: TemplateConfigOverride;
    }) => {
      const template = await upsertDocumentTemplate(docType, {
        name: DOC_TYPE_LABELS[docType],
        is_default: true,
      });
      const version = await createVersion(template.id, override, {
        changeNote: `Edited ${DOC_TYPE_LABELS[docType]} template`,
      });
      return publishVersion(template.id, version.id);
    },
    onSuccess: (_data, { docType }) => {
      toast.success(`${DOC_TYPE_LABELS[docType]} template saved and deployed.`);
      queryClient.invalidateQueries({ queryKey: documentTemplatePdfKeys.all });
      queryClient.invalidateQueries({ queryKey: documentTemplateVersionKeys.all });
      setEditing(null);
    },
    onError: (err) => {
      logger.error('[DocumentTemplatesPage] save failed:', err);
      toast.error('Could not save the template. Please try again.');
    },
  });

  /** Duplicate: copy the deployed override into a fresh deployed version. */
  const duplicateMutation = useMutation({
    mutationFn: async (docType: TemplateDocumentType) => {
      const deployed = await getDeployedVersionByType(docType);
      const override: TemplateConfigOverride = deployed ? readConfig(deployed.config) : {};
      const template = await upsertDocumentTemplate(docType, {
        name: DOC_TYPE_LABELS[docType],
        is_default: true,
      });
      const version = await createVersion(template.id, override, {
        changeNote: `Duplicated ${DOC_TYPE_LABELS[docType]} template`,
      });
      return publishVersion(template.id, version.id);
    },
    onSuccess: (_data, docType) => {
      toast.success(`${DOC_TYPE_LABELS[docType]} template duplicated.`);
      queryClient.invalidateQueries({ queryKey: documentTemplateVersionKeys.all });
      queryClient.invalidateQueries({ queryKey: documentTemplatePdfKeys.all });
    },
    onError: (err) => {
      logger.error('[DocumentTemplatesPage] duplicate failed:', err);
      toast.error('Could not duplicate the template.');
    },
  });

  /** Reset to default: deploy an empty override (built-in defaults take over). */
  const resetMutation = useMutation({
    mutationFn: async (docType: TemplateDocumentType) => {
      const template = await upsertDocumentTemplate(docType, {
        name: DOC_TYPE_LABELS[docType],
        is_default: true,
      });
      const version = await createVersion(template.id, {}, {
        changeNote: `Reset ${DOC_TYPE_LABELS[docType]} template to default`,
      });
      return publishVersion(template.id, version.id);
    },
    onSuccess: (_data, docType) => {
      toast.success(`${DOC_TYPE_LABELS[docType]} template reset to default.`);
      queryClient.invalidateQueries({ queryKey: documentTemplateVersionKeys.all });
      queryClient.invalidateQueries({ queryKey: documentTemplatePdfKeys.all });
    },
    onError: (err) => {
      logger.error('[DocumentTemplatesPage] reset failed:', err);
      toast.error('Could not reset the template.');
    },
  });

  const handleReset = async (docType: TemplateDocumentType) => {
    await confirm({
      title: 'Reset to default?',
      message: `This replaces your custom ${DOC_TYPE_LABELS[docType]} layout with the built-in default. Existing documents are unaffected.`,
      confirmLabel: 'Reset',
      tone: 'danger',
      onConfirm: () => resetMutation.mutateAsync(docType),
    });
  };

  // ---- Editor sub-view -----------------------------------------------------
  if (editing) {
    const state = overview?.[editing];
    const initialOverride: TemplateConfigOverride = state?.deployed
      ? readConfig(state.deployed.config)
      : {};
    return (
      <DocumentTemplateEditor
        docType={editing}
        initialOverride={initialOverride}
        isSaving={saveMutation.isPending}
        onBack={() => setEditing(null)}
        onSave={(override) => saveMutation.mutate({ docType: editing, override })}
      />
    );
  }

  // ---- Landing grid --------------------------------------------------------
  return (
    <div className="min-h-screen">
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
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <FileStack className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Documents</h1>
            <p className="text-slate-600 text-sm">
              Customize how your invoices, quotes, and receipts look when printed or emailed.
            </p>
          </div>
        </div>
      </div>

      {!canEdit && (
        <Card variant="bordered" className="p-4 mb-6 bg-warning-muted border-warning/30">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <p className="text-sm text-warning">
              You can preview document templates, but only managers and admins can edit them.
            </p>
          </div>
        </Card>
      )}

      {/* States */}
      {isError ? (
        <Card variant="bordered" className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-danger mx-auto mb-3" />
          <p className="text-slate-900 font-medium mb-1">Couldn't load document templates</p>
          <p className="text-sm text-slate-500 mb-4">Please check your connection and try again.</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} variant="bordered" className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-2 pt-3">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-9" />
                <Skeleton className="h-8 w-9" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOCUMENT_TYPES.map(({ type, label, description, icon: Icon }) => {
            const state = overview?.[type];
            const isCustomized = !!state?.deployed;
            const busy =
              (duplicateMutation.isPending && duplicateMutation.variables === type) ||
              (resetMutation.isPending && resetMutation.variables === type);

            return (
              <Card key={type} variant="bordered" className="p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  {isCustomized ? (
                    <Badge variant="success" size="sm">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Customized
                    </Badge>
                  ) : (
                    <Badge variant="default" size="sm">
                      Default
                    </Badge>
                  )}
                </div>

                <h3 className="font-semibold text-slate-900 mb-1">{label}</h3>
                <p className="text-sm text-slate-600 mb-4 flex-1">{description}</p>

                <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                  <Button
                    variant={canEdit ? 'primary' : 'secondary'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditing(type)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    {canEdit ? 'Edit' : 'Preview'}
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Duplicate ${label} template`}
                        title="Duplicate"
                        disabled={busy}
                        onClick={() => duplicateMutation.mutate(type)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Reset ${label} template to default`}
                        title="Reset to default"
                        disabled={busy || !isCustomized}
                        className="text-danger hover:bg-danger-muted disabled:text-slate-400"
                        onClick={() => handleReset(type)}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DocumentTemplatesPage;
