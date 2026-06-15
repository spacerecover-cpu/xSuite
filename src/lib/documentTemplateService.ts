/**
 * documentTemplateService — typed CRUD for the tenant-configurable PDF template
 * persistence layer (M2): `branding_themes`, `document_templates_pdf`, and
 * `document_template_versions`.
 *
 * This is the storage companion to the pure config + engine modules under
 * `src/lib/pdf/`:
 *   - `branding_themes`          — reusable, Xero-style tenant branding presets
 *                                  (logo, accent, fonts, paper defaults, socials).
 *   - `document_templates_pdf`   — one per (tenant, document_type) PDF template,
 *                                  optionally bound to a branding theme.
 *   - `document_template_versions` — immutable-ish version history for a template;
 *                                  exactly one row per template is `is_deployed`.
 *
 * Follows the project service-layer pattern (see `companySettingsService.ts`):
 * imports the shared `supabase` client, uses generated `Database` types, returns
 * typed rows, and uses `maybeSingle()` for zero-or-one reads. RLS is the source
 * of tenant isolation — this module never touches the service_role key. The
 * `config` Json column carries a {@link TemplateConfigOverride} (the cascade
 * layer for that template); we type it at the service boundary and cast to
 * {@link Json} only at the write edge.
 *
 * Soft deletes only (`deleted_at = now()`); never `DELETE FROM`.
 */

import { supabase } from './supabaseClient';
import { resolveTenantId } from './supabaseClient';
import { logger } from './logger';
import type { Database, Json } from '../types/database.types';
import type { TemplateConfigOverride } from './pdf/templateConfig';
import { BUILT_IN_TEMPLATE_CONFIGS } from './pdf/templateConfig';
import { getOrCreateCompanySettings } from './companySettingsService';

// ---------------------------------------------------------------------------
// Row / Insert / Update aliases (generated types are the source of truth)
// ---------------------------------------------------------------------------

export type BrandingTheme = Database['public']['Tables']['branding_themes']['Row'];
export type BrandingThemeInsert = Database['public']['Tables']['branding_themes']['Insert'];
export type BrandingThemeUpdate = Database['public']['Tables']['branding_themes']['Update'];

export type DocumentTemplatePdf = Database['public']['Tables']['document_templates_pdf']['Row'];
export type DocumentTemplatePdfInsert = Database['public']['Tables']['document_templates_pdf']['Insert'];
export type DocumentTemplatePdfUpdate = Database['public']['Tables']['document_templates_pdf']['Update'];

export type DocumentTemplateVersion =
  Database['public']['Tables']['document_template_versions']['Row'];
export type DocumentTemplateVersionInsert =
  Database['public']['Tables']['document_template_versions']['Insert'];
export type DocumentTemplateVersionUpdate =
  Database['public']['Tables']['document_template_versions']['Update'];

/**
 * The stored config payload for a template/version is a {@link TemplateConfigOverride}
 * (the cascade layer the tenant edits). It lives in the `config Json` column;
 * read it back through {@link readConfig} to recover the typed shape.
 */
export type TemplateConfigPayload = TemplateConfigOverride;

/** Narrow a Json config column back to the typed override shape. */
export function readConfig(config: Json): TemplateConfigPayload {
  return (config ?? {}) as TemplateConfigPayload;
}

/** Cast a typed override to the Json column shape for writes. */
function toJson(config: TemplateConfigPayload): Json {
  return config as unknown as Json;
}

// ===========================================================================
// branding_themes
// ===========================================================================

/**
 * List the tenant's branding themes (newest first). Excludes soft-deleted rows.
 * RLS scopes the result to the caller's tenant.
 */
export async function listBrandingThemes(): Promise<BrandingTheme[]> {
  const { data, error } = await supabase
    .from('branding_themes')
    .select('*')
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error listing branding themes:', error);
    throw error;
  }
  return data ?? [];
}

/** Fetch a single branding theme by id, or `null` when missing / deleted. */
export async function getBrandingTheme(id: string): Promise<BrandingTheme | null> {
  const { data, error } = await supabase
    .from('branding_themes')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching branding theme:', error);
    throw error;
  }
  return data ?? null;
}

/**
 * Create a branding theme. `tenant_id` is required by the generated Insert type;
 * we resolve it client-side, but the `set_*_tenant_and_audit` trigger remains the
 * authoritative stamp server-side.
 */
export async function createBrandingTheme(
  input: Omit<BrandingThemeInsert, 'tenant_id'> & { tenant_id?: string },
): Promise<BrandingTheme> {
  const tenant_id = input.tenant_id ?? (await resolveTenantId());
  const { data, error } = await supabase
    .from('branding_themes')
    .insert({ ...input, tenant_id })
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error creating branding theme:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to create branding theme: no row returned');
  return data;
}

/** Update a branding theme by id. Tenant scoping is enforced by RLS. */
export async function updateBrandingTheme(
  id: string,
  updates: BrandingThemeUpdate,
): Promise<BrandingTheme> {
  const { data, error } = await supabase
    .from('branding_themes')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error updating branding theme:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to update branding theme: not found or permission denied');
  return data;
}

/** Soft-delete a branding theme (`deleted_at = now()`). Never a hard delete. */
export async function softDeleteBrandingTheme(id: string): Promise<void> {
  const { error } = await supabase
    .from('branding_themes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) {
    logger.error('Error soft-deleting branding theme:', error);
    throw error;
  }
}

// ===========================================================================
// document_templates_pdf  (one per tenant + document_type)
// ===========================================================================

/** List the tenant's PDF templates (excludes soft-deleted), newest first. */
export async function listDocumentTemplates(): Promise<DocumentTemplatePdf[]> {
  const { data, error } = await supabase
    .from('document_templates_pdf')
    .select('*')
    .is('deleted_at', null)
    .order('document_type', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error listing PDF templates:', error);
    throw error;
  }
  return data ?? [];
}

/** Fetch a single PDF template by id, or `null` when missing / deleted. */
export async function getDocumentTemplate(id: string): Promise<DocumentTemplatePdf | null> {
  const { data, error } = await supabase
    .from('document_templates_pdf')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching PDF template:', error);
    throw error;
  }
  return data ?? null;
}

/**
 * Fetch the (single) PDF template for a given `document_type` in the current
 * tenant, or `null` when the tenant hasn't customized that type yet (callers
 * then fall back to the built-in config). RLS scopes to the caller's tenant.
 */
export async function getDocumentTemplateByType(
  documentType: string,
): Promise<DocumentTemplatePdf | null> {
  const { data, error } = await supabase
    .from('document_templates_pdf')
    .select('*')
    .eq('document_type', documentType)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching PDF template by type:', error);
    throw error;
  }
  return data ?? null;
}

/**
 * Upsert the tenant's PDF template for a `document_type`: update the existing
 * row when present, else insert a new one. Keeps exactly one template per
 * (tenant, document_type) without requiring callers to know which case applies.
 */
export async function upsertDocumentTemplate(
  documentType: string,
  values: Omit<DocumentTemplatePdfInsert, 'tenant_id' | 'document_type'> & {
    tenant_id?: string;
  },
): Promise<DocumentTemplatePdf> {
  const existing = await getDocumentTemplateByType(documentType);

  if (existing) {
    const update: DocumentTemplatePdfUpdate = { ...values, document_type: documentType };
    delete (update as { tenant_id?: string }).tenant_id;
    return updateDocumentTemplate(existing.id, update);
  }

  const tenant_id = values.tenant_id ?? (await resolveTenantId());
  const { data, error } = await supabase
    .from('document_templates_pdf')
    .insert({ ...values, tenant_id, document_type: documentType })
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error creating PDF template:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to create PDF template: no row returned');
  return data;
}

/** Update a PDF template by id. Tenant scoping enforced by RLS. */
export async function updateDocumentTemplate(
  id: string,
  updates: DocumentTemplatePdfUpdate,
): Promise<DocumentTemplatePdf> {
  const { data, error } = await supabase
    .from('document_templates_pdf')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error updating PDF template:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to update PDF template: not found or permission denied');
  return data;
}

/** Soft-delete a PDF template (`deleted_at = now()`). */
export async function softDeleteDocumentTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('document_templates_pdf')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) {
    logger.error('Error soft-deleting PDF template:', error);
    throw error;
  }
}

// ===========================================================================
// document_template_versions
// ===========================================================================

/** List a template's versions, highest version number first (excludes deleted). */
export async function listVersions(templateId: string): Promise<DocumentTemplateVersion[]> {
  const { data, error } = await supabase
    .from('document_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .is('deleted_at', null)
    .order('version_number', { ascending: false });

  if (error) {
    logger.error('Error listing template versions:', error);
    throw error;
  }
  return data ?? [];
}

/** Fetch one version row by id, or `null`. */
export async function getVersion(id: string): Promise<DocumentTemplateVersion | null> {
  const { data, error } = await supabase
    .from('document_template_versions')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching template version:', error);
    throw error;
  }
  return data ?? null;
}

/** The highest existing version number for a template, or 0 when none exist. */
async function maxVersionNumber(templateId: string): Promise<number> {
  const { data, error } = await supabase
    .from('document_template_versions')
    .select('version_number')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Error reading max version number:', error);
    throw error;
  }
  return data?.version_number ?? 0;
}

/**
 * The currently-deployed version for a template, or `null` when none is deployed
 * yet. This is what the renderer reads to assemble a document.
 */
export async function getDeployedVersion(
  templateId: string,
): Promise<DocumentTemplateVersion | null> {
  const { data, error } = await supabase
    .from('document_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('is_deployed', true)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching deployed version:', error);
    throw error;
  }
  return data ?? null;
}

/**
 * Create the next version of a template (auto-incremented `version_number`).
 * New versions are created undeployed; promote one with {@link publishVersion}.
 * `tenant_id` is resolved client-side (the trigger stamps authoritatively).
 */
export async function createVersion(
  templateId: string,
  config: TemplateConfigPayload,
  options?: { changeNote?: string; tenant_id?: string },
): Promise<DocumentTemplateVersion> {
  const nextVersion = (await maxVersionNumber(templateId)) + 1;
  const tenant_id = options?.tenant_id ?? (await resolveTenantId());

  const insert: DocumentTemplateVersionInsert = {
    template_id: templateId,
    tenant_id,
    version_number: nextVersion,
    config: toJson(config),
    is_deployed: false,
    ...(options?.changeNote !== undefined ? { change_note: options.changeNote } : {}),
  };

  const { data, error } = await supabase
    .from('document_template_versions')
    .insert(insert)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error creating template version:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to create template version: no row returned');
  return data;
}

/**
 * Publish (deploy) a version: flip `is_deployed` to true on the target version
 * and false on every other version of the same template, so exactly one version
 * is deployed at a time. Done as two scoped updates (no service_role / no RPC);
 * RLS keeps both writes tenant-local.
 */
export async function publishVersion(
  templateId: string,
  versionId: string,
): Promise<DocumentTemplateVersion> {
  // 1. Demote any currently-deployed sibling versions.
  const { error: demoteError } = await supabase
    .from('document_template_versions')
    .update({ is_deployed: false })
    .eq('template_id', templateId)
    .eq('is_deployed', true)
    .neq('id', versionId);

  if (demoteError) {
    logger.error('Error demoting prior deployed versions:', demoteError);
    throw demoteError;
  }

  // 2. Promote the target version.
  const { data, error } = await supabase
    .from('document_template_versions')
    .update({ is_deployed: true })
    .eq('id', versionId)
    .eq('template_id', templateId)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error publishing template version:', error);
    throw error;
  }
  if (!data) throw new Error('Failed to publish version: not found or permission denied');
  return data;
}

/** Soft-delete a template version (`deleted_at = now()`). */
export async function softDeleteVersion(id: string): Promise<void> {
  const { error } = await supabase
    .from('document_template_versions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) {
    logger.error('Error soft-deleting template version:', error);
    throw error;
  }
}

// ===========================================================================
// Doc-type resolution helpers (engine entry points)
// ===========================================================================

/**
 * Resolve the deployed version for a tenant's template of a given
 * `document_type`, respecting an optional per-(legal_entity, business_unit)
 * scope. Resolution order (most-specific first, each falling through to next):
 *
 *   1. (legal_entity_id, business_unit_id)  — when both provided
 *   2. (legal_entity_id, NULL)               — when legalEntityId provided
 *   3. (NULL, NULL)                          — tenant default (always last)
 *
 * Existing single-arg callers resolve the tenant default exactly as before
 * (no behavior change).
 *
 * RLS scopes all reads to the caller's tenant.
 */
export async function getDeployedVersionByType(
  documentType: string,
  scope?: { legalEntityId?: string; businessUnitId?: string },
): Promise<DocumentTemplateVersion | null> {
  const template = await getDocumentTemplateByType(documentType);
  if (!template) return null;

  const { legalEntityId, businessUnitId } = scope ?? {};

  // Build the ordered list of scopes to try, most-specific first.
  const candidates: Array<{ legalEntityId: string | null; businessUnitId: string | null }> = [];

  if (legalEntityId && businessUnitId) {
    candidates.push({ legalEntityId, businessUnitId });
  }
  if (legalEntityId) {
    candidates.push({ legalEntityId, businessUnitId: null });
  }
  // Tenant default is always the final fallback.
  candidates.push({ legalEntityId: null, businessUnitId: null });

  for (const candidate of candidates) {
    const version = await getDeployedVersionForScope(template.id, candidate);
    if (version) return version;
  }

  return null;
}

/**
 * Fetch the deployed version for a template constrained to an exact
 * (legal_entity_id, business_unit_id) scope. Both values are matched
 * exactly — pass `null` to match the tenant-default rows.
 */
async function getDeployedVersionForScope(
  templateId: string,
  scope: { legalEntityId: string | null; businessUnitId: string | null },
): Promise<DocumentTemplateVersion | null> {
  let query = supabase
    .from('document_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('is_deployed', true)
    .is('deleted_at', null);

  if (scope.legalEntityId === null) {
    query = query.is('legal_entity_id', null);
  } else {
    query = query.eq('legal_entity_id', scope.legalEntityId);
  }

  if (scope.businessUnitId === null) {
    query = query.is('business_unit_id', null);
  } else {
    query = query.eq('business_unit_id', scope.businessUnitId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    logger.error('Error fetching deployed version for scope:', error);
    throw error;
  }
  return data ?? null;
}

/**
 * Idempotently ensure the tenant has a complete, deployable invoice template:
 *   1. a `branding_themes` row (seeded from `company_settings.branding`:
 *      logo_url, brand_tagline → footer_text, accent_color),
 *   2. a `document_templates_pdf` row for `document_type = 'invoice'`
 *      (`is_default = true`, `config` = the built-in invoice config), and
 *   3. a deployed `document_template_versions` row (version 1, `is_deployed`).
 *
 * Safe to call repeatedly: existing rows are reused (no duplicates), and an
 * already-deployed version short-circuits version creation. Uses the existing
 * RLS-respecting CRUD only — no service_role, no RPC. The trigger remains the
 * authoritative `tenant_id` stamp; `tenantId` is passed through for the
 * client-side insert path.
 *
 * @returns the (created or pre-existing) deployed invoice version.
 */
export async function getOrCreateDefaultInvoiceTemplate(
  tenantId: string,
): Promise<DocumentTemplateVersion> {
  const builtIn = BUILT_IN_TEMPLATE_CONFIGS.invoice;

  // ---- 1. Branding theme seeded from company settings ----------------------
  // Reuse the tenant's default theme when present; otherwise seed one from the
  // existing company branding so the invoice template has a theme to bind to.
  const themes = await listBrandingThemes();
  let theme: BrandingTheme | undefined = themes.find((t) => t.is_default) ?? themes[0];
  if (!theme) {
    const settings = await getOrCreateCompanySettings();
    const branding = settings.branding ?? {};
    theme = await createBrandingTheme({
      tenant_id: tenantId,
      name: 'Default',
      is_default: true,
      ...(branding.logo_url ? { logo_url: branding.logo_url } : {}),
      ...(branding.brand_tagline ? { footer_text: branding.brand_tagline } : {}),
      ...(branding.accent_color ? { accent_color: branding.accent_color } : {}),
    });
  }

  // ---- 2. document_templates_pdf row (one per tenant + 'invoice') ----------
  let template = await getDocumentTemplateByType('invoice');
  if (!template) {
    template = await upsertDocumentTemplate('invoice', {
      tenant_id: tenantId,
      name: 'Invoice',
      is_default: true,
      branding_theme_id: theme.id,
      // Persist the full built-in invoice config as the template baseline.
      config: builtIn as unknown as Json,
    });
  }

  // ---- 3. Deployed version 1 -----------------------------------------------
  const deployed = await getDeployedVersion(template.id);
  if (deployed) return deployed;

  // No deployed version yet: create version 1 carrying the built-in config and
  // publish it so the engine has something to read.
  const version = await createVersion(
    template.id,
    builtIn as unknown as TemplateConfigPayload,
    { changeNote: 'Initial default invoice template', tenant_id: tenantId },
  );
  return publishVersion(template.id, version.id);
}
