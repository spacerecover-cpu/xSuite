import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface SidebarNavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: number | string;
  badgeColor?: 'blue' | 'red' | 'green' | 'orange' | 'purple';
  isCollapsed?: boolean;
}

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  to,
  icon: Icon,
  label,
  badge,
  badgeColor = 'blue',
  isCollapsed = false,
}) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  const [isHovered, setIsHovered] = useState(false);

  const badgeColorClasses = {
    blue: 'bg-info text-info-foreground',
    red: 'bg-danger text-danger-foreground',
    green: 'bg-success text-success-foreground',
    orange: 'bg-warning text-warning-foreground',
    purple: 'bg-accent text-accent-foreground',
  };

  const getItemStyle = () => {
    if (isActive) {
      return {
        background: 'rgb(var(--color-primary) / 0.10)',
        boxShadow: '0 1px 4px rgb(var(--color-primary) / 0.15)',
        borderLeft: '4px solid rgb(var(--color-primary))',
      };
    }
    if (isHovered) {
      return {
        background: 'rgb(var(--color-primary) / 0.04)',
        borderLeft: '4px solid rgb(var(--color-primary) / 0.4)',
      };
    }
    return {
      background: 'transparent',
      borderLeft: '4px solid transparent',
    };
  };

  const getIconBoxStyle = () => {
    if (isActive) return { background: 'rgb(var(--color-primary) / 0.12)' };
    if (isHovered) return { background: '#D4DCE8' };
    return { background: '#E8ECF2' };
  };

  const getIconColor = () => {
    if (isActive) return 'rgb(var(--color-primary))';
    if (isHovered) return 'rgb(var(--color-primary))';
    return '#4A6080';
  };

  const getLabelColor = () => {
    if (isActive) return 'rgb(var(--color-primary))';
    if (isHovered) return 'rgb(var(--color-primary))';
    return '#2C3A4A';
  };

  return (
    <Link
      to={to}
      className={`
        relative flex items-center rounded-lg transition-all duration-[180ms] ease-[ease]
        ${isCollapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3'}
      `}
      style={{
        ...(isCollapsed ? {} : { padding: '9px 10px' }),
        ...getItemStyle(),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isCollapsed ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
    >
      {isCollapsed && isActive && (
        <div
          className="absolute left-0 top-0 bottom-0 rounded-r-sm"
          style={{ width: '3px', background: 'rgb(var(--color-primary))' }}
        />
      )}

      <div
        className={`
          flex items-center justify-center flex-shrink-0 transition-all duration-[180ms]
          ${isCollapsed ? 'w-10 h-10' : ''}
          rounded-[7px]
        `}
        style={{
          ...(isCollapsed ? {} : { width: '24px', height: '24px' }),
          ...getIconBoxStyle(),
        }}
      >
        <Icon
          style={{
            width: '15px',
            height: '15px',
            color: getIconColor(),
            strokeWidth: 1.5,
            transition: 'color 0.18s ease',
          }}
        />
      </div>

      {!isCollapsed && (
        <>
          <span
            className={`${isActive ? 'font-semibold' : 'font-medium'} flex-1 tracking-tight transition-colors duration-[180ms]`}
            style={{ fontSize: '13.5px', color: getLabelColor() }}
          >
            {label}
          </span>
          {badge !== undefined && (
            <span className={`
              ml-auto text-[11px] font-medium rounded-[5px] text-center
              ${badgeColorClasses[badgeColor]}
            `}
            style={{ padding: '2px 8px' }}
            >
              {badge}
            </span>
          )}
        </>
      )}

      {isCollapsed && badge !== undefined && (
        <div className={`
          absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold
          ${badgeColorClasses[badgeColor]}
          shadow-lg
        `}>
          {typeof badge === 'number' && badge > 9 ? '9+' : badge}
        </div>
      )}
    </Link>
  );
};
