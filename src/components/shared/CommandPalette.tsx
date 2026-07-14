import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Command, Briefcase, Users, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Dialog } from '../ui/Dialog';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTenantFeatures } from '../../contexts/TenantConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { buildCommands, type CommandItem } from './commandPaletteRegistry';

const LISTBOX_ID = 'command-palette-listbox';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}


// Substring + initial-letter score. Higher is better. -1 means no match.
function scoreMatch(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  const idx = t.indexOf(q);
  if (idx !== -1) return 200 - idx;
  // Initial letters: "no" matches "New Order"
  const initials = t.split(/\s+/).map((w) => w[0]).join('');
  if (initials.startsWith(q)) return 150;
  // Character subsequence (loose match): "nci" matches "New Case Invoice-ish"
  let ti = 0;
  let matched = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ti < t.length && t[ti] !== q[qi]) ti++;
    if (ti === t.length) return -1;
    matched++;
    ti++;
  }
  return matched === q.length ? 50 - (t.length - matched) : -1;
}

function scoreItem(query: string, item: CommandItem): number {
  if (!query) return 0;
  const labelScore = scoreMatch(query, item.label);
  const groupScore = scoreMatch(query, item.group) - 50;
  const kwScore = item.keywords ? scoreMatch(query, item.keywords) - 30 : -1;
  return Math.max(labelScore, groupScore, kwScore);
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { hasModuleAccess } = usePermissions();
  const { isEnabled } = useTenantFeatures();
  const { profile } = useAuth();
  // Gated command registry — mirrors the sidebar's permission/feature gating so
  // the palette never exposes navigation the user cannot access.
  const commands = useMemo(() => {
    const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';
    return buildCommands({ isAdmin, hasModuleAccess, isEnabled });
  }, [profile?.role, hasModuleAccess, isEnabled]);

  // Reset state every time the palette opens. Otherwise stale active-index
  // can point past the new filtered list and the previous query lingers.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      // RAF before focus — modal isn't laid out yet on first paint.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Recent entities — only fetched while palette is open, only when query is
  // empty (otherwise the static commands already cover the search).
  const { data: recents = [] } = useQuery({
    queryKey: ['command-palette-recents'],
    queryFn: async (): Promise<CommandItem[]> => {
      const [casesRes, customersRes, invoicesRes] = await Promise.all([
        supabase
          .from('cases')
          .select('id, case_number, case_no, title, subject')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('customers_enhanced')
          .select('id, customer_name, customer_number')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('invoices')
          .select('id, invoice_number')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(5),
      ]);

      const items: CommandItem[] = [];
      for (const c of casesRes.data ?? []) {
        const num = (c.case_number || c.case_no) ?? '';
        const title = (c.title || c.subject || '').trim();
        items.push({
          id: `recent-case-${c.id}`,
          kind: 'recent',
          group: 'Recent Cases',
          label: title ? `${num} — ${title}` : num || 'Untitled case',
          icon: Briefcase,
          to: `/cases/${c.id}`,
        });
      }
      for (const cust of customersRes.data ?? []) {
        items.push({
          id: `recent-customer-${cust.id}`,
          kind: 'recent',
          group: 'Recent Customers',
          label: cust.customer_name || cust.customer_number || 'Unnamed customer',
          icon: Users,
          to: `/customers/${cust.id}`,
        });
      }
      for (const inv of invoicesRes.data ?? []) {
        items.push({
          id: `recent-invoice-${inv.id}`,
          kind: 'recent',
          group: 'Recent Invoices',
          label: inv.invoice_number || 'Untitled invoice',
          icon: Receipt,
          to: `/invoices/${inv.id}`,
        });
      }
      return items;
    },
    enabled: isOpen,
    // 30s cache: enough to feel snappy on rapid re-open without going stale.
    staleTime: 30_000,
  });

  // Filter + sort. When query is empty, show recents on top and a curated
  // subset of static commands below; never show 100+ rows for an empty query.
  const visibleItems = useMemo<CommandItem[]>(() => {
    if (!query.trim()) {
      const pinnedStatic = commands.filter((c) => c.kind === 'action').slice(0, 6);
      return [...recents, ...pinnedStatic];
    }
    const all = [...recents, ...commands];
    const scored = all
      .map((item) => ({ item, score: scoreItem(query, item) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.item);
    return scored;
  }, [query, recents, commands]);

  // Group items in render order while preserving the scored sort.
  const groupedItems = useMemo(() => {
    const groups: { name: string; items: CommandItem[] }[] = [];
    const indexByGroup = new Map<string, number>();
    for (const item of visibleItems) {
      let idx = indexByGroup.get(item.group);
      if (idx === undefined) {
        idx = groups.length;
        indexByGroup.set(item.group, idx);
        groups.push({ name: item.group, items: [] });
      }
      groups[idx].items.push(item);
    }
    return groups;
  }, [visibleItems]);

  // Flatten the grouped structure into the exact order the rows are rendered.
  // The keyboard state (activeIndex), the highlight, aria, and the Enter target
  // MUST all index into THIS list — grouping re-buckets items so its order can
  // diverge from visibleItems, and indexing Enter against visibleItems would
  // activate a different row than the one highlighted.
  const flatItems = useMemo(() => groupedItems.flatMap((g) => g.items), [groupedItems]);

  const runItem = useCallback(
    (item: CommandItem) => {
      navigate(item.to);
      onClose();
    },
    [navigate, onClose],
  );

  // Keyboard handling on the input. Esc closes; arrows move; Enter activates.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatItems[activeIndex];
      if (target) runItem(target);
    }
  };

  // Reset active index when filtered list changes — otherwise it points past
  // the end and Enter does nothing.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view as the user arrows through.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      label="Command palette"
      initialFocusRef={inputRef}
      closeOnEscape={false}
      overlayClassName="items-start justify-center pt-[10vh] backdrop-blur-sm px-4"
      className="w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[70vh]"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search pages, recent items, or actions…"
          className="flex-1 bg-transparent outline-none text-base text-slate-900 placeholder:text-slate-400"
          role="combobox"
          aria-expanded
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            flatItems[activeIndex] ? `command-palette-option-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
        />
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-xs font-mono text-slate-500">
          ESC
        </kbd>
      </div>

      <div ref={listRef} id={LISTBOX_ID} role="listbox" className="flex-1 overflow-y-auto">
        {visibleItems.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-400">
            No matches for &ldquo;{query}&rdquo;
          </div>
        ) : (
          groupedItems.map((group, gi) => {
            // Each rendered item needs its global index so the active-index
            // highlight works across groups.
            let cursor = 0;
            for (let i = 0; i < gi; i++) cursor += groupedItems[i].items.length;
            return (
              <div key={group.name} className="py-1">
                <div className="px-4 pt-2 pb-1 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  {group.name}
                </div>
                {group.items.map((item, i) => {
                  const globalIdx = cursor + i;
                  const isActive = globalIdx === activeIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      id={`command-palette-option-${globalIdx}`}
                      role="option"
                      aria-selected={isActive}
                      data-cmd-index={globalIdx}
                      type="button"
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={() => runItem(item)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isActive ? 'bg-primary/10 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                      <span className="flex-1 text-sm truncate">{item.label}</span>
                      {item.hint && (
                        <span className="text-xs text-slate-400 truncate">{item.hint}</span>
                      )}
                      {isActive && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-slate-50 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <ArrowUp className="w-3 h-3" />
          <ArrowDown className="w-3 h-3" />
          navigate
        </span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft className="w-3 h-3" />
          go
        </span>
        <span className="inline-flex items-center gap-1 ml-auto">
          <Command className="w-3 h-3" />
          <span className="font-mono">K</span> to open anywhere
        </span>
      </div>
    </Dialog>
  );
}
