import React, { useState, useEffect, useRef, useId } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, User, Phone, Shield, Lock } from 'lucide-react';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userData: UserFormData) => Promise<void>;
  user?: UserProfile | null;
  mode: 'create' | 'edit';
}

export interface UserFormData {
  full_name: string;
  email: string;
  password?: string;
  role: 'admin' | 'technician' | 'sales' | 'accounts' | 'hr';
  phone: string;
  is_active: boolean;
  case_access_level?: 'restricted' | 'full';
}

interface UserProfile {
  id: string;
  full_name: string;
  role: 'admin' | 'technician' | 'sales' | 'accounts' | 'hr';
  phone: string | null;
  email?: string;
  is_active: boolean;
  case_access_level?: 'restricted' | 'full';
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  user,
  mode,
}) => {
  const [formData, setFormData] = useState<UserFormData>({
    full_name: '',
    email: '',
    password: '',
    role: 'technician',
    phone: '',
    is_active: true,
    case_access_level: 'full',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const fullNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const phoneId = useId();
  const roleId = useId();
  const caseAccessLevelId = useId();
  const statusId = useId();

  useEffect(() => {
    if (user && mode === 'edit') {
      setFormData({
        full_name: user.full_name,
        email: user.email || '',
        role: user.role,
        phone: user.phone || '',
        is_active: user.is_active,
        case_access_level: user.case_access_level || 'full',
      });
    } else if (mode === 'create') {
      setFormData({
        full_name: '',
        email: '',
        password: '',
        role: 'technician',
        phone: '',
        is_active: true,
        case_access_level: 'full',
      });
    }
    setError('');
  }, [user, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'create' && (!formData.password || formData.password.length < 6)) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (!formData.full_name.trim()) {
      setError('Full name is required');
      return;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Valid email is required');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New User' : 'Edit User'}
      size="lg"
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-danger-muted border border-danger/30 text-danger rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor={fullNameId} className="block text-sm font-medium text-slate-700 mb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name
              </div>
            </label>
            <Input
              ref={firstFieldRef}
              id={fullNameId}
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="John Doe"
              required
            />
          </div>

          <div>
            <label htmlFor={emailId} className="block text-sm font-medium text-slate-700 mb-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </div>
            </label>
            {mode === 'edit' ? (
              <Input
                id={emailId}
                type="email"
                value={formData.email}
                readOnly
                disabled
                className="bg-slate-50 cursor-not-allowed"
              />
            ) : (
              <Input
                id={emailId}
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                required
              />
            )}
            {mode === 'edit' && (
              <p className="text-xs text-slate-500 mt-1">
                Email cannot be changed after user creation
              </p>
            )}
          </div>

          {mode === 'create' && (
            <div>
              <label htmlFor={passwordId} className="block text-sm font-medium text-slate-700 mb-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Password
                </div>
              </label>
              <Input
                id={passwordId}
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 6 characters"
                required
                minLength={6}
              />
            </div>
          )}

          <div>
            <label htmlFor={phoneId} className="block text-sm font-medium text-slate-700 mb-2">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone Number
              </div>
            </label>
            <Input
              id={phoneId}
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div>
            <label htmlFor={roleId} className="block text-sm font-medium text-slate-700 mb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Role
              </div>
            </label>
            <select
              id={roleId}
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as UserFormData['role'],
                })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            >
              <option value="admin">Admin</option>
              <option value="technician">Technician</option>
              <option value="sales">Sales</option>
              <option value="accounts">Accounts</option>
              <option value="hr">HR</option>
            </select>
          </div>

          {formData.role === 'technician' && (
            <div>
              <label htmlFor={caseAccessLevelId} className="block text-sm font-medium text-slate-700 mb-2">
                Case Access Level
              </label>
              <select
                id={caseAccessLevelId}
                value={formData.case_access_level || 'full'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    case_access_level: e.target.value as 'restricted' | 'full',
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="full">Full Access - Can view all cases</option>
                <option value="restricted">Restricted - Only own/assigned cases</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                {formData.case_access_level === 'restricted'
                  ? 'This user can only view cases they created or are assigned to.'
                  : 'This user can view all cases in the system.'}
              </p>
            </div>
          )}

          <div>
            <label htmlFor={statusId} className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              id={statusId}
              value={formData.is_active ? 'active' : 'inactive'}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.value === 'active' })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : mode === 'create' ? 'Create User' : 'Update User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
