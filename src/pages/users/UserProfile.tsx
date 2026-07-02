import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { User, Mail, Phone, Shield, Calendar, Save, Lock, PanelLeft, PanelRight, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import { useSidebarPreferences, type SidebarPosition } from '../../contexts/SidebarPreferencesContext';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';

const POSITION_OPTIONS: { id: SidebarPosition; label: string; icon: typeof PanelLeft; description: string }[] = [
  { id: 'left', label: 'Left', icon: PanelLeft, description: 'Navigation on the left (default).' },
  { id: 'right', label: 'Right', icon: PanelRight, description: 'Navigation on the right.' },
];

// Tiny wireframe of the app shell — a nav rail on the chosen side next to
// placeholder content — so the choice reads at a glance.
const SidebarLayoutPreview: React.FC<{ side: SidebarPosition }> = ({ side }) => (
  <div
    className={`flex gap-1.5 h-20 rounded-md border border-slate-200 bg-slate-50 p-1.5 ${
      side === 'right' ? 'flex-row-reverse' : ''
    }`}
  >
    <div className="w-1/4 rounded-sm bg-primary" />
    <div className="flex-1 flex flex-col gap-1.5">
      <div className="h-2 rounded-sm bg-slate-200" />
      <div className="h-2 w-2/3 rounded-sm bg-slate-200" />
      <div className="flex-1 rounded-sm bg-slate-100" />
    </div>
  </div>
);

export const UserProfile: React.FC = () => {
  const { profile, user } = useAuth();
  const { position, setPosition } = useSidebarPreferences();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleSaveProfile = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
      setEditing(false);
      window.location.reload();
    } catch (error) {
      logger.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) throw error;

      toast.success('Password changed successfully');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      logger.error('Error changing password:', error);
      toast.error('Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
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

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeaderSlot title="My Profile" icon={User} />

      <div className="grid gap-6">
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Profile Information</h2>
              {!editing && (
                <Button onClick={() => setEditing(true)} variant="outline">
                  Edit Profile
                </Button>
              )}
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-semibold text-2xl">
                {profile.full_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{profile.full_name}</h3>
                <Badge color={getRoleBadgeColor(profile.role ?? '')}>{profile.role}</Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </div>
                </label>
                <Input type="email" value={user?.email || ''} disabled />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Full Name
                  </div>
                </label>
                <Input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  disabled={!editing}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </div>
                </label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={!editing}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Role
                  </div>
                </label>
                <Input type="text" value={profile.role ?? ''} disabled />
              </div>

              {profile.last_login && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Last Login
                    </div>
                  </label>
                  <Input
                    type="text"
                    value={format(new Date(profile.last_login), 'MMMM dd, yyyy HH:mm')}
                    disabled
                  />
                </div>
              )}

              {editing && (
                <div className="flex gap-3">
                  <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setFormData({
                        full_name: profile.full_name,
                        phone: profile.phone || '',
                      });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Workspace Layout</h2>
            <p className="text-sm text-slate-600 mb-6">
              Choose which side the navigation sidebar appears on. This preference is saved to your
              account.
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              {POSITION_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = position === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPosition(opt.id)}
                    aria-pressed={active}
                    title={opt.description}
                    className={[
                      'group text-left rounded-xl border-2 bg-white p-3 transition-all',
                      active
                        ? 'border-primary shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
                    ].join(' ')}
                  >
                    <SidebarLayoutPreview side={opt.id} />
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                      </div>
                      <span
                        className={[
                          'w-5 h-5 rounded-full flex items-center justify-center transition-all',
                          active ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-transparent',
                        ].join(' ')}
                        aria-hidden="true"
                      >
                        <Check className="w-3 h-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Change Password</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    New Password
                  </div>
                </label>
                <Input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="Enter new password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Confirm New Password
                  </div>
                </label>
                <Input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                  }
                  placeholder="Confirm new password"
                />
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={
                  changingPassword ||
                  !passwordData.newPassword ||
                  !passwordData.confirmPassword
                }
                className="gap-2"
              >
                <Lock className="w-4 h-4" />
                {changingPassword ? 'Changing...' : 'Change Password'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
