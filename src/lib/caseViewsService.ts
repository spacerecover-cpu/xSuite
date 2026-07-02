import { supabase, resolveTenantId } from './supabaseClient';
import type { Json } from '../types/database.types';
import type { CaseBucket } from './caseLifecycle';

/**
 * Per-user saved filter presets for the Cases list, stored in
 * user_preferences.preferences.case_views (same row the table prefs use).
 */
export interface CaseSavedView {
  id: string;
  name: string;
  filterStatus: string;
  filterPriority: string;
  bucket: CaseBucket | null;
  sort: { key: string; dir: 'asc' | 'desc' };
}

export function normalizeCaseViews(raw: unknown): CaseSavedView[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is CaseSavedView =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as CaseSavedView).id === 'string' &&
      typeof (v as CaseSavedView).name === 'string' &&
      typeof (v as CaseSavedView).filterStatus === 'string' &&
      typeof (v as CaseSavedView).filterPriority === 'string' &&
      !!(v as CaseSavedView).sort &&
      typeof (v as CaseSavedView).sort.key === 'string',
  );
}

export async function getCaseViews(): Promise<CaseSavedView[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return [];
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  return normalizeCaseViews(prefs.case_views);
}

export async function saveCaseViews(views: CaseSavedView[]): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const { data: existing, error: readError } = await supabase
    .from('user_preferences')
    .select('id, preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const preferences = {
    ...((existing?.preferences ?? {}) as Record<string, unknown>),
    case_views: views,
  } as unknown as Json;

  if (existing?.id) {
    const { error } = await supabase
      .from('user_preferences')
      .update({ preferences })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const tenantId = await resolveTenantId();
    const { error } = await supabase
      .from('user_preferences')
      .insert({ tenant_id: tenantId, user_id: userId, preferences });
    if (error) throw error;
  }
}
