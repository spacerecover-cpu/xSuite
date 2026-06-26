import { useRef } from 'react';
import type React from 'react';
import { cn } from '../../lib/utils';

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  colorToken?: string;
  hasError?: boolean;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabDef[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  /** 'underline' (default) = bottom-border tabs; 'pills' = colored fill tabs. */
  variant?: 'underline' | 'pills';
}

// Static lookup — full class strings must be literal so Tailwind JIT can scan them.
const ACTIVE_CLASSES: Record<string, string> = {
  'cat-1': 'border-cat-1 text-cat-1',
  'cat-2': 'border-cat-2 text-cat-2',
  'cat-3': 'border-cat-3 text-cat-3',
  'cat-4': 'border-cat-4 text-cat-4',
  'cat-5': 'border-cat-5 text-cat-5',
  'cat-6': 'border-cat-6 text-cat-6',
  'cat-7': 'border-cat-7 text-cat-7',
  'cat-8': 'border-cat-8 text-cat-8',
  primary: 'border-primary text-primary',
};

// Pill variant — solid tone fill when active, 10% tint when inactive. Full
// literal strings so Tailwind JIT emits them. cat-* tokens have no -foreground
// variant, so the active ink is picked per tone for WCAG AA on small (14px)
// labels: the lighter/mid tones (cat-1..cat-5) take slate-900 ink (white fails
// 4.5:1 on them), the dark tones (primary, cat-6..cat-8) take white.
const PILL_ACTIVE: Record<string, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm',
  'cat-1': 'bg-cat-1 text-slate-900 shadow-sm',
  'cat-2': 'bg-cat-2 text-slate-900 shadow-sm',
  'cat-3': 'bg-cat-3 text-slate-900 shadow-sm',
  'cat-4': 'bg-cat-4 text-slate-900 shadow-sm',
  'cat-5': 'bg-cat-5 text-slate-900 shadow-sm',
  'cat-6': 'bg-cat-6 text-white shadow-sm',
  'cat-7': 'bg-cat-7 text-white shadow-sm',
  'cat-8': 'bg-cat-8 text-white shadow-sm',
};
const PILL_INACTIVE: Record<string, string> = {
  primary: 'bg-primary/10 text-primary hover:bg-primary/15',
  'cat-1': 'bg-cat-1/10 text-cat-1 hover:bg-cat-1/15',
  'cat-2': 'bg-cat-2/10 text-cat-2 hover:bg-cat-2/15',
  'cat-3': 'bg-cat-3/10 text-cat-3 hover:bg-cat-3/15',
  'cat-4': 'bg-cat-4/10 text-cat-4 hover:bg-cat-4/15',
  'cat-5': 'bg-cat-5/10 text-cat-5 hover:bg-cat-5/15',
  'cat-6': 'bg-cat-6/10 text-cat-6 hover:bg-cat-6/15',
  'cat-7': 'bg-cat-7/10 text-cat-7 hover:bg-cat-7/15',
  'cat-8': 'bg-cat-8/10 text-cat-8 hover:bg-cat-8/15',
};

export function Tabs({ tabs, activeId, onChange, className, variant = 'underline' }: TabsProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = tabs.filter(t => !t.disabled);
  const isPills = variant === 'pills';

  const onKey = (e: React.KeyboardEvent) => {
    const idx = enabled.findIndex(t => t.id === activeId);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    else return;
    e.preventDefault();
    ref.current?.querySelector<HTMLElement>(`[id="tab-${enabled[next].id}"]`)?.focus();
    onChange(enabled[next].id);
  };

  return (
    <div ref={ref} role="tablist" onKeyDown={onKey}
      className={cn(isPills ? 'flex flex-wrap gap-1.5' : 'flex border-b border-border', className)}>
      {tabs.map(t => {
        const active = t.id === activeId;
        const colorKey = t.colorToken ?? 'primary';
        const activeClass = isPills
          ? (PILL_ACTIVE[colorKey] ?? PILL_ACTIVE.primary)
          : (ACTIVE_CLASSES[colorKey] ?? ACTIVE_CLASSES.primary);
        const inactiveClass = isPills
          ? (PILL_INACTIVE[colorKey] ?? PILL_INACTIVE.primary)
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300';
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            disabled={t.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
              isPills ? 'px-3.5 py-2 rounded-md' : 'px-4 py-2.5 border-b-2 -mb-px',
              t.disabled && 'opacity-40 cursor-not-allowed',
              active ? activeClass : inactiveClass,
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{t.label}</span>
            {t.hasError && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-danger" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
