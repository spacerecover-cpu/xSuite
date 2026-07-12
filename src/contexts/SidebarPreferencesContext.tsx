import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import type { Database } from '../types/database.types';

export type SidebarPosition = 'left' | 'right';

type SidebarPrefsInsert = Database['public']['Tables']['user_sidebar_preferences']['Insert'];

// Sections that round-trip to collapsed_sections via the single-open accordion
// model. Matches the historical persistence set; HR/Payroll/Employee stay
// session-only (unchanged behaviour — see Sidebar accordion).
const PERSISTED_SECTIONS = ['financial', 'business', 'resources', 'system'];

// localStorage hints mirror the xsuite_theme_hint / xsuite_locale_hint pattern:
// the provider seeds its initial state synchronously so returning users on the
// same device don't see the sidebar flash from default → saved placement before
// the DB row loads. The DB row remains the source of truth and reconciles on load.
const POSITION_HINT_KEY = 'xsuite_sidebar_position';
const COLLAPSED_HINT_KEY = 'xsuite_sidebar_collapsed';

interface SidebarPreferencesValue {
  loading: boolean;
  position: SidebarPosition;
  isCollapsed: boolean;
  expandedSection: string | null;
  setPosition: (position: SidebarPosition) => void;
  toggleCollapsed: () => void;
  setExpandedSection: (section: string | null) => void;
}

const SidebarPreferencesContext = createContext<SidebarPreferencesValue | undefined>(undefined);

function readPositionHint(): SidebarPosition {
  if (typeof localStorage === 'undefined') return 'left';
  return localStorage.getItem(POSITION_HINT_KEY) === 'right' ? 'right' : 'left';
}

function readCollapsedHint(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(COLLAPSED_HINT_KEY) === 'true';
}

export const SidebarPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [position, setPositionState] = useState<SidebarPosition>(readPositionHint);
  const [isCollapsed, setIsCollapsedState] = useState<boolean>(readCollapsedHint);
  const [expandedSection, setExpandedSectionState] = useState<string | null>(null);
  // Per-field record of which preferences the user changed this session. The DB
  // row loads asynchronously after mount; without this a slow SELECT landing
  // after a user toggle snapped that field back under the cursor (and stomped
  // the newer, already-persisted intent with pre-change data). Tracking is
  // per-field so an in-flight SELECT still hydrates the fields the user has NOT
  // touched — a single boolean here dropped every other saved preference the
  // moment the user changed any one of them. Reset per userId so a later user's
  // row is not suppressed by an earlier user's interaction.
  const touchedRef = useRef({ position: false, collapsed: false, section: false });

  // Persist a partial patch for the current user. tenant_id is stamped by the
  // set_user_sidebar_preferences_tenant_and_audit trigger; a PostgREST upsert
  // only writes the columns present in the payload on conflict, so single-field
  // patches never clobber the user's other preferences.
  const persist = useCallback(
    async (patch: Partial<SidebarPrefsInsert>) => {
      if (!userId) return;
      const { error } = await supabase
        .from('user_sidebar_preferences')
        .upsert({ user_id: userId, ...patch } as SidebarPrefsInsert, { onConflict: 'user_id' });
      if (error) logger.error('Failed to persist sidebar preferences:', error);
    },
    [userId],
  );

  useEffect(() => {
    touchedRef.current = { position: false, collapsed: false, section: false };
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_sidebar_preferences')
        .select('sidebar_position, is_collapsed, collapsed_sections')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        // Apply each saved field only if the user has not changed that field
        // since mount; untouched fields still hydrate from the DB row.
        if (!touchedRef.current.position) {
          const pos: SidebarPosition = data.sidebar_position === 'right' ? 'right' : 'left';
          setPositionState(pos);
          localStorage.setItem(POSITION_HINT_KEY, pos);
        }

        if (!touchedRef.current.collapsed) {
          const collapsed = Boolean(data.is_collapsed);
          setIsCollapsedState(collapsed);
          localStorage.setItem(COLLAPSED_HINT_KEY, String(collapsed));
        }

        if (!touchedRef.current.section) {
          const collapsedSections = data.collapsed_sections ?? [];
          if (collapsedSections.length > 0) {
            const expanded = PERSISTED_SECTIONS.find((s) => !collapsedSections.includes(s));
            setExpandedSectionState(expanded ?? null);
          }
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setPosition = useCallback(
    (next: SidebarPosition) => {
      touchedRef.current.position = true;
      setPositionState(next);
      localStorage.setItem(POSITION_HINT_KEY, next);
      void persist({ sidebar_position: next });
    },
    [persist],
  );

  const toggleCollapsed = useCallback(() => {
    touchedRef.current.collapsed = true;
    setIsCollapsedState((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_HINT_KEY, String(next));
      void persist({ is_collapsed: next });
      return next;
    });
  }, [persist]);

  const setExpandedSection = useCallback(
    (section: string | null) => {
      touchedRef.current.section = true;
      setExpandedSectionState(section);
      void persist({ collapsed_sections: PERSISTED_SECTIONS.filter((s) => s !== section) });
    },
    [persist],
  );

  // Memoized: the provider sits inside AppLayout, which re-renders on every
  // navigation (useLocation); an unstable value re-rendered the whole sidebar
  // tree on each route change.
  const value = useMemo(
    () => ({ loading, position, isCollapsed, expandedSection, setPosition, toggleCollapsed, setExpandedSection }),
    [loading, position, isCollapsed, expandedSection, setPosition, toggleCollapsed, setExpandedSection],
  );

  return (
    <SidebarPreferencesContext.Provider value={value}>
      {children}
    </SidebarPreferencesContext.Provider>
  );
};

export function useSidebarPreferences(): SidebarPreferencesValue {
  const ctx = useContext(SidebarPreferencesContext);
  if (!ctx) {
    throw new Error('useSidebarPreferences must be used within a SidebarPreferencesProvider');
  }
  return ctx;
}
