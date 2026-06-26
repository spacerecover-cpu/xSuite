import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';

const selectSizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'px-3 py-2' } as const;

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  /** Declarative option list. Ignored when `children` are provided. */
  options?: SelectOption[];
  /** Placeholder rendered as a disabled, empty-value leading option. */
  placeholder?: string;
  size?: 'sm' | 'md';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className = '', size = 'md', children, ...props }, ref) => {
    const { labelProps, controlProps, errorProps, hintProps } = useFieldA11y({
      id: props.id,
      hasError: !!error,
      hasHint: !!hint,
      required: props.required,
    });

    return (
      <div className="w-full">
        {label && (
          <label {...labelProps} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
            {props.required && (
              <span aria-hidden="true" className="text-danger ms-1">
                *
              </span>
            )}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            {...controlProps}
            {...props}
            className={cn(
              'w-full appearance-none pe-9 border rounded-md bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selectSizeClasses[size],
              error ? 'border-danger' : 'border-slate-300',
              className
            )}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children ??
              options?.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="absolute inset-y-0 end-0 me-3 my-auto h-4 w-4 text-slate-400 pointer-events-none"
          />
        </div>
        {error && (
          <p {...errorProps} className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
        {hint && (
          <p {...hintProps} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
