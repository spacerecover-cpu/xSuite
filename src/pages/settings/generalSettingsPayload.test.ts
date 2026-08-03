import { describe, it, expect, vi } from 'vitest';

// GeneralSettings.tsx transitively imports the real Supabase client (which throws
// without env vars). We only exercise the pure payload helper, so stub the client.
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), auth: {} } }));

import {
  buildGeneralSettingsPayload,
  resolveCompanySettingsScope,
  replaceBrandingAsset,
  GENERAL_SETTINGS_OWNED_SECTIONS,
} from './GeneralSettings';

describe('buildGeneralSettingsPayload', () => {
  it('drops sibling-owned columns so saving General Settings cannot clobber them', () => {
    // Simulates the mount-time snapshot GeneralSettings holds in formData: the
    // whole company_settings row, including columns other surfaces write.
    const formData = {
      id: 'abc',
      basic_info: { company_name: 'Acme' },
      location: { city: 'Muscat' },
      contact_info: { email_general: 'info@acme.test' },
      online_presence: { website: 'https://acme.test' },
      legal_compliance: { privacy_policy_url: 'https://acme.test/p' },
      branding: { primary_color: '#0ea5e9' },
      clone_defaults: { default_retention_days: 180 },
      // Owned by sibling surfaces — must NOT be round-tripped:
      metadata: { table_columns: ['case_no'], rows_per_page: 50 },
      portal_settings: { portal_session_timeout: 60 },
      portal_maintenance_mode: true,
      date_format: 'DD/MM/YYYY',
      accounting_locale: 'om',
      banking_info: { iban: 'OM123' },
      localization: { document_language_settings: { mode: 'bilingual' } },
    };

    const payload = buildGeneralSettingsPayload(formData);

    expect(Object.keys(payload).sort()).toEqual(
      [...GENERAL_SETTINGS_OWNED_SECTIONS].sort(),
    );
    expect(payload).not.toHaveProperty('metadata');
    expect(payload).not.toHaveProperty('portal_settings');
    expect(payload).not.toHaveProperty('portal_maintenance_mode');
    expect(payload).not.toHaveProperty('date_format');
    expect(payload).not.toHaveProperty('accounting_locale');
    expect(payload).not.toHaveProperty('banking_info');
    expect(payload).not.toHaveProperty('localization');
    expect(payload).not.toHaveProperty('id');
    expect(payload.basic_info).toEqual({ company_name: 'Acme' });
  });

  it('omits owned sections that are absent rather than writing undefined', () => {
    const payload = buildGeneralSettingsPayload({ basic_info: { company_name: 'X' } });
    expect(Object.keys(payload)).toEqual(['basic_info']);
  });
});

describe('replaceBrandingAsset', () => {
  it('removes the superseded file only after the replacement is persisted', async () => {
    const calls: string[] = [];
    const deletePrevious = vi.fn(async () => {
      calls.push('delete');
    });

    const persisted = await replaceBrandingAsset({
      newPath: 'logos/primary/2.png',
      persist: async () => {
        calls.push('persist');
        return { persisted: true, previousPath: 'logos/primary/1.png' };
      },
      deletePrevious,
    });

    expect(persisted).toBe(true);
    expect(calls).toEqual(['persist', 'delete']);
    expect(deletePrevious).toHaveBeenCalledWith('logos/primary/1.png');
  });

  it('keeps the existing file when the write fails, so branding never points at a deleted object', async () => {
    const deletePrevious = vi.fn();

    const persisted = await replaceBrandingAsset({
      newPath: 'logos/primary/2.png',
      persist: async () => ({ persisted: false, previousPath: 'logos/primary/1.png' }),
      deletePrevious,
    });

    expect(persisted).toBe(false);
    expect(deletePrevious).not.toHaveBeenCalled();
  });

  it('does not delete when there is no previous file or the path is unchanged', async () => {
    const deletePrevious = vi.fn();

    await replaceBrandingAsset({
      newPath: 'qrcodes/invoice/2.png',
      persist: async () => ({ persisted: true, previousPath: undefined }),
      deletePrevious,
    });
    await replaceBrandingAsset({
      newPath: 'qrcodes/invoice/2.png',
      persist: async () => ({ persisted: true, previousPath: 'qrcodes/invoice/2.png' }),
      deletePrevious,
    });

    expect(deletePrevious).not.toHaveBeenCalled();
  });
});

describe('resolveCompanySettingsScope', () => {
  it('scopes the write to the loaded settings row', () => {
    expect(resolveCompanySettingsScope('row-1', 'tenant-1')).toEqual({
      column: 'id',
      value: 'row-1',
    });
  });

  it('falls back to the caller tenant when no row is loaded yet', () => {
    expect(resolveCompanySettingsScope(null, 'tenant-1')).toEqual({
      column: 'tenant_id',
      value: 'tenant-1',
    });
  });

  it('refuses to produce a scope for a platform admin with no row and no tenant', () => {
    // Without a scope the caller must abort — a platform admin's RLS spans every
    // tenant, so an unscoped update would overwrite other tenants' settings.
    expect(resolveCompanySettingsScope(null, null)).toBeNull();
    expect(resolveCompanySettingsScope(undefined, undefined)).toBeNull();
  });
});
