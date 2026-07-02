import React from 'react';
import { Link, useLocation, useNavigation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { useSidebarPreferences } from '../../contexts/SidebarPreferencesContext';

interface SidebarNavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: number | string;
  badgeColor?: 'blue' | 'red' | 'green' | 'orange' | 'purple';
  isCollapsed?: boolean;
}

const badgeColorClasses: Record<NonNullable<SidebarNavItemProps['badgeColor']>, string> = {
  blue: 'bg-info text-info-foreground',
  red: 'bg-danger text-danger-foreground',
  green: 'bg-success text-success-foreground',
  orange: 'bg-warning text-warning-foreground',
  purple: 'bg-accent text-accent-foreground',
};

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  to,
  icon: Icon,
  label,
  badge,
  badgeColor = 'blue',
  isCollapsed = false,
}) => {
  const location = useLocation();
  const navigation = useNavigation();
  const { position } = useSidebarPreferences();
  const tooltipSide = position === 'right' ? 'left' : 'right';
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  // Route chunks resolve inside the router (route.lazy), so while a section's
  // chunk downloads the navigation is in 'loading' state with the DESTINATION
  // in navigation.location. Matching it against this item's target gives the
  // clicked item an immediate pending indicator — the first click is visibly
  // acknowledged instead of looking swallowed.
  const pendingPath = navigation.state === 'loading' ? navigation.location.pathname : null;
  const isPending =
    pendingPath !== null && (pendingPath === to || (to !== '/' && pendingPath.startsWith(to)));
  const isHighlighted = isActive || isPending;

  // Solid pill on active maximizes the visible theme change and keeps the
  // label/icon at AA contrast on every theme (white-on-primary). Hover stays a
  // light tint so it reads clearly distinct from the active state.
  const stateClasses = isActive
    ? 'bg-primary text-primary-foreground shadow-sm'
    : isPending
      ? 'bg-primary/10 text-primary'
      : 'text-slate-700 hover:bg-primary/[0.06] hover:text-primary';

  const iconClasses = isHighlighted ? 'text-current' : 'text-slate-500 group-hover:text-primary';

  const link = (
    <Link
      to={to}
      className={`
        group relative flex items-center rounded-lg
        transition-colors duration-200 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        focus-visible:ring-offset-2 focus-visible:ring-offset-surface
        ${isCollapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-2.5 h-9'}
        ${stateClasses}
      `}
      aria-label={isCollapsed ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
      aria-busy={isPending || undefined}
    >
      {isPending ? (
        <Loader2 className={`w-[18px] h-[18px] flex-shrink-0 animate-spin ${iconClasses}`} strokeWidth={1.75} />
      ) : (
        <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${iconClasses}`} strokeWidth={1.75} />
      )}

      {!isCollapsed && (
        <>
          <span className={`flex-1 text-nav tracking-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
            {label}
          </span>
          {badge !== undefined && (
            <span
              className={`ml-auto px-2 py-0.5 text-xxs font-semibold rounded text-center ${
                isActive ? 'bg-primary-foreground/20 text-primary-foreground' : badgeColorClasses[badgeColor]
              }`}
            >
              {badge}
            </span>
          )}
        </>
      )}

      {isCollapsed && badge !== undefined && (
        <span
          className={`absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-xxs font-bold shadow ${
            isActive ? 'bg-primary-foreground text-primary' : badgeColorClasses[badgeColor]
          }`}
        >
          {typeof badge === 'number' && badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  );

  return isCollapsed ? (
    <Tooltip label={label} side={tooltipSide}>
      {link}
    </Tooltip>
  ) : (
    link
  );
};
