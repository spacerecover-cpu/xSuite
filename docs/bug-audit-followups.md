# Bug Audit — Deferred Follow-ups (status)

Companion to `docs/bug-audit-2026-07-12.md`. The audit's 90 code bugs were fixed
across branches A–D (`d9b44b0`, `f1ce996`, `14c38c3`, `57242d0`). The
migration-dependent follow-ups were then built out once the Supabase MCP was
authorized. This file tracks their status.

## ✅ Resolved (migration applied + service wired, on PR #419)

All 8 migrations were applied to the live project (`ssmbegiyjivrcwgcqutu`) and are
recorded in `supabase/migrations.manifest.md`. Types regenerated (`2251931`);
services wired (`5b8cb63`). Each function is `SECURITY DEFINER` with
`SET search_path=public`, `REVOKE`d from `anon`, and enforces tenant/role internally.

| # | Migration | What it fixes |
|---|---|---|
| 27 | `fix_export_customer_name_key` | Customer export now emits key `customer_name` (matched import contract) so exported names aren't blank. (#28 device `serial_number` was already correct live.) |
| 79 | `fix_finalize_trailing_sequence_extract` | `data_migration_finalize` advances sequences from the trailing digit run, not all digits, so year/FY-prefixed numbers don't over-inflate the counter. |
| 63 | `quote_permanent_purge` | `quotes.purged_at` + `delete_quote_permanently(uuid)`; `permanentDeleteQuote` stamps it and `fetchDeletedQuotes` filters it, so a purged quote leaves the recycle bin instead of resetting its 30-day timer. |
| 75 | `get_next_number_for_tenant` | Tenant-parameterized numbering; the paypal-webhook mints invoice numbers under the service-role client. **Edge function still needs a deploy to take effect.** |
| 19 | `payroll_records_unique_per_period_employee` | Partial unique index makes duplicate payroll records impossible at the DB level (0 dupes verified first). |
| 40 | `atomic_account_balance_rpcs` | `execute_account_transfer` / `complete_account_transfer` / `adjust_account_balance` — row-locked atomic balance moves; concurrency lost-updates eliminated. |
| 87 | `atomic_issue_delivery_challan` | Advisory-locked, idempotent mint-and-append in one transaction — no serial gaps on transient failure, no duplicate rows on concurrency. |
| 35/36 | `stock_sale_reserved_and_discount_guards` | `record_stock_sale` guards on `quantity_available` (respects reservations) and caps a fixed discount at the subtotal. |
| 6 | (code only, `5b8cb63`) | Per-slot `signer_user_id` (null for external operator/witness) + signer-name field for non-typed signing methods on destruction certificates. |

## ⏳ Deferred — deploy-ordering (must apply AFTER the frontend deploys)

**#53 — leave-balance DB trigger.** Batch B added *client-side* balance accounting
that the currently-deployed frontend runs. A trigger that also mutates balances on
`leave_requests` status changes would **double-count** every approval until the new
frontend (with client accounting removed) is live. Sequence: **(1)** merge/deploy
PR #419, **(2)** in the same or a follow-up change remove the client-side
`applyLeaveBalanceDelta` calls in `leaveService.approve/reject/delete`, **(3)** then
apply the trigger below. Until then the working client-side fix stays.

```sql
-- Apply ONLY after the frontend no longer does client-side leave-balance accounting.
CREATE OR REPLACE FUNCTION public.apply_leave_balance_on_status_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_delta numeric := 0; v_year int;
BEGIN
  -- approve: consume; leave-approved (reject/cancel/soft-delete): restore
  IF (TG_OP = 'UPDATE') THEN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
       AND NEW.deleted_at IS NULL THEN
      v_delta := NEW.days;
    ELSIF OLD.status = 'approved'
       AND (NEW.status IS DISTINCT FROM 'approved' OR NEW.deleted_at IS NOT NULL) THEN
      v_delta := -OLD.days;
    END IF;
  END IF;
  IF v_delta <> 0 THEN
    v_year := EXTRACT(YEAR FROM COALESCE(NEW.start_date, OLD.start_date))::int;
    UPDATE leave_balances
       SET used_days = GREATEST(0, COALESCE(used_days,0) + v_delta),
           remaining_days = total_days - GREATEST(0, COALESCE(used_days,0) + v_delta),
           updated_at = now()
     WHERE tenant_id = NEW.tenant_id AND employee_id = NEW.employee_id
       AND leave_type_id = NEW.leave_type_id AND year = v_year;
  END IF;
  RETURN NEW;
END; $fn$;

CREATE TRIGGER trg_leave_balance_on_status_change
  AFTER UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION apply_leave_balance_on_status_change();
```

## ⏳ Deferred — no value today

**Inventory `adjust_inventory_quantity` RPC.** Would back `inventoryService`'s adjust
helper, but that helper has 0 call sites (dead code). The batch-D compare-and-set
already prevents lost updates / negative / phantom transactions. Add the RPC only when
the helper gains real callers.

## Notes

- **Edge-function deploys still required** for the code fixes to take effect:
  `paypal-webhook` (#75 numbering + the batch-A signature/`amount_cents` fixes),
  `provision-tenant`, and the portal/email functions. The SQL they rely on is live;
  the Deno code is committed but not deployed.
- Pre-existing, out-of-scope test issues (unchanged by this work, identical at baseline
  `65fa2ac`): the sandbox test runner has no Supabase env vars so ~24 suites fail to
  import, and 3 assertions fail (`chainOfCustodyParity` ×2, `legacyTeardown`).
