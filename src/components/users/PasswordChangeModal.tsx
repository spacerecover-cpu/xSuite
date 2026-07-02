import React, { useState, useRef, useId } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock, AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { userManagementService } from '../../lib/userManagementService';

interface PasswordChangeModalProps {
  isOpen: boolean;
  userName: string;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  userName,
}) => {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validatePassword = (password: string): string | null => {
    if (password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const getPasswordStrength = (password: string): { label: string; color: string; width: string } => {
    if (password.length === 0) {
      return { label: '', color: '', width: '0%' };
    }

    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) {
      return { label: 'Weak', color: 'bg-danger', width: '33%' };
    } else if (strength <= 4) {
      return { label: 'Medium', color: 'bg-warning', width: '66%' };
    } else {
      return { label: 'Strong', color: 'bg-success', width: '100%' };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Please enter your current password');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from the current password');
      return;
    }

    setLoading(true);
    try {
      const result = await userManagementService.changePassword(currentPassword, newPassword);

      if (result.success) {
        window.location.reload();
      } else {
        throw new Error(result.error || 'Failed to change password');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(newPassword);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      title="Change Your Password"
      size="md"
      closeOnBackdrop={false}
      closeOnEscape={false}
      initialFocusRef={firstFieldRef}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-start gap-3 p-4 bg-warning-muted border border-warning/30 rounded-lg">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-warning font-medium">
              Password Change Required
            </p>
            <p className="text-sm text-warning mt-1">
              Hi {userName}, your password has been reset by an administrator. For security reasons,
              you must change it now before continuing.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-danger-muted border border-danger/30 text-danger rounded-lg text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor={currentPasswordId} className="block text-sm font-medium text-slate-700 mb-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Current Password
            </div>
          </label>
          <div className="relative">
            <Input
              ref={firstFieldRef}
              id={currentPasswordId}
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor={newPasswordId} className="block text-sm font-medium text-slate-700 mb-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              New Password
            </div>
          </label>
          <div className="relative">
            <Input
              id={newPasswordId}
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter your new password"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {newPassword && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-600">Password Strength:</span>
                <span className={`text-xs font-medium ${
                  passwordStrength.label === 'Weak' ? 'text-danger' :
                  passwordStrength.label === 'Medium' ? 'text-warning' :
                  'text-success'
                }`}>
                  {passwordStrength.label}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${passwordStrength.color} transition-all duration-300`}
                  style={{ width: passwordStrength.width }}
                />
              </div>
            </div>
          )}
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            <li className="flex items-center gap-2">
              <CheckCircle className={`w-3 h-3 ${newPassword.length >= 6 ? 'text-success' : 'text-slate-300'}`} />
              At least 6 characters
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className={`w-3 h-3 ${/[A-Z]/.test(newPassword) ? 'text-success' : 'text-slate-300'}`} />
              One uppercase letter
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className={`w-3 h-3 ${/[a-z]/.test(newPassword) ? 'text-success' : 'text-slate-300'}`} />
              One lowercase letter
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className={`w-3 h-3 ${/[0-9]/.test(newPassword) ? 'text-success' : 'text-slate-300'}`} />
              One number
            </li>
          </ul>
        </div>

        <div>
          <label htmlFor={confirmPasswordId} className="block text-sm font-medium text-slate-700 mb-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Confirm New Password
            </div>
          </label>
          <div className="relative">
            <Input
              id={confirmPasswordId}
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-danger mt-1">Passwords do not match</p>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-200">
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Changing Password...' : 'Change Password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
