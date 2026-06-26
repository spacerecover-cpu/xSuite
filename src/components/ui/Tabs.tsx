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
  /** 'underline' (default) = bottom-border tabs; 'pills' = solid colored fill tabs. */
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

// Pill variant — every tab carries a permanent solid tone fill with white ink
// (the Edit Device modal design treats tab color as a category identity, not an
// active/inactive signal). Active state is conveyed by elevation; inactive tabs
// sit slightly flatter and lift on hover. Full literal strings for the JIT.
const PILL_SOLID: Record<string, string> = {
  primary: 'bg-primary text-white',
  'cat-1': 'bg-cat-1 text-white',
  'cat-2': 'bg-cat-2 text-white',
  'cat-3': 'bg-cat-3 text-white',
  'cat-4': 'bg-cat-4 text-white',
  'cat-5': 'bg-cat-5 text-white',
  'cat-6': 'bg-cat-6 text-white',
  'cat-7': 'bg-cat-7 text-white',
  'cat-8': 'bg-cat-8 text-white',
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
      className={cn(isPills ? 'flex flex-wrap gap-4' : 'flex border-b border-border', className)}>
      {tabs.map(t => {
        const active = t.id === activeId;
        const colorKey = t.colorToken ?? 'primary';

        let stateClass: string;
        if (isPills) {
          const solid = PILL_SOLID[colorKey] ?? PILL_SOLID.primary;
          if (t.disabled) stateClass = cn(solid, 'opacity-90 shadow-sm cursor-not-allowed');
          else if (active) stateClass = cn(solid, 'shadow-md');
          else stateClass = cn(solid, 'opacity-90 shadow-sm hover:opacity-100 hover:-translate-y-0.5 hover:shadow-md');
        } else {
          const activeClass = ACTIVE_CLASSES[colorKey] ?? ACTIVE_CLASSES.primary;
          const inactiveClass = 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300';
          stateClass = cn(active ? activeClass : inactiveClass, t.disabled && 'opacity-40 cursor-not-allowed');
        }

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
              'inline-flex items-center justify-center transition-all duration-150',
              isPills
                ? 'h-10 px-5 rounded-[10px] gap-2 text-sm font-semibold'
                : 'gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
              stateClass,
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{t.label}</span>
            {t.hasError && (
              <span className={cn('ml-1 w-1.5 h-1.5 rounded-full', isPills ? 'bg-white' : 'bg-danger')} aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
