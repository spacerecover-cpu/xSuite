import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '../contexts/PermissionsContext';

interface ModuleRouteProps {
  /** A `role_module_permissions` module key (e.g. 'banking', 'employees'). */
  moduleKey: string;
  /** Omit to use the guard as a pathless layout route — children render via <Outlet/>. */
  children?: React.ReactNode;
  /** Where to send the user when the role has no access. Defaults to the dashboard. */
  redirectTo?: string;
}

/**
 * Route-level guard for `role_module_permissions`. The sidebar, the nav config and
 * the command palette all gate on `hasModuleAccess`, but nothing gated the ROUTES
 * — so a module hidden from a role stayed reachable by typing its URL. This is the
 * missing half: the same predicate, applied at the route.
 *
 * Defense-in-depth only: data access is still governed by RLS + the role policies.
 * Compose INSIDE the existing ProtectedRoute (role) guard, alongside FeatureRoute
 * (tenant feature). owner/admin short-circuit to true inside hasModuleAccess, so
 * admin-only route groups gain nothing from this and are left unwrapped.
 *
 * Renders nothing while permissions load: `hasModuleAccess` answers false for every
 * non-admin until the fetch resolves, and redirecting on that would bounce
 * legitimate users off their own deep links on every cold load. The dashboard (the
 * redirect target) is deliberately never wrapped, so there is no redirect loop.
 */
export const ModuleRoute: React.FC<ModuleRouteProps> = ({
  moduleKey,
  children,
  redirectTo = '/',
}) => {
  const { hasModuleAccess, loading } = usePermissions();
  if (loading) return null;
  if (!hasModuleAccess(moduleKey)) return <Navigate to={redirectTo} replace />;
  return <>{children ?? <Outlet />}</>;
};

export default ModuleRoute;
