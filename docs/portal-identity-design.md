> **DESIGN DOCUMENT — no code written yet.** Design for the portal-identity (real-JWT) migration (step 5 of the critical-fixes sequence in `docs/critical-fixes-scope.md`). This is the **highest-blast-radius change** in the program — it modifies `get_current_tenant_id()` (behind every tenant table's RESTRICTIVE isolation) and turns portal customers into real DB principals. It is held for an explicit architecture decision before any migration is applied.

## 1. Problem & verified current state

Portal customers are **not** database principals. Verified against the live DB + source:

- `authenticate_portal_customer(email, password)` is a `SECURITY DEFINER` RPC that bcrypt-checks credentials against `customers_enhanced` and returns **plain JSON** (id, tenant_id, name, …) — **no JWT, no Supabase session**.
- `PortalAuthContext` stores that JSON in **`sessionStorage`** and keeps using the shared **anon** Supabase client.
- `is_portal_user()` reads a `portal_token` JWT claim **that nothing ever sets** → always `false`. **0 RLS policies reference it.**
- `get_current_tenant_id()` = `SELECT tenant_id FROM profiles WHERE id = auth.uid()` → **NULL** for portal principals (no `auth.uid()`, no `profiles` row).
- Every portal page (`PortalCases`, `PortalDashboard`, `PortalReports`, `PortalPayments`, `PortalCommunications`, …) queries `.from('cases')` / `.from('case_reports')` directly via the anon client, scoping with `.eq('customer_id', customer.id)` **in client JS**.

**Consequence:** per-customer isolation is enforced only in the browser. Worse, because those tables' policies are `TO authenticated`, the anon role can't satisfy RLS at all — so the portal's direct queries are also functionally **unbacked**. This migration must therefore both **secure** (DB-enforced per-customer scoping) and **fix** (make data reachable) the portal.

## 2. Goal

Make a logged-in portal customer a real authenticated principal whose row access is **enforced by RLS**, scoped to **their own customer record only**, without weakening staff/tenant isolation anywhere.

## 3. The core risk (why this is design-first)

`get_current_tenant_id()` is the single function behind **every** tenant table's RESTRICTIVE `tenant_isolation` policy. Two failure modes:

1. **Tenant mis-resolution.** If we teach it to read a portal claim and get the precedence wrong, staff isolation could break app-wide. Mitigation: **profiles-first, portal-claim only as fallback, fail-closed** (NULL when neither resolves — which denies, never leaks).
2. **Role inheritance.** A Supabase JWT's `role` claim becomes the Postgres role. If portal principals are role `authenticated`, they inherit **every** `TO authenticated` permissive policy — including `cases_select USING(true)`. With a portal-aware `get_current_tenant_id()` returning their tenant, the RESTRICTIVE tenant policy would then pass for the **whole tenant**, leaking every customer's cases to every portal user. Any design that puts portal users in the `authenticated` role MUST add RESTRICTIVE per-customer scoping to every portal-reachable table, or it leaks.

These two are the entire reason this is a design gate, not a fan-out task.

## 4. Identity architecture — the decision

All options converge on the same RLS-scoping need; they differ in how the principal is minted and which Postgres role it runs as.

### Option A — Custom JWT + dedicated `portal` Postgres role  *(recommended)*
- New edge function `portal-login`: calls `authenticate_portal_customer`, then mints a JWT signed with `SUPABASE_JWT_SECRET`, claims `{ role: 'portal', sub: <customer_id>, portal_token, customer_id, tenant_id, exp }`.
- Create role `portal` (NOLOGIN), grant `authenticator` the ability to `SET ROLE portal`, grant `portal` only `SELECT`/needed DML on portal-reachable tables.
- Portal principals run as role `portal` → they **do not** inherit any `TO authenticated` policy. Default-deny: they see nothing except what we explicitly grant via `TO portal` policies scoped to `get_current_portal_customer_id()`.
- **Pros:** strongest isolation (a forgotten table = no access, not a leak); smallest reasoning surface; matches the existing `portal_token` claim intent.
- **Cons:** most infra (new role + grants + PostgREST role config + edge function with the JWT secret); token refresh handled manually.

### Option B — Custom JWT, role `authenticated` + RESTRICTIVE per-customer scoping everywhere
- Same edge function, but `role: 'authenticated'`; add a RESTRICTIVE policy `… AND (NOT is_portal_user() OR customer_id = get_current_portal_customer_id())` to **every** table a portal user can reach.
- **Pros:** reuses the existing `authenticated` role/grants.
- **Cons:** **fail-open by default** — forget one table and the whole tenant leaks to portal users. Largest audit surface; brittle. Not recommended.

### Option C — Real `auth.users` per portal customer
- Provision an `auth.users` row per portal customer; sign in with `supabase.auth.signInWithPassword`; map `auth.uid() → customer_id/tenant_id`.
- **Pros:** Supabase-native sessions / refresh / password-reset; no custom JWT minting.
- **Cons:** portal customers run as `authenticated` (same inheritance risk as B); dual password store (auth.users vs `customers_enhanced.portal_password_hash`); migrating existing portal customers into `auth.users`; two identity systems to keep in sync.

**Recommendation: Option A.** Default-deny via a dedicated role is the only option where a mistake fails closed. The extra infra is a one-time cost; the alternative (B/C) makes every future portal-reachable table a potential tenant-wide leak.

## 5. Tenant-resolution-first design (applies to all options)

Land these helpers **before** any RLS references them, and before any real portal JWT is issued (no JWT carries the claims yet, so these are inert no-ops on day one):

```sql
-- Portal customer id from the JWT claim (NULL for staff / anon).
create function get_current_portal_customer_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select nullif(current_setting('request.jwt.claims', true)::json->>'customer_id','')::uuid $$;

-- Tenant resolution: staff (profiles) FIRST, portal claim as fallback, else NULL (fail-closed).
-- NOTE: migration 20260620020115 (audit finding M1) added `and is_active = true` to the
-- profiles subquery to deny deactivated staff at the resolver. PRESERVE that predicate when
-- this function is rewritten for portal support — dropping it silently re-opens M1.
create or replace function get_current_tenant_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select coalesce(
     (select tenant_id from profiles where id = auth.uid() and is_active = true and deleted_at is null),
     nullif(current_setting('request.jwt.claims', true)::json->>'tenant_id','')::uuid
   ) $$;
```

`is_portal_user()` already checks `portal_token` — unchanged. The portal claim path only ever activates once the `portal-login` edge function issues a JWT carrying it, so steps below can land incrementally without affecting staff.

## 6. RLS scoping for portal principals (Option A)

For each portal-reachable table (`cases`, `case_devices`, `case_reports`, `case_communications`, `quotes`, `invoices`, `payments`, `case_portal_visibility`, …), add a policy `TO portal` that joins back to the customer:

```sql
create policy cases_portal_read on cases as permissive for select to portal
  using (customer_id = get_current_portal_customer_id());
-- child tables scope via their case_id -> cases.customer_id, e.g.:
create policy case_reports_portal_read on case_reports as permissive for select to portal
  using (exists (select 1 from cases c
                 where c.id = case_reports.case_id
                   and c.customer_id = get_current_portal_customer_id()));
```

Write paths a portal customer legitimately needs (quote approve/reject, manifest acceptance in C4) go through `SECURITY DEFINER` RPCs that re-check `get_current_portal_customer_id()` internally — not broad `TO portal` write grants.

## 7. Migration sequencing (the order that never mis-scopes)

1. **Helpers** (`get_current_portal_customer_id`, portal-aware `get_current_tenant_id`) — inert until a portal JWT exists. Verify staff isolation unchanged (RED/GREEN as before).
2. **`portal` role + grants** + PostgREST config. No principals use it yet.
3. **`TO portal` SELECT policies** on the reachable tables. Still no principals.
4. **`portal-login` edge function** (mint JWT) + **frontend**: a portal-scoped Supabase client that uses the minted JWT; `PortalAuthContext` stores the token (httpOnly-ish; at minimum not the plaintext password) and sets the session. Only now do portal principals exist.
5. **Cut over** portal pages to the portal client; delete the client-JS `.eq('customer_id', …)` reliance (RLS now enforces it). Keep `.eq` as defense-in-depth.
6. **Revoke** the fallback: once portal uses real JWTs, confirm no anon path reads case data.

Each step is its own PR; steps 1–3 are pure DB and reversible; step 4 is the security-sensitive one (edge function + auth) and gets its own review.

## 8. Verification plan

- **Staff unchanged:** existing authenticated-role sims (tenant A cannot read tenant B) must stay green after step 1.
- **Portal scoping:** simulate a `portal`-role JWT for customer X; assert X sees only X's cases; assert X sees **0** rows of another customer in the same tenant (the critical anti-leak test); assert X sees 0 staff-only tables.
- **Fail-closed:** a JWT with a `tenant_id` claim but no matching data returns 0 rows, never another tenant's.
- **No anon leak:** anon client still reads 0 case rows.

## 9. Rollback

Steps 1–3 are additive/reversible (drop the `TO portal` policies, restore the prior `get_current_tenant_id` body — staff path is byte-identical so this is safe). Step 4 (edge function + frontend) is feature-flagged: if disabled, portal falls back to the current sessionStorage flow (which is no worse than today).

## 10. Open decisions for the product owner
1. **Identity architecture** — Option A (dedicated `portal` role, recommended), B (authenticated + restrictive everywhere), or C (real `auth.users`).
2. **Token storage** — the minted JWT in memory + refresh, vs sessionStorage (today's posture). Affects XSS exposure.
3. **Scope of cut-over** — do all portal pages at once, or page-by-page behind the flag.

Until this lands, C4's customer manifest-acceptance stays **staff-attested** (the correct interim), and the C3 customer-facing gates remain staff-driven.

## 11. Go-live runbook — `portal-login` edge function

**Status (2026-06-01):** `supabase/functions/portal-login` is **deployed** (ACTIVE, `verify_jwt=false`) and **fails closed** — probed live, it returns `500 {"error":"jwt_secret_not_configured"}` because Supabase does not expose the JWT secret to edge functions by default. Go-live is gated on two owner-only inputs, then a live verification, then the frontend cutover.

1. **Set the JWT signing secret** (owner only — I cannot access it):
   `supabase secrets set PORTAL_JWT_SECRET=<project JWT secret>` (Dashboard → Project Settings → API → JWT Settings → *JWT Secret*). Optional: `PORTAL_JWT_TTL_SECONDS` (default `28800` = 8h).
2. **Set a portal password** for a test customer — today **0 of 7** portal-enabled customers have a `portal_password_hash`, so nobody can log in. Use the existing `change_portal_password` RPC (or seed a bcrypt hash) for one test account.
3. **Verify minting:** `curl -X POST https://<ref>.supabase.co/functions/v1/portal-login -H "apikey: <anon>" -H "Content-Type: application/json" -d '{"email":"<t>","password":"<p>"}'` → expect `200` + `access_token`. Decode it: claims must be `role:portal`, `customer_id`, `tenant_id`, `aud:authenticated`, `exp`.
4. **Verify the hosted gateway accepts `role='portal'`** (the one thing not provable without the secret): `curl "https://<ref>.supabase.co/rest/v1/cases?select=id,customer_id" -H "apikey: <anon>" -H "Authorization: Bearer <access_token>"` → must return **only that customer's** cases and **zero** of any other (the live counterpart of the role-sim anti-leak test that already passed at the DB layer). If PostgREST rejects the role, confirm Supabase gateway role config (the DB side — `grant portal to authenticator` — is already in place).
5. **Frontend cutover (next PR, only after 3–4 pass):** a portal-scoped Supabase client that sends the minted JWT; `PortalAuthContext.login` calls `portal-login` and stores the token (sessionStorage to match current posture; in-memory+short-TTL is the hardening option); cut the portal pages from the anon client + client-JS `customer_id` filter over to the portal client (RLS now enforces scoping — keep the `.eq` as defense-in-depth). Deliberately deferred here because it is unverifiable until steps 3–4 succeed, and a blind cutover would break the live portal.
