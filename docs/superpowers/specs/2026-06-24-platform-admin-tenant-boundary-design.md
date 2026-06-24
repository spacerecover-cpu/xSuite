# Platform-admin ↔ tenant boundary — design

**Date:** 2026-06-24
**Status:** Approved (Approach 2)
**Author:** platform-admin routing rework

## Problem

A platform super-admin (`profiles.tenant_id IS NULL`, role `owner`/`admin`) who lands
on any tenant route renders the tenant shell (`AppLayout`). Because the RLS policies
grant platform admins `OR is_platform_admin()` visibility into every tenant, the tenant
pages then run their normal tenant-scoped queries **unscoped** and surface another
tenant's data (observed: an admin "inside" the *Space Data Recovery* tenant).

The app already routes platform admins to `/platform-admin` on login (`Login.tsx`) and
from the exact `/` path (`ProtectedRoute`), but the `/`-only guard misses every deep
tenant URL (bookmarks, typed `/cases`, links), and the redirect is entangled with the
generic auth guard.

## Decision

**Strict portal-only.** Platform admins live exclusively in `/platform-admin`. They are
redirected out of *any* tenant route and never mount `AppLayout`. No impersonation
(consistent with `PLATFORM_ADMIN_SETUP.md` → "No Impersonation"). The RLS
`OR is_platform_admin()` bypass stays — the portal's cross-tenant views need it.

## Design (Approach 2 — dedicated boundary guard)

### Components & responsibilities

- **`RequireTenantWorkspace`** *(new — `src/components/RequireTenantWorkspace.tsx`)*
  Single-purpose boundary guard. Assumes auth already passed (it renders inside
  `ProtectedRoute`). Reads `useAuth().profile`; if the user is a platform admin
  (`!tenant_id && role ∈ {owner, admin}`) → `<Navigate to="/platform-admin" replace />`.
  Otherwise renders `children ?? <Outlet/>` (so it works both as a wrapper and as a
  pathless layout route, mirroring `ProtectedRoute`).

- **`ProtectedRoute`** — drops the `isPlatformAdmin && location.pathname === '/'`
  redirect. Reverts to pure *authenticated → MFA → approved/active → password → role*.
  The boundary now lives in exactly one obvious place.

- **`ProtectedPlatformAdminRoute`** — unchanged. Still gates `/platform-admin` via the
  `is_platform_admin()` RPC; tenant users get the 403 "Access Denied" page.

- **`Login`** — unchanged. Still sends platform admins to `/platform-admin` (happy
  path); the guard is the safety net for deep links.

### Routing (`App.tsx`)

Wrap both tenant-context route groups with the guard, nested inside the existing
`ProtectedRoute` so auth runs first:

- The `/` tenant tree: `ProtectedRoute → RequireTenantWorkspace → ErrorBoundary → AppLayout`.
- The `/print/*` + `/onboarding` group: `ProtectedRoute → RequireTenantWorkspace (pathless) → routes`.

`/platform-admin` is **not** wrapped (it's under `ProtectedPlatformAdminRoute`), so there
is no redirect loop.

### Data flow

login → `Login` routes platform admins to `/platform-admin`; any direct hit on a tenant
URL → `RequireTenantWorkspace` bounces them **before** `AppLayout` mounts → tenant
config / name / data never resolve. The "Space Data Recovery" leak disappears as a side
effect (the shell never renders).

### Edge cases

- **No loop:** target `/platform-admin` isn't under the guard.
- **Truth source:** uses DB `profile.tenant_id`, not the `localStorage` tenant hint.
- **Null-tenant non-admin** (shouldn't exist): `isPlatformAdmin` is false → falls through
  to the normal approved/onboarding path, not the portal.
- **Transient null profile:** can't happen here — `ProtectedRoute` only renders children
  once the profile is approved; defensively, a null profile yields `isPlatformAdmin=false`
  (renders through, safe for tenant users).

## Testing

- Unit-test `RequireTenantWorkspace`: platform admin (null tenant + owner) → redirect to
  `/platform-admin`; tenant user → renders children; tenant **owner** (has tenant_id) →
  renders children (a tenant owner is not a platform admin).
- Existing `ProtectedRoute.test.tsx` stays green (it tests a tenant user at `/cases`).
- Full gate: tsc 0, eslint 0, `check:tokens`, full vitest, build.

## Out of scope

- Impersonation (explicitly declined).
- The RLS `OR is_platform_admin()` bypass (intentional; powers the portal).
- Reworking `TenantConfigContext` (already returns default config for null tenant; the
  guard makes it moot by preventing the shell from mounting).
