import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff, Loader2, AlertTriangle, KeyRound } from 'lucide-react';
import { mfaService } from '../../lib/mfaService';
import { MFAEnrollment } from '../../components/auth/MFAEnrollment';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

export const SecuritySettingsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const { data: factors, isLoading } = useQuery({
    queryKey: ['mfa', 'factors'],
    queryFn: () => mfaService.listFactors(),
    enabled: !!user,
  });

  const verifiedFactor = factors?.find(f => f.status === 'verified');
  const mfaEnabled = !!verifiedFactor;

  const handleDisableMFA = async () => {
    if (!verifiedFactor || !user) return;
    setDisabling(true);
    try {
      await mfaService.unenroll(verifiedFactor.id);
      await mfaService.updateProfileMFAStatus(user.id, false);
      queryClient.invalidateQueries({ queryKey: ['mfa'] });
      toast.success('Two-factor authentication has been disabled');
      setShowDisableConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable MFA');
    } finally {
      setDisabling(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Security Settings</h1>
        <p className="text-sm text-slate-600 mt-1">Manage your account security and authentication preferences</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${mfaEnabled ? 'bg-success-muted' : 'bg-warning-muted'}`}>
              {mfaEnabled ? (
                <ShieldCheck className="w-6 h-6 text-success" />
              ) : (
                <ShieldOff className="w-6 h-6 text-warning" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">Two-Factor Authentication (2FA)</h2>
              <p className="text-sm text-slate-600 mt-1">
                Add an extra layer of security to your account by requiring a verification code from your authenticator app when signing in.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading security settings...</span>
            </div>
          ) : mfaEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-success-muted border border-success/30 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-success" />
                <div>
                  <p className="text-sm font-medium text-success">2FA is enabled</p>
                  <p className="text-xs text-success">
                    Enrolled: {verifiedFactor?.created_at ? new Date(verifiedFactor.created_at).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              </div>

              {showDisableConfirm ? (
                <div className="p-4 bg-danger-muted border border-danger/30 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-danger mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-danger">Disable Two-Factor Authentication?</p>
                      <p className="text-xs text-danger mt-1">
                        This will remove the extra security layer from your account. You can re-enable it at any time.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDisableConfirm(false)}
                      className="px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDisableMFA}
                      disabled={disabling}
                      className="px-3 py-1.5 text-sm text-danger-foreground bg-danger rounded-md hover:bg-danger/90 disabled:opacity-50 flex items-center gap-1"
                    >
                      {disabling && <Loader2 className="w-3 h-3 animate-spin" />}
                      Disable 2FA
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDisableConfirm(true)}
                  className="px-4 py-2 text-sm text-danger border border-danger/30 rounded-lg hover:bg-danger-muted transition-colors"
                >
                  Disable Two-Factor Authentication
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-warning-muted border border-warning/30 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <p className="text-sm text-warning">
                  2FA is not enabled. We strongly recommend enabling it for admin accounts.
                </p>
              </div>

              <button
                onClick={() => setShowEnrollment(true)}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                Enable Two-Factor Authentication
              </button>
            </div>
          )}
        </div>
      </div>

      <MFAEnrollment
        isOpen={showEnrollment}
        onClose={() => setShowEnrollment(false)}
        onEnrolled={() => {
          queryClient.invalidateQueries({ queryKey: ['mfa'] });
          toast.success('Two-factor authentication enabled successfully');
        }}
      />
    </div>
  );
};
