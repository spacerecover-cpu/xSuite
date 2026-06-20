import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { PermissionsProvider } from './PermissionsContext';
import { useAuth } from './AuthContext';
import { rolePermissionsService } from '../lib/rolePermissionsService';

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../lib/rolePermissionsService', () => ({
  rolePermissionsService: {
    getRolePermissions: vi.fn(),
    getAccessibleModules: vi.fn(),
  },
}));
vi.mock('../lib/logger', () => ({ logger: { error: vi.fn() } }));

function setRole(role: string | null) {
  vi.mocked(useAuth).mockReturnValue({ profile: role ? { role } : null } as unknown as ReturnType<typeof useAuth>);
}

describe('PermissionsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rolePermissionsService.getRolePermissions).mockResolvedValue({ role: 'manager', accessibleModules: new Set() } as never);
    vi.mocked(rolePermissionsService.getAccessibleModules).mockResolvedValue([]);
  });

  it('resolves manager/viewer access via the service (configurable, default none) instead of hardcoding empty (M3)', async () => {
    setRole('manager');
    render(<PermissionsProvider><div>x</div></PermissionsProvider>);
    await waitFor(() =>
      expect(rolePermissionsService.getAccessibleModules).toHaveBeenCalledWith('manager'),
    );
  });

  it('does not load permissions for an unauthenticated (role-less) profile', async () => {
    setRole(null);
    render(<PermissionsProvider><div>x</div></PermissionsProvider>);
    // give effects a tick
    await waitFor(() => expect(true).toBe(true));
    expect(rolePermissionsService.getAccessibleModules).not.toHaveBeenCalled();
  });
});
