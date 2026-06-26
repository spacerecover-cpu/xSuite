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

export function Tabs({ tabs, activeId, onChange, className }: TabsProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = tabs.filter(t => !t.disabled);

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
    onChange(enabled[next].id);
  };

  return (
    <div ref={ref} role="tablist" onKeyDown={onKey}
      className={cn('flex border-b border-border', className)}>
      {tabs.map(t => {
        const active = t.id === activeId;
        const colorKey = t.colorToken ?? 'primary';
        const activeClass = ACTIVE_CLASSES[colorKey] ?? ACTIVE_CLASSES.primary;
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
            onClick={() => !t.disabled && onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              t.disabled && 'opacity-40 cursor-not-allowed',
              active
                ? activeClass
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
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
