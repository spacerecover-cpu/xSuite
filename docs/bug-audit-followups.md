# Bug Audit — Deferred Follow-ups

Companion to `docs/bug-audit-2026-07-12.md`. The audit's 90 code bugs were fixed
across branches A–D (commits `d9b44b0`, `f1ce996`, `14c38c3`, `57242d0`). The items
below could **not** be fully closed in application code this session because they
require a Supabase migration (the Supabase MCP was not authenticated, so no
migration/type-gen could be applied) or deeper cross-surface work. Each carries
enough detail to action directly.

## A. Blocked on a Supabase migration (not applied this session)

| # | Area | What's needed |
|---|---|---|
| 27 | `data_migration_export_rpc` | Customer export RPC emits JSON key `name`; contract/import expect `customer_name` → every exported Customer Name is blank and re-import fails. Forward migration to emit `customer_name`. |
| 28 | `data_migration_export_rpc` | Device export RPC emits `serial`; contract/import expect `serial_number` → serials dropped on export. Forward migration to emit `serial_number`. |
| 79 | `data_migration_finalize` | Advancing number sequences strips **all** non-digits instead of just the trailing suffix → counter over-inflated for year-prefixed numbers. Forward migration to strip only the suffix. |
| 63 | `quotesService.permanentDeleteQuote` | Currently re-stamps `deleted_at` (a re-soft-delete), so the quote never leaves the Recycle Bin and each press resets the ~30-day purge timer. Add a SECURITY DEFINER `delete_quote_permanently(p_quote_id uuid)` RPC (mirror `delete_case_permanently`), regenerate types, then call it from `permanentDeleteQuote`; **or** add a `purged_at` column that `fetchDeletedQuotes` filters out. Hard `DELETE` is banned. |
| 75 | `paypal-webhook` invoice numbering | `get_next_number` resolves tenant via `auth.uid()`, which is null under the webhook's service-role client, so the sequence never advances (falls back to `INV-${Date.now()}`). The wrong-arg-name + swallowed-error surface defects are already fixed; real sequential numbering needs a tenant-parameterized `get_next_number(p_tenant, p_scope)` or a session GUC/JWT claim carrying the tenant. |
| 87 | `deliveryChallanService` | Non-atomic mint-then-append: a transient `log_case_history` failure throws after a number is minted, so a retry mints a fresh number and the consumed one becomes an unexplained gap; concurrent same-batch callers append duplicate rows. In-file re-read now converges the customer-facing number, but a SECURITY DEFINER RPC with an advisory lock / unique `(case_id, batch_id)` constraint is the real fix. |

## B. Harm closed in application code; DB backstop recommended

These no longer reproduce the described failure through the UI, but a DB-side guard
would make them un-bypassable (forensic-grade, per repo philosophy).

| # | Area | Recommended backstop |
|---|---|---|
| 6 | `documentSignatureService.captureStaffSignature` | Operator/witness signature rows still carry the approver's `signer_user_id`. Add an optional per-slot `signerUserId` (null for an external signer) + a signer-name field in `SignatureCaptureModal` for non-typed methods. (Signer-**name** attribution is already fixed.) |
| 35 / 36 | `record_stock_sale` RPC | Add an availability guard so reserved stock can't be sold (`on_hand - reserved`) and cap the fixed discount at subtotal server-side; also filter `getSaleableItems` on availability. (UI caps already applied.) |
| 40 | `bankingService` transfers/disbursements | Non-atomic read-modify-write balance updates can lose concurrent updates. Add `execute_account_transfer` / `adjust_account_balance` SECURITY DEFINER RPCs using `SELECT ... FOR UPDATE` + atomic increments. (Partial-failure compensation already added.) |
| 19 | `payrollService` period processing | Add a partial unique index `payroll_records(period_id, employee_id) WHERE deleted_at IS NULL` and an atomic SECURITY DEFINER RPC wrapping the status flip + record inserts + loan updates. (App-level compare-and-swap claim already added.) |
| 53 | `leaveService` | Move leave-balance mutation into a DB trigger/RPC on `leave_requests` status changes so non-UI write paths also account correctly. (Client-side approve/reject/delete balance accounting already added.) |
| — | `inventoryService` adjust | Optional: `adjust_inventory_quantity` RPC for single-transaction quantity + ledger insert. (Compare-and-set already prevents lost updates/negative/phantom; function is currently dead code.) |

## Notes

- Edge-function fixes (paypal-webhook, provision-tenant, portal/email functions) are
  committed in the repo but must be **deployed** separately (Supabase MCP not authed).
- Pre-existing, out-of-scope test issues (unchanged by this work, identical at baseline
  `65fa2ac`): the sandbox test runner has no Supabase env vars so ~24 suites fail to
  import; and 3 assertions fail (`chainOfCustodyParity` ×2, `legacyTeardown`).
