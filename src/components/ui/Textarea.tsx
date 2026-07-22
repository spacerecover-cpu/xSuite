import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';
import { FLOATING_LABEL_CLS } from './Input';

const textareaSizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'px-3 py-2 text-sm' } as const;

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md';
  /** Opt-in: render the label as a notch on the field's top border. */
  floatingLabel?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, floatingLabel = false, className = '', size = 'md', rows = 4, ...props }, ref) => {
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
        <textarea
          ref={ref}
          rows={rows}
          {...controlProps}
          {...props}
          className={cn(
            'w-full border rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            textareaSizeClasses[size],
            error ? 'border-danger' : 'border-slate-300',
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

Textarea.displayName = 'Textarea';
