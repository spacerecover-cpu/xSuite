import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { PermissionsProvider, usePermissions } from './PermissionsContext';
import { useAuth } from './AuthContext';
import { rolePermissionsService, type Module } from '../lib/rolePermissionsService';

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

  it('drops a superseded in-flight load so the previous role cannot overwrite the current one', async () => {
    const mod = (slug: string): Module => ({
      id: slug, slug, name: slug, description: null, category: null,
      icon: null, sort_order: null, order_index: null, is_active: true,
    });
    let resolveManager: (modules: Module[]) => void = () => {};
    const managerModules = new Promise<Module[]>((resolve) => {
      resolveManager = resolve;
    });
    vi.mocked(rolePermissionsService.getAccessibleModules).mockImplementation((role) =>
      role === 'manager' ? managerModules : Promise.resolve([mod('viewer-only')]),
    );

    const Probe = () => <span data-testid="mods">{usePermissions().accessibleModules.map((m) => m.slug).join(',')}</span>;

    setRole('manager');
    const { rerender } = render(<PermissionsProvider><Probe /></PermissionsProvider>);

    // Role changes to viewer while the manager fetch is still pending.
    setRole('viewer');
    rerender(<PermissionsProvider><Probe /></PermissionsProvider>);
    await waitFor(() => expect(screen.getByTestId('mods')).toHaveTextContent('viewer-only'));

    // The slower manager fetch resolves last — it must not win.
    await act(async () => {
      resolveManager([mod('manager-only')]);
      await managerModules;
    });
    expect(screen.getByTestId('mods')).toHaveTextContent('viewer-only');
  });

  it('does not load permissions for an unauthenticated (role-less) profile', async () => {
    setRole(null);
    render(<PermissionsProvider><div>x</div></PermissionsProvider>);
    // give effects a tick
    await waitFor(() => expect(true).toBe(true));
    expect(rolePermissionsService.getAccessibleModules).not.toHaveBeenCalled();
  });
});
