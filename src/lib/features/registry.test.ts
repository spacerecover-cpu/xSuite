import { describe, it, expect } from 'vitest';
import {
  FEATURE_REGISTRY,
  FEATURES_BY_KEY,
  CASE_TAB_FEATURE,
  isFeatureEnabled,
  featuresByCategory,
} from './registry';

// The tab ids that exist in src/pages/cases/CaseDetail.tsx. Kept here so a tab
// rename/removal that desyncs the registry fails loudly.
const REAL_CASE_TAB_IDS = [
  'overview', 'client', 'devices', 'clones', 'documents', 'quotes', 'communications',
  'stock', 'files', 'engineers', 'recovery_qa', 'notes', 'portal', 'history',
];

describe('feature registry integrity', () => {
  it('has unique keys', () => {
    const keys = FEATURE_REGISTRY.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every dependsOn references a real feature key', () => {
    for (const f of FEATURE_REGISTRY) {
      for (const dep of f.dependsOn ?? []) {
        expect(FEATURES_BY_KEY[dep], `${f.key} depends on missing ${dep}`).toBeDefined();
      }
    }
  });

  it('core features default to enabled', () => {
    for (const f of FEATURE_REGISTRY) {
      if (f.core) expect(f.defaultEnabled, `${f.key} is core but not default-on`).toBe(true);
    }
  });

  it('every caseTabId maps to a real CaseDetail tab', () => {
    for (const tabId of Object.keys(CASE_TAB_FEATURE)) {
      expect(REAL_CASE_TAB_IDS, `unknown tab id ${tabId}`).toContain(tabId);
    }
  });

  it('every real case tab has a registry entry', () => {
    for (const tabId of REAL_CASE_TAB_IDS) {
      expect(CASE_TAB_FEATURE[tabId], `tab ${tabId} missing from registry`).toBeTruthy();
    }
  });
});

describe('isFeatureEnabled (bound to the real registry)', () => {
  // Net-new features that require an explicit tenant opt-in. Everything that existed
  // before the flag system must default ON (backward compatible); a brand-new
  // outbound channel defaulting OFF is the same guarantee — existing tenants see
  // no behavior change when it ships. The server side mirrors this: the WhatsApp
  // dispatcher reads feature_flags with default-FALSE semantics.
  const DEFAULT_OFF_FEATURES = new Set(['automation.whatsapp']);

  it('defaults everything on for a tenant with no overrides (backward compatible)', () => {
    for (const f of FEATURE_REGISTRY) {
      const expected = !DEFAULT_OFF_FEATURES.has(f.key);
      expect(isFeatureEnabled({}, f.key), `${f.key} should default ${expected ? 'on' : 'off'}`).toBe(expected);
    }
  });

  it('default-off features are opt-in (never core, honor an explicit enable)', () => {
    for (const key of DEFAULT_OFF_FEATURES) {
      const def = FEATURES_BY_KEY[key];
      expect(def, `${key} missing from registry`).toBeTruthy();
      expect(def.core, `${key} must not be core`).toBeFalsy();
      expect(isFeatureEnabled({ [key]: true }, key)).toBe(true);
    }
  });

  it('honors an override for a toggleable feature', () => {
    expect(isFeatureEnabled({ 'case.tab.clones': false }, 'case.tab.clones')).toBe(false);
  });

  it('keeps core tabs on even if overridden off', () => {
    expect(isFeatureEnabled({ 'case.tab.overview': false }, 'case.tab.overview')).toBe(true);
  });

  it('cascades display stage toggles off when the banner is disabled', () => {
    expect(isFeatureEnabled({ 'workflow.stage_banner': false }, 'workflow.stage.quoting')).toBe(false);
  });

  it('keeps the QA workflow toggle independent of the display-only banner', () => {
    // workflow.stage.qa is routing-authoritative (enforced server-side), so a
    // tenant that hides the cosmetic banner must NOT silently lose QA.
    expect(isFeatureEnabled({ 'workflow.stage_banner': false }, 'workflow.stage.qa')).toBe(true);
    expect(isFeatureEnabled({ 'workflow.stage.qa': false }, 'workflow.stage.qa')).toBe(false);
  });

  it('groups features by category', () => {
    const byCat = featuresByCategory();
    expect(byCat.case_tabs.length).toBeGreaterThan(0);
    expect(byCat.portal.length).toBeGreaterThan(0);
  });
});
