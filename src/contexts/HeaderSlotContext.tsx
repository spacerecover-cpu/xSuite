import React, { createContext, useContext, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

export interface HeaderSlot {
  title?: string;
  icon?: LucideIcon;
  iconColor?: string;
}

interface HeaderSlotContextValue {
  header: HeaderSlot;
  setHeader: (h: HeaderSlot) => void;
  actionsHost: HTMLElement | null;
  setActionsHost: (el: HTMLElement | null) => void;
}

const HeaderSlotContext = createContext<HeaderSlotContextValue | null>(null);

const EMPTY_HEADER: HeaderSlot = {};

export const HeaderSlotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [header, setHeader] = useState<HeaderSlot>(EMPTY_HEADER);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ header, setHeader, actionsHost, setActionsHost }}>
      {children}
    </HeaderSlotContext.Provider>
  );
};

export function useHeaderSlot(): HeaderSlotContextValue {
  const ctx = useContext(HeaderSlotContext);
  if (!ctx) throw new Error('useHeaderSlot must be used within HeaderSlotProvider');
  return ctx;
}

/**
 * Register the current page's header (title + optional icon/colour shown in the
 * top-bar breadcrumb) and actions (portaled into the bar's actions host). The
 * header is context state set in a layout effect (pre-paint, no flash); actions
 * are portaled live so dynamic action nodes stay current. Returns the portal
 * (or null) for the caller to render.
 */
export function usePageHeaderSlot(
  { title, icon, iconColor, actions }: { title: string; icon?: LucideIcon; iconColor?: string; actions?: React.ReactNode },
): React.ReactPortal | null {
  const { setHeader, actionsHost } = useHeaderSlot();
  useLayoutEffect(() => {
    setHeader({ title, icon, iconColor });
    return () => setHeader(EMPTY_HEADER);
  }, [title, icon, iconColor, setHeader]);
  return actionsHost && actions != null ? createPortal(actions, actionsHost) : null;
}
