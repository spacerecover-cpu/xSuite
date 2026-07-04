import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { KeyRound, Lock, Mail, Eye, EyeOff, Loader2, CheckCircle, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MFAChallenge } from '../../components/auth/MFAChallenge';
import { AuthShell } from '../../components/auth/shared/AuthShell';
import { AuthTextField } from '../../components/auth/shared/AuthTextField';
import { AuthAlert } from '../../components/auth/shared/AuthAlert';
import { AUTH_PRIMARY_BUTTON } from '../../components/auth/shared/authStyles';
import { PasswordStrengthMeter } from '../../components/auth/shared/PasswordStrengthMeter';
import { validatePassword } from '../../components/auth/shared/passwordPolicy';
import { useResetRequest } from '../../components/auth/shared/useResetRequest';
import { userManagementService } from '../../lib/userManagementService';

// GoTrue leaves the hash intact on the error path (expired/used link) and
// clears it on success — so a hash error at mount reliably means a dead link.
const parseRecoveryHashError = (): string | null => {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('error') || params.get('error_code')) {
    return params.get('error_description')?.replace(/\+/g, ' ') || params.get('error') || 'invalid_link';
  }
  return null;
};

export const ResetPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const {
    user, profile, loading, mfaPending,
    completeMFAChallenge, completePasswordRecovery, signOut,
  } = useAuth();

  const [hashError] = useState<string | null>(() => parseRecoveryHashError());
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invalid-link re-request form
  const [requestEmail, setRequestEmail] = useState('');
  const resetRequest = useResetRequest();

  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const policyError = validatePassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.reset.mismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await userManagementService.changePassword('', newPassword);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update password');
      }
      completePasswordRecovery();
      setSucceeded(true);
      const isPlatformAdmin = profile && !profile.tenant_id && (profile.role === 'owner' || profile.role === 'admin');
      const dest = isPlatformAdmin ? '/platform-admin' : '/';
      redirectTimer.current = setTimeout(() => navigate(dest, { replace: true }), 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail) return;
    await resetRequest.send(requestEmail);
  };

  if (loading) {
    return (
      <AuthShell>
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="w-6 h-6 text-sky-300 motion-safe:animate-spin" aria-hidden="true" />
        </div>
      </AuthShell>
    );
  }

  // The recovery session is aal1; MFA-enrolled accounts must present their
  // second factor before GoTrue will accept updateUser({ password }).
  if (user && mfaPending) {
    return <MFAChallenge onVerified={completeMFAChallenge} onCancel={() => void signOut()} />;
  }

  const linkIsInvalid = hashError !== null || !user;

  return (
    <AuthShell>
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {linkIsInvalid ? (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-300" aria-hidden="true" />
              </span>
              <h1 className="text-xl font-semibold text-white">{t('auth.reset.linkInvalidTitle')}</h1>
            </div>
            <p className="text-sm text-slate-400 mb-6">{t('auth.reset.linkInvalidBody')}</p>

            {resetRequest.status === 'sent' ? (
              <div className="space-y-5">
                <AuthAlert tone="success">
                  {t('auth.forgot.sent', { email: requestEmail })}
                </AuthAlert>
                {resetRequest.cooldown > 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    {t('auth.forgot.resendIn', { seconds: resetRequest.cooldown })}
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleRequestNewLink} className="space-y-5">
                {resetRequest.error && <AuthAlert>{resetRequest.error}</AuthAlert>}
                <AuthTextField
                  icon={Mail}
                  label={t('auth.emailLabel')}
                  type="email"
                  value={requestEmail}
                  onChange={(e) => setRequestEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <button
                  type="submit"
                  disabled={resetRequest.status === 'sending'}
                  aria-busy={resetRequest.status === 'sending'}
                  className={AUTH_PRIMARY_BUTTON}
                >
                  {resetRequest.status === 'sending' ? (
                    <>
                      <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
                      {t('auth.forgot.sending')}
                    </>
                  ) : (
                    t('auth.reset.requestNewLink')
                  )}
                </button>
              </form>
            )}

            <p className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
              >
                <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                {t('auth.forgot.backToSignIn')}
              </Link>
            </p>
          </div>
        ) : succeeded ? (
          <div className="text-center py-6" role="status">
            <span className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-300" aria-hidden="true" />
            </span>
            <p className="text-white font-medium">{t('auth.reset.success')}</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-sky-300" aria-hidden="true" />
              </span>
              <h1 className="text-xl font-semibold text-white">{t('auth.reset.title')}</h1>
            </div>
            <p className="text-sm text-slate-400 mb-6">{t('auth.reset.subtitle')}</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <AuthAlert>{error}</AuthAlert>}

              <div>
                <AuthTextField
                  icon={Lock}
                  label={t('auth.reset.newPassword')}
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                      aria-label={showNew ? t('auth.hidePassword') : t('auth.showPassword')}
                      tabIndex={-1}
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
                <PasswordStrengthMeter password={newPassword} dark />
              </div>

              <AuthTextField
                icon={Lock}
                label={t('auth.reset.confirmPassword')}
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                error={confirmPassword && newPassword !== confirmPassword ? t('auth.reset.mismatch') : undefined}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showConfirm ? t('auth.hidePassword') : t('auth.showPassword')}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className={AUTH_PRIMARY_BUTTON}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
                    {t('auth.reset.submitting')}
                  </>
                ) : (
                  t('auth.reset.submit')
                )}
              </button>
            </form>
          </div>
        )}
      </motion.div>
    </AuthShell>
  );
};
