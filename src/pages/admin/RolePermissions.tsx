import React, { useState, useEffect } from 'react';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  rolePermissionsService,
  ModulesByCategory,
} from '../../lib/rolePermissionsService';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import {
  Shield,
  CheckCircle,
  XCircle,
  Save,
  RotateCcw,
  Info,
} from 'lucide-react';

type Role = 'admin' | 'manager' | 'technician' | 'sales' | 'accounts' | 'hr' | 'viewer';

const ROLES: Role[] = ['admin', 'manager', 'technician', 'sales', 'accounts', 'hr', 'viewer'];

const ROLE_DETAILS = {
  admin: {
    name: 'Admin',
    color: 'red' as const,
    description: 'Full system access - cannot be modified',
  },
  manager: {
    name: 'Manager',
    color: 'slategray' as const,
    description: 'Team manager — module access granted below',
  },
  technician: {
    name: 'Technician',
    color: 'blue' as const,
    description: 'Technical staff managing cases and repairs',
  },
  sales: {
    name: 'Sales',
    color: 'green' as const,
    description: 'Sales team managing customers and quotes',
  },
  accounts: {
    name: 'Accounts',
    color: 'orange' as const,
    description: 'Finance team managing invoices and payments',
  },
  hr: {
    name: 'HR',
    color: 'teal' as const,
    description: 'Human resources managing employees and payroll',
  },
  viewer: {
    name: 'Viewer',
    color: 'gray' as const,
    description: 'Read-only — module access granted below',
  },
};

export const RolePermissions: React.FC = () => {
  const toast = useToast();
  const [selectedRole, setSelectedRole] = useState<Role>('technician');
  const [modulesByCategory, setModulesByCategory] = useState<ModulesByCategory>({});
  const [permissions, setPermissions] = useState<Map<string, boolean>>(new Map());
  const [originalPermissions, setOriginalPermissions] = useState<Map<string, boolean>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (Object.keys(modulesByCategory).length > 0) {
      loadRolePermissions(selectedRole);
    }
  }, [selectedRole, modulesByCategory]);

  const loadData = async () => {
    try {
      setLoading(true);
      const grouped = await rolePermissionsService.getModulesByCategory();
      setModulesByCategory(grouped);
    } catch (error) {
      logger.error('Error loading modules:', error);
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  const loadRolePermissions = async (role: Role) => {
    try {
      const perms = await rolePermissionsService.getRolePermissionsWithModules(role);
      setPermissions(new Map(perms));
      setOriginalPermissions(new Map(perms));
      setHasChanges(false);
    } catch (error) {
      logger.error('Error loading permissions:', error);
      toast.error('Failed to load permissions');
    }
  };

  const handlePermissionToggle = (moduleId: string) => {
    if (selectedRole === 'admin') return;

    const newPermissions = new Map(permissions);
    const currentValue = newPermissions.get(moduleId) || false;
    newPermissions.set(moduleId, !currentValue);
    setPermissions(newPermissions);

    const hasChanges = Array.from(newPermissions.entries()).some(
      ([id, value]) => value !== originalPermissions.get(id)
    );
    setHasChanges(hasChanges);
  };

  const handleSelectAll = (category: string) => {
    if (selectedRole === 'admin') return;

    const modules = modulesByCategory[category] || [];
    const newPermissions = new Map(permissions);

    modules.forEach((module) => {
      newPermissions.set(module.id, true);
    });

    setPermissions(newPermissions);
    setHasChanges(true);
  };

  const handleClearAll = (category: string) => {
    if (selectedRole === 'admin') return;

    const modules = modulesByCategory[category] || [];
    const newPermissions = new Map(permissions);

    modules.forEach((module) => {
      newPermissions.set(module.id, false);
    });

    setPermissions(newPermissions);
    setHasChanges(true);
  };

  const handleResetChanges = () => {
    setPermissions(new Map(originalPermissions));
    setHasChanges(false);
  };

  const handleSaveChanges = async () => {
    if (selectedRole === 'admin') return;

    try {
      setSaving(true);

      const updates = Array.from(permissions.entries()).map(([moduleId, canAccess]) => ({
        moduleId,
        canAccess,
      }));

      const result = await rolePermissionsService.updateRolePermissions(
        selectedRole,
        updates
      );

      if (result.success) {
        setOriginalPermissions(new Map(permissions));
        setHasChanges(false);
        toast.success('Permissions updated successfully');
      } else {
        toast.error(result.error || 'Failed to update permissions');
      }
    } catch (error) {
      logger.error('Error saving permissions:', error);
      toast.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <PageHeaderSlot title="Role Permissions" icon={Shield} />

        <Card className="p-4 bg-info-muted border-info/30">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
            <div className="text-sm text-info">
              <p className="font-medium mb-1">About Role Permissions</p>
              <p>
                Use the checkboxes below to control which modules each role can access.
                Changes take effect immediately after clicking the Apply button. Admin role
                has full access to all modules and cannot be modified.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Select Role to Manage
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {ROLES.map((role) => {
            const roleInfo = ROLE_DETAILS[role];
            const isSelected = selectedRole === role;
            return (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`
                  p-4 rounded-lg border-2 transition-all
                  ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-md'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }
                `}
              >
                <div className="flex items-center justify-center mb-2">
                  <Shield
                    className={`w-6 h-6 ${
                      isSelected ? 'text-primary' : 'text-slate-400'
                    }`}
                  />
                </div>
                <div className="text-center">
                  <Badge color={roleInfo.color} className="mb-2">
                    {roleInfo.name}
                  </Badge>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {roleInfo.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {ROLE_DETAILS[selectedRole].name} Permissions
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {selectedRole === 'admin'
                  ? 'Admin role has full access to all modules (cannot be modified)'
                  : `Configure which modules ${ROLE_DETAILS[selectedRole].name} role can access`}
              </p>
            </div>
            {hasChanges && selectedRole !== 'admin' && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleResetChanges}
                  disabled={saving}
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </Button>
                <Button
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Applying...' : 'Apply Changes'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-6">
            {Object.entries(modulesByCategory).map(([category, modules]) => (
              <div key={category} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">
                      {rolePermissionsService.getCategoryDisplayName(category)}
                    </h3>
                    {selectedRole !== 'admin' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSelectAll(category)}
                          className="text-xs text-primary hover:text-primary/80 font-medium"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => handleClearAll(category)}
                          className="text-xs text-slate-600 hover:text-slate-700 font-medium"
                        >
                          Clear All
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {modules.map((module) => {
                      const hasAccess = permissions.get(module.id) || false;
                      const isDisabled = selectedRole === 'admin';

                      return (
                        <div
                          key={module.id}
                          className={`
                            flex items-center gap-3 p-3 rounded-lg border
                            ${
                              isDisabled
                                ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
                                : hasAccess
                                ? 'bg-success-muted border-success/30 hover:bg-success-muted/70'
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }
                            transition-colors cursor-pointer
                          `}
                          onClick={() => handlePermissionToggle(module.id)}
                        >
                          <div className="flex-shrink-0">
                            {hasAccess ? (
                              <CheckCircle className="w-5 h-5 text-success" />
                            ) : (
                              <XCircle className="w-5 h-5 text-slate-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {module.name}
                            </p>
                            {module.description && (
                              <p className="text-xs text-slate-500 truncate">
                                {module.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

    </div>
  );
};
