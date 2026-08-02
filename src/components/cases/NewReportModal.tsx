import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileStack, Sparkles } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../../hooks/useToast';
import { REPORT_TYPES, type ReportType } from '../../lib/reportTypes';
import { reportSectionTemplateKeys } from '../../lib/queryKeys';
import {
  createReportSectionTemplate,
  listReportTemplateChoices,
  listSectionLibrary,
  type ReportTemplateChoice,
} from '../../lib/reportSectionTemplateService';
import { createReportInstance } from '../../lib/documentInstanceService';
import { reportSubtypeSections } from '../../lib/pdf/engine/adapters/reportAdapter';
import {
  ReportSectionComposer,
  includedDescriptors,
  toComposerSections,
  type ComposerSection,
} from '../settings/reports/ReportSectionComposer';
import { logger } from '../../lib/logger';

interface NewReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  reportSubtype: ReportType;
  /** Called with the created draft's instance id (opens the draft editor). */
  onCreated: (instanceId: string) => void;
}

type ChoiceRef = `tenant:${string}` | `system:${string}` | 'builtin';

function refOf(choice: ReportTemplateChoice): ChoiceRef {
  return `${choice.source}:${choice.id}` as ChoiceRef;
}

/**
 * Step 2 of the New Document flow: choose one of the predefined (or the
 * tenant's own) section templates for the picked report type, customize the
 * section list for THIS document, optionally save the customization as a team
 * template, then create the draft.
 */
export const NewReportModal: React.FC<NewReportModalProps> = ({
  isOpen,
  onClose,
  caseId,
  reportSubtype,
  onCreated,
}) => {
  const toast = useToast();
  const typeConfig = REPORT_TYPES[reportSubtype];
  const initialFocusRef = useRef<HTMLInputElement>(null);

  const choicesQuery = useQuery({
    queryKey: reportSectionTemplateKeys.choices(reportSubtype),
    queryFn: () => listReportTemplateChoices(reportSubtype),
    enabled: isOpen,
  });
  const libraryQuery = useQuery({
    queryKey: reportSectionTemplateKeys.library(),
    queryFn: listSectionLibrary,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const tenantChoices = choicesQuery.data?.tenant ?? [];
  const systemChoices = choicesQuery.data?.system ?? [];
  const hasCatalog = tenantChoices.length > 0 || systemChoices.length > 0;

  const [title, setTitle] = useState(typeConfig?.name ?? 'Report');
  const [selected, setSelected] = useState<ChoiceRef | null>(null);
  const [sections, setSections] = useState<ComposerSection[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset per open + per subtype.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(typeConfig?.name ?? 'Report');
    setSelected(null);
    setSections([]);
    setSaveAsTemplate(false);
    setTemplateName('');
    setMakeDefault(false);
  }, [isOpen, reportSubtype, typeConfig?.name]);

  // Preselect the effective default once choices load: tenant default →
  // system default → first tenant → first system → built-in fallback.
  useEffect(() => {
    if (!isOpen || selected || choicesQuery.isPending) return;
    const preferred =
      tenantChoices.find((c) => c.isDefault) ??
      systemChoices.find((c) => c.isDefault) ??
      tenantChoices[0] ??
      systemChoices[0] ??
      null;
    if (preferred) {
      setSelected(refOf(preferred));
      setSections(toComposerSections(preferred.sections));
    } else {
      setSelected('builtin');
      setSections(toComposerSections(reportSubtypeSections(reportSubtype)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, choicesQuery.isPending, choicesQuery.data]);

  const allChoices = useMemo(
    () => [...tenantChoices, ...systemChoices],
    [tenantChoices, systemChoices],
  );

  const pick = (choice: ReportTemplateChoice) => {
    setSelected(refOf(choice));
    setSections(toComposerSections(choice.sections));
  };

  const includedCount = sections.filter((s) => s.included).length;

  async function create() {
    const chosen = includedDescriptors(sections).map((s) => ({ ...s, title: s.title.trim() }));
    if (chosen.length === 0 || chosen.some((s) => !s.title)) {
      toast.error(
        chosen.length === 0
          ? 'Include at least one section.'
          : 'Every included section needs a title.',
      );
      return;
    }
    if (saveAsTemplate && !templateName.trim()) {
      toast.error('Name the template to save it.');
      return;
    }
    setBusy(true);
    try {
      if (saveAsTemplate) {
        try {
          const sourcePresetId = selected?.startsWith('system:')
            ? selected.slice('system:'.length)
            : null;
          await createReportSectionTemplate({
            reportType: reportSubtype,
            name: templateName,
            sections: chosen,
            isDefault: makeDefault,
            sourcePresetId,
          });
          toast.success('Template saved');
        } catch (e) {
          // Template persistence must never block the document itself.
          logger.error('[NewReportModal] save-as-template failed:', e);
          toast.error(e instanceof Error ? e.message : 'Saving the template failed');
        }
      }
      const instance = await createReportInstance({
        caseId,
        reportSubtype,
        title: title.trim() || (typeConfig?.name ?? 'Report'),
        sections: chosen,
      });
      onCreated(instance.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create the document');
    } finally {
      setBusy(false);
    }
  }

  const TypeIcon = typeConfig?.icon ?? FileStack;

  const hasTenantDefault = tenantChoices.some((c) => c.isDefault);

  const choiceCard = (choice: ReportTemplateChoice) => {
    const ref = refOf(choice);
    const active = selected === ref;
    // The EFFECTIVE default: a tenant default supersedes the system one.
    const isEffectiveDefault =
      choice.isDefault && (choice.source === 'tenant' || !hasTenantDefault);
    return (
      <label
        key={ref}
        className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
          active ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:border-primary/40'
        }`}
      >
        <input
          type="radio"
          name="report-section-template"
          className="mt-1 h-4 w-4 shrink-0 text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          checked={active}
          onChange={() => pick(choice)}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-900">{choice.name}</span>
            {choice.source === 'tenant' ? (
              <Badge variant="accent" size="sm">Custom</Badge>
            ) : (
              <Badge variant="secondary" size="sm">System</Badge>
            )}
            {isEffectiveDefault && (
              <Badge variant="info" size="sm">Default</Badge>
            )}
          </span>
          {choice.description && (
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">
              {choice.description}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-slate-400">
            {choice.sections.length} sections
          </span>
        </span>
      </label>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onClose={busy ? () => undefined : onClose}
      labelledBy="new-report-modal-title"
      className="max-w-4xl"
      closeOnBackdrop={false}
      initialFocusRef={initialFocusRef}
    >
      <div className="flex max-h-[calc(100vh-4rem)] flex-col">
        <div className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <TypeIcon className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="new-report-modal-title" className="text-base font-semibold text-slate-900">
                New {typeConfig?.name ?? 'Report'}
              </h2>
              <p className="text-xs text-slate-500">
                Choose a template, then tailor its sections for this document.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-label="Template">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Template
              </h3>
              {choicesQuery.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <div className="space-y-2" role="radiogroup" aria-label="Report template">
                  {allChoices.map(choiceCard)}
                  {!hasCatalog && (
                    <label
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                        selected === 'builtin'
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-200 bg-white hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-section-template"
                        className="h-4 w-4 text-primary"
                        checked={selected === 'builtin'}
                        onChange={() => {
                          setSelected('builtin');
                          setSections(toComposerSections(reportSubtypeSections(reportSubtype)));
                        }}
                      />
                      <span className="text-sm font-semibold text-slate-900">
                        Built-in sections
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="mt-5">
                <Input
                  ref={initialFocusRef}
                  label="Document title"
                  size="sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="mt-5 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <Checkbox
                  label="Save these sections as a team template"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                />
                {saveAsTemplate && (
                  <div className="space-y-2 pl-6">
                    <Input
                      label="Template name"
                      size="sm"
                      placeholder={`e.g. Our ${typeConfig?.name ?? 'report'}`}
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                    <Checkbox
                      label={`Use as the default for every new ${typeConfig?.name ?? 'report'}`}
                      checked={makeDefault}
                      onChange={(e) => setMakeDefault(e.target.checked)}
                    />
                  </div>
                )}
              </div>
            </section>

            <section aria-label="Sections">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-accent-foreground" aria-hidden="true" />
                Sections for this document
              </h3>
              {libraryQuery.isPending || choicesQuery.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <ReportSectionComposer
                  sections={sections}
                  onChange={setSections}
                  library={libraryQuery.data ?? []}
                  disabled={busy}
                />
              )}
            </section>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 border-t border-border px-6 py-3">
          <p className="text-xs text-slate-500" aria-live="polite">
            {includedCount} of {sections.length} sections included
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={busy || choicesQuery.isPending}>
              {busy ? 'Creating…' : 'Create Document'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
