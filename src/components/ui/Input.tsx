import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';

// md is the app-wide standard field height: 36px (h-9, 14px text) — aligned
// with the ERP density band (Dynamics 32 / shadcn 36 / Odoo 38 / Jira 40).
const inputSizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'h-9 px-3 text-sm' } as const;

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  size?: 'sm' | 'md';
  /** Opt-in: render the label as a small notch on the field's top border
   *  (Material-style outlined field) instead of above it. Label stays fully
   *  associated for a11y/testing. */
  floatingLabel?: boolean;
}

/** Shared notch-label classes for the opt-in floatingLabel variant. */
export const FLOATING_LABEL_CLS =
  'pointer-events-none absolute -top-2 start-2.5 z-10 bg-surface px-1 text-xs font-medium text-slate-500';

/**
 * Attributes that ask the browser AND the major password managers
 * (1Password / LastPass / Bitwarden / Dashlane) to leave a field alone. Spread
 * onto any input that records third-party data — device serials, customer
 * contact details, secrets — so staff never get their own saved login or
 * contact profile injected into a business record. Chrome ignores
 * autoComplete="off" on password-type inputs, so those fields additionally set
 * autoComplete="new-password". The data-* keys aren't in the React input type,
 * so the object is attached at runtime via this cast.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, floatingLabel = false, className = '', size = 'md', ...props }, ref) => {
    const { labelProps, controlProps, errorProps, hintProps } = useFieldA11y({
      id: props.id,
      hasError: !!error,
      hasHint: !!hint,
      required: props.required,
    });

    return (
      <div className="w-full">
        {label && !floatingLabel && (
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
          {leftIcon && (
            <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-slate-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            {...controlProps}
            {...props}
            className={cn(
              'w-full border rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              inputSizeClasses[size],
              error ? 'border-danger' : 'border-slate-300',
              leftIcon ? 'ps-9' : '',
              floatingLabel && 'placeholder:text-xs',
              className
            )}
          />
          {label && floatingLabel && (
            <label {...labelProps} className={FLOATING_LABEL_CLS}>
              {label}
              {props.required && <span aria-hidden="true" className="text-danger ms-0.5">*</span>}
            </label>
          )}
        </div>
        {error && (
          <p {...errorProps} className="mt-1 text-xs text-danger flex items-center gap-1"><AlertCircle aria-hidden="true" className="w-3 h-3 shrink-0" />
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

Input.displayName = 'Input';
