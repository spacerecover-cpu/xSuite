import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import {
  slugifySectionKey,
  type ReportSectionLibraryRow,
  type TemplateSectionDescriptor,
} from '../../../lib/reportSectionTemplateService';

/** A template section plus its per-composer include state. */
export interface ComposerSection extends TemplateSectionDescriptor {
  included: boolean;
}

interface ReportSectionComposerProps {
  sections: ComposerSection[];
  onChange: (next: ComposerSection[]) => void;
  /** Catalog for the "Add section" picker; already-used keys are filtered out. */
  library: ReportSectionLibraryRow[];
  disabled?: boolean;
}

export function toComposerSections(sections: TemplateSectionDescriptor[]): ComposerSection[] {
  return sections.map((s) => ({ ...s, included: true }));
}

export function includedDescriptors(sections: ComposerSection[]): TemplateSectionDescriptor[] {
  return sections
    .filter((s) => s.included)
    .map(({ included: _included, ...descriptor }) => descriptor);
}

/**
 * Shared ordered-section editor for report templates: include-toggle, inline
 * rename, keyboard-operable reorder, remove, and add (from the section library
 * or free-form custom). Controlled + fetch-free; used by the case New Report
 * picker and the Settings template editor.
 */
export const ReportSectionComposer: React.FC<ReportSectionComposerProps> = ({
  sections,
  onChange,
  library,
  disabled = false,
}) => {
  const [addKey, setAddKey] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  const usedKeys = useMemo(() => new Set(sections.map((s) => s.key)), [sections]);
  const addable = useMemo(
    () => library.filter((l) => !usedKeys.has(l.section_key)),
    [library, usedKeys],
  );

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const patch = (index: number, part: Partial<ComposerSection>) => {
    onChange(sections.map((s, i) => (i === index ? { ...s, ...part } : s)));
  };

  const remove = (index: number) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  const addFromLibrary = () => {
    const row = addable.find((l) => l.section_key === addKey);
    if (!row) return;
    onChange([
      ...sections,
      {
        key: row.section_key,
        title: row.title,
        ...(row.guidance ? { guidance: row.guidance } : {}),
        included: true,
      },
    ]);
    setAddKey('');
  };

  const addCustom = () => {
    const title = customTitle.trim();
    if (!title) return;
    let key = slugifySectionKey(title);
    while (usedKeys.has(key)) key = `${key}_2`;
    onChange([...sections, { key, title, included: true }]);
    setCustomTitle('');
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-2" aria-label="Report sections, in print order">
        {sections.map((s, i) => (
          <li
            key={s.key}
            className={`rounded-lg border p-2.5 transition-colors ${
              s.included ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-6 shrink-0">
                <Checkbox
                  aria-label={`Include section ${s.title}`}
                  checked={s.included}
                  disabled={disabled || s.required}
                  onChange={(e) => patch(i, { included: e.target.checked })}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Input
                  aria-label={`Title of section ${i + 1}`}
                  size="sm"
                  value={s.title}
                  disabled={disabled}
                  onChange={(e) => patch(i, { title: e.target.value })}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled || i === 0}
                  aria-label={`Move ${s.title} up`}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled || i === sections.length - 1}
                  aria-label={`Move ${s.title} down`}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled || s.required}
                  aria-label={`Remove ${s.title}`}
                  title={s.required ? 'This section is required for this report type' : undefined}
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {s.guidance && (
              <p className="mt-1.5 line-clamp-2 pl-6 text-xs leading-snug text-slate-500">
                {s.guidance}
              </p>
            )}
          </li>
        ))}
        {sections.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
            No sections yet — add one below.
          </li>
        )}
      </ol>

      {!disabled && (
        <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          <div className="flex items-end gap-2">
            <Select
              label="Add from library"
              size="sm"
              value={addKey}
              onChange={(e) => setAddKey(e.target.value)}
              placeholder="Choose a section…"
              options={addable.map((l) => ({ value: l.section_key, label: l.title }))}
            />
            <Button variant="secondary" size="sm" disabled={!addKey} onClick={addFromLibrary}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <Input
              label="Add custom section"
              size="sm"
              placeholder="e.g. Warranty Notes"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button variant="secondary" size="sm" disabled={!customTitle.trim()} onClick={addCustom}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
