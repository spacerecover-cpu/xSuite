import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PendingApprovalScreen } from './PendingApprovalScreen';
import { MFAChallenge } from './auth/MFAChallenge';
import { PasswordChangeModal } from './users/PasswordChangeModal';
import { Button } from './ui/Button';

interface ProtectedRouteProps {
  /** Omit to use the guard as a pathless layout route — children render via <Outlet/>. */
  children?: React.ReactNode;
  allowedRoles?: Array<'owner' | 'admin' | 'manager' | 'technician' | 'sales' | 'accounts' | 'hr' | 'viewer'>;
}

const AuthLoadingSkeleton = () => (
  <div className="min-h-screen bg-slate-50 flex">
    <div className="w-72 bg-white border-r border-slate-200 flex flex-col animate-pulse shrink-0">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-200" />
          <div className="flex-1">
            <div className="h-4 w-28 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-20 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
      <div className="flex-1 p-3 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 bg-slate-100 rounded-lg" />
        ))}
      </div>
      <div className="p-3 border-t border-slate-200">
        <div className="h-14 bg-slate-100 rounded-xl" />
      </div>
    </div>
    <div className="flex-1 p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl border border-slate-200" />
        ))}
      </div>
      <div className="h-64 bg-white rounded-xl border border-slate-200" />
    </div>
  </div>
);

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, profile, loading, profileStatus, mfaPending, passwordResetRequired, recoveryPending, completeMFAChallenge, signOut, refreshProfile } = useAuth();
  const location = useLocation();
  const [isRetrying, setIsRetrying] = useState(false);

  const retryProfile = async () => {
    setIsRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setIsRetrying(false);
    }
  };

  if (loading) {
    return <AuthLoadingSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Password-recovery gate: a session minted from an email reset link exists
  // only to set a new password. Bounce any protected-route navigation back to
  // /reset-password until the flow completes — placed BEFORE the MFA gate
  // because the reset page owns the MFA challenge in this flow.
  if (recoveryPending) {
    return <Navigate to="/reset-password" replace />;
  }

  // MFA gate: an authenticated-but-not-yet-elevated (aal1) session must present
  // its second factor before any protected page renders. Without this the
  // challenge lived only on /login, so a deep link / second tab bypassed it.
  if (mfaPending) {
    return <MFAChallenge onVerified={completeMFAChallenge} onCancel={() => void signOut()} />;
  }

  if (profileStatus === 'pending_approval') {
    return <PendingApprovalScreen />;
  }

  if (profileStatus === 'inactive') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-danger-muted rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Account Inactive</h1>
          <p className="text-slate-600 mb-6">
            Your account has been deactivated. Please contact your system administrator for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (profileStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-danger-muted rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Profile Error</h1>
          <p className="text-slate-600 mb-6">
            There was an error loading your profile. Please try again, or log in again to start a
            fresh session. Contact support if the problem persists.
          </p>
          {/* Recovery actions — this card used to be a dead end: no retry and
              no way back to login, which stranded users on a dead session
              until they cleared site data. */}
          <div className="space-y-3">
            <Button variant="primary" className="w-full" onClick={() => void retryProfile()} disabled={isRetrying}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying…' : 'Try Again'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
              <LogOut className="w-4 h-4 mr-2" />
              Log In Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Profile not present yet/anymore but not a hard error — e.g. the logout
  // transition (signOut clears profile before user) or a transient refetch.
  // Show the skeleton, never the dead-end error card, until the auth state
  // settles (redirect on signed-out, or profile resolves).
  if (!profile) {
    return <AuthLoadingSkeleton />;
  }

  // Forced password rotation: enforce on every route, not just /login, so a
  // deep link or browser refresh can't walk past an admin-mandated reset (H5).
  if (passwordResetRequired) {
    return <PasswordChangeModal isOpen userName={profile.full_name} />;
  }

  if (allowedRoles && profile && profile.role && !allowedRoles.includes(profile.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-danger mb-2">Access Denied</h1>
          <p className="text-slate-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children ?? <Outlet />}</>;
};
