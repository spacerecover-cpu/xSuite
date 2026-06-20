/**
 * documentTemplateService — unit tests
 *
 * Tests for getDeployedVersionByType scope resolution (R6, §8c):
 *   (a) no scope  → tenant default (NULL, NULL)
 *   (b) {legalEntityId} with entity-scoped deployed version → that version
 *   (c) {legalEntityId} with NO entity-scoped version → tenant default
 *   (d) {legalEntityId, businessUnitId} prefers BU-scoped over entity-scoped
 *
 * Supabase is mocked via vi.mock so no network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_DEFAULT: Record<string, unknown> = {
  id: 'ver-tenant',
  template_id: 'tpl-1',
  tenant_id: 'ten-1',
  version_number: 1,
  is_deployed: true,
  legal_entity_id: null,
  business_unit_id: null,
  config: {},
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  change_note: null,
  created_by: null,
  updated_by: null,
};

const ENTITY_VERSION: Record<string, unknown> = {
  ...TENANT_DEFAULT,
  id: 'ver-entity',
  legal_entity_id: 'le-1',
  business_unit_id: null,
};

const BU_VERSION: Record<string, unknown> = {
  ...TENANT_DEFAULT,
  id: 'ver-bu',
  legal_entity_id: 'le-1',
  business_unit_id: 'bu-1',
};

const TEMPLATE_ROW: Record<string, unknown> = {
  id: 'tpl-1',
  tenant_id: 'ten-1',
  document_type: 'invoice',
  name: 'Invoice',
  is_default: true,
  deleted_at: null,
  config: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  branding_theme_id: null,
  created_by: null,
  updated_by: null,
};

// ---------------------------------------------------------------------------
// vi.mock — must be at the top level so Vitest can hoist it
// ---------------------------------------------------------------------------

vi.mock('./supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
    resolveTenantId: vi.fn().mockResolvedValue('ten-1'),
  };
});

vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('./pdf/templateConfig', () => ({
  BUILT_IN_TEMPLATE_CONFIGS: { invoice: {} },
}));

vi.mock('./companySettingsService', () => ({
  getOrCreateCompanySettings: vi.fn().mockResolvedValue({ branding: {} }),
}));

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

import { getDeployedVersionByType, seedTemplateLanguage, type TemplateConfigPayload } from './documentTemplateService';
import { supabase } from './supabaseClient';
import type { CompanySettingsData } from './pdf/types';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helper: set up the from() mock to respond based on the table name queried
// ---------------------------------------------------------------------------

/**
 * Configure `supabase.from` so that:
 *   - 'document_templates_pdf' → returns templateResult
 *   - 'document_template_versions' → returns versionsResult (iterable; each
 *     call pops the first element so sequential lookups get different answers)
 */
function setupFromMock(
  templateResult: unknown,
  versionsResults: unknown[],
) {
  let versionCallIndex = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'document_templates_pdf') {
      return makeMaybySingleChainWith(templateResult);
    }
    if (table === 'document_template_versions') {
      const result = versionsResults[versionCallIndex] ?? null;
      versionCallIndex++;
      return makeMaybySingleChainWith(result);
    }
    return makeMaybySingleChainWith(null);
  });
}

/** Build a chain that returns the given value from maybeSingle(). */
function makeMaybySingleChainWith(result: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    neq: () => chain,
    update: () => chain,
    maybeSingle: () => Promise.resolve({ data: result, error: null }),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getDeployedVersionByType — scope resolution (R6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // (a) No scope argument → resolves the tenant default (NULL, NULL)
  it('(a) no scope → returns tenant default (NULL, NULL) version', async () => {
    // template lookup → TEMPLATE_ROW
    // version lookup  → TENANT_DEFAULT (is_deployed, no legal_entity, no bu)
    setupFromMock(TEMPLATE_ROW, [TENANT_DEFAULT]);

    const result = await getDeployedVersionByType('invoice');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-tenant');
    expect(result?.legal_entity_id).toBeNull();
    expect(result?.business_unit_id).toBeNull();
  });

  // (b) {legalEntityId} with a matching entity-scoped deployed version → that version
  it('(b) legalEntityId with entity-scoped version → returns entity version', async () => {
    // 1st version call (entity+BU scope) → null (no BU scope, BU not provided so skipped)
    // Actually: scope={legalEntityId} means we try (entity,NULL) first, then (NULL,NULL)
    // So: 1st call → ENTITY_VERSION (entity scope), done.
    setupFromMock(TEMPLATE_ROW, [ENTITY_VERSION]);

    const result = await getDeployedVersionByType('invoice', { legalEntityId: 'le-1' });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-entity');
    expect(result?.legal_entity_id).toBe('le-1');
    expect(result?.business_unit_id).toBeNull();
  });

  // (c) {legalEntityId} with NO entity-scoped version → falls back to tenant default
  it('(c) legalEntityId but no entity version → falls back to tenant default', async () => {
    // 1st version call (entity scope) → null
    // 2nd version call (tenant default) → TENANT_DEFAULT
    setupFromMock(TEMPLATE_ROW, [null, TENANT_DEFAULT]);

    const result = await getDeployedVersionByType('invoice', { legalEntityId: 'le-1' });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-tenant');
    expect(result?.legal_entity_id).toBeNull();
  });

  // (d) {legalEntityId, businessUnitId} → prefers BU-scoped over entity-scoped
  it('(d) legalEntityId + businessUnitId → prefers BU-scoped row', async () => {
    // 1st version call (entity+BU scope) → BU_VERSION (most specific)
    setupFromMock(TEMPLATE_ROW, [BU_VERSION]);

    const result = await getDeployedVersionByType('invoice', {
      legalEntityId: 'le-1',
      businessUnitId: 'bu-1',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-bu');
    expect(result?.legal_entity_id).toBe('le-1');
    expect(result?.business_unit_id).toBe('bu-1');
  });

  // (d2) {legalEntityId, businessUnitId} but no BU version → falls back to entity version
  it('(d2) legalEntityId + businessUnitId but no BU version → falls back to entity version', async () => {
    // 1st version call (entity+BU scope) → null
    // 2nd version call (entity scope)    → ENTITY_VERSION
    setupFromMock(TEMPLATE_ROW, [null, ENTITY_VERSION]);

    const result = await getDeployedVersionByType('invoice', {
      legalEntityId: 'le-1',
      businessUnitId: 'bu-1',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-entity');
  });

  // (d3) full scope, no BU, no entity → falls back to tenant default
  it('(d3) full scope but no BU/entity versions → falls back to tenant default', async () => {
    // 1st call (BU scope)     → null
    // 2nd call (entity scope) → null
    // 3rd call (tenant default) → TENANT_DEFAULT
    setupFromMock(TEMPLATE_ROW, [null, null, TENANT_DEFAULT]);

    const result = await getDeployedVersionByType('invoice', {
      legalEntityId: 'le-1',
      businessUnitId: 'bu-1',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-tenant');
  });

  // Edge: no template at all → null
  it('returns null when no template exists for the document type', async () => {
    setupFromMock(null, []);

    const result = await getDeployedVersionByType('invoice');

    expect(result).toBeNull();
  });

  // Backward-compat: existing single-arg callers get same behavior as before
  it('single-arg call is backward-compatible (no scope = tenant default path)', async () => {
    setupFromMock(TEMPLATE_ROW, [TENANT_DEFAULT]);

    const result = await getDeployedVersionByType('invoice');

    expect(result?.id).toBe('ver-tenant');
  });
});

// ---------------------------------------------------------------------------
// seedTemplateLanguage — a brand-new template inherits the tenant-wide default
// document language so its persisted config carries an explicit `language`,
// while an explicit Studio choice is never overwritten (single source of truth).
// ---------------------------------------------------------------------------

describe('seedTemplateLanguage', () => {
  const tenant = (
    mode: 'english_only' | 'bilingual' | undefined,
    secondary: string | null,
  ): CompanySettingsData =>
    ({
      localization: mode
        ? { document_language_settings: { mode, secondary_language: secondary, language_name: null } }
        : undefined,
    } as unknown as CompanySettingsData);

  it('seeds a new template language from a bilingual-Arabic tenant default', () => {
    const out = seedTemplateLanguage({}, tenant('bilingual', 'ar'));
    expect(out.language).toEqual({ mode: 'bilingual_stacked', primary: 'ar' });
  });

  it('seeds explicit English from an english_only tenant (was implicit default)', () => {
    const out = seedTemplateLanguage({}, tenant('english_only', null));
    expect(out.language).toEqual({ mode: 'en', primary: 'en' });
  });

  it('does not overwrite an explicit Studio language choice', () => {
    const cfg = { language: { mode: 'bilingual_sidebyside', primary: 'en' } } as TemplateConfigPayload;
    const out = seedTemplateLanguage(cfg, tenant('bilingual', 'ar'));
    expect(out.language).toEqual({ mode: 'bilingual_sidebyside', primary: 'en' });
  });
});
