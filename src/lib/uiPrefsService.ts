import { supabase, resolveTenantId } from './supabaseClient';
import { logger } from './logger';
import type { Json } from '../types/database.types';

/**
 * Lightweight per-user UI flags that don't warrant a schema column — stored in
 * the `user_preferences.preferences.ui` JSON blob (same table/merge pattern as
 * tablePrefsService) with a localStorage hint for instant first paint. Read the
 * server value once per session (cached) to avoid re-querying on every page nav.
 */
type UiFlags = { ui?: Record<string, boolean> } & Record<string, unknown>;

const HINT_PREFIX = 'xsuite_ui_';
const hintKey = (flag: string) => `${HINT_PREFIX}${flag}`;

// Session caches: the resolved server value and an in-flight load promise, keyed
// by flag, so concurrent/repeated callers share a single SELECT.
const sessionValues: Record<string, boolean> = {};
const loadPromises: Record<string, Promise<boolean>> = {};

export function readUiFlagHint(flag: string): boolean {
  if (flag in sessionValues) return sessionValues[flag];
  try {
    return localStorage.getItem(hintKey(flag)) === 'true';
  } catch {
    return false;
  }
}

function writeUiFlagHint(flag: string, value: boolean): void {
  try {
    localStorage.setItem(hintKey(flag), String(value));
  } catch {
    // best-effort hint only
  }
}

export async function loadUiFlag(flag: string): Promise<boolean> {
  if (flag in sessionValues) return sessionValues[flag];
  if (flag in loadPromises) return loadPromises[flag];

  const p = (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return readUiFlagHint(flag);

      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        logger.error('Failed to load UI preference:', error);
        return readUiFlagHint(flag);
      }
      const prefs = (data?.preferences ?? {}) as UiFlags;
      const value = Boolean(prefs.ui?.[flag]);
      sessionValues[flag] = value;
      writeUiFlagHint(flag, value);
      return value;
    } catch (e) {
      // Degrade to the localStorage hint on any failure (e.g. no auth/session).
      logger.error('Failed to load UI preference:', e);
      return readUiFlagHint(flag);
    }
  })();
  loadPromises[flag] = p;
  return p;
}

export async function setUiFlag(flag: string, value: boolean): Promise<void> {
  // Optimistic + best-effort: the hint/session update is what drives the UI; the
  // server write is fire-and-forget and must never throw into the caller.
  sessionValues[flag] = value;
  writeUiFlagHint(flag, value);

  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;

    const { data: existing, error: readError } = await supabase
      .from('user_preferences')
      .select('id, preferences')
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) {
      logger.error('Failed to read UI preferences before write:', readError);
      return;
    }

    const current = (existing?.preferences ?? {}) as UiFlags;
    const preferences = {
      ...current,
      ui: { ...(current.ui ?? {}), [flag]: value },
    } as unknown as Json;

    if (existing?.id) {
      const { error } = await supabase.from('user_preferences').update({ preferences }).eq('id', existing.id);
      if (error) logger.error('Failed to persist UI preference:', error);
    } else {
      const tenantId = await resolveTenantId();
      const { error } = await supabase
        .from('user_preferences')
        .insert({ tenant_id: tenantId, user_id: userId, preferences });
      if (error) logger.error('Failed to insert UI preference:', error);
    }
  } catch (e) {
    logger.error('Failed to persist UI preference:', e);
  }
}

/** The KPI-row collapse flag used by CollapsibleKpis (Audit-3 M1). */
export const UI_FLAG_KPIS_COLLAPSED = 'kpisCollapsed';
