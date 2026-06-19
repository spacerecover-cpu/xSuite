import React, { useEffect, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  alwaysExpanded?: boolean;
  /**
   * Monochrome identity glyph for the group header. Stays slate at rest and
   * adopts the brand colour when the group is open/hovered. Replaces the old
   * per-group `cat-*` dot — see note below.
   */
  icon?: LucideIcon;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  title,
  children,
  defaultCollapsed = false,
  onToggle,
  isCollapsed = false,
  alwaysExpanded = false,
  icon: Icon,
}) => {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);
  const contentId = useId();

  useEffect(() => {
    setIsOpen(!defaultCollapsed);
  }, [defaultCollapsed]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (alwaysExpanded) return;
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(!newState);
  };

  // Collapsed icon rail: drop the group label/glyph and separate groups with a
  // hairline divider so the rail stays scannable without text.
  if (isCollapsed) {
    return (
      <div className="py-2 border-b border-border">
        <div className="space-y-1">{children}</div>
      </div>
    );
  }

  // An open group reads as the active section: its glyph, label and chevron take
  // the brand colour. This is what replaced the per-group identity dots — colour
  // now means "you are here" rather than a fixed (and arbitrary) hue per group,
  // which freed the cat-* palette for its real job (charts / device tiles).
  const isActiveGroup = isOpen && !alwaysExpanded;
  const iconColor = isActiveGroup ? 'text-primary' : 'text-slate-500 group-hover:text-primary';
  const labelColor = isActiveGroup ? 'text-primary' : 'text-slate-700 group-hover:text-primary';

  const headerInner = (
    <div className="flex items-center gap-3 min-w-0">
      {Icon && (
        <Icon className={`w-[17px] h-[17px] flex-shrink-0 transition-colors ${iconColor}`} strokeWidth={1.75} />
      )}
      <span className={`text-xxs font-semibold uppercase tracking-[0.1em] transition-colors ${labelColor}`}>
        {title}
      </span>
    </div>
  );

  return (
    <div className={alwaysExpanded ? 'py-1' : 'pt-3 mt-1.5 border-t border-border'}>
      {/* The open group rides a faint navy band + a 2px spine so the active
          branch carries real weight instead of dissolving into the chrome. */}
      <div className={isActiveGroup ? 'relative rounded-xl bg-primary/[0.06] py-1' : ''}>
        {isActiveGroup && (
          <span aria-hidden="true" className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-primary" />
        )}
        {!alwaysExpanded ? (
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isOpen}
            aria-controls={contentId}
            className="group w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {headerInner}
            <ChevronRight
              className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
                isOpen ? 'rotate-90 text-primary' : 'text-slate-500 group-hover:text-primary'
              }`}
            />
          </button>
        ) : (
          <div className="px-2.5 py-2">{headerInner}</div>
        )}

        <div
          id={contentId}
          role="group"
          aria-label={title}
          className={`mt-0.5 space-y-0.5 overflow-hidden transition-all duration-300 ease-in-out ${
            isOpen || alwaysExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
