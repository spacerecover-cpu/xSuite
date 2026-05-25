import React from 'react';
import { usePermissions } from '../../contexts/PermissionsContext';
import { SidebarNavItem } from './SidebarNavItem';
import { LucideIcon } from 'lucide-react';
import { getModuleKeyForRoute } from '../../lib/moduleMapping';

interface ProtectedSidebarNavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  badgeColor?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  isCollapsed: boolean;
  moduleKey?: string;
}

export const ProtectedSidebarNavItem: React.FC<ProtectedSidebarNavItemProps> = ({
  to,
  icon,
  label,
  badge,
  badgeColor,
  isCollapsed,
  moduleKey,
}) => {
  const { hasModuleAccess } = usePermissions();

  const key = moduleKey || getModuleKeyForRoute(to);
  if (!key || !hasModuleAccess(key)) {
    return null;
  }

  return (
    <SidebarNavItem
      to={to}
      icon={icon}
      label={label}
      badge={badge}
      badgeColor={badgeColor}
      isCollapsed={isCollapsed}
    />
  );
};
