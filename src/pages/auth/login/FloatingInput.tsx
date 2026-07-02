import type { LucideIcon } from 'lucide-react';
import type { ReactNode, InputHTMLAttributes } from 'react';

interface FloatingInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  icon: LucideIcon;
  error?: string;
  rightElement?: ReactNode;
}

export const FloatingInput = ({
  label,
  icon: Icon,
  error,
  rightElement,
  id,
  ...inputProps
}: FloatingInputProps) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div>
      <div className="relative">
        <Icon
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors duration-200 pointer-events-none ${
            error ? 'text-danger' : 'text-slate-400 peer-focus:text-primary'
          }`}
        />
        <input
          id={inputId}
          placeholder=" "
          className={`peer w-full pl-11 ${rightElement ? 'pr-12' : 'pr-4'} pt-5 pb-2 text-sm text-slate-900 bg-slate-50 border ${
            error
              ? 'border-danger/40 focus:border-danger focus:ring-danger/20'
              : 'border-slate-200 focus:border-primary focus:ring-primary/20'
          } rounded-xl outline-none focus:ring-4 transition-all duration-200`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...inputProps}
        />
        <label
          htmlFor={inputId}
          className={`absolute left-11 transition-all duration-200 pointer-events-none
            peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm
            peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-xs
            top-2.5 translate-y-0 text-xs
            ${error ? 'text-danger' : 'text-slate-500 peer-focus:text-primary'}`}
        >
          {label}
        </label>
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
