import { describe, it, expect } from 'vitest';
import { canManageExpenses, EXPENSE_APPROVER_ROLES } from './roleGates';

describe('canManageExpenses (EXP-012 — UI gate mirrors has_role(accounts))', () => {
  it('allows the full server-authorized set incl. owner + manager (previously hidden)', () => {
    expect(canManageExpenses('owner')).toBe(true);
    expect(canManageExpenses('admin')).toBe(true);
    expect(canManageExpenses('manager')).toBe(true);   // regression: manager was hidden before
    expect(canManageExpenses('accounts')).toBe(true);
  });

  it('denies non-finance roles', () => {
    for (const r of ['technician', 'sales', 'hr', 'viewer']) {
      expect(canManageExpenses(r)).toBe(false);
    }
  });

  it('denies missing role', () => {
    expect(canManageExpenses(null)).toBe(false);
    expect(canManageExpenses(undefined)).toBe(false);
  });

  it('parity contract: set equals has_role(accounts) hierarchy — fails loudly if drifted', () => {
    expect([...EXPENSE_APPROVER_ROLES]).toEqual(['owner', 'admin', 'manager', 'accounts']);
  });
});
