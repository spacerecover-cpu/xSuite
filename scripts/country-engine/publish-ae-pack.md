# Runbook — AE country pack: author → gate → dual-control publish (P3 WP-7 Task 29)

**Executed 2026-07-05 against the canonical DB `ssmbegiyjivrcwgcqutu`. Result: AE `statutory_ready`.**

Two platform admins (both `super_admin` in `platform_admins`, both `owner`/`tenant_id NULL` in `profiles`):
- **Admin A (author)** `d1139ac6-526c-4805-bbea-790985233725` (`support@xsuite.space`)
- **Admin B (approver)** `4db807ae-09f7-4db9-89b4-b7a68cf67fc0` (`dev@flowza.ai`)

Executed via `mcp__supabase__execute_sql` impersonating each admin with a transaction-local
JWT-claims `set_config` (`request.jwt.claims` → `{sub, role:'authenticated'}`), which resolves
`auth.uid()` + `is_platform_admin()` for the governed RPCs. In the app this is the Studio UI:
author in the editor tabs, **Run fixtures**, **Submit**, then a *different* admin clicks **Publish**.

## Repo fixtures (kernel-verified — the honest basis for `record_pack_test_result(pass=true)`)
`src/lib/regimes/simple_vat/fixtures/ae_standard_invoice.json` (VAT 5% → 50 / 1050) and
`ae_zero_rated_export.json` (export, base 2000 / tax 0). Wired into `simpleVat.test.ts`: **8/8 green**.
`input_document` is a full `TaxContext` — the same shape `runPublishGate` (kernel mode) consumes,
so one fixture serves both homes (repo + `master_country_pack_tests`).

## Step 1–2 — author + submit (admin A, one transaction)
`create_country_pack_draft(AE, …)` → `upsert_document_requirement` (buyer TRN block on B2B) →
`upsert_country_pack_test` ×2 (the two fixtures verbatim) → `record_pack_test_result(pass=true)` ×2
→ `submit_country_pack_for_review`. **AE's VAT 5% standard + zero rates were already seeded by
Phase 1/2 and satisfy the coverage gate, so no rate upsert was needed** (see Finding 3).

## Step 3 — dual-control publish (admin B) + verification
Negative first — publish as **author A**:
```
ERROR: publish_country_pack: dual control — the pack must have a recorded author distinct from the approver
```
Then publish as **admin B** → recorded gate result:
```json
{ "published": true, "config_status": "statutory_ready",
  "gate": { "dual_control": true, "blockers": [],
    "fixtures": { "total": 2, "passed": 2, "stale": 0 },
    "capabilities": { "required": ["simple_vat","prefix_numbering","generic_invoice","no_einvoice","gcc_return"], "missing": [] },
    "coverage": { "standard_rate": true, "invalid_requirement_conditions": 0, "numbering_over_max_length": 0, "numbering_missing_seq_token": 0 } } }
```
Persisted: `geo_countries.config_status='statutory_ready'`; `master_country_pack_versions` v1
`published`, `authored_by <> approved_by = true`, `effective_from = 2026-07-05`.

## Findings surfaced by executing the runbook (the governance RPCs had never been run end-to-end)
1. **submit staled fixtures** — `submit_country_pack_for_review` bumped `content_updated_at` via
   `_pack_touch`, so the Studio order (Run fixtures → Submit) marked fixtures stale and publish blocked.
   **Fixed** (migration `phase3_wp7_submit_no_content_bump`): a lifecycle transition audits without
   bumping content freshness.
2. **audit admin_id FK mismatch** — `platform_audit_logs.admin_id` FKs to `platform_admins.id`, but
   `_pack_touch`/submit inserted `auth.uid()` (= `platform_admins.user_id`, a *different* uuid) → every
   authoring RPC 23503'd. **Fixed** (migration `phase3_wp7_pack_audit_admin_id_fk`): shared
   `_pack_admin_id()` resolves `platform_admins.id` from `auth.uid()`.
3. **`upsert_country_tax_rate` is not idempotent** — with no `id` it always INSERTs, colliding with the
   pre-seeded effective rate on `uq_geo_country_tax_rates_effective`. The plan called these "idempotent
   upserts"; they are not. **Carry-forward:** add `ON CONFLICT (country_id, subdivision_id, component_code,
   tax_category, valid_from)` upsert semantics, or match-by-effective-key before INSERT. Runbook worked
   around it by relying on the already-seeded rates.
