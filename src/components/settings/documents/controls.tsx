/**
 * Shared, presentational controls for the document Template Studio. They use
 * only DESIGN.md semantic tokens + slate neutrals (no purple/indigo/violet, no
 * raw-hex utility classes). The hex VALUES a user edits are data, not styling.
 */
import React from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Input } from '../../ui/Input';
import { contrastRatio, isHex } from '../../../lib/pdf/engine/palette';

// ── ColorField ──────────────────────────────────────────────────────────────

interface ColorFieldProps {
  label: string;
  /** Current hex, or undefined when the field is at its neutral default. */
  value?: string;
  /** Neutral default shown in the swatch + as placeholder when unset. */
  neutral: string;
  onChange: (hex: string | undefined) => void;
  /** Comparison color for the live WCAG badge (default white). */
  against?: string;
  againstLabel?: string;
  hint?: string;
}

/** A WCAG pass/fail chip for a foreground/background pair. */
const ContrastBadge: React.FC<{ fg: string; bg: string; label?: string }> = ({ fg, bg, label }) => {
  const ratio = contrastRatio(fg, bg);
  const tier = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail';
  const tone =
    ratio >= 4.5
      ? 'bg-success-muted text-success'
      : ratio >= 3
        ? 'bg-warning-muted text-warning'
        : 'bg-danger-muted text-danger';
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      {tier} {ratio.toFixed(1)}:1{label ? ` ${label}` : ''}
    </span>
  );
};

export const ColorField: React.FC<ColorFieldProps> = ({
  label,
  value,
  neutral,
  onChange,
  against = '#ffffff',
  againstLabel,
  hint,
}) => {
  const swatch = value && isHex(value) ? value : neutral;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {value && isHex(value) && <ContrastBadge fg={value} bg={against} label={againstLabel} />}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 flex-shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-1"
        />
        <Input
          aria-label={`${label} hex`}
          value={value ?? ''}
          placeholder={`${neutral} (default)`}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="font-mono text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Reset ${label} to default`}
            title="Reset to neutral default"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
};

// ── NumberField ─────────────────────────────────────────────────────────────

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({ label, value, onChange, min, max, step, suffix }) => (
  <div>
    <label className="mb-1 block text-sm font-medium text-slate-700">
      {label}
      {suffix ? <span className="ml-1 font-normal text-slate-400">({suffix})</span> : null}
    </label>
    <Input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  </div>
);

// ── SegmentedControl ────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  columns?: number;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = 3,
}: SegmentedControlProps<T>) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const active = opt.value === value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={[
                'flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── ToggleRow ───────────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-800">{label}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-primary' : 'bg-slate-300',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  </div>
);

// ── Section heading inside a tab panel ───────────────────────────────────────

export const FieldGroup: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="space-y-3">
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
);
