import type { Database } from '../types/database.types';

// profiles.role is the source of truth for the role string set. Do NOT key this off
// roles.ts's Role type — it omits 'manager' (and 'viewer'), which the live hierarchy includes.
type ProfileRole = NonNullable<Database['public']['Tables']['profiles']['Row']['role']>;

/**
 * Client mirror of the server `has_role('accounts')` hierarchy — the role set RLS
 * authorizes to insert/update/approve/reject/pay expenses (owner/admin/manager/accounts).
 * Keep this in lockstep with the `expenses_insert`/`expenses_update` policies: if the
 * policy changes, update this array AND the parity test in roleGates.test.ts (EXP-012).
 */
export const EXPENSE_APPROVER_ROLES = ['owner', 'admin', 'manager', 'accounts'] as const;

export function canManageExpenses(role: string | null | undefined): boolean {
  return !!role && (EXPENSE_APPROVER_ROLES as readonly string[]).includes(role);
}

// Compile-time nudge: every approver role is a real ProfileRole.
const _assertRoles: readonly ProfileRole[] = EXPENSE_APPROVER_ROLES;
void _assertRoles;
