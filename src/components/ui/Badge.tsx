import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { STATUS_TONE_MUTED } from '../../lib/ui/variants';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'custom' | 'error' | 'outline';

type ResolvedBadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'custom';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  ref?: React.Ref<HTMLSpanElement>;
}

const VARIANT_ALIAS: Record<BadgeVariant, ResolvedBadgeVariant> = {
  default: 'default',
  secondary: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  custom: 'custom',
  error: 'danger',
  outline: 'secondary',
};

export const badgeVariants = cva('inline-flex items-center font-semibold rounded-md transition-all', {
  variants: {
    variant: {
      default: 'bg-slate-100 text-slate-800',
      secondary: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
      success: `${STATUS_TONE_MUTED.success} ring-1 ring-success/30`,
      warning: `${STATUS_TONE_MUTED.warning} ring-1 ring-warning/30`,
      danger: `${STATUS_TONE_MUTED.danger} ring-1 ring-danger/30`,
      info: `${STATUS_TONE_MUTED.info} ring-1 ring-info/30`,
      custom: '',
    },
    size: {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-sm',
      lg: 'px-3 py-1.5 text-base',
    },
    interactive: {
      true: 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      false: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
    interactive: false,
  },
});

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  color,
  className = '',
  style,
  onClick,
  ref,
  ...rest
}) => {
  const resolvedVariant = VARIANT_ALIAS[variant];
  const interactive = !!onClick;

  const colorStyle: React.CSSProperties | undefined =
    color !== undefined
      ? resolvedVariant === 'custom'
        ? { backgroundColor: color + '20', color, border: `1px solid ${color}40` }
        : { backgroundColor: color }
      : undefined;

  const computedStyle = { ...colorStyle, ...style };

  const handleKeyDown = interactive
    ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e as unknown as React.MouseEvent<HTMLSpanElement>);
        }
      }
    : undefined;

  return (
    <span
      {...rest}
      ref={ref}
      role={interactive ? 'button' : rest.role}
      tabIndex={interactive ? 0 : rest.tabIndex}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(badgeVariants({ variant: resolvedVariant, size, interactive }), className)}
      style={computedStyle}
    >
      {children}
    </span>
  );
};
