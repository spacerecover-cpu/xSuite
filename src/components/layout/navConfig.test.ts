import { describe, it, expect } from 'vitest';
import { NAV_SECTIONS, type NavGateContext } from './navConfig';

/** Build a gate context from a small spec. */
const ctx = (over: {
  isAdmin?: boolean;
  modules?: string[];
  features?: string[];
}): NavGateContext => ({
  isAdmin: over.isAdmin ?? false,
  hasModuleAccess: (m) => (over.modules ?? []).includes(m),
  isEnabled: (f) => (over.features ?? []).includes(f),
});

const byKey = (k: string) => {
  const s = NAV_SECTIONS.find((sec) => sec.key === k);
  if (!s) throw new Error(`no section ${k}`);
  return s;
};
const visible = (k: string, c: NavGateContext) => {
  const s = byKey(k);
  return !s.gate || s.gate(c);
};

describe('navConfig — section gating parity', () => {
  it('Core Operations is always visible and always expanded', () => {
    const core = byKey('core');
    expect(core.gate).toBeUndefined();
    expect(core.alwaysExpanded).toBe(true);
  });

  it('Financial needs (invoices OR payments) AND nav.financial', () => {
    expect(visible('financial', ctx({ modules: ['invoices'], features: ['nav.financial'] }))).toBe(true);
    expect(visible('financial', ctx({ modules: ['payments'], features: ['nav.financial'] }))).toBe(true);
    expect(visible('financial', ctx({ modules: ['invoices'], features: [] }))).toBe(false); // feature off
    expect(visible('financial', ctx({ modules: [], features: ['nav.financial'] }))).toBe(false); // no module
  });

  it('Business needs (customers OR companies) AND nav.business', () => {
    expect(visible('business', ctx({ modules: ['companies'], features: ['nav.business'] }))).toBe(true);
    expect(visible('business', ctx({ modules: ['customers'], features: [] }))).toBe(false);
    expect(visible('business', ctx({ modules: [], features: ['nav.business'] }))).toBe(false);
  });

  it('Resources needs (inventory OR stock OR clone-drives) AND nav.resources', () => {
    expect(visible('resources', ctx({ modules: ['clone-drives'], features: ['nav.resources'] }))).toBe(true);
    expect(visible('resources', ctx({ modules: ['stock'], features: [] }))).toBe(false);
    expect(visible('resources', ctx({ modules: [], features: ['nav.resources'] }))).toBe(false);
  });

  it('HR, Payroll and Employee Management share the (hr-dashboard OR employees) AND nav.hr gate', () => {
    const ok = ctx({ modules: ['employees'], features: ['nav.hr'] });
    const noFeature = ctx({ modules: ['employees'], features: [] });
    const noModule = ctx({ modules: [], features: ['nav.hr'] });
    for (const k of ['hr', 'payroll', 'employee']) {
      expect(visible(k, ok)).toBe(true);
      expect(visible(k, noFeature)).toBe(false);
      expect(visible(k, noModule)).toBe(false);
    }
  });

  it('System is admin-only and ignores module/feature flags', () => {
    expect(visible('system', ctx({ isAdmin: true }))).toBe(true);
    expect(visible('system', ctx({ isAdmin: false, modules: ['invoices'], features: ['nav.financial'] }))).toBe(false);
  });
});

describe('navConfig — structure', () => {
  it('section keys are unique and match the persisted preference strings, in order', () => {
    const keys = NAV_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['core', 'financial', 'business', 'resources', 'hr', 'payroll', 'employee', 'system']);
  });

  it('every item has a route, icon and label', () => {
    for (const s of NAV_SECTIONS) {
      for (const i of s.items) {
        expect(i.to).toMatch(/^\//);
        expect(i.icon).toBeTruthy();
        expect(i.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('badge items reference the known live counters, in order', () => {
    const badged = NAV_SECTIONS.flatMap((s) => s.items).filter((i) => i.badgeKey);
    expect(badged.map((i) => `${i.to}:${i.badgeKey}`)).toEqual([
      '/cases:casesTodayCount',
      '/invoices:invoicesAttentionCount',
      '/quotes:pendingQuotesCount',
      '/stock:lowStockCount',
    ]);
  });
});
