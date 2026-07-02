import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import {
  getCaseViews,
  saveCaseViews,
  type CaseSavedView,
} from '../../lib/caseViewsService';

const VIEWS_KEY = ['case_views', 'user'] as const;

interface CaseViewsMenuProps {
  /** The list's current filter/sort state — captured when saving a view. */
  current: Omit<CaseSavedView, 'id' | 'name'>;
  onApply: (view: CaseSavedView) => void;
}

/**
 * Per-user saved views for the Cases list: apply a preset in one click,
 * save the current filters under a name, delete stale ones. Presets live in
 * user_preferences.preferences.case_views.
 */
export const CaseViewsMenu: React.FC<CaseViewsMenuProps> = ({ current, onApply }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: views = [] } = useQuery({ queryKey: VIEWS_KEY, queryFn: getCaseViews });

  const persist = useMutation({
    mutationFn: saveCaseViews,
    onMutate: async (next: CaseSavedView[]) => {
      queryClient.setQueryData(VIEWS_KEY, next);
    },
    onError: (error) => toast.error((error as Error).message || 'Failed to save views'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: VIEWS_KEY }),
  });

  const handleSaveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view: CaseSavedView = { id: crypto.randomUUID(), name: trimmed, ...current };
    persist.mutate([...views, view]);
    setName('');
    toast.success(`View "${trimmed}" saved`);
  };

  const handleDelete = (id: string) => {
    persist.mutate(views.filter((v) => v.id !== id));
  };

  return (
    <div className="relative flex-shrink-0">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2"
      >
        <Bookmark className="w-4 h-4" aria-hidden="true" />
        Views
        {views.length > 0 && (
          <span className="rounded-full bg-slate-200 px-1.5 text-xs font-semibold tabular-nums text-slate-600">
            {views.length}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-overlay" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Saved views"
            className="absolute right-0 z-overlay mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          >
            <p className="text-sm font-semibold text-slate-900">Saved views</p>
            {views.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No saved views yet. Set your filters, then save them here.
              </p>
            ) : (
              <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-auto">
                {views.map((view) => (
                  <li key={view.id} className="flex items-center gap-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onApply(view);
                        setOpen(false);
                      }}
                      className="flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(view.id)}
                      aria-label={`Delete view ${view.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCurrent();
                }}
                placeholder="Name current view…"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <Button size="sm" onClick={handleSaveCurrent} disabled={!name.trim()}>
                Save
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
