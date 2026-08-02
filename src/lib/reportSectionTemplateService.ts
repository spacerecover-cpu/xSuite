/**
 * reportSectionTemplateService — predefined report-section templates per report
 * type (global `report_section_presets` seeded from `report_section_library`)
 * plus tenant-customized templates (`report_section_templates`).
 *
 * The resolver feeds report creation: chosen template → tenant default →
 * default preset → the built-in `reportSubtypeSections` list. Resolution NEVER
 * throws — a missing/unreachable catalog degrades to the built-in sections so
 * report creation (and document automation) keeps working with zero rows.
 *
 * Spec: docs/superpowers/specs/2026-08-02-report-section-templates-design.md
 */

import { supabase } from './supabaseClient';
import type { Database, Json } from '../types/database.types';
import { logger } from './logger';
import { reportSubtypeSections } from './pdf/engine/adapters/reportAdapter';

export type ReportSectionTemplateRow =
  Database['public']['Tables']['report_section_templates']['Row'];
export type ReportSectionPresetRow =
  Database['public']['Tables']['report_section_presets']['Row'];
export type ReportSectionLibraryRow =
  Database['public']['Tables']['report_section_library']['Row'];

/** One ordered section inside a template/preset (stored as JSONB array items). */
export interface TemplateSectionDescriptor {
  key: string;
  title: string;
  /** Editor placeholder copy (never printed). */
  guidance?: string;
  /** Structural sections (e.g. the destruction certificate) can't be removed. */
  required?: boolean;
}

/** A choosable template, resolved to a uniform shape for pickers. */
export interface ReportTemplateChoice {
  source: 'tenant' | 'system';
  id: string;
  reportType: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  sections: TemplateSectionDescriptor[];
}

/** The template report creation seeds from when none is explicitly chosen. */
export interface EffectiveTemplate {
  source: 'tenant' | 'system' | 'builtin';
  id?: string;
  name: string;
  sections: TemplateSectionDescriptor[];
}

/** Lowercase snake_case key from an arbitrary title/key; never empty. */
export function slugifySectionKey(raw: string): string {
  const slug = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'custom_section';
}

/**
 * Defensive parse of a JSONB sections array: trims titles, slugifies missing
 * keys from the title, drops entries without a usable title, dedupes by key
 * (first wins). Applied on every read AND write so malformed rows can never
 * reach the composer or the section seeder.
 */
export function normalizeSections(input: unknown): TemplateSectionDescriptor[] {
  if (!Array.isArray(input)) return [];
  const out: TemplateSectionDescriptor[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    if (!title) continue;
    const rawKey = typeof r.key === 'string' ? r.key.trim() : '';
    const key = slugifySectionKey(rawKey || title);
    if (seen.has(key)) continue;
    seen.add(key);
    const guidance =
      typeof r.guidance === 'string' && r.guidance.trim() ? r.guidance.trim() : undefined;
    out.push({
      key,
      title,
      ...(guidance ? { guidance } : {}),
      ...(r.required === true ? { required: true } : {}),
    });
  }
  return out;
}

async function resolveTenantId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.tenant_id) throw new Error('No active tenant');
  return profile.tenant_id;
}

/** The section catalog for the "Add section" picker (active, ordered). */
export async function listSectionLibrary(): Promise<ReportSectionLibraryRow[]> {
  const { data, error } = await supabase
    .from('report_section_library')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    logger.error('[reportSectionTemplateService] library list failed:', error);
    throw error;
  }
  return data ?? [];
}

function toChoice(
  source: 'tenant' | 'system',
  row: Pick<ReportSectionPresetRow, 'id' | 'report_type' | 'name' | 'description' | 'sections' | 'is_default'>,
): ReportTemplateChoice {
  return {
    source,
    id: row.id,
    reportType: row.report_type,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
    sections: normalizeSections(row.sections),
  };
}

/** Every choosable template for a report type: the tenant's own + the presets. */
export async function listReportTemplateChoices(
  reportType: string,
): Promise<{ tenant: ReportTemplateChoice[]; system: ReportTemplateChoice[] }> {
  const [tenantRes, systemRes] = await Promise.all([
    supabase
      .from('report_section_templates')
      .select('id, report_type, name, description, sections, is_default')
      .eq('report_type', reportType)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('report_section_presets')
      .select('id, report_type, name, description, sections, is_default')
      .eq('report_type', reportType)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);
  if (tenantRes.error) {
    logger.error('[reportSectionTemplateService] tenant choices failed:', tenantRes.error);
    throw tenantRes.error;
  }
  if (systemRes.error) {
    logger.error('[reportSectionTemplateService] preset choices failed:', systemRes.error);
    throw systemRes.error;
  }
  return {
    tenant: (tenantRes.data ?? []).map((r) => toChoice('tenant', r)),
    system: (systemRes.data ?? []).map((r) => toChoice('system', r)),
  };
}

/** Every tenant template (all types) for the Settings management page. */
export async function listTenantReportSectionTemplates(): Promise<ReportSectionTemplateRow[]> {
  const { data, error } = await supabase
    .from('report_section_templates')
    .select('*')
    .is('deleted_at', null)
    .order('report_type', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('[reportSectionTemplateService] tenant templates list failed:', error);
    throw error;
  }
  return data ?? [];
}

/** Every active preset (all types) for the Settings management page. */
export async function listReportSectionPresets(): Promise<ReportSectionPresetRow[]> {
  const { data, error } = await supabase
    .from('report_section_presets')
    .select('*')
    .eq('is_active', true)
    .order('report_type', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) {
    logger.error('[reportSectionTemplateService] presets list failed:', error);
    throw error;
  }
  return data ?? [];
}

/**
 * The template report creation seeds from: tenant default → default preset →
 * built-in list. Never throws; every failure falls through to the next source.
 */
export async function resolveEffectiveTemplate(reportType: string): Promise<EffectiveTemplate> {
  try {
    const { data, error } = await supabase
      .from('report_section_templates')
      .select('id, name, sections')
      .eq('report_type', reportType)
      .eq('is_default', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (!error && data) {
      const sections = normalizeSections(data.sections);
      if (sections.length) return { source: 'tenant', id: data.id, name: data.name, sections };
    }
  } catch (e) {
    logger.warn('[reportSectionTemplateService] tenant default lookup failed:', e);
  }
  try {
    const { data, error } = await supabase
      .from('report_section_presets')
      .select('id, name, sections')
      .eq('report_type', reportType)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();
    if (!error && data) {
      const sections = normalizeSections(data.sections);
      if (sections.length) return { source: 'system', id: data.id, name: data.name, sections };
    }
  } catch (e) {
    logger.warn('[reportSectionTemplateService] preset default lookup failed:', e);
  }
  return {
    source: 'builtin',
    name: 'Built-in sections',
    sections: reportSubtypeSections(reportType),
  };
}

export interface CreateReportSectionTemplateParams {
  reportType: string;
  name: string;
  description?: string | null;
  sections: TemplateSectionDescriptor[];
  isDefault?: boolean;
  sourcePresetId?: string | null;
}

export async function createReportSectionTemplate(
  params: CreateReportSectionTemplateParams,
): Promise<ReportSectionTemplateRow> {
  const sections = normalizeSections(params.sections);
  if (!sections.length) throw new Error('A template needs at least one section');
  const tenantId = await resolveTenantId();
  if (params.isDefault) await clearDefaultsForType(params.reportType);
  const { data, error } = await supabase
    .from('report_section_templates')
    .insert({
      tenant_id: tenantId,
      report_type: params.reportType,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      sections: sections as unknown as Json,
      is_default: !!params.isDefault,
      ...(params.sourcePresetId ? { source_preset_id: params.sourcePresetId } : {}),
    })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('[reportSectionTemplateService] create failed:', error);
    throw error ?? new Error('Failed to create template');
  }
  return data;
}

export interface UpdateReportSectionTemplateParams {
  name?: string;
  description?: string | null;
  sections?: TemplateSectionDescriptor[];
  isActive?: boolean;
}

export async function updateReportSectionTemplate(
  id: string,
  patch: UpdateReportSectionTemplateParams,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.sections !== undefined) {
    const sections = normalizeSections(patch.sections);
    if (!sections.length) throw new Error('A template needs at least one section');
    update.sections = sections as unknown as Json;
  }
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .from('report_section_templates')
    .update(update)
    .eq('id', id);
  if (error) {
    logger.error('[reportSectionTemplateService] update failed:', error);
    throw error;
  }
}

/** Soft delete (clears default so the unique partial index frees the slot). */
export async function softDeleteReportSectionTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('report_section_templates')
    .update({ deleted_at: new Date().toISOString(), is_default: false })
    .eq('id', id);
  if (error) {
    logger.error('[reportSectionTemplateService] delete failed:', error);
    throw error;
  }
}

async function clearDefaultsForType(reportType: string): Promise<void> {
  const { error } = await supabase
    .from('report_section_templates')
    .update({ is_default: false })
    .eq('report_type', reportType)
    .eq('is_default', true)
    .is('deleted_at', null);
  if (error) {
    logger.error('[reportSectionTemplateService] clear defaults failed:', error);
    throw error;
  }
}

/** Make one tenant template the default for its type (clears siblings first). */
export async function setDefaultReportSectionTemplate(
  id: string,
  reportType: string,
): Promise<void> {
  await clearDefaultsForType(reportType);
  const { error } = await supabase
    .from('report_section_templates')
    .update({ is_default: true })
    .eq('id', id);
  if (error) {
    logger.error('[reportSectionTemplateService] set default failed:', error);
    throw error;
  }
}
