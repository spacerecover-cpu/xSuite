import React, { createContext, useContext, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface HeaderSlotContextValue {
  title: string | undefined;
  setTitle: (t: string | undefined) => void;
  actionsHost: HTMLElement | null;
  setActionsHost: (el: HTMLElement | null) => void;
}

const HeaderSlotContext = createContext<HeaderSlotContextValue | null>(null);

export const HeaderSlotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ title, setTitle, actionsHost, setActionsHost }}>
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
 * Register the current page's title (shown in the top-bar breadcrumb) and
 * actions (portaled into the bar's actions host). Title is context state set in
 * a layout effect (pre-paint, no flash); actions are portaled live so dynamic
 * action nodes stay current. Returns the portal (or null) for the caller to render.
 */
export function usePageHeaderSlot(
  { title, actions }: { title: string; actions?: React.ReactNode },
): React.ReactPortal | null {
  const { setTitle, actionsHost } = useHeaderSlot();
  useLayoutEffect(() => {
    setTitle(title);
    return () => setTitle(undefined);
  }, [title, setTitle]);
  return actionsHost && actions != null ? createPortal(actions, actionsHost) : null;
}
