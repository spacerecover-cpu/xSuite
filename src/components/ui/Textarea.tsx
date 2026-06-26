import React from 'react';
import { cn } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';

const textareaSizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'px-3 py-2' } as const;

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md';
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', size = 'md', rows = 4, ...props }, ref) => {
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
        <textarea
          ref={ref}
          rows={rows}
          {...controlProps}
          {...props}
          className={cn(
            'w-full border rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            textareaSizeClasses[size],
            error ? 'border-danger' : 'border-slate-300',
            className
          )}
        />
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

Textarea.displayName = 'Textarea';
