import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { UserFormModal, UserFormData } from '../../components/users/UserFormModal';
import { PasswordResetModal } from '../../components/users/PasswordResetModal';
import { userManagementService } from '../../lib/userManagementService';
import { useToast } from '../../hooks/useToast';
import { useUsageLimit } from '../../hooks/useFeatureGate';
import { canPerformAction } from '../../lib/featureGateService';
import { UserPlus, Search, CreditCard as Edit, Lock, Unlock, Mail, Phone, Calendar, Shield, AlertCircle, CheckCircle, XCircle, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';

interface UserProfile {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  password_reset_required: boolean;
  case_access_level: string | null;
  created_at: string;
  updated_at: string;
  email: string;
  tenant_id: string | null;
}

type FormRole = 'admin' | 'technician' | 'sales' | 'accounts' | 'hr';
type FormCaseAccessLevel = 'restricted' | 'full';

const FORM_ROLES: readonly FormRole[] = ['admin', 'technician', 'sales', 'accounts', 'hr'] as const;

const asFormRole = (role: string | null): FormRole =>
  FORM_ROLES.find((r) => r === role) ?? 'technician';

const asFormCaseAccessLevel = (level: string | null): FormCaseAccessLevel | undefined => {
  if (level === 'restricted' || level === 'full') return level;
  return undefined;
};

const toUserFormModalUser = (user: UserProfile) => ({
  id: user.id,
  full_name: user.full_name,
  role: asFormRole(user.role),
  phone: user.phone,
  email: user.email,
  is_active: user.is_active,
  case_access_level: asFormCaseAccessLevel(user.case_access_level),
});

export const UserManagement: React.FC = () => {
  const { profile: currentUser } = useAuth();
  const toast = useToast();
  const { usage: userUsage } = useUsageLimit('max_users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');

  useEffect(() => {
    fetchUsers();
  }, [filterStatus]);

  const handleAddUserClick = async () => {
    const check = await canPerformAction('max_users');
    if (!check.allowed) {
      toast.error(check.message || 'User limit reached');
      return;
    }
    if (check.message) {
      toast.warning(check.message);
    }
    setShowCreateModal(true);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .rpc('get_user_profiles_with_email');

      if (profilesError) throw profilesError;

      const mapped: UserProfile[] = (profilesData ?? []).map((row) => ({
        id: row.id,
        full_name: row.full_name,
        role: row.role ?? null,
        phone: row.phone ?? null,
        avatar_url: row.avatar_url ?? null,
        is_active: row.is_active,
        last_login_at: row.last_login_at ?? null,
        password_reset_required: row.password_reset_required,
        case_access_level: row.case_access_level ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        email: row.email,
        tenant_id: row.tenant_id ?? null,
      }));

      let filteredData = mapped;

      if (filterStatus === 'active') {
        filteredData = mapped.filter((user) => user.is_active && user.role !== null);
      } else if (filterStatus === 'inactive') {
        filteredData = mapped.filter((user) => !user.is_active && user.role !== null);
      } else if (filterStatus === 'pending') {
        filteredData = mapped.filter((user) => user.role === null);
      }

      setUsers(filteredData);
    } catch (error) {
      logger.error('Error fetching users:', error);
      toast.error('Failed to fetch users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      user.full_name.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.role ?? '').toLowerCase().includes(searchLower)
    );
  });

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      await supabase.rpc('log_audit_trail', {
        p_action: 'update',
        p_record_type: 'profiles',
        p_record_id: userId,
        p_old_values: { is_active: currentStatus },
        p_new_values: { is_active: !currentStatus },
      });

      fetchUsers();
      setShowDeactivateModal(false);
    } catch (error) {
      logger.error('Error toggling user status:', error);
    }
  };

  const handleCreateUser = async (userData: UserFormData) => {
    const result = await userManagementService.createUser({
      email: userData.email,
      password: userData.password || '',
      full_name: userData.full_name,
      role: userData.role,
      phone: userData.phone,
      is_active: userData.is_active,
      case_access_level: userData.case_access_level ?? 'full',
    });

    if (result.success) {
      toast.success('User created successfully');
      await fetchUsers();
    } else {
      throw new Error(result.error || 'Failed to create user');
    }
  };

  const handleEditUser = async (userData: UserFormData) => {
    if (!selectedUser) return;

    const result = await userManagementService.updateUser(selectedUser.id, {
      full_name: userData.full_name,
      role: userData.role,
      phone: userData.phone,
      is_active: userData.is_active,
      case_access_level: userData.case_access_level,
    });

    if (result.success) {
      toast.success('User updated successfully');
      await fetchUsers();
    } else {
      throw new Error(result.error || 'Failed to update user');
    }
  };

  const handleResetPassword = async (temporaryPassword: string) => {
    if (!selectedUser || !selectedUser.email) return;

    const result = await userManagementService.resetPassword(
      selectedUser.id,
      selectedUser.email,
      temporaryPassword
    );

    if (result.success) {
      toast.success('Password reset successfully. The temporary password has been set.');
    } else {
      throw new Error(result.error || 'Failed to reset password');
    }
  };

  const getRoleBadgeColor = (role: string | null) => {
    if (role === null) return 'amber';
    switch (role) {
      case 'admin':
        return 'red';
      case 'technician':
        return 'blue';
      case 'sales':
        return 'green';
      case 'accounts':
        return 'orange';
      case 'hr':
        return 'teal';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage staff accounts and permissions
              {userUsage && userUsage.limit && (
                <span className="ml-2 text-slate-500">
                  ({userUsage.current}/{userUsage.limit} users)
                </span>
              )}
            </p>
          </div>
          <Button onClick={handleAddUserClick} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Add New User
          </Button>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={filterStatus === 'all' ? 'primary' : 'ghost'}
              onClick={() => setFilterStatus('all')}
              className="text-sm"
            >
              All Users
            </Button>
            <Button
              variant={filterStatus === 'pending' ? 'primary' : 'ghost'}
              onClick={() => setFilterStatus('pending')}
              className="text-sm"
            >
              Pending Approval
            </Button>
            <Button
              variant={filterStatus === 'active' ? 'primary' : 'ghost'}
              onClick={() => setFilterStatus('active')}
              className="text-sm"
            >
              Active
            </Button>
            <Button
              variant={filterStatus === 'inactive' ? 'primary' : 'ghost'}
              onClick={() => setFilterStatus('inactive')}
              className="text-sm"
            >
              Inactive
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Case Access
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-white font-semibold text-sm">
                        {user.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{user.full_name}</p>
                        {user.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Phone className="w-3 h-3" />
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge color={getRoleBadgeColor(user.role)}>
                      {user.role === null ? 'Pending Approval' : user.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {user.role === 'technician' ? (
                      <Badge color={user.case_access_level === 'restricted' ? '#f59e0b' : '#10b981'}>
                        {user.case_access_level === 'restricted' ? 'Restricted' : 'Full'}
                      </Badge>
                    ) : (
                      <span className="text-sm text-slate-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {user.is_active ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-success" />
                          <span className="text-sm text-success font-medium">Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-danger" />
                          <span className="text-sm text-danger font-medium">Inactive</span>
                        </>
                      )}
                      {user.password_reset_required && (
                        <span title="Password reset required" className="inline-flex">
                          <AlertCircle className="w-4 h-4 text-warning" aria-label="Password reset required" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {user.last_login_at ? (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(user.last_login_at), 'MMM dd, yyyy HH:mm')}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {user.role === null ? (
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowEditModal(true);
                          }}
                          className="px-3 py-1.5 bg-success text-success-foreground text-sm font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center gap-2"
                          title="Approve user"
                        >
                          <UserCheck className="w-4 h-4" />
                          Approve
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowEditModal(true);
                            }}
                            className="p-2 text-slate-600 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit user"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowPasswordResetModal(true);
                            }}
                            className="p-2 text-slate-600 hover:text-warning hover:bg-warning-muted rounded-lg transition-colors"
                            title="Reset password"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          {currentUser?.id !== user.id && (
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDeactivateModal(true);
                              }}
                              className={`p-2 rounded-lg transition-colors ${
                                user.is_active
                                  ? 'text-slate-600 hover:text-danger hover:bg-danger-muted'
                                  : 'text-slate-600 hover:text-success hover:bg-success-muted'
                              }`}
                              title={user.is_active ? 'Deactivate user' : 'Activate user'}
                            >
                              {user.is_active ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">No users found</p>
          </div>
        )}
      </div>

      <UserFormModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedUser(null);
        }}
        onSubmit={handleCreateUser}
        mode="create"
      />

      <UserFormModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedUser(null);
        }}
        onSubmit={handleEditUser}
        user={selectedUser ? toUserFormModalUser(selectedUser) : null}
        mode="edit"
      />

      {showPasswordResetModal && selectedUser && (
        <PasswordResetModal
          isOpen={showPasswordResetModal}
          onClose={() => {
            setShowPasswordResetModal(false);
            setSelectedUser(null);
          }}
          onConfirm={handleResetPassword}
          userName={selectedUser.full_name}
          userEmail={selectedUser.email || ''}
        />
      )}

      {showDeactivateModal && selectedUser && (
        <Modal
          isOpen={showDeactivateModal}
          onClose={() => setShowDeactivateModal(false)}
          title={selectedUser.is_active ? 'Deactivate User' : 'Activate User'}
        >
          <div className="space-y-4">
            <p className="text-slate-600">
              {selectedUser.is_active
                ? 'Are you sure you want to deactivate this user? They will not be able to log in until reactivated.'
                : 'Are you sure you want to activate this user? They will be able to log in immediately.'}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowDeactivateModal(false)}>
                Cancel
              </Button>
              <Button
                variant={selectedUser.is_active ? 'danger' : 'primary'}
                onClick={() => handleToggleUserStatus(selectedUser.id, selectedUser.is_active)}
              >
                {selectedUser.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
