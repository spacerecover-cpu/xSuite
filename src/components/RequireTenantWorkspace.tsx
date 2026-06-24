import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface RequireTenantWorkspaceProps {
  /** Omit to use as a pathless layout route — children render via <Outlet/>. */
  children?: React.ReactNode;
}

/**
 * Boundary guard for the tenant workspace. Renders inside `ProtectedRoute`, so
 * auth/approval has already passed by the time it runs.
 *
 * A platform super-admin has no tenant (`tenant_id` null + owner/admin role) and
 * belongs in the `/platform-admin` portal — not a tenant's app shell. Redirect
 * them there so `AppLayout` (and its tenant config + cross-tenant, RLS-visible
 * data) never mounts for them. Tenant users — anyone with a `tenant_id` — pass
 * straight through.
 *
 * The reverse boundary (tenant users out of `/platform-admin`) is owned by
 * `ProtectedPlatformAdminRoute`.
 */
export const RequireTenantWorkspace: React.FC<RequireTenantWorkspaceProps> = ({ children }) => {
  const { profile } = useAuth();

  const isPlatformAdmin =
    !!profile && !profile.tenant_id && (profile.role === 'owner' || profile.role === 'admin');

  if (isPlatformAdmin) {
    return <Navigate to="/platform-admin" replace />;
  }

  return <>{children ?? <Outlet />}</>;
};
