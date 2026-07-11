import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Copy,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Sparkles,
  Tags,
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
  applyTemplateStyle,
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
  TemplateStorageKey,
} from '../../lib/pdf/templateConfig';
import {
  DOCUMENT_TYPES,
  DOC_CATEGORIES,
  LEGACY_REPORT_CARD,
  type DocCategory,
  type DocumentTypeMeta,
} from './documentTypeMeta';
import { TemplateStudio } from '../../components/settings/documents/TemplateStudio';
import { TemplateGalleryModal } from '../../components/settings/documents/TemplateGalleryModal';
import { CopyStyleModal } from '../../components/settings/documents/CopyStyleModal';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';

/** Roles allowed to edit document templates (manager and above). */
const EDITOR_ROLES = ['owner', 'admin', 'manager'] as const;

/** Per-card query result: the tenant's template + its deployed version (if any). */
interface DocTypeState {
  template: DocumentTemplatePdf | null;
  deployed: DocumentTemplateVersion | null;
}

/**
 * Every card the grid can show, keyed by its template storage key. The legacy
 * shared report base is always LOADED (its card only renders while its row
 * exists — see `legacyReportVisible`).
 */
const ALL_CARDS: DocumentTypeMeta[] = [...DOCUMENT_TYPES, LEGACY_REPORT_CARD];
const CARD_BY_KEY = new Map(ALL_CARDS.map((c) => [c.key, c]));
const cardLabel = (key: TemplateStorageKey): string => CARD_BY_KEY.get(key)?.label ?? key;

/** Query: load every card's template + deployed version in parallel. */
const documentTemplatesOverviewKey = [
  ...documentTemplatePdfKeys.all,
  'overview',
  ...documentTemplateVersionKeys.all,
] as const;

async function loadOverview(): Promise<Record<string, DocTypeState>> {
  const entries = await Promise.all(
    ALL_CARDS.map(async ({ key }) => {
      const template = await getDocumentTemplateByType(key);
      const deployed = template ? await getDeployedVersionByType(key) : null;
      return [key, { template, deployed }] as const;
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

  const [editing, setEditing] = useState<TemplateStorageKey | null>(null);
  const [galleryFor, setGalleryFor] = useState<TemplateStorageKey | null>(null);
  const [copyStyleFor, setCopyStyleFor] = useState<TemplateStorageKey | null>(null);
  const [category, setCategory] = useState<DocCategory>('financial');
  // A preset selected from the gallery seeds the Studio; the nonce remounts it
  // so an already-open Studio re-seeds when a template is applied.
  const [seedOverride, setSeedOverride] = useState<TemplateConfigOverride | null>(null);
  const [seedNonce, setSeedNonce] = useState(0);

  const openTemplateFrom = (key: TemplateStorageKey, override: TemplateConfigOverride) => {
    setSeedOverride(override);
    setSeedNonce((n) => n + 1);
    setEditing(key);
    setGalleryFor(null);
  };

  const {
    data: overview,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: documentTemplatesOverviewKey,
    queryFn: loadOverview,
  });

  /** Cards that currently carry a customized (deployed) template. */
  const customizedKeys = useMemo(
    () => new Set(ALL_CARDS.filter((c) => overview?.[c.key]?.deployed).map((c) => c.key)),
    [overview],
  );

  /** The legacy shared report base only surfaces while its row still exists. */
  const legacyReportVisible = !!overview?.[LEGACY_REPORT_CARD.key]?.template;

  /** Persist an override: upsert the per-card template, create + deploy a new version. */
  const saveMutation = useMutation({
    mutationFn: async ({
      key,
      override,
    }: {
      key: TemplateStorageKey;
      override: TemplateConfigOverride;
    }) => {
      const template = await upsertDocumentTemplate(key, {
        name: cardLabel(key),
        is_default: true,
      });
      const version = await createVersion(template.id, override, {
        changeNote: `Edited ${cardLabel(key)} template`,
      });
      return publishVersion(template.id, version.id);
    },
    onSuccess: (_data, { key }) => {
      toast.success(`${cardLabel(key)} template saved and deployed.`);
      queryClient.invalidateQueries({ queryKey: documentTemplatePdfKeys.all });
      queryClient.invalidateQueries({ queryKey: documentTemplateVersionKeys.all });
      setEditing(null);
    },
    onError: (err) => {
      logger.error('[DocumentTemplatesPage] save failed:', err);
      toast.error('Could not save the template. Please try again.');
    },
  });

  /** Reset to default: deploy an empty override (built-in defaults take over). */
  const resetMutation = useMutation({
    mutationFn: async (key: TemplateStorageKey) => {
      const template = await upsertDocumentTemplate(key, {
        name: cardLabel(key),
        is_default: true,
      });
      const version = await createVersion(template.id, {}, {
        changeNote: `Reset ${cardLabel(key)} template to default`,
      });
      return publishVersion(template.id, version.id);
    },
    onSuccess: (_data, key) => {
      toast.success(`${cardLabel(key)} template reset to default.`);
      queryClient.invalidateQueries({ queryKey: documentTemplateVersionKeys.all });
      queryClient.invalidateQueries({ queryKey: documentTemplatePdfKeys.all });
    },
    onError: (err) => {
      logger.error('[DocumentTemplatesPage] reset failed:', err);
      toast.error('Could not reset the template.');
    },
  });

  /** Copy one card's visual style onto one or more other cards (content untouched). */
  const copyStyleMutation = useMutation({
    mutationFn: async ({
      source,
      targets,
    }: {
      source: TemplateStorageKey;
      targets: TemplateStorageKey[];
    }) => {
      const srcDeployed = await getDeployedVersionByType(source);
      const srcCfg: TemplateConfigOverride = srcDeployed ? readConfig(srcDeployed.config) : {};
      for (const target of targets) {
        const tgtDeployed = await getDeployedVersionByType(target);
        const tgtCfg: TemplateConfigOverride = tgtDeployed ? readConfig(tgtDeployed.config) : {};
        const merged = applyTemplateStyle(tgtCfg, srcCfg);
        const template = await upsertDocumentTemplate(target, {
          name: cardLabel(target),
          is_default: true,
        });
        const version = await createVersion(template.id, merged, {
          changeNote: `Copied style from ${cardLabel(source)}`,
        });
        await publishVersion(template.id, version.id);
      }
      return targets.length;
    },
    onSuccess: (count, { source }) => {
      toast.success(
        `Style copied from ${cardLabel(source)} to ${count} ${count === 1 ? 'document' : 'documents'}.`,
      );
      queryClient.invalidateQueries({ queryKey: documentTemplatePdfKeys.all });
      queryClient.invalidateQueries({ queryKey: documentTemplateVersionKeys.all });
      setCopyStyleFor(null);
    },
    onError: (err) => {
      logger.error('[DocumentTemplatesPage] copy style failed:', err);
      toast.error('Could not copy the template style.');
    },
  });

  const handleReset = async (key: TemplateStorageKey) => {
    await confirm({
      title: 'Reset to default?',
      message: `This replaces your custom ${cardLabel(key)} layout with the built-in default. Existing documents are unaffected.`,
      confirmLabel: 'Reset',
      tone: 'danger',
      onConfirm: () => resetMutation.mutateAsync(key),
    });
  };

  /** Cards the copy-style modal can target (legacy base only while it exists). */
  const copyableCards = useMemo(
    () => (legacyReportVisible ? ALL_CARDS : DOCUMENT_TYPES),
    [legacyReportVisible],
  );

  const galleryModal = (
    <TemplateGalleryModal
      isOpen={!!galleryFor}
      docType={(galleryFor && CARD_BY_KEY.get(galleryFor)?.type) || 'invoice'}
      onClose={() => setGalleryFor(null)}
      onUse={(config) => galleryFor && openTemplateFrom(galleryFor, config)}
      onBlank={() => galleryFor && openTemplateFrom(galleryFor, {})}
    />
  );

  const copyStyleModal = (
    <CopyStyleModal
      isOpen={!!copyStyleFor}
      sourceKey={copyStyleFor}
      cards={copyableCards}
      customizedKeys={customizedKeys}
      busy={copyStyleMutation.isPending}
      onClose={() => setCopyStyleFor(null)}
      onCopy={(targets) => copyStyleFor && copyStyleMutation.mutate({ source: copyStyleFor, targets })}
    />
  );

  // ---- Editor sub-view -----------------------------------------------------
  const editingCard = editing ? CARD_BY_KEY.get(editing) : undefined;
  if (editing && editingCard) {
    const state = overview?.[editing];
    // A gallery-selected preset seeds the Studio; otherwise start from the
    // tenant's deployed config (or the built-in default for a fresh type).
    const initialOverride: TemplateConfigOverride =
      seedOverride ?? (state?.deployed ? readConfig(state.deployed.config) : {});
    return (
      <>
        <TemplateStudio
          key={`${editing}-${seedNonce}`}
          docType={editingCard.type}
          reportSubtype={editingCard.reportSubtype}
          titleLabel={editingCard.label}
          initialOverride={initialOverride}
          isSaving={saveMutation.isPending}
          onBack={() => {
            setEditing(null);
            setSeedOverride(null);
          }}
          onOpenGallery={() => setGalleryFor(editing)}
          onSave={(override) => saveMutation.mutate({ key: editing, override })}
        />
        {galleryModal}
      </>
    );
  }

  const visibleCards = [
    ...DOCUMENT_TYPES.filter((d) => d.category === category),
    ...(category === 'reports' && legacyReportVisible ? [LEGACY_REPORT_CARD] : []),
  ];
  const cardCount = visibleCards.length;
  const activeCategory = DOC_CATEGORIES.find((c) => c.id === category)!;

  // ---- Landing (category master-detail) ------------------------------------
  return (
    <div className="min-h-screen">
      <SettingsPageHeader categoryId="documents" />
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="mb-4 flex items-center gap-2 text-slate-600 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back to Settings</span>
        </button>
      </div>

      {!canEdit && (
        <Card variant="bordered" className="mb-6 border-warning/30 bg-warning-muted p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
            <p className="text-sm text-warning">
              You can preview document templates, but only managers and admins can edit them.
            </p>
          </div>
        </Card>
      )}

      {isError ? (
        <Card variant="bordered" className="p-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-danger" />
          <p className="mb-1 font-medium text-slate-900">Couldn't load document templates</p>
          <p className="mb-4 text-sm text-slate-500">Please check your connection and try again.</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Category rail */}
          <nav aria-label="Document categories" className="lg:w-64 lg:flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1.5 lg:overflow-visible">
              {DOC_CATEGORIES.map((cat) => {
                const active = cat.id === category;
                const total =
                  DOCUMENT_TYPES.filter((d) => d.category === cat.id).length +
                  (cat.id === 'reports' && legacyReportVisible ? 1 : 0);
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex flex-shrink-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors lg:w-full',
                      active ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-500',
                      ].join(' ')}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="hidden min-w-0 flex-1 lg:block">
                      <p className={['text-sm font-semibold', active ? 'text-primary' : 'text-slate-800'].join(' ')}>
                        {cat.label}
                      </p>
                      <p className="truncate text-xs text-slate-500">{cat.description}</p>
                    </div>
                    <span className="text-sm font-medium text-slate-800 lg:hidden">{cat.label}</span>
                    <span className="ml-auto text-xs font-medium tabular-nums text-slate-400">{total}</span>
                  </button>
                );
              })}
            </div>
            <Link
              to="/settings/labels"
              className="mt-3 flex items-center gap-1.5 px-1 text-xs font-medium text-primary hover:underline"
            >
              <Tags className="h-3.5 w-3.5" />
              Thermal labels have moved to Label Studio
            </Link>
          </nav>

          {/* Right panel — the selected category's templates */}
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-slate-900">{activeCategory.label}</h2>
              <span className="text-sm text-slate-400">
                {cardCount} {cardCount === 1 ? 'template' : 'templates'}
              </span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} variant="bordered" className="space-y-3 p-5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCards.map(({ key, label, description, icon: Icon }) => {
                  const isCustomized = customizedKeys.has(key);
                  const busy = resetMutation.isPending && resetMutation.variables === key;

                  return (
                    <Card key={key} variant="bordered" className="flex flex-col p-5">
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        {isCustomized ? (
                          <Badge variant="success" size="sm">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Customized
                          </Badge>
                        ) : (
                          <Badge variant="default" size="sm">
                            Default
                          </Badge>
                        )}
                      </div>

                      <h3 className="mb-1 font-semibold text-slate-900">{label}</h3>
                      <p className="mb-4 flex-1 text-sm text-slate-600">{description}</p>

                      <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
                        <Button
                          variant={canEdit ? 'primary' : 'secondary'}
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setSeedOverride(null);
                            setEditing(key);
                          }}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          {canEdit ? 'Edit' : 'Preview'}
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Browse ${label} templates`}
                              title="Browse templates"
                              onClick={() => setGalleryFor(key)}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Copy ${label} style to other documents`}
                              title="Copy style to other documents"
                              onClick={() => setCopyStyleFor(key)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Reset ${label} template to default`}
                              title="Reset to default"
                              disabled={busy || !isCustomized}
                              className="text-danger hover:bg-danger-muted disabled:text-slate-400"
                              onClick={() => handleReset(key)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
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
        </div>
      )}

      {galleryModal}
      {copyStyleModal}
    </div>
  );
};

export default DocumentTemplatesPage;
