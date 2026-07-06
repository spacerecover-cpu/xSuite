# P0 — Self-service tenant provisioning was broken (3 regressions) — ✅ RESOLVED 2026-07-06

**Found:** 2026-07-06, while provisioning the disposable IN test tenant for Phase 4 WP-S2.8.
**Impact:** **No new tenant could be provisioned** through `provision-tenant` (self-service signup *or* admin-provisioned) — every attempt returned HTTP 500 and soft-deleted the half-created tenant. This blocked all new-customer onboarding.
**Resolution (2026-07-06):** All three regressions fixed (R1 + R2 + R3). Owner chose **Option A** for R2 (the guard trusts `service_role`). Verified end-to-end: a real self-service `provision-tenant` call succeeded — HTTP **201**, tenant **`IND0003`** (`4c4c32db-bd06-4100-b106-7ccae2f70b48`), with every child insert (`company_settings`, `accounting_locales`, `legal_entities`, `onboarding_progress`) landing. See **Resolution — verified end-to-end** below.

Reproduced live on `ssmbegiyjivrcwgcqutu`: three attempts, each surfacing the next regression in the chain. The `provision-tenant` edge function creates a tenant, an auth user (via `auth.admin.createUser`), then — as the **service-role PostgREST client** — inserts `company_settings`, `accounting_locales`, `legal_entities`, `onboarding_progress`. Two of those steps are fail-loud (they soft-delete the tenant and rethrow); the others only `console.error`. The tenant-scoped inserts run with **no `get_current_tenant_id()` context** and **`is_platform_admin() = false`**.

## Regression 1 — `handle_new_user` didn't take the tenant-guard bypass  ✅ FIXED

`auth.admin.createUser` fires `handle_new_user` (AFTER INSERT on `auth.users`), which inserts the owner's `profiles` row with the new `tenant_id`. The BEFORE-INSERT guard `set_tenant_and_audit_fields` raises **`Cannot insert data for a different tenant` (P0001)** because `NEW.tenant_id ≠ get_current_tenant_id()` (NULL in GoTrue's admin txn), aborting `createUser` with *"Database error creating new user"*.

- **Fix applied** (migration `20260706152831`, `fix_handle_new_user_tenant_guard_bypass`): `handle_new_user` now `PERFORM set_config('app.bypass_tenant_guard','true',true)` before the insert — the guard's own transaction-local escape hatch. Safe: the `tenant_id` comes from service-role-controlled `raw_user_meta_data`. Verified: `createUser` then succeeds.

## Regression 2 — the tenant-guard blocks ALL service-role provisioning inserts  ✅ FIXED (Option A)

`set_tenant_and_audit_fields` (BEFORE INSERT on every tenant-scoped table) fires for the edge function's service-role inserts too (triggers run regardless of RLS). With no tenant context and `is_platform_admin()=false`, it rejected `company_settings`, `accounting_locales`, `legal_entities`, `onboarding_progress`. Verified: for the rolled-back tenant `d45782b9`, **0** rows landed in any of those tables.

The guard's authorization was `NEW.tenant_id = get_current_tenant_id() OR is_platform_admin() OR app.bypass_tenant_guard='true'`. A platform-level provisioner (service_role) satisfied none.

**Options considered (owner's call — this touches the guard on ~190 tables):**
1. Make the guard recognise `service_role`, OR
2. Refactor `provision-tenant` to do all its inserts inside a single `SECURITY DEFINER` RPC that sets `app.bypass_tenant_guard` for the duration (PostgREST can't set session config across its per-request connections).

**Fix applied — owner chose Option 1 (“Option A”)** (migration `restore_provisioning_tenant_guard_service_role`): the INSERT authorization condition gains `AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'`. `service_role` — the platform *machine* identity, which already bypasses RLS entirely — is now exempt in the same category as the `is_platform_admin()` *human* identity the guard already trusts. Only the INSERT condition changed; the UPDATE `tenant_id`-immutability branch and audit stamping are byte-identical.

**`IS DISTINCT FROM` (not `<>`) is deliberate.** With `<>`, an insert carrying no JWT claims yields `NULL <> 'service_role' = NULL`, which poisons the AND-chain (`… AND NULL` → the whole `IF` is NULL → *not* true → **no RAISE**), silently un-guarding legitimate no-context inserts (cron, direct SQL, trigger-internal). `IS DISTINCT FROM` yields TRUE there, so those stay guarded. Verified live in an isolated trigger harness on the real guard function:

| caller context (mismatched `tenant_id`, no bypass) | before fix | after fix |
|---|---|---|
| `service_role` JWT | BLOCKED | **ALLOWED** ✅ |
| `authenticated` JWT | BLOCKED | BLOCKED ✅ (no regression) |
| no JWT context (genuinely unset) | BLOCKED | BLOCKED ✅ (`(auth.jwt()->>'role') IS DISTINCT FROM 'service_role'` = TRUE) |
| `app.bypass_tenant_guard='true'` | ALLOWED | ALLOWED ✅ (existing hatch intact) |

## Regression 3 — `validate_country_config_overrides` is mis-attached to `legal_entities`  ✅ FIXED

The trigger function `validate_country_config_overrides()` references `NEW.country_config_overrides`, but it was attached to **both `tenants` (correct — has the column) and `legal_entities` (wrong — has no such column, only an entity-operational `config` column)**. So every `legal_entities` INSERT errored **`record "new" has no field "country_config_overrides"` (42703)** — the fail-loud step that rolled the tenant back once regressions 1 & 2 were cleared.

- **Fix applied:** `DROP TRIGGER trg_validate_country_config_overrides_entities ON public.legal_entities` (same migration as R2). This was a category error from the start: the trigger read the wrong column, *and* `legal_entities.config` holds entity-operational settings (`fiscal_year_start`/`timezone`/`entity_type`), not a jurisdiction-override map — and the legal-entity config-override *layer* is "transparent in Phase 1 (auto-collapse)" per `src/lib/country/buildConfigLayers.ts`, so no override validation is owed there yet. A purpose-built validation belongs on the correct column when that layer is activated. The correct `tenants` trigger is untouched (verified: 1 trigger remains on `tenants`, 0 on `legal_entities`).

## Resolution — verified end-to-end

After R1 (already live) + R2 + R3 (migration `restore_provisioning_tenant_guard_service_role`), a **real** self-service `provision-tenant` HTTP call (no `Authorization` header; OTP-gated) succeeded:

- HTTP **201** `{"success":true,"tenant_code":"IND0003", …}`.
- Full row-completeness confirmed for tenant `4c4c32db-bd06-4100-b106-7ccae2f70b48`: `tenants` (trial, INR, `resolved_country_config` synced) · owner `profiles` (tenant-scoped, role owner) · `company_settings` ×1 · `accounting_locales` ×1 (en-IN/INR) · `legal_entities` ×1 (primary, GSTIN `29AAACX0000X1ZW`) · `onboarding_progress` ×1. None of the `console.error`-only steps silently failed.

This is the true production signup path — new-customer onboarding is restored.

## Test-rig state left behind (disposable, safe to purge)

While diagnosing, these artifacts were created and NOT cleaned (kept for owner inspection):
- Auth user `92b93bd7-9a34-4943-96bc-8531117ce518` (`phase4-in-lab@spacedatarecovery.com`) — created by the first (partial) diagnosis; its profile points to the soft-deleted tenant `d45782b9`. It **cannot** be recycled into a new tenant (the guard's UPDATE branch makes `tenant_id` immutable), so the successful provision used a fresh email.
- Soft-deleted tenants `IND0001` (`f2ea7f96`, slug `in-test-lab-p4`) and `IND0002` (`d45782b9`, slug `in-test-lab-p4b`) — rolled back by the failed provisions.
- The **live** disposable IN test tenant is `IND0003` (`4c4c32db…`, slug `in-test-lab-p4c`, owner `phase4-in-lab2@spacedatarecovery.com`) — used by Phase 4 WP-S2.9; purge after S2 wraps.

## Consequence for Phase 4 WP-S2

WP-S2's **code is complete and reviewed** (S2.1–S2.7 + review fixes). With all three regressions fixed, `provision-tenant` works and the disposable IN test tenant `IND0003` is live, **unblocking S2.9** (live dry-run acceptance — env-gated probe).
