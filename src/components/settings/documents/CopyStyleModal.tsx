import React, { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Badge } from '../../ui/Badge';
import type { TemplateStorageKey } from '../../../lib/pdf/templateConfig';
import { DOC_CATEGORIES, type DocumentTypeMeta } from '../../../pages/settings/documentTypeMeta';

interface CopyStyleModalProps {
  isOpen: boolean;
  /** The template card whose style is being copied FROM. */
  sourceKey: TemplateStorageKey | null;
  /** Every card the style can copy to (the parent decides, e.g. legacy visibility). */
  cards: DocumentTypeMeta[];
  /** Which cards are currently customized (for the per-row status badge). */
  customizedKeys: Set<TemplateStorageKey>;
  busy?: boolean;
  onClose: () => void;
  onCopy: (targets: TemplateStorageKey[]) => void;
}

/**
 * "Copy template style" — apply one template's visual style (colours, fonts,
 * header/footer, table + totals styling) to one or more OTHER templates. Each
 * target keeps its own structure, labels and document title; only the look is
 * copied.
 */
export const CopyStyleModal: React.FC<CopyStyleModalProps> = ({
  isOpen,
  sourceKey,
  cards,
  customizedKeys,
  busy,
  onClose,
  onCopy,
}) => {
  const [selected, setSelected] = useState<Set<TemplateStorageKey>>(new Set());

  // Reset the selection whenever the modal opens or the source changes.
  useEffect(() => {
    setSelected(new Set());
  }, [sourceKey, isOpen]);

  const targets = useMemo(() => cards.filter((d) => d.key !== sourceKey), [cards, sourceKey]);
  const allSelected = targets.length > 0 && selected.size === targets.length;
  const sourceLabel = sourceKey ? cards.find((d) => d.key === sourceKey)?.label ?? sourceKey : '';

  const toggle = (key: TemplateStorageKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(targets.map((d) => d.key)));

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Copy template style" icon={Copy}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Apply <span className="font-semibold text-slate-900">{sourceLabel}</span>&rsquo;s colours, fonts,
          header &amp; footer, and table / totals styling to other document templates. Each template keeps its
          own structure, labels and document title &mdash; only the look is copied.
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
                    const on = selected.has(d.key);
                    return (
                      <label
                        key={d.key}
                        className={[
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                          on ? 'border-primary bg-primary/5' : 'border-slate-200 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <Checkbox checked={on} onChange={() => toggle(d.key)} />
                        <d.icon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="flex-1 text-sm font-medium text-slate-800">{d.label}</span>
                        {customizedKeys.has(d.key) ? (
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
            Copy to {selected.size} {selected.size === 1 ? 'template' : 'templates'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
