import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LogIn, AlertCircle } from 'lucide-react';
import { getPortalSettings } from '../../lib/portalUrlService';

export const PortalLogin: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, error } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [termsUrl, setTermsUrl] = useState<string | null>(null);
  const [privacyUrl, setPrivacyUrl] = useState<string | null>(null);

  useEffect(() => {
    document.title = t('portal.login.tabTitle');
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    getPortalSettings()
      .then((s) => {
        if (cancelled || !s) return;
        setSupportEmail(s.portal_support_email?.trim() || null);
        setTermsUrl(s.portal_terms_url?.trim() || null);
        setPrivacyUrl(s.portal_privacy_url?.trim() || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const success = await login(email, password);
    if (success) {
      navigate('/portal/dashboard', { replace: true });
    }

    setIsSubmitting(false);
  };

  const forgotPasswordHref = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent('Portal password reset request')}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.login.heading')}</h1>
          <p className="text-slate-600">{t('portal.login.subheading')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 bg-danger-muted border border-danger/30 rounded-lg flex items-start gap-2"
            >
              <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <Input
            label={t('portal.login.emailLabel')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder={t('portal.login.emailPlaceholder')}
          />

          <Input
            label={t('portal.login.passwordLabel')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder={t('portal.login.passwordPlaceholder')}
          />

          <div className="text-right -mt-2">
            {forgotPasswordHref ? (
              <a
                href={forgotPasswordHref}
                className="text-sm text-primary hover:text-primary/80 hover:underline"
              >
                {t('portal.login.forgotPassword')}
              </a>
            ) : (
              <span className="text-sm text-slate-400" aria-disabled="true">
                {t('portal.login.forgotPasswordContact')}
              </span>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90"
            disabled={isSubmitting}
          >
            {isSubmitting ? t('portal.login.signingIn') : t('portal.login.signIn')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            {t('portal.login.needHelp')}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {supportEmail ? (
              <>
                {t('portal.common.contact')}{' '}
                <a
                  href={`mailto:${supportEmail}`}
                  className="text-primary hover:underline"
                >
                  {supportEmail}
                </a>
                {' '}{t('portal.login.contactSupportWithEmail')}
              </>
            ) : (
              <>{t('portal.login.contactSupport')}</>
            )}
          </p>
        </div>

        {(termsUrl || privacyUrl) && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-center text-xs text-slate-500 space-x-3">
            {termsUrl && (
              <a
                href={termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline"
              >
                {t('portal.login.termsOfService')}
              </a>
            )}
            {termsUrl && privacyUrl && <span aria-hidden="true">·</span>}
            {privacyUrl && (
              <a
                href={privacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline"
              >
                {t('portal.login.privacyPolicy')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
