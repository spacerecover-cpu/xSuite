import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const cardVariants = cva('rounded-lg transition-all duration-200 bg-surface', {
  variants: {
    variant: {
      default: 'shadow-sm border-t-4',
      bordered: 'border border-slate-200',
      outlined: 'border-2',
    },
    hoverable: {
      true: 'hover:shadow-md hover:scale-[1.02] cursor-pointer',
      false: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    hoverable: false,
  },
});

interface CardProps extends VariantProps<typeof cardVariants> {
  children: React.ReactNode;
  className?: string;
  borderColor?: string;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  hoverable?: boolean;
  variant?: 'default' | 'bordered' | 'outlined';
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  borderColor = 'transparent',
  onClick,
  onKeyDown,
  hoverable = false,
  variant = 'default',
  role,
  tabIndex,
  'aria-label': ariaLabel,
  ref,
}) => {
  return (
    <div
      ref={ref}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      className={cn(cardVariants({ variant, hoverable }), className)}
      style={variant === 'default' ? { borderTopColor: borderColor } : {}}
    >
      {children}
    </div>
  );
};
