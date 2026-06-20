import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { rolePermissionsService, Module, RolePermissions } from '../lib/rolePermissionsService';
import { logger } from '../lib/logger';

interface PermissionsContextType {
  permissions: RolePermissions | null;
  accessibleModules: Module[];
  loading: boolean;
  hasModuleAccess: (moduleKey: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [accessibleModules, setAccessibleModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const role = profile?.role ?? null;

  const loadPermissions = useCallback(async () => {
    if (!role) {
      setPermissions(null);
      setAccessibleModules([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // manager/viewer used to be hardcoded to zero access here; they now resolve
      // through role_module_permissions like every other non-admin role and
      // default to nothing until an admin grants modules (M3).
      const [userPermissions, modules] = await Promise.all([
        rolePermissionsService.getRolePermissions(role),
        rolePermissionsService.getAccessibleModules(role),
      ]);

      setPermissions(userPermissions);
      setAccessibleModules(modules);
    } catch (error) {
      logger.error('Error loading permissions:', error);
      setPermissions(null);
      setAccessibleModules([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasModuleAccess = useCallback((moduleKey: string): boolean => {
    if (!role) return false;
    if (['owner', 'admin'].includes(role)) return true;
    return permissions?.accessibleModules.has(moduleKey) || false;
  }, [role, permissions]);

  const refreshPermissions = useCallback(async () => {
    rolePermissionsService.clearCache();
    await loadPermissions();
  }, [loadPermissions]);

  // Memoized: this provider re-renders whenever any ancestor provider does, and
  // an unstable value re-rendered every usePermissions consumer (each sidebar
  // item among them) on unrelated state changes.
  const value: PermissionsContextType = useMemo(() => ({
    permissions,
    accessibleModules,
    loading,
    hasModuleAccess,
    refreshPermissions,
  }), [permissions, accessibleModules, loading, hasModuleAccess, refreshPermissions]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};

export const usePermissions = (): PermissionsContextType => {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};
