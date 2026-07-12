import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { MFAChallenge } from './auth/MFAChallenge';
import { PasswordChangeModal } from './users/PasswordChangeModal';

interface ProtectedPlatformAdminRouteProps {
  children: React.ReactNode;
}

export const ProtectedPlatformAdminRoute: React.FC<ProtectedPlatformAdminRouteProps> = ({ children }) => {
  const { user, profile, loading, mfaPending, passwordResetRequired, recoveryPending, completeMFAChallenge, signOut } = useAuth();

  const { data: isPlatformAdmin, isLoading } = useQuery({
    queryKey: ['is-platform-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data } = await supabase.rpc('is_platform_admin');
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Session-level auth gates — mirror ProtectedRoute (recovery → MFA → forced
  // reset) BEFORE any authorization decision. The /platform-admin tree is a
  // sibling of the main app in App.tsx, so without these a deep link / restored
  // aal1 session would walk straight past the second factor, an in-progress
  // password recovery, or an admin-mandated password rotation into the
  // highest-privilege cross-tenant console. is_platform_admin() is AAL-agnostic
  // and cannot be relied on to enforce the second factor.
  if (recoveryPending) {
    return <Navigate to="/reset-password" replace />;
  }

  if (mfaPending) {
    return <MFAChallenge onVerified={completeMFAChallenge} onCancel={() => void signOut()} />;
  }

  if (passwordResetRequired) {
    return <PasswordChangeModal isOpen userName={profile?.full_name ?? ''} />;
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-danger-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-600 mb-6">
            You do not have permission to access the Platform Admin area. This area is restricted to platform administrators only.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
