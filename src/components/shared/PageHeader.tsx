import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  stats?: Array<{
    label: string;
    value: string | number;
    color?: string;
  }>;
}

// Maps caller-supplied color keys to literal, JIT-safe token classes.
// Brand/status keys route through semantic tokens; "teal" has no status
// meaning so it uses the cat-* identity palette. Raw Tailwind brand colors
// (text-blue-600 etc.) are banned by DESIGN.md / no-raw-tailwind-colors.
const STAT_COLOR_CLASSES: Record<string, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-accent-foreground',
  blue: 'text-info',
  green: 'text-success',
  emerald: 'text-success',
  teal: 'text-cat-2',
  red: 'text-danger',
  orange: 'text-warning',
  amber: 'text-warning',
  slate: 'text-slate-900',
};

const DEFAULT_STAT_COLOR_CLASS = 'text-slate-900';

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  stats,
}) => {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-3 bg-gradient-to-br from-primary to-primary rounded-xl shadow-lg shadow-primary/30">
              <Icon className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
            {description && (
              <p className="text-slate-600 mt-1">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>

      {stats && stats.length > 0 && (
        <div className="flex gap-4 mt-6">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="flex-1 bg-white rounded-lg border border-slate-200 p-4"
            >
              <p className="text-sm text-slate-600 mb-1">{stat.label}</p>
              <p
                className={`text-2xl font-bold ${
                  stat.color
                    ? STAT_COLOR_CLASSES[stat.color] ?? DEFAULT_STAT_COLOR_CLASS
                    : DEFAULT_STAT_COLOR_CLASS
                }`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
