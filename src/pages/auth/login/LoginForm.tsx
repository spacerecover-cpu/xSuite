import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, ChevronRight, ArrowRight, ArrowLeft } from 'lucide-react';
import { XLogo } from '../../../components/auth/shared/XLogo';
import { AuthTextField } from '../../../components/auth/shared/AuthTextField';
import { AuthAlert } from '../../../components/auth/shared/AuthAlert';
import { AUTH_PRIMARY_BUTTON } from '../../../components/auth/shared/authStyles';
import { useResetRequest } from '../../../components/auth/shared/useResetRequest';
import { setSessionPersistence } from '../../../lib/authStorage';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  error: string;
  loading: boolean;
}

export const LoginForm = ({ onSubmit, error, loading }: LoginFormProps) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const [view, setView] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [shakeKey, setShakeKey] = useState(0);
  const resetRequest = useResetRequest();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Must land in storage BEFORE signInWithPassword saves the session — the
    // adapter reads the flag lazily on every write (see lib/authStorage.ts).
    setSessionPersistence(remember);
    await onSubmit(email, password);
    setShakeKey(prev => prev + 1);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    await resetRequest.send(email);
  };

  const viewMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -8 } };

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {view === 'signin' ? (
          <motion.div key="signin" {...viewMotion} transition={{ duration: 0.2 }}>
            <div className="text-center mb-7">
              <span className="inline-flex w-14 h-14 rounded-2xl bg-white/[0.06] ring-1 ring-white/15 items-center justify-center shadow-lg shadow-slate-950/40">
                <XLogo size={30} />
              </span>
              <h1 className="mt-4 text-2xl font-semibold text-white">{t('auth.welcomeBack')}</h1>
              <p className="mt-1 text-sm text-slate-400">{t('auth.signInSubtitle')}</p>
            </div>

            {error && (
              <motion.div
                key={shakeKey}
                animate={shouldReduceMotion ? {} : { x: [0, -8, 8, -8, 4, 0] }}
                transition={{ duration: 0.4 }}
                className="mb-5"
              >
                <AuthAlert>{error}</AuthAlert>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <AuthTextField
                icon={Mail}
                label={t('auth.emailLabel')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <AuthTextField
                icon={Lock}
                label={t('auth.passwordLabel')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/[0.06] text-sky-500 focus:ring-sky-400/50 focus:ring-offset-0"
                  />
                  {t('auth.rememberMe')}
                </label>
                <button
                  type="button"
                  onClick={() => { resetRequest.reset(); setView('forgot'); }}
                  className="text-sm text-sky-300 hover:text-sky-200 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>

              <button type="submit" disabled={loading} aria-busy={loading} className={AUTH_PRIMARY_BUTTON}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
                    {t('auth.signingIn')}
                  </>
                ) : (
                  <>
                    {t('auth.signInCta')}
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <p className="text-center mt-6 text-slate-400 text-sm">
              {t('auth.newToXsuite')}{' '}
              <Link
                to="/signup/tenant"
                className="text-sky-300 font-medium hover:text-sky-200 transition-colors inline-flex items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
              >
                {t('auth.createYourLab')}
                <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </p>
          </motion.div>
        ) : (
          <motion.div key="forgot" {...viewMotion} transition={{ duration: 0.2 }}>
            <h1 className="text-xl font-semibold text-white">{t('auth.forgot.title')}</h1>
            <p className="mt-1 text-sm text-slate-400 mb-6">{t('auth.forgot.subtitle')}</p>

            {resetRequest.status === 'sent' ? (
              <div className="space-y-5">
                <AuthAlert tone="success">
                  {t('auth.forgot.sent', { email })}
                </AuthAlert>
                {resetRequest.cooldown > 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    {t('auth.forgot.resendIn', { seconds: resetRequest.cooldown })}
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-5">
                {resetRequest.error && <AuthAlert>{resetRequest.error}</AuthAlert>}
                <AuthTextField
                  icon={Mail}
                  label={t('auth.emailLabel')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                    t('auth.forgot.send')
                  )}
                </button>
              </form>
            )}

            <p className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setView('signin')}
                className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
              >
                <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                {t('auth.forgot.backToSignIn')}
              </button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
