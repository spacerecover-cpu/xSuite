import React, { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Badge } from '../../ui/Badge';
import type { TemplateDocumentType } from '../../../lib/pdf/templateConfig';
import { DOCUMENT_TYPES, DOC_CATEGORIES, DOC_TYPE_LABELS } from '../../../pages/settings/documentTypeMeta';

interface CopyStyleModalProps {
  isOpen: boolean;
  /** The template whose style is being copied FROM. */
  sourceType: TemplateDocumentType | null;
  /** Which doc types are currently customized (for the per-row status badge). */
  customizedTypes: Set<TemplateDocumentType>;
  busy?: boolean;
  onClose: () => void;
  onCopy: (targets: TemplateDocumentType[]) => void;
}

/**
 * "Copy template style" — apply one document type's visual style (colours, fonts,
 * header/footer, table + totals styling) to one or more OTHER types. Each target
 * keeps its own structure, labels and document title; only the look is copied.
 */
export const CopyStyleModal: React.FC<CopyStyleModalProps> = ({
  isOpen,
  sourceType,
  customizedTypes,
  busy,
  onClose,
  onCopy,
}) => {
  const [selected, setSelected] = useState<Set<TemplateDocumentType>>(new Set());

  // Reset the selection whenever the modal opens or the source changes.
  useEffect(() => {
    setSelected(new Set());
  }, [sourceType, isOpen]);

  const targets = useMemo(() => DOCUMENT_TYPES.filter((d) => d.type !== sourceType), [sourceType]);
  const allSelected = targets.length > 0 && selected.size === targets.length;
  const sourceLabel = sourceType ? DOC_TYPE_LABELS[sourceType] : '';

  const toggle = (t: TemplateDocumentType) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(targets.map((d) => d.type)));

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Copy template style" icon={Copy}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Apply <span className="font-semibold text-slate-900">{sourceLabel}</span>&rsquo;s colours, fonts,
          header &amp; footer, and table / totals styling to other document types. Each type keeps its own
          structure, labels and document title &mdash; only the look is copied.
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Apply to</span>
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm font-medium text-primary hover:underline"
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto px-0.5">
          {DOC_CATEGORIES.map((cat) => {
            const rows = targets.filter((d) => d.category === cat.id);
            if (!rows.length) return null;
            return (
              <div key={cat.id}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{cat.label}</p>
                <div className="space-y-1.5">
                  {rows.map((d) => {
                    const on = selected.has(d.type);
                    return (
                      <label
                        key={d.type}
                        className={[
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                          on ? 'border-primary bg-primary/5' : 'border-slate-200 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <Checkbox checked={on} onChange={() => toggle(d.type)} />
                        <d.icon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="flex-1 text-sm font-medium text-slate-800">{d.label}</span>
                        {customizedTypes.has(d.type) ? (
                          <Badge variant="success" size="sm">Customized</Badge>
                        ) : (
                          <Badge variant="default" size="sm">Default</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={selected.size === 0 || busy}
            onClick={() => onCopy([...selected])}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            Copy to {selected.size} {selected.size === 1 ? 'type' : 'types'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
