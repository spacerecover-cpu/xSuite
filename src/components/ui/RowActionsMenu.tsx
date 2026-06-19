import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  tone?: 'default' | 'success' | 'danger';
  disabled?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  /** Non-interactive footnote shown under the actions (e.g. a read-only reason). */
  note?: { label: string; icon?: LucideIcon };
  ariaLabel?: string;
}

const MENU_WIDTH = 208; // matches w-52
const ITEM_HEIGHT = 40;

/**
 * Single kebab (⋮) trigger whose menu is portaled to <body> with fixed
 * positioning. The portal is what lets it live inside a table cell that clips
 * its overflow (ConfigurableDataTable cells are `overflow-hidden`) without the
 * menu being cut off. Clicks/keys stop propagating so the surrounding clickable
 * row doesn't also fire. Closes on outside click, Escape, scroll, or resize.
 */
export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ actions, note, ariaLabel = 'Row actions' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const estHeight = (actions.length + (note ? 1 : 0)) * ITEM_HEIGHT + 8;
    const top = r.bottom + 4 + estHeight > window.innerHeight - 8 ? Math.max(8, r.top - estHeight - 4) : r.bottom + 4;
    setPos({ top, left });
  }, [actions.length, note]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!open) place();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
              className="fixed z-50 rounded-xl border border-slate-200 bg-surface py-1 shadow-xl"
            >
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    action.tone === 'danger'
                      ? 'text-danger hover:bg-danger-muted'
                      : action.tone === 'success'
                        ? 'text-success hover:bg-success-muted'
                        : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  {action.icon ? <action.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate">{action.label}</span>
                </button>
              ))}
              {note ? (
                <div className="mt-1 flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  {note.icon ? <note.icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate">{note.label}</span>
                </div>
              ) : null}
            </div>
          </>,
          document.body,
        )}
    </>
  );
};
