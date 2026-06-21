import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Braces } from 'lucide-react';
import { getVariableRegistry } from '../../lib/templateContextService';
import { templateKeys } from '../../lib/queryKeys';

interface VariableInsertMenuProps {
  onInsert: (variableKey: string) => void;
  disabled?: boolean;
}

/**
 * "Insert variable" dropdown fed by the master_template_variables catalog,
 * grouped by category. Used wherever template content is authored so users
 * never have to remember {{dotted.keys}}.
 */
export const VariableInsertMenu: React.FC<VariableInsertMenuProps> = ({
  onInsert,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: variables = [] } = useQuery({
    queryKey: templateKeys.variables(),
    queryFn: getVariableRegistry,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const grouped = variables.reduce<Record<string, typeof variables>>((acc, variable) => {
    const category = variable.category ?? 'other';
    (acc[category] ??= []).push(variable);
    return acc;
  }, {});

  if (variables.length === 0) return null;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 px-2 py-1 hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
      >
        <Braces className="w-3 h-3" />
        Insert variable
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-30 right-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {category}
              </p>
              {items.map((variable) => (
                <button
                  key={variable.variableKey}
                  type="button"
                  onClick={() => {
                    onInsert(variable.variableKey);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors"
                >
                  <span className="block text-sm text-slate-700">{variable.name}</span>
                  <span className="block text-xs text-slate-400 font-mono">
                    {'{{'}{variable.variableKey}{'}}'}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
