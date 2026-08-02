import { describe, it, expect, vi } from 'vitest';

// FeaturesSettings.tsx transitively imports the real Supabase client. We only
// exercise the pure payload helper, so stub the client.
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), auth: {} } }));

import { buildFeatureFlagsPayload } from './FeaturesSettings';

describe('buildFeatureFlagsPayload', () => {
  it('preserves stored flags the registry does not know about', () => {
    // Server-side flags the DB gates on: absent from FEATURE_REGISTRY, so absent
    // from the draft this screen builds. Saving must not drop them.
    const stored = {
      'automation.whatsapp': true,
      business_unit_isolation: true,
      'workflow.stage.qa': true,
    };
    const draft = { 'workflow.stage.qa': false };

    expect(buildFeatureFlagsPayload(stored, draft)).toEqual({
      'automation.whatsapp': true,
      business_unit_isolation: true,
      'workflow.stage.qa': false,
    });
  });

  it('lets the draft win for keys present in both', () => {
    expect(buildFeatureFlagsPayload({ 'portal.quotes': true }, { 'portal.quotes': false }))
      .toEqual({ 'portal.quotes': false });
  });

  it('does not mutate the stored map', () => {
    const stored = { business_unit_isolation: true };
    buildFeatureFlagsPayload(stored, { 'workflow.stage.qa': false });
    expect(stored).toEqual({ business_unit_isolation: true });
  });
});
