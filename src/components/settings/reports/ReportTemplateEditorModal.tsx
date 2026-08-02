import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Checkbox } from '../../ui/Checkbox';
import { useToast } from '../../../hooks/useToast';
import { REPORT_TYPES, type ReportType } from '../../../lib/reportTypes';
import {
  createReportSectionTemplate,
  normalizeSections,
  setDefaultReportSectionTemplate,
  updateReportSectionTemplate,
  type ReportSectionLibraryRow,
  type ReportSectionTemplateRow,
  type TemplateSectionDescriptor,
} from '../../../lib/reportSectionTemplateService';
import {
  ReportSectionComposer,
  includedDescriptors,
  toComposerSections,
  type ComposerSection,
} from './ReportSectionComposer';

interface ReportTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: ReportType;
  library: ReportSectionLibraryRow[];
  /** Row being edited; null = create a new template. */
  template: ReportSectionTemplateRow | null;
  /** Create mode: seed sections (e.g. duplicated from a preset). */
  initialSections?: TemplateSectionDescriptor[];
  /** Create mode: seed name (e.g. "<preset> (Custom)"). */
  initialName?: string;
  /** Create mode: provenance of a duplicated preset. */
  sourcePresetId?: string | null;
  onSaved: () => void;
}

/** Create/edit a tenant report-section template (name, description, sections, default). */
export const ReportTemplateEditorModal: React.FC<ReportTemplateEditorModalProps> = ({
  isOpen,
  onClose,
  reportType,
  library,
  template,
  initialSections,
  initialName,
  sourcePresetId,
  onSaved,
}) => {
  const toast = useToast();
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const typeName = REPORT_TYPES[reportType]?.name ?? reportType;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<ComposerSection[]>([]);
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (template) {
      setName(template.name);
      setDescription(template.description ?? '');
      setSections(toComposerSections(normalizeSections(template.sections)));
      setMakeDefault(template.is_default);
    } else {
      setName(initialName ?? '');
      setDescription('');
      setSections(toComposerSections(initialSections ?? []));
      setMakeDefault(false);
    }
  }, [isOpen, template, initialName, initialSections]);

  async function save() {
    const chosen = includedDescriptors(sections).map((s) => ({ ...s, title: s.title.trim() }));
    if (!name.trim()) {
      toast.error('Name the template.');
      return;
    }
    if (chosen.length === 0 || chosen.some((s) => !s.title)) {
      toast.error(
        chosen.length === 0
          ? 'A template needs at least one included section.'
          : 'Every included section needs a title.',
      );
      return;
    }
    setBusy(true);
    try {
      if (template) {
        await updateReportSectionTemplate(template.id, {
          name,
          description: description || null,
          sections: chosen,
        });
        if (makeDefault && !template.is_default) {
          await setDefaultReportSectionTemplate(template.id, reportType);
        }
      } else {
        await createReportSectionTemplate({
          reportType,
          name,
          description: description || null,
          sections: chosen,
          isDefault: makeDefault,
          sourcePresetId: sourcePresetId ?? null,
        });
      }
      toast.success(template ? 'Template updated' : 'Template created');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Saving the template failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={busy ? () => undefined : onClose}
      labelledBy="report-template-editor-title"
      className="max-w-3xl"
      closeOnBackdrop={false}
      initialFocusRef={initialFocusRef}
    >
      <div className="flex max-h-[calc(100vh-4rem)] flex-col">
        <div className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <h2 id="report-template-editor-title" className="text-base font-semibold text-slate-900">
            {template ? 'Edit template' : 'New template'} — {typeName}
          </h2>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              ref={initialFocusRef}
              label="Template name"
              size="sm"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Description"
              size="sm"
              placeholder="Shown in the template picker"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sections, in print order
            </h3>
            <ReportSectionComposer
              sections={sections}
              onChange={setSections}
              library={library}
              disabled={busy}
            />
          </div>

          <Checkbox
            label={`Use as the default template for every new ${typeName}`}
            checked={makeDefault}
            disabled={busy || (template?.is_default ?? false)}
            hint={
              template?.is_default
                ? 'Already the default — set another template as default to change it.'
                : undefined
            }
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
        </div>

        <div className="shrink-0 flex justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : template ? 'Save Changes' : 'Create Template'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
