import React, { useState, useRef, useId } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { userManagementService } from '../../lib/userManagementService';
import { validatePassword } from '../auth/shared/passwordPolicy';
import { PasswordStrengthMeter } from '../auth/shared/PasswordStrengthMeter';

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
          <label htmlFor={currentPasswordId} className="block text-sm font-medium text-slate-700 mb-1">
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
          <label htmlFor={newPasswordId} className="block text-sm font-medium text-slate-700 mb-1">
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
          <PasswordStrengthMeter password={newPassword} />
        </div>

        <div>
          <label htmlFor={confirmPasswordId} className="block text-sm font-medium text-slate-700 mb-1">
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
