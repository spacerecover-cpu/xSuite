# Authentication Lifecycle Audit — xSuite

> _2026-06-19._ End-to-end audit of the authentication system, triggered by the "Profile Error" flash on logout. Covers staff/tenant auth, the customer portal, platform-admin, permissions, sessions/tokens, route protection, and cross-cutting reliability.

**Method.** Static analysis of the auth code + the deployed baseline migration. Two parallel read-only audits (staff auth; portal + cross-cutting) plus first-hand verification of the highest-impact findings.

**Confidence.** ✅ = verified firsthand in this review. ◐ = from the sub-audit with file:line evidence (high confidence). Where `database.types.ts` and the SQL migrations disagree, the **deployed migration is treated as truth**.

**Files reviewed.** `src/contexts/{AuthContext,PermissionsContext,PortalAuthContext,PlatformAdminContext}.tsx`, `src/components/{ProtectedRoute,ProtectedPortalRoute,ProtectedPlatformAdminRoute}.tsx`, `src/lib/{supabaseClient,mfaService,rolePermissionsService,portalUrlService,rateLimiter,logger}.ts`, `src/pages/auth/{Login,login/LoginForm}.tsx`, `src/pages/portal/PortalLogin.tsx`, `src/components/layout/PortalLayout.tsx`, `src/App.tsx`, `supabase/migrations/20260409000000_baseline_schema.sql`, `docs/portal-identity-design.md`.

---

## Executive summary

The reported "Profile Error on logout" is a **Medium** UX race — but the audit surfaced **far more serious issues**: an MFA gate that is bypassable on most session-establishment paths, and a customer-portal identity that is enforced only in client-side JS. Recurring theme: **every auth gate (MFA, password-reset, inactivity, role/module access, portal identity) is enforced only in the UI and only on certain entry paths, while the durable refresh token lives in `localStorage`.** Defense-in-depth is thin; server-side (RLS/AAL) does not back most of these gates.

### Priority index

| ID | Issue | Area | Priority |
|----|-------|------|----------|
| **C1** | MFA only evaluated in password `signIn` → bypassed on OAuth / browser-refresh / 2nd tab / token-refresh | MFA | **Critical** |
| **C2** | `ProtectedRoute` never checks `mfaPending` → MFA skippable by direct navigation | MFA | **Critical** |
| **C3** | Portal identity is forgeable client-side JSON in `sessionStorage` (no token); isolation is JS-only | Portal | **Critical** |
| **C4** | Portal reads run as `anon` vs `TO authenticated` policies → portal non-functional + latent cross-tenant leak if "fixed" wrong | Portal | **Critical** |
| **C5** | `change_portal_password`: no current-password check, stores unhashed, client calls a non-existent signature | Portal | **Critical** |
| **H1** | `needsMFAVerification()` fails open (returns "no MFA" on error) | MFA | High |
| **H2** | MFA redirect race — login redirects before `mfaPending` resolves | MFA | High |
| **H3** | Refresh/access tokens in `localStorage`; client auth options unhardened | Session | High |
| **H4** | No session-expiry handling distinct from manual logout (silent eject) | Session | High |
| **H5** | Password-reset-required gate is client-only, not in `ProtectedRoute`, no server enforcement | Login | High |
| **H6** | Role-keyed permission cache not cleared on logout/user-switch → stale/cross-tenant perms | Permissions | High |
| **H7** | In-flight profile fetch after logout → Profile Error + state resurrection (no cancellation) | Reliability | High |
| **H8** | Transient `fetchProfile` error → permanent dead-end "Profile Error" (no retry) | Reliability | High |
| **A1** | **"Profile Error" flash on logout (the reported bug)** — state-ordering race | Reliability | Medium |
| **M1** | Mid-session deactivation / role-null not enforced until re-auth | Edge case | Medium |
| **M2** | `mfa_enabled` flag dead; no mandatory-MFA policy | MFA | Medium |
| **M3** | manager/viewer role-enum mismatch → zero module access | Permissions | Medium |
| **M4** | Stale permissions for ≤5 min after a role change | Permissions | Medium |
| **M5** | Permissions load-order flicker / premature "Access Denied" | Permissions | Medium |
| **M6** | `profileStatus` never reset on `SIGNED_OUT` (stuck loading/error) | State | Medium |
| **M7** | Inactivity warning is dead UI; logout is client-only | Reliability | Medium |
| **M8** | `setSentryUser` never called → errors lack user/tenant context | Observability | Medium |
| **M9** | Portal logout: no server invalidation; sessionStorage re-paste re-enters | Portal | Medium |
| **M10** | Portal settings cache not cleared on logout (cross-tenant on shared device) | Portal | Medium |
| **M11** | Portal session timeout: default-until-resolved + expires only on navigation | Portal | Medium |
| **M12** | Portal deep-link lost after login (no `from`) | Portal | Medium |
| **M13** | Portal multi-tab logout not propagated | Portal | Medium |
| **M14** | Half-wired Google OAuth bypasses gates; dead "Forgot password?" link | Login | Medium |
| **M15** | Three diverging sources of truth for "is platform admin" | Platform-admin | Medium |
| **L1** | `onAuthStateChange` async IIFE → unhandled rejections | Reliability | Low |
| **L2** | Inactivity timer resets on token-refresh (`[user]` dep) | Reliability | Low |
| **L3** | Staff login double-submit; no client rate-limit (portal has one) | Login | Low |
| **L4** | Unvalidated `from` redirect; platform-admin landing conflict | Redirect | Low |
| **L5** | `tenant_id` in `localStorage` shared across staff/portal, stale on shared device | State | Low |
| **L6** | `PlatformAdminContext` treats transient error as "not admin" | Platform-admin | Low |
| **L7** | Portal logout uses push not replace (back-button wart) | Portal | Low |
| **L8** | `refreshProfile()` silently dropped if a boot fetch is in flight | Reliability | Low |

### Resolution status

Tracked across PR #280 (`claude/auth-lifecycle-fixes`, merged), PR #281 (`claude/auth-context-hardening`) and `claude/auth-frontend-polish` (supersedes #281; also carries the M1 migration record). Updated 2026-06-20.

| Status | Findings | Where landed |
|---|---|---|
| ✅ **Fixed** | **A1, H7, H8, M6** — logout flash + its independent co-triggers: error card renders only on a genuine `profileStatus === 'error'`; `signOut` is atomic (`setLoading(true)` + epoch bump, clears profile before the redirect); `fetchProfile` is epoch-guarded and retries transient failures with backoff; `profileStatus` resets on `SIGNED_OUT`. | `ProtectedRoute.tsx`, `AuthContext.tsx` |
| ✅ **Fixed** | **C1, C2, H1** — MFA gate: AAL recomputed on every session establishment (boot + `onAuthStateChange`, incl. `TOKEN_REFRESHED`) and cleared on sign-out; `ProtectedRoute` renders `MFAChallenge` when `mfaPending`; `needsMFAVerification` fails **closed**. | `AuthContext.tsx`, `ProtectedRoute.tsx`, `mfaService.ts` |
| ✅ **Fixed** | **H5, H6, M8, L1, L2, L4, L5, L8** — forced password-reset gated app-wide in `ProtectedRoute`; permission cache tenant-scoped + cleared on sign-out; `setSentryUser` wired on load/clear; auth-state IIFE caught; inactivity timer keyed on `user?.id`; `safeInternalRedirect` validates the post-login `from`; `tenant_id` cleared on `SIGNED_OUT`; `refreshProfile` force-bypass. | `ProtectedRoute.tsx`, `AuthContext.tsx`, `rolePermissionsService.ts`, `utils.ts`, `logger.ts` |
| ✅ **Fixed** | **H4, L7** — expiry vs manual-logout breadcrumb (`auth_session_expired`) surfaced on the login page; portal logout uses `{ replace: true }`. | `AuthContext.tsx`, `Login.tsx`, `PortalLayout.tsx` |
| ✅ **Fixed** | **M1** — `get_current_tenant_id()` now filters `is_active = true`, denying deactivated users at the resolver behind every RESTRICTIVE isolation policy (migration `20260620020115`; active users unaffected; no custom token hook so the JWT fallback is inert). | live DB + `supabase/migrations/` |
| ✅ **Fixed** | **M3** — manager/viewer are configurable (default none) via `role_module_permissions` (free-text role; no migration) instead of a hardcoded zero-access short-circuit; admin UI lists them. | `PermissionsContext.tsx`, `rolePermissionsService.ts`, `pages/admin/RolePermissions.tsx` |
| ✅ **Fixed (already live)** | **C5** — the deployed `change_portal_password(p_customer_id, p_current_password, p_new_password)` already verifies the current password via bcrypt and stores `crypt(new, gen_salt('bf'))`; `authenticate_portal_customer` uses bcrypt + lockout. The audit captured a since-superseded state; no 2-arg overload remains. | live DB (verified 2026-06-20) |
| ◑ **Mitigated** | **H2** — the *bypass* is closed by C2; residual is cosmetic only (brief render before the local AAL check settles). Tri-state polish deferred (low value, touches the MFA-critical path). | via C2 |
| ⛔ **Plan-ready — needs its own verified PR** | **C3, C4** — portal customers are still forgeable `sessionStorage` JSON read via the `anon` client. Implementation is fully specced in `docs/portal-identity-design.md` (Option A: `portal-login` edge fn minting a `role: 'portal'` JWT + dedicated Postgres `portal` role + `TO portal` RLS scoped to `get_current_portal_customer_id()`). **Held deliberately:** highest-blast-radius change; a role/RLS mistake leaks cross-tenant customer data, and it **cannot be E2E-verified here** (0 portal customers have a password hash, so portal login can't be exercised). Must land as a dedicated, staged, reviewed PR. **When it rewrites `get_current_tenant_id()`, preserve the `is_active = true` predicate added by M1.** | design doc |
| ⏳ **Open — needs server work / decision** | C1 server `aal2` backstop (N/A while MFA is voluntary per M2), **H3** (token storage hardening + CSP); **M2** = voluntary (dead `mfa_enabled` write may be removed in a later pass). | — |
| ⏳ **Open — triage (low value post-gates)** | **M5, M7, M9–M15, L3, L6** — mostly cosmetic or feature-level now that the security-bearing items are gated. | — |

> The ✅ markers in the per-finding headings below denote **verification confidence** (verified firsthand in this review), *not* resolution. Resolution is tracked only in the table above.

---

## A1 — "Profile Error" flashes on logout (the reported bug) ✅

1. **Issue.** Clicking Logout briefly renders the full red "Profile Error" card before redirecting to `/login`.
2. **Root cause.** State-ordering race. `AuthContext.signOut()` (`src/contexts/AuthContext.tsx:225‑235`) synchronously does `setProfile(null)` + `setProfileStatus('loading')` but **does not** set `loading=true`, and clears `profile` **before** `user` is cleared (that happens later via the `SIGNED_OUT` `onAuthStateChange`). During the gap, `ProtectedRoute` renders with `loading=false`, `user`=set, `profile=null`: line 49 `if (loading)` → false; line 53 `if (!user)` → false; **line 79 `if (profileStatus === 'error' || !profile)` → `!profile` true → "Profile Error".** A tick later `user` becomes null → line 53 redirects. The `setProfileStatus('loading')` is inert because the guard at line 49 checks the `loading` boolean, not `profileStatus`.
3. **Reproduction.** Log in as staff → Logout (`Sidebar.handleSignOut` → `await signOut()` → `navigate('/login')`). 100% reproducible (deterministic render between two commits; more visible under CPU throttle).
4. **Impact.** UX/trust only — no data/security impact — but a scary error on every logout looks broken.
5. **Recommended fix (two complementary).** (a) `ProtectedRoute.tsx:79` — render the Profile Error card only when `profileStatus === 'error'`; treat "no profile but not errored" as the loading skeleton. (b) `AuthContext.signOut()` — don't pre-clear `profile` while `user` is still set; let the single `SIGNED_OUT` event clear `user`+`profile` together, or set `loading=true` at the start of `signOut`. Also reset `profileStatus` on `SIGNED_OUT` (see M6).
6. **Priority.** Medium. **Note:** H7 and H8 are *additional, independent* triggers of this exact card — fix all three together.

---

## Critical

### C1 — MFA evaluated only in the password `signIn` path ✅
1. **Issue.** An MFA-enrolled user reaches the full app at `aal1` after OAuth, browser refresh, a second tab, or token refresh.
2. **Root cause.** `checkMFAStatus()` is called only inside `signIn` (`AuthContext.tsx:199`). `mfaPending` is set nowhere else; the boot path (`:101‑110`) and `onAuthStateChange` (`:112‑133`) never compute AAL; `signInWithGoogle` (`:202‑210`) has no AAL check; `TOKEN_REFRESHED` is explicitly skipped (`:124`).
3. **Reproduction.** Enroll TOTP, log in & pass MFA, then **refresh the browser** → `getSession` restores the aal1 session, `mfaPending` defaults false → app renders, no challenge. (Also: 2nd tab, Google sign-in.)
4. **Impact.** MFA is effectively decorative for session continuity. A persisted/stolen aal1 refresh token (H3) grants full access without the second factor. **Most serious staff-auth finding.**
5. **Recommended fix.** Compute AAL in a single effect on every session establishment (`INITIAL_SESSION`/`SIGNED_IN`/`TOKEN_REFRESHED`), set `mfaPending` regardless of entry path, and **enforce server-side** (RLS/RPCs requiring `aal2` for sensitive tables) so a client bypass isn't sufficient.
6. **Priority.** Critical.

### C2 — `ProtectedRoute` never checks `mfaPending` ✅
1. **Issue.** Even when `mfaPending` is true, direct/deep-link navigation renders protected pages — the challenge only exists on `/login`.
2. **Root cause.** `ProtectedRoute.tsx:45‑113` destructures only `user, profile, loading, profileStatus`; the sole `mfaPending` gate is `Login.tsx:54‑61`.
3. **Reproduction.** With MFA pending on `/login`, open a 2nd tab to `/cases` → renders; `MFAChallenge` never mounts.
4. **Impact.** Even after C1, the gate is bypassable by URL. Authentication-bypass class.
5. **Recommended fix.** In `ProtectedRoute`, `if (mfaPending) return <MFAChallenge/>` (or redirect to a challenge route) before rendering children.
6. **Priority.** Critical.

### C3 — Portal identity is forgeable client-side JSON ◐
1. **Issue.** A portal customer's identity is a plain object in `sessionStorage` (`portal_session`) — no JWT, no Supabase session. Editing it in devtools impersonates any customer/tenant.
2. **Root cause.** `PortalAuthContext.tsx:66‑91` (sessionStorage read/write); `authenticate_portal_customer` returns plain JSON with no token (`baseline_schema.sql:5235‑5250`); all scoping is `.eq('customer_id', …)` in JS; `is_portal_user()` reads a `portal_token` JWT claim that nothing sets and **no RLS policy references** (`baseline_schema.sql:5791‑5796`).
3. **Reproduction.** Log in as customer A → set `sessionStorage.portal_session` to B's id/tenant → reload → client queries scoped to B.
4. **Impact.** Cross-customer/cross-tenant access is prevented only by browser JS. (Currently masked by C4, which returns no data — but that makes a naive "fix" dangerous.) Already documented as a pending decision in `docs/portal-identity-design.md`.
5. **Recommended fix.** Implement the design doc's Option A: a `portal-login` edge function mints a signed JWT (role `portal`); a portal-scoped client sends it; `TO portal` RLS policies scope every table to `get_current_portal_customer_id()`; keep `.eq(customer_id)` as defense-in-depth only.
6. **Priority.** Critical (architectural).

### C4 — Portal reads run as `anon` against `TO authenticated` policies ◐
1. **Issue.** Portal pages query `cases`/`case_quotes`/`case_portal_visibility` via the anon client, but those SELECT policies are `TO authenticated` → **zero rows** for a logged-in customer (portal is non-functional).
2. **Root cause.** Policies `FOR SELECT TO authenticated USING(true)` (`baseline_schema.sql:6750, 6682, 6631`) + RESTRICTIVE tenant isolation keyed on `get_current_tenant_id()` which is NULL for anon (`:5511`); portal reads use the anon client (`portalVisibility.ts:19,29`; `PortalDashboard.tsx:59,87,109`).
3. **Reproduction.** Log in as a portal customer with cases → dashboard shows 0/0/0. (Also: per the design doc, 0 of 7 portal customers have a password hash, so login is impossible today.)
4. **Impact.** Portal broken; and the latent risk — loosening these to `anon` without the JWT design (C3) turns it into a live cross-tenant leak.
5. **Recommended fix.** Same real-`portal`-principal design as C3. Do **not** open these tables to `anon`.
6. **Priority.** Critical.

### C5 — `change_portal_password` is broken and insecure ◐
1. **Issue.** (a) Deployed RPC `change_portal_password(p_customer_id, p_new_hash)` does a bare `UPDATE … SET portal_password_hash = p_new_hash` — **no current-password check, no bcrypt** (`baseline_schema.sql:5259‑5269`). (b) The client calls a 3-arg signature `(p_customer_id, p_current_password, p_new_password)` that exists only in `database.types.ts:16773` — **no migration** → PostgREST can't resolve it → call errors. (c) If the 2-arg version ran, it would store the password **in plaintext**, then bcrypt login comparison fails.
2. **Root cause.** Deployed body vs client/type contract (`PortalAuthContext.tsx:230‑234`, `PortalSettings.tsx:42`).
3. **Reproduction.** Portal → Settings → change password → always "Current password is incorrect."
4. **Impact.** Feature broken; deployed function is a hole — anyone able to invoke it for a `p_customer_id` can reset that customer's password, unhashed.
5. **Recommended fix.** Replace with a `SECURITY DEFINER` RPC that verifies the current password against the stored bcrypt hash, `crypt(new, gen_salt('bf'))` before storing, restricted to the authenticated portal principal (post-C3). Regenerate `database.types.ts` from the real DB.
6. **Priority.** Critical.

---

## High

### H1 — `needsMFAVerification()` fails open ✅
- **Root cause.** `mfaService.ts:81‑89` returns `false` on `error` and in `catch`; `AuthContext.checkMFAStatus` also sets `mfaPending=false` on throw (`:184‑186`). **Repro.** A transient AAL-check error at sign-in admits an MFA user without a challenge. **Impact.** Security control silently disabled under degraded conditions. **Fix.** Fail closed (retry or treat as "challenge required"); log the error. **Priority.** High.

### H2 — MFA redirect race ◐
- **Root cause.** `signIn` sets `mfaPending` via an async `checkMFAStatus` (`AuthContext.tsx:199`) while `onAuthStateChange` independently loads the profile; `Login.tsx:45` redirects as soon as `profile && approved && !mfaPending`, and `mfaPending` defaults false. **Repro.** Slow `getAuthenticatorAssuranceLevel` → profile resolves first → redirect into app at aal1 before the challenge renders. **Impact.** MFA-challenge bypass. **Fix.** Make MFA status tri-state (`unknown|required|satisfied`); never redirect while `unknown`; or derive AAL synchronously in `onAuthStateChange`. **Priority.** High.

### H3 — Tokens in `localStorage`; client unhardened ✅
- **Root cause.** `supabaseClient.ts:16‑21` sets `persistSession/autoRefreshToken/detectSessionInUrl:true` but omits `storage`, `storageKey`, `flowType` → refresh token persists in `localStorage`. **Repro.** `localStorage['sb-<ref>-auth-token']` contains the refresh token. **Impact.** Any stored-XSS yields a long-lived, refresh-capable takeover that survives the (client-only) inactivity logout; mitigating control (MFA) is bypassable (C1). **Fix.** Strong CSP + output encoding; set explicit `storageKey` and `flowType:'pkce'`; most importantly back sessions with server-side controls. **Priority.** High (security).

### H4 — No session-expiry handling vs manual logout ◐
- **Root cause.** `onAuthStateChange` handles all null-session events identically (`AuthContext.tsx:127‑131`); `event` is ignored; no `SIGNED_OUT`/`USER_DELETED` branch. **Repro.** Revoke/expire the refresh token mid-task → next refresh fails → bounced to `/login` with no message, work lost. **Impact.** Confusing UX; looks like a random logout. **Fix.** Inspect `event`; on expiry route to `/login` with a "session expired" message; keep cached profile on transient refresh-time fetch errors instead of tearing down. **Priority.** High.

### H5 — Password-reset gate is client-only ✅(partial)
- **Root cause.** `passwordResetRequired` drives a modal only on `/login` (`Login.tsx:19‑23,45,76‑81`); `ProtectedRoute` doesn't read it (verified); no server/RLS tie-in (`baseline_schema.sql:2643`, `DEFAULT false`). **Repro.** Admin resets a logged-in user's password → user keeps working; on refresh `getSession` restores them straight to the app, modal never shows. **Impact.** Forced rotation is advisory, not enforced. **Fix.** Gate in `ProtectedRoute` (show `PasswordChangeModal`/block) and enforce server-side. **Priority.** High (security).

### H6 — Permission cache keyed by role only, not cleared on logout ◐
- **Root cause.** `rolePermissionsService` is a module singleton caching by **role** with a 5-min TTL (`rolePermissionsService.ts:101‑119`); `clearCache()` (`:249`) is never called from `AuthContext` on logout/user-switch. Module access is tenant-specific but cached under the role key. **Repro.** Tenant-A `technician` logs in → modules cached under `technician`; logs out; Tenant-B `technician` logs in within 5 min → sees A's cached modules. **Impact.** Stale/cross-tenant module visibility on shared devices (client-side tenant-isolation smell; server RLS still gates data). **Fix.** Key the cache by tenant (+user) and call `clearCache()` in `signOut` and on user switch. **Priority.** High.

### H7 — In-flight profile fetch after logout ◐ (secondary Profile-Error trigger)
- **Root cause.** `fetchProfile` has no cancellation/epoch guard (`AuthContext.tsx:54‑96`); `signOut` doesn't cancel it. A fetch in flight at logout resolves after — on error → `profileStatus='error'`; on success → repopulates `profile`/`profileCache` for a logged-out user. **Repro.** Throttle network, trigger `refreshProfile()`/boot, click Logout while pending. **Impact.** Profile Error screen or transient stale-auth window. **Fix.** Add an `authEpoch`/`AbortController`; bump in `signOut`; bail all `setState` if epoch changed; `setLoading(true)` at top of `signOut`. **Priority.** High.

### H8 — Transient `fetchProfile` error → permanent dead-end ◐
- **Root cause.** Any transient error (network/RLS) → `profileStatus='error'` (`AuthContext.tsx:89‑91`), no retry; `ProtectedRoute.tsx:79` renders a dead-end card; no fallback to `profileCache`. **Repro.** Throttle network and refresh while authenticated → stuck "Profile Error", manual reload required. **Impact.** A blip becomes a stuck error screen — a likely primary real-world source of the reported reports. **Fix.** Retry w/ backoff before flipping to `error`; fall back to cached profile; add a "Retry" action; distinguish "no row" (terminal) from "fetch failed" (transient). **Priority.** High.

---

## Medium

- **M1 — Mid-session deactivation/role-null latency ◐.** Same-user `TOKEN_REFRESHED` profile refetch is deliberately skipped (`AuthContext.tsx:122‑126`); no realtime on the `profiles` row. Deactivated/demoted users keep cached `approved` access until re-auth (RLS doesn't check `is_active`). **Fix.** Realtime subscribe to the user's profile row or heartbeat refetch; force `signOut` when `is_active=false`/role→null. **Priority.** Medium (offboarding security; lean High if offboarding matters).
- **M2 — Dead `mfa_enabled` / no mandatory MFA ◐.** `mfaService.ts:84‑85` only challenges already-enrolled users; `mfa_enabled` is written (`:96‑102`) but never read for gating. **Fix.** Gate enrollment on policy or document MFA as voluntary; remove the dead write. **Priority.** Medium.
- **M3 — manager/viewer enum mismatch ◐.** `AuthContext`/route `allowedRoles` include 8 roles; `rolePermissionsService` role union has 6 (no manager/viewer); `PermissionsContext.tsx:34‑38` hardcodes them to empty modules → those users see nothing. **Fix.** Reconcile enums; define intended access. **Priority.** Medium.
- **M4 — Stale permissions ≤5 min after role change ◐.** `rolePermissionsService.ts:105` TTL cache not invalidated on role change. **Fix.** `refreshPermissions()` (clears cache) when current user's role changes. **Priority.** Medium.
- **M5 — Permissions load-order flicker ◐.** `ProtectedRoute` gates only on `auth.loading`, not `permissions.loading` (`PermissionsContext.tsx:17‑21,60‑64`) → module-gated UI flickers hidden→shown; premature "Access Denied" possible. **Fix.** Fold permissions readiness into an `authReady` gate. **Priority.** Medium.
- **M6 — `profileStatus` not reset on `SIGNED_OUT` ◐.** `AuthContext.tsx:127‑131` leaves `profileStatus` at `loading`/`error`. **Fix.** Reset to a clean/`signed_out` status on the null-session branch. **Priority.** Medium (interacts with A1).
- **M7 — Dead inactivity warning; client-only logout ◐.** `AuthContext.tsx:141‑172`: the 5-min warning only flips a local boolean (renders nothing); `signOut()` is un-awaited; no server-side idle enforcement. **Fix.** Render a real countdown modal; await/catch `signOut`; pair with server session policy. **Priority.** Medium.
- **M8 — `setSentryUser` never called ◐.** Defined `logger.ts:112`, zero call sites → captured errors lack user/tenant/role; not cleared on logout. **Fix.** Call on profile load + `null` on signOut. **Priority.** Medium.
- **M9 — Portal logout: no server invalidation ◐.** `PortalAuthContext.tsx:255‑259` clears only sessionStorage; re-pasting the prior JSON re-enters. **Fix.** `await portalClient.auth.signOut()` once the JWT design lands. **Priority.** Medium (Low today, High post-C3).
- **M10 — Portal settings cache not cleared on logout ◐.** `portalUrlService.ts:20‑27` module cache (5 min) not cleared in `logout` → prior tenant's branding/timeout on a shared device. **Fix.** `clearPortalSettingsCache()` in logout; key by tenant/host. **Priority.** Medium.
- **M11 — Portal timeout default-until-resolved + nav-only expiry ◐.** `PortalAuthContext.tsx:125‑158` uses 1440-min default before settings resolve and only expires on `location.pathname` change → idle-but-stationary sessions never expire. **Fix.** Periodic wall-clock timer; re-check after settings resolve. **Priority.** Medium.
- **M12 — Portal deep-link lost after login ◐.** `ProtectedPortalRoute.tsx:91` redirects with no `from`; `PortalLogin.tsx:46` always → `/portal/dashboard`. Breaks emailed case links. **Fix.** Round-trip `from` (validated to `/portal/*`). **Priority.** Medium.
- **M13 — Portal multi-tab logout not propagated ◐.** sessionStorage is tab-scoped; no BroadcastChannel/storage listener → other tabs stay logged in. **Fix.** `BroadcastChannel('portal-auth')` or the JWT cutover. **Priority.** Medium.
- **M14 — Half-wired Google OAuth bypasses gates ◐.** `signInWithGoogle` exists (`AuthContext.tsx:202‑210`) but no button in `LoginForm`; `redirectTo: ${origin}/` would skip the `/login` MFA + reset gates. "Forgot password?" link has no `onClick`. **Fix.** Remove or finish (apply gates on the OAuth landing); wire/remove the link. **Priority.** Medium (High if OAuth ships before C1/C2).
- **M15 — Three sources of truth for platform-admin ◐.** `ProtectedRoute.tsx:97` (profile shape) vs `ProtectedPlatformAdminRoute.tsx:18` (`is_platform_admin()` RPC) vs `getCurrentPlatformAdmin` (`platform_admins` table, `platformAdminService.ts:625`). Different criteria can diverge. **Fix.** One authority (recommend `is_platform_admin()`). **Priority.** Medium.

---

## Low

- **L1 — `onAuthStateChange` async IIFE unhandled rejection ◐.** `AuthContext.tsx:112‑132` — no `.catch`. **Fix.** `.catch(logger.error)` + `finally` for `setLoading(false)`. 
- **L2 — Inactivity effect keyed on `user` object ◐.** `AuthContext.tsx:172` deps `[user]`; new `User` identity each token refresh resets `lastActivity`, extending idle timeout. **Fix.** Depend on `user?.id`; persist `lastActivity` in a ref.
- **L3 — Staff login double-submit / no client rate-limit ◐.** `Login.tsx:31‑42`; portal has `rateLimiter` (`PortalAuthContext.tsx:165`), staff doesn't. **Fix.** In-flight ref + client throttle for parity.
- **L4 — Unvalidated `from` redirect ◐.** `Login.tsx:48‑50` trusts `location.state.from`; conflicts with platform-admin landing (`ProtectedRoute.tsx:98`). Same-origin only (not a classic open redirect). **Fix.** Whitelist `from` to known prefixes; centralize landing logic.
- **L5 — `tenant_id` in localStorage shared/stale ◐.** `supabaseClient.ts:32‑62`; portal never sets/clears it; `resolveTenantId` trusts cache first. Server triggers stamp tenant regardless (low isolation risk). **Fix.** Clear on every signOut; never use for security.
- **L6 — PlatformAdminContext error-as-null ◐.** `PlatformAdminContext.tsx:24‑34` no `enabled:!!user`; transient error looks like "not admin". **Fix.** `enabled:!!user`; honor `error`/`isLoading`.
- **L7 — Portal logout push not replace ◐.** `PortalLayout.tsx:79` → back button returns to a protected page (flash). **Fix.** `{replace:true}`.
- **L8 — `refreshProfile()` dropped during boot fetch ◐.** Dedupe ref (`AuthContext.tsx:58`) no-ops a concurrent manual refresh. **Fix.** `force` param to bypass the in-flight guard.

---

## Cross-cutting themes & recommended remediation order

1. **The reported bug (A1) + its co-triggers (H7, H8, M6).** Cheap, high-visibility reliability win. Fix the `ProtectedRoute` guard + atomic `signOut` + fetch cancellation + retry. **Do first.**
2. **MFA enforcement (C1, C2, H1, H2).** Make AAL evaluation path-independent, enforce in `ProtectedRoute`, fail closed, and back it with server-side `aal2` policy. **Security-critical.**
3. **Portal identity (C3, C4, C5).** Already a pending architecture decision (`docs/portal-identity-design.md`); needs the signed-JWT/`TO portal` RLS design. **Do not** band-aid by opening tables to `anon`. C5 (password RPC) is independently exploitable and should be fixed regardless.
4. **Server-side backing for client gates (H5, H6, M1).** Password-reset, permission freshness, and deactivation should not rely on the client.
5. **Hardening & observability (H3, M8).** CSP/storage posture; wire `setSentryUser` so the above are debuggable in production.

**Scope note.** Fixes here touch shared auth context + RLS/migrations and are forensically/security sensitive (per CLAUDE.md). They should land as small, reviewed, TDD'd changes on a fresh branch from `main` — not bundled. The A1 cluster is the safe first increment; C1–C5 warrant their own design + review.
