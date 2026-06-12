import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useTenantFeature } from '../contexts/TenantConfigContext';

interface FeatureRouteProps {
  /** A tenant feature key from the registry (e.g. 'nav.financial'). */
  featureKey: string;
  /** Omit to use the guard as a pathless layout route — children render via <Outlet/>. */
  children?: React.ReactNode;
  /** Where to send the user when the feature is disabled. Defaults to the dashboard. */
  redirectTo?: string;
}

/**
 * Route-level guard for the Tenant Feature Management system. When the tenant has
 * disabled `featureKey`, a direct/deep-link to the route redirects instead of
 * rendering — so disabled modules aren't reachable by URL even though the sidebar
 * already hides them. Defense-in-depth only: data access is still governed by RLS
 * + role permissions. Compose INSIDE the existing ProtectedRoute (role) guard.
 */
export const FeatureRoute: React.FC<FeatureRouteProps> = ({
  featureKey,
  children,
  redirectTo = '/',
}) => {
  const enabled = useTenantFeature(featureKey);
  if (!enabled) return <Navigate to={redirectTo} replace />;
  return <>{children ?? <Outlet />}</>;
};

export default FeatureRoute;
