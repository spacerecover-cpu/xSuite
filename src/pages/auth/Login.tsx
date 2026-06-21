import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PasswordChangeModal } from '../../components/users/PasswordChangeModal';
import { MFAChallenge } from '../../components/auth/MFAChallenge';
import { AuthLayout } from '../../components/auth/shared/AuthLayout';
import { safeInternalRedirect } from '../../lib/utils';
import { BrandShowcase } from './login/BrandShowcase';
import { LoginForm } from './login/LoginForm';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, passwordResetRequired, profile, profileStatus, mfaPending, completeMFAChallenge, signOut } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (passwordResetRequired && profile) {
      setShowPasswordChangeModal(true);
    }
  }, [passwordResetRequired, profile]);

  useEffect(() => {
    if (!profile) {
      hasRedirected.current = false;
    }
  }, [profile]);

  // H4: explain an expiry / revoked-refresh eject (flagged by AuthContext)
  // instead of dropping the user at a blank login form.
  useEffect(() => {
    if (localStorage.getItem('auth_session_expired')) {
      localStorage.removeItem('auth_session_expired');
      setError('Your session has expired. Please sign in again.');
    }
  }, []);

  const handleSubmit = async (email: string, password: string) => {
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && !passwordResetRequired && !mfaPending && !hasRedirected.current && profileStatus === 'approved') {
      hasRedirected.current = true;
      const isPlatformAdmin = !profile.tenant_id && (profile.role === 'owner' || profile.role === 'admin');
      const from = safeInternalRedirect((location.state as { from?: { pathname?: string } })?.from?.pathname);
      const defaultPath = isPlatformAdmin ? '/platform-admin' : '/';
      navigate(from || defaultPath, { replace: true });
    }
  }, [profile, passwordResetRequired, mfaPending, navigate, location, profileStatus]);

  if (mfaPending) {
    return (
      <MFAChallenge
        onVerified={completeMFAChallenge}
        onCancel={() => signOut()}
      />
    );
  }

  return (
    <>
      <AuthLayout
        leftContent={<BrandShowcase />}
        rightContent={
          <LoginForm
            onSubmit={handleSubmit}
            error={error}
            loading={loading}
          />
        }
      />

      {showPasswordChangeModal && profile && (
        <PasswordChangeModal
          isOpen={showPasswordChangeModal}
          userName={profile.full_name}
        />
      )}
    </>
  );
};
