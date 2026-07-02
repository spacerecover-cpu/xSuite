import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'danger' | 'ghost' | 'outline' | 'default' | 'destructive' | 'accent';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingLabel?: string;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}

const VARIANT_ALIAS: Record<ButtonVariant, 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'danger' | 'ghost' | 'accent'> = {
  primary: 'primary',
  secondary: 'secondary',
  success: 'success',
  warning: 'warning',
  info: 'info',
  danger: 'danger',
  ghost: 'ghost',
  outline: 'ghost',
  default: 'primary',
  destructive: 'danger',
  accent: 'accent',
};

export const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary',
        secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 focus-visible:ring-slate-500',
        success: 'bg-success text-success-foreground hover:bg-success/90 focus-visible:ring-success',
        warning: 'bg-warning text-warning-foreground hover:bg-warning/90 focus-visible:ring-warning',
        info: 'bg-info text-info-foreground hover:bg-info/90 focus-visible:ring-info',
        danger: 'bg-danger text-danger-foreground hover:bg-danger/90 focus-visible:ring-danger',
        ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-500',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent-foreground',
      },
      size: {
        // 14px is the platform button size (DESIGN.md → Typography → Type
        // roles). Vertical padding compensates the smaller line-height so
        // control heights are unchanged (md 40px, lg 52px) — no layout shift.
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-6 py-3.5 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingLabel,
  className = '',
  children,
  disabled,
  ref,
  ...props
}) => {
  const resolvedVariant = VARIANT_ALIAS[variant];

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant: resolvedVariant, size }), className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Spinner size={size === 'lg' ? 'md' : 'sm'} label={loadingLabel} />}
      {children}
    </button>
  );
};
