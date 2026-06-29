import { describe, it, expect } from 'vitest';
import { buildCommands } from './commandPaletteRegistry';
import type { NavGateContext } from '../layout/navConfig';

const ctx = (o: { isAdmin?: boolean; modules?: string[]; features?: string[] }): NavGateContext => ({
  isAdmin: o.isAdmin ?? false,
  hasModuleAccess: (m) => (o.modules ?? []).includes(m),
  isEnabled: (f) => (o.features ?? []).includes(f),
});
const has = (cmds: { to: string }[], to: string) => cmds.some((c) => c.to === to);

describe('buildCommands — gated command palette registry', () => {
  it('a bare user sees no gated nav/actions, only ungated personal pages', () => {
    const cmds = buildCommands(ctx({}));
    expect(has(cmds, '/cases')).toBe(false); // no 'cases' module
    expect(has(cmds, '/invoices')).toBe(false); // financial section gated off
    expect(has(cmds, '/payroll')).toBe(false);
    expect(has(cmds, '/admin')).toBe(false); // System gated to admins
    expect(cmds.some((c) => c.kind === 'action')).toBe(false); // no create actions
    // Personal/global pages are always available to an authenticated user.
    expect(has(cmds, '/settings/appearance')).toBe(true);
    expect(has(cmds, '/notifications')).toBe(true);
    expect(has(cmds, '/settings/security')).toBe(true);
  });

  it('financial nav requires BOTH the module and the nav.financial feature', () => {
    expect(has(buildCommands(ctx({ modules: ['invoices'] })), '/invoices')).toBe(false); // feature off
    const ok = buildCommands(ctx({ modules: ['invoices'], features: ['nav.financial'] }));
    expect(has(ok, '/invoices')).toBe(true);
    expect(has(ok, '/payments')).toBe(false); // no payments module → item gated
    expect(has(ok, '/transactions')).toBe(false);
  });

  it('quick-create actions are gated by their target module', () => {
    const ok = buildCommands(ctx({ modules: ['invoices'], features: ['nav.financial'] }));
    expect(has(ok, '/invoices?new=1')).toBe(true);
    expect(has(ok, '/cases?new=1')).toBe(false); // no cases module
  });

  it('Audit Trails is admin-only; Stock Sales is stock-module gated', () => {
    expect(has(buildCommands(ctx({})), '/admin/audit')).toBe(false);
    expect(has(buildCommands(ctx({ isAdmin: true })), '/admin/audit')).toBe(true);
    expect(has(buildCommands(ctx({})), '/stock/sales')).toBe(false);
    expect(has(buildCommands(ctx({ modules: ['stock'], features: ['nav.resources'] })), '/stock/sales')).toBe(true);
  });

  it('Core nav items still require their module (Dashboard/Cases not free)', () => {
    const cmds = buildCommands(ctx({ modules: ['cases', 'dashboard'] }));
    expect(has(cmds, '/')).toBe(true); // dashboard
    expect(has(cmds, '/cases')).toBe(true);
  });

  it('an admin with the right modules + features sees System + financial nav', () => {
    const cmds = buildCommands(
      ctx({
        isAdmin: true,
        modules: ['invoices', 'payments', 'settings', 'admin-panel', 'user-management'],
        features: ['nav.financial'],
      }),
    );
    expect(has(cmds, '/invoices')).toBe(true);
    expect(has(cmds, '/settings')).toBe(true);
    expect(has(cmds, '/admin')).toBe(true);
    expect(has(cmds, '/users')).toBe(true);
  });
});
