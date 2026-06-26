import React from 'react';
import { cn } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';

const inputSizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'px-3 py-2' } as const;

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  size?: 'sm' | 'md';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, className = '', size = 'md', ...props }, ref) => {
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
              className
            )}
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

Input.displayName = 'Input';
