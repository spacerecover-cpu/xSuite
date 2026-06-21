import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Lock, Check, AlertCircle } from 'lucide-react';

export const PortalSettings: React.FC = () => {
  const { t } = useTranslation();
  const { changePassword } = usePortalAuth();

  useEffect(() => {
    document.title = t('portal.settings.tabTitle');
  }, [t]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError(t('portal.settings.errTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('portal.settings.errNoMatch'));
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result) {
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError(t('portal.settings.errIncorrectCurrent'));
      }
    } catch (err) {
      setError(t('portal.settings.errFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.settings.heading')}</h1>
        <p className="text-slate-600">
          {t('portal.settings.subtitle')}
        </p>
      </div>

      <Card className="p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('portal.settings.changePassword')}</h2>
            <p className="text-sm text-slate-600">{t('portal.settings.changePasswordSubtitle')}</p>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-success-muted border border-success/30 rounded-lg flex items-start gap-3">
            <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div className="text-sm text-success">
              <p className="font-semibold">{t('portal.settings.passwordChangedTitle')}</p>
              <p>{t('portal.settings.passwordChangedBody')}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-danger-muted border border-danger/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm text-danger">
              <p className="font-semibold">{t('portal.settings.errorTitle')}</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('portal.settings.currentPasswordLabel')}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder={t('portal.settings.currentPasswordPlaceholder')}
          />

          <Input
            label={t('portal.settings.newPasswordLabel')}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder={t('portal.settings.newPasswordPlaceholder')}
          />

          <Input
            label={t('portal.settings.confirmPasswordLabel')}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder={t('portal.settings.confirmPasswordPlaceholder')}
          />

          <div className="pt-4 border-t border-slate-200">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? t('portal.settings.changingPassword') : t('portal.settings.changePasswordBtn')}
            </Button>
          </div>

          <div className="text-xs text-slate-500 pt-2">
            <p className="font-semibold mb-1">{t('portal.settings.requirementsTitle')}</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>{t('portal.settings.requirementLength')}</li>
              <li>{t('portal.settings.requirementMix')}</li>
            </ul>
          </div>
        </form>
      </Card>
    </div>
  );
};
