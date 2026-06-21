import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, FileText, ListOrdered, X } from 'lucide-react';
import { reportSectionService, type ReportSection } from '../../lib/reportSectionService';
import type { ReportTemplate } from '../../lib/reportTypes';
import { reportKeys, settingsKeys } from '../../lib/queryKeys';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface DraftRow {
  section_id: string;
  is_required: boolean;
  section: ReportSection;
}

interface TemplateSectionsEditorProps {
  template: ReportTemplate;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Ordered editor for a template's section mappings. Tenant templates are
 * editable (reorder / required / add / remove); system templates render the
 * same list read-only with a "clone to customize" hint.
 */
export const TemplateSectionsEditor: React.FC<TemplateSectionsEditorProps> = ({
  template,
  isOpen,
  onClose,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const readOnly = template.tenant_id == null;

  const [rows, setRows] = useState<DraftRow[] | null>(null);

  const { data: mappedSections, isLoading } = useQuery({
    queryKey: reportKeys.templateSections(template.id),
    queryFn: () => reportSectionService.getTemplateSections(template.id),
    enabled: isOpen,
  });

  const { data: librarySections = [] } = useQuery({
    queryKey: settingsKeys.reportSections(),
    queryFn: () => reportSectionService.getSections(),
    enabled: isOpen && !readOnly,
  });

  // Seed the draft once per mount; background refetches must not clobber edits.
  useEffect(() => {
    if (mappedSections && rows === null) {
      setRows(
        mappedSections.map((mapping) => ({
          section_id: mapping.section_id,
          is_required: mapping.is_required,
          section: mapping.section,
        }))
      );
    }
  }, [mappedSections, rows]);

  const saveMutation = useMutation({
    mutationFn: (draft: DraftRow[]) =>
      reportSectionService.updateTemplateSections(
        template.id,
        draft.map((row, index) => ({
          section_id: row.section_id,
          section_order: index + 1,
          is_required: row.is_required,
        }))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.templateSections(template.id) });
      toast.success('Template sections saved');
      onClose();
    },
    onError: (error) => {
      logger.error('Error saving template sections:', error);
      toast.error('Failed to save template sections');
    },
  });

  const moveRow = (index: number, direction: -1 | 1) => {
    setRows((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleRequired = (index: number, isRequired: boolean) => {
    setRows((current) =>
      current
        ? current.map((row, i) => (i === index ? { ...row, is_required: isRequired } : row))
        : current
    );
  };

  const removeRow = (index: number) => {
    setRows((current) => (current ? current.filter((_, i) => i !== index) : current));
  };

  const addSection = (sectionId: string) => {
    const section = librarySections.find((s) => s.id === sectionId);
    if (!section) return;
    setRows((current) => [
      ...(current ?? []),
      { section_id: section.id, is_required: false, section },
    ]);
  };

  const availableSections = librarySections.filter(
    (section) => !(rows ?? []).some((row) => row.section_id === section.id)
  );

  const showSkeleton = isLoading || rows === null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        readOnly
          ? `Template Sections: ${template.template_name}`
          : `Manage Sections: ${template.template_name}`
      }
      icon={ListOrdered}
      size="lg"
    >
      <div className="space-y-4">
        {readOnly ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-info-muted border border-info/30">
            <Copy className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
            <p className="text-sm text-info">
              This is a shared system template, so its sections are read-only. Clone the
              template to customize which sections it includes.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Order the sections as they should appear in generated reports. Required sections
            cannot be skipped by report authors.
          </p>
        )}

        {showSkeleton ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">No sections mapped to this template yet</p>
            {!readOnly && (
              <p className="text-sm text-slate-400 mt-1">Add your first section below</p>
            )}
          </div>
        ) : (
          <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <li
                key={row.section_id}
                className="flex items-center gap-3 p-3 border border-border rounded-lg bg-surface"
              >
                <span className="w-7 h-7 flex-shrink-0 rounded-md bg-surface-muted text-slate-600 text-sm font-semibold flex items-center justify-center">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {row.section.section_name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {row.section.section_key} &middot; {row.section.category}
                  </p>
                </div>

                {readOnly ? (
                  row.is_required && (
                    <Badge variant="info" size="sm">
                      Required
                    </Badge>
                  )
                ) : (
                  <>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${row.section.section_name} up`}
                        disabled={index === 0}
                        onClick={() => moveRow(index, -1)}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${row.section.section_name} down`}
                        disabled={index === rows.length - 1}
                        onClick={() => moveRow(index, 1)}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="w-28 flex-shrink-0">
                      <Checkbox
                        label="Required"
                        checked={row.is_required}
                        onChange={(e) => toggleRequired(index, e.target.checked)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${row.section.section_name}`}
                      className="text-danger hover:bg-danger-muted"
                      onClick={() => removeRow(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && !showSkeleton && (
          <Select
            aria-label="Add section"
            value=""
            placeholder={
              availableSections.length === 0
                ? 'All library sections are already mapped'
                : 'Add a section from the library…'
            }
            disabled={availableSections.length === 0}
            onChange={(e) => addSection(e.target.value)}
            options={availableSections.map((section) => ({
              value: section.id,
              label: `${section.section_name} (${section.category})`,
            }))}
          />
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose} disabled={saveMutation.isPending}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button
              onClick={() => rows && saveMutation.mutate(rows)}
              disabled={showSkeleton}
              isLoading={saveMutation.isPending}
            >
              Save Sections
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
