import { supabase, getTenantId } from './supabaseClient';
import { logger } from './logger';

// Roles whose module access is resolved from role_module_permissions. owner/admin
// are short-circuited to full access; manager/viewer are configurable and resolve
// to nothing until an admin grants modules (M3 — previously hardcoded to empty).
export type ManageableRole = 'owner' | 'admin' | 'manager' | 'technician' | 'sales' | 'accounts' | 'hr' | 'viewer';

export interface Module {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  sort_order: number | null;
  order_index: number | null;
  is_active: boolean;
}

export interface RoleModulePermission {
  id: string;
  role: ManageableRole;
  module_id: string;
  can_access: boolean;
  module?: Module;
}

export interface ModulesByCategory {
  [category: string]: Module[];
}

export interface RolePermissions {
  role: ManageableRole;
  accessibleModules: Set<string>;
}

class RolePermissionsService {
  private permissionsCache: Map<string, RolePermissions> = new Map();
  private modulesCache: Module[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  async getAllModules(): Promise<Module[]> {
    if (this.modulesCache && Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
      return this.modulesCache;
    }

    const { data, error } = await supabase
      .from('master_modules')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('order_index');

    if (error) {
      logger.error('Error fetching modules:', error);
      throw new Error('Failed to fetch modules');
    }

    this.modulesCache = data || [];
    this.cacheTimestamp = Date.now();
    return this.modulesCache;
  }

  async getModulesByCategory(): Promise<ModulesByCategory> {
    const modules = await this.getAllModules();

    const grouped: ModulesByCategory = {};
    modules.forEach((module) => {
      const cat = module.category ?? 'other';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(module);
    });

    return grouped;
  }

  async getAccessibleModules(role: ManageableRole): Promise<Module[]> {
    if (role === 'owner' || role === 'admin') {
      return this.getAllModules();
    }

    const { data, error } = await supabase.rpc('get_accessible_modules');

    if (error) {
      logger.error('Error fetching accessible modules:', error);
      throw new Error('Failed to fetch accessible modules');
    }

    return (data || []).map((row) => ({
      id: row.module_id,
      slug: row.module_slug,
      name: row.module_name,
      description: null,
      category: null,
      icon: null,
      sort_order: null,
      order_index: null,
      is_active: true,
    }));
  }

  async getRolePermissions(role: ManageableRole): Promise<RolePermissions> {
    // Accessible modules are resolved per-tenant (via get_accessible_modules),
    // so the cache must be keyed by tenant too — a role-only key let one
    // tenant's cached module set leak to a same-role user of another tenant on
    // a shared device within the TTL.
    const cacheKey = `${getTenantId() ?? 'none'}:${role}`;
    const cached = this.permissionsCache.get(cacheKey);

    if (cached && Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
      return cached;
    }

    const accessibleModules = await this.getAccessibleModules(role);
    const moduleKeys = new Set(accessibleModules.map(m => m.slug));

    const permissions: RolePermissions = {
      role,
      accessibleModules: moduleKeys,
    };

    this.permissionsCache.set(cacheKey, permissions);
    return permissions;
  }

  async checkModuleAccess(
    role: ManageableRole,
    moduleKey: string
  ): Promise<boolean> {
    if (role === 'owner' || role === 'admin') {
      return true;
    }

    const { data, error } = await supabase
      .rpc('check_module_access', {
        p_module_slug: moduleKey,
      });

    if (error) {
      logger.error('Error checking module access:', error);
      return false;
    }

    return data === true;
  }

  async getAllRolePermissions(): Promise<RoleModulePermission[]> {
    const { data, error } = await supabase
      .from('role_module_permissions')
      .select(`
        *,
        module:master_modules(*)
      `);

    if (error) {
      logger.error('Error fetching role permissions:', error);
      throw new Error('Failed to fetch role permissions');
    }

    return (data || []).map((row) => ({
      id: row.id,
      role: row.role as RoleModulePermission['role'],
      module_id: row.module_id,
      can_access: row.can_access ?? false,
      module: row.module ? {
        ...row.module,
        category: row.module.category ?? null,
      } as Module : undefined,
    }));
  }

  async getRolePermissionsWithModules(
    role: ManageableRole
  ): Promise<Map<string, boolean>> {
    if (role === 'owner' || role === 'admin') {
      const modules = await this.getAllModules();
      const permissionsMap = new Map<string, boolean>();
      modules.forEach(module => {
        permissionsMap.set(module.id, true);
      });
      return permissionsMap;
    }

    const { data, error } = await supabase
      .from('role_module_permissions')
      .select('module_id, can_access')
      .eq('role', role);

    if (error) {
      logger.error('Error fetching role permissions:', error);
      throw new Error('Failed to fetch role permissions');
    }

    const permissionsMap = new Map<string, boolean>();
    (data || []).forEach((perm: any) => {
      permissionsMap.set(perm.module_id, perm.can_access);
    });

    return permissionsMap;
  }

  async updateRolePermissions(
    role: ManageableRole,
    permissions: { moduleId: string; canAccess: boolean }[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (role === 'owner' || role === 'admin') {
        return { success: false, error: 'Owner and Admin permissions cannot be modified' };
      }

      const updates = permissions.map(({ moduleId, canAccess }) => ({
        role,
        module_id: moduleId,
        can_access: canAccess,
      }));

      const { error: upsertError } = await supabase
        .from('role_module_permissions')
        .upsert(updates as never, {
          onConflict: 'role,module_id',
        });

      if (upsertError) {
        logger.error('Error updating permissions:', upsertError);
        return { success: false, error: upsertError.message };
      }

      this.clearCache();

      await supabase.rpc('log_audit_trail', {
        p_action: 'update',
        p_record_type: 'role_module_permissions',
        p_record_id: role,
        p_old_values: {} as never,
        p_new_values: { permissions: updates } as never,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Error in updateRolePermissions:', error);
      return { success: false, error: error.message };
    }
  }

  async bulkUpdateRolePermissions(
    role: ManageableRole,
    moduleIds: string[],
    canAccess: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const permissions = moduleIds.map(moduleId => ({ moduleId, canAccess }));
    return this.updateRolePermissions(role, permissions);
  }

  clearCache(): void {
    this.permissionsCache.clear();
    this.modulesCache = null;
    this.cacheTimestamp = 0;
  }

  getCategoryDisplayName(category: string): string {
    const displayNames: { [key: string]: string } = {
      core: 'Core Operations',
      financial: 'Financial',
      business: 'Business',
      resources: 'Resources',
      hr: 'Human Resources',
      payroll: 'Payroll',
      employee: 'Employee Management',
      system: 'System',
    };

    return displayNames[category] || category;
  }
}

export const rolePermissionsService = new RolePermissionsService();
