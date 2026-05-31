import React from 'react';
import { cva } from 'class-variance-authority';
import { HardDrive, Database, Wrench, Copy, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface DeviceRoleBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  role: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
  ref?: React.Ref<HTMLSpanElement>;
}

type RoleKey = 'patient' | 'backup' | 'donor' | 'clone';

// Self-contained role -> tone map. Keeps the `border-<tone>/30` signature and the
// clone -> accent mapping that the shared STATUS_TONE_MUTED map does NOT carry.
export const deviceRoleBadgeVariants = cva(
  'inline-flex items-center gap-1.5 font-medium rounded-md border',
  {
    variants: {
      role: {
        patient: 'bg-info-muted text-info border-info/30',
        backup: 'bg-success-muted text-success border-success/30',
        donor: 'bg-warning-muted text-warning border-warning/30',
        clone: 'bg-accent text-accent-foreground border-accent-foreground/20',
      },
      size: {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-1',
        lg: 'text-base px-3 py-1.5',
      },
    },
    defaultVariants: {
      role: 'patient',
      size: 'md',
    },
  },
);

const iconSizes: Record<NonNullable<DeviceRoleBadgeProps['size']>, string> = {
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
  lg: 'w-4 h-4',
};

const roleMeta: Record<RoleKey, { icon: LucideIcon; labelKey: string }> = {
  patient: { icon: HardDrive, labelKey: 'ui.deviceRole.patient' },
  backup: { icon: Database, labelKey: 'ui.deviceRole.backup' },
  donor: { icon: Wrench, labelKey: 'ui.deviceRole.donor' },
  clone: { icon: Copy, labelKey: 'ui.deviceRole.clone' },
};

export const DeviceRoleBadge: React.FC<DeviceRoleBadgeProps> = ({
  role,
  size = 'md',
  showIcon = true,
  className = '',
  ref,
  ...rest
}) => {
  const { t } = useTranslation();
  const normalizedRole = role?.toLowerCase() || 'patient';
  const roleKey: RoleKey = normalizedRole in roleMeta ? (normalizedRole as RoleKey) : 'patient';
  const meta = roleMeta[roleKey];
  const Icon = meta.icon;

  return (
    <span
      ref={ref}
      className={cn(deviceRoleBadgeVariants({ role: roleKey, size }), className)}
      {...rest}
    >
      {showIcon && <Icon className={iconSizes[size]} aria-hidden="true" />}
      <span>{t(meta.labelKey)}</span>
    </span>
  );
};
