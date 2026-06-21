# Phase A.1 — Credit Notes (Data + Service Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add credit notes (issue / apply / void) to xSuite so a locked tax invoice can be reduced compliantly, with `balance_due`/settlement correctly accounting for applied credits — the keystone for invoice revision, partial-recovery discounts, and negotiated settlement.

**Architecture:** Credit-note-first (issued invoices stay immutable). Three new tenant-scoped tables (`credit_notes`, `credit_note_items`, `credit_note_allocations`) + an additive `invoices.credited_amount` column. All money mutation goes through three new `SECURITY DEFINER` RPCs that post to the append-only `financial_transactions` ledger and reverse output VAT in `vat_transactions`, mirroring the existing `record_payment`/`void_payment` pattern. The existing payment RPCs are surgically updated so `balance_due = total − amount_paid − credited_amount`. A pure TS helper (`invoicePermissions.ts`) folds `credited_amount` into settlement, and a typed `creditNoteService.ts` wraps the RPCs.

**Tech Stack:** Supabase Postgres 15 (PL/pgSQL `SECURITY DEFINER` RPCs via `mcp__supabase__apply_migration`), TypeScript, `database.types.ts` (regenerated via `mcp__supabase__generate_typescript_types`), Vitest (`vi.hoisted` + `vi.mock('./supabaseClient')`), TanStack Query.

**Spec:** `docs/superpowers/specs/2026-06-13-recovery-outcome-billing-design.md` (§3.1–3.3, §5, Phase A).

**Scope:** This plan is the **data + service layer only** — programmatically issuing/applying/voiding credit notes with correct balances and ledger/VAT postings, fully verifiable. The **UI + PDF + portal** (Settle/Revise wizard, credit-note editor, `CreditNoteDocument`) are a separate **Phase A.2** plan.

**Test reality:** The repo has no DB test harness (Vitest/jsdom only). SQL RPCs are verified with assertion queries via `mcp__supabase__execute_sql` wrapped in `BEGIN … ROLLBACK` (no test data persists). The pure TS helper and the service wrapper get real Vitest TDD.

> **Domain guardrails (CLAUDE.md):** every Supabase MCP call MUST pass `project_id = ssmbegiyjivrcwgcqutu`. New tenant tables MUST carry the full package (RLS enabled+forced, RESTRICTIVE isolation, `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index, soft delete). Never weaken append-only audit/custody or RESTRICTIVE isolation. Never write to `supabase/migrations/` by hand — use `mcp__supabase__apply_migration`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| migration `add_invoices_credited_amount` | additive `invoices.credited_amount` + `_base` | apply via MCP |
| migration `create_credit_notes_tables` | the 3 credit-note tables + full tenant package | apply via MCP |
| migration `credit_note_rpcs` | `issue/apply/void_credit_note` RPCs | apply via MCP |
| migration `payment_rpcs_credited_amount` | surgical derivation update to `record_payment`/`void_payment` (+ `payment_status` expr if generated) | apply via MCP |
| `src/types/database.types.ts` | generated types | regenerate (never hand-edit) |
| `src/lib/invoicePermissions.ts` | settlement/editability helper — fold in `credited_amount` | modify |
| `src/lib/invoicePermissions.test.ts` | unit tests for the derivation change | **create** |
| `src/lib/creditNoteService.ts` | typed RPC wrappers + reads | **create** |
| `src/lib/creditNoteService.test.ts` | service unit tests (mock `supabase.rpc`) | **create** |
| `src/lib/queryKeys.ts` | credit-note query keys | modify |

---

## Task 1: Introspect the live schema (CLAUDE.md "introspect first")

**Files:** none (read-only MCP queries; record findings in the PR description).

- [ ] **Step 1: Confirm `invoices` shape, whether `payment_status` is generated, and that `credited_amount` is absent**

Run via `mcp__supabase__execute_sql` (`project_id: ssmbegiyjivrcwgcqutu`):

```sql
SELECT column_name, data_type, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema='public' AND table_name='invoices'
  AND column_name IN ('total_amount','amount_paid','balance_due','credited_amount','payment_status','status','currency','exchange_rate')
ORDER BY column_name;
```

Expected: `credited_amount` **absent**. Note whether `payment_status` has `is_generated='ALWAYS'` and capture its `generation_expression` (decides Task 5 Step 3).

- [ ] **Step 2: Capture the current payment-RPC bodies (they may have evolved past migration `20260601092707`)**

```sql
SELECT pg_get_functiondef('public.record_payment(jsonb,jsonb)'::regprocedure);
SELECT pg_get_functiondef('public.void_payment(uuid)'::regprocedure);
```

Confirm the `balance_due`/`v_new_due` computation lines that Task 5 edits still match `total_amount − amount_paid`. If the body diverges, adapt Task 5's surgical edit to the live text (same intent: subtract `credited_amount`).

- [ ] **Step 3: Copy the established tenant-table package from a recent migration**

```sql
SELECT pg_get_functiondef('public.set_tenant_and_audit_fields()'::regprocedure);
```

Also list policies/trigger on a known tenant table to copy names exactly:

```sql
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy WHERE polrelid='public.payment_allocations'::regclass;
SELECT tgname FROM pg_trigger WHERE tgrelid='public.payment_allocations'::regclass AND NOT tgisinternal;
```

Expected: a RESTRICTIVE `*_tenant_isolation` policy using `tenant_id = get_current_tenant_id() OR is_platform_admin()`, and a `set_<table>_tenant_and_audit` BEFORE trigger calling `set_tenant_and_audit_fields()`. Use these exact names in Tasks 3.

- [ ] **Step 4: No commit** (read-only).

---

## Task 2: Add `invoices.credited_amount`

**Files:** migration `add_invoices_credited_amount` (MCP).

- [ ] **Step 1: Apply the additive migration**

`mcp__supabase__apply_migration` (`project_id: ssmbegiyjivrcwgcqutu`, name: `add_invoices_credited_amount`):

```sql
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS credited_amount      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credited_amount_base numeric NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_credited_amount_nonneg CHECK (credited_amount >= 0) NOT VALID;
ALTER TABLE public.invoices VALIDATE CONSTRAINT chk_invoices_credited_amount_nonneg;

COMMENT ON COLUMN public.invoices.credited_amount IS
  'Sum of applied non-cash credit notes (adjustment/refund/writeoff). balance_due = total_amount - amount_paid - credited_amount.';
```

- [ ] **Step 2: Verify**

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_name='invoices' AND column_name IN ('credited_amount','credited_amount_base');
```

Expected: `2`.

- [ ] **Step 3: Commit** — migration is applied to the live DB; record it in the migration manifest per `.github/PULL_REQUEST_TEMPLATE/migration.md` (the `migration-manifest` CI gate). Types regen happens in Task 6.

---

## Task 3: Create the credit-note tables

**Files:** migration `create_credit_notes_tables` (MCP).

- [ ] **Step 1: Apply the table migration** (use the exact trigger/policy names confirmed in Task 1)

`mcp__supabase__apply_migration` (name: `create_credit_notes_tables`):

```sql
-- ============ credit_notes (header) ============
CREATE TABLE public.credit_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_number text NOT NULL,
  credit_note_date   timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','issued','applied','void')),
  credit_type        text NOT NULL DEFAULT 'adjustment'
                       CHECK (credit_type IN ('adjustment','refund','advance_adjustment','writeoff')),
  invoice_id         uuid REFERENCES public.invoices(id),
  case_id            uuid REFERENCES public.cases(id),
  customer_id        uuid,
  company_id         uuid,
  currency           text NOT NULL DEFAULT 'USD',
  exchange_rate      numeric NOT NULL DEFAULT 1,
  rate_source        text NOT NULL DEFAULT 'derived',
  subtotal           numeric NOT NULL DEFAULT 0,
  tax_rate           numeric NOT NULL DEFAULT 0,
  tax_amount         numeric NOT NULL DEFAULT 0,
  total_amount       numeric NOT NULL DEFAULT 0,
  subtotal_base      numeric NOT NULL DEFAULT 0,
  tax_amount_base    numeric NOT NULL DEFAULT 0,
  total_amount_base  numeric NOT NULL DEFAULT 0,
  applied_amount     numeric NOT NULL DEFAULT 0,
  refunded_amount    numeric NOT NULL DEFAULT 0,
  reason_code        text,
  reason_notes       text,
  approved_by        uuid,
  approved_at        timestamptz,
  voided_at          timestamptz,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT chk_credit_notes_total_pos CHECK (total_amount > 0),
  CONSTRAINT chk_credit_notes_consumption CHECK (applied_amount + refunded_amount <= total_amount)
);

-- ============ credit_note_items (lines) ============
CREATE TABLE public.credit_note_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  description    text NOT NULL DEFAULT '',
  quantity       numeric NOT NULL DEFAULT 1,
  unit_price     numeric NOT NULL DEFAULT 0,
  discount       numeric NOT NULL DEFAULT 0,
  tax_rate       numeric NOT NULL DEFAULT 0,
  tax_amount     numeric NOT NULL DEFAULT 0,
  total          numeric NOT NULL DEFAULT 0,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

-- ============ credit_note_allocations (apply to invoices) ============
CREATE TABLE public.credit_note_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id),
  invoice_id     uuid NOT NULL REFERENCES public.invoices(id),
  amount         numeric NOT NULL,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT chk_credit_note_alloc_amount_pos CHECK (amount > 0)
);

-- Tenant package: RLS + RESTRICTIVE isolation + trigger + indexes (per table)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['credit_notes','credit_note_items','credit_note_allocations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                      USING (tenant_id = get_current_tenant_id() OR is_platform_admin())$p$,
                   t||'_tenant_isolation', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (true) WITH CHECK (true)$p$, t||'_ops', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
                      USING (has_role('admin'))$p$, t||'_delete_admin', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields()',
                   'set_'||t||'_tenant_and_audit', t);
    EXECUTE format('CREATE INDEX %I ON public.%I (tenant_id) WHERE deleted_at IS NULL',
                   'idx_'||t||'_tenant_id', t);
  END LOOP;
END $$;

CREATE UNIQUE INDEX uq_credit_notes_number_per_tenant
  ON public.credit_notes (tenant_id, credit_note_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_credit_notes_invoice_id ON public.credit_notes (invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_credit_notes_case_id    ON public.credit_notes (case_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_credit_note_items_cn    ON public.credit_note_items (credit_note_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_credit_note_alloc_cn    ON public.credit_note_allocations (credit_note_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_credit_note_alloc_inv   ON public.credit_note_allocations (invoice_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_credit_note_alloc_active
  ON public.credit_note_allocations (credit_note_id, invoice_id) WHERE deleted_at IS NULL;
```

> If Task 1 Step 3 showed a different ops/delete policy convention than the `_ops`/`_delete_admin` shapes above, match the live convention exactly.

- [ ] **Step 2: Verify the tenant-table requirements gate passes**

Run `scripts/check-tenant-table-requirements.sql` against the project (the `tenant-table-requirements` CI gate). Expected: no findings for the three new tables. Spot-check:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname IN ('credit_notes','credit_note_items','credit_note_allocations');
```

Expected: `relrowsecurity` and `relforcerowsecurity` both `t` for all three.

- [ ] **Step 3: Commit** — manifest entry per migration template.

---

## Task 4: Credit-note RPCs (`issue` / `apply` / `void`)

**Files:** migration `credit_note_rpcs` (MCP).

- [ ] **Step 1: Apply the RPC migration** (mirrors `record_payment` conventions: tenant guard, `auth.uid()`, base-currency helpers, `FOR UPDATE` locks, append-only ledger)

`mcp__supabase__apply_migration` (name: `credit_note_rpcs`):

```sql
-- issue_credit_note: create header + items, post revenue↓ and VAT reversal.
CREATE OR REPLACE FUNCTION public.issue_credit_note(p_cn jsonb, p_items jsonb)
 RETURNS public.credit_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid; v_uid uuid; v_base text; v_bdec int; v_ddec int;
  v_cur text; v_rate numeric; v_total numeric; v_tax numeric;
  v_cn public.credit_notes%ROWTYPE; v_num text; v_item jsonb;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'issue_credit_note: no tenant context' USING ERRCODE='insufficient_privilege'; END IF;
  v_uid := auth.uid();
  v_cur  := COALESCE(NULLIF(p_cn->>'currency',''),'USD');
  v_rate := COALESCE(NULLIF(p_cn->>'exchange_rate','')::numeric, 1);
  v_total:= (p_cn->>'total_amount')::numeric;
  v_tax  := COALESCE(NULLIF(p_cn->>'tax_amount','')::numeric, 0);
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'issue_credit_note: total_amount must be > 0' USING ERRCODE='check_violation'; END IF;
  IF COALESCE(NULLIF(p_cn->>'reason_code',''), NULLIF(p_cn->>'reason_notes','')) IS NULL THEN
    RAISE EXCEPTION 'issue_credit_note: a reason is required' USING ERRCODE='check_violation'; END IF;

  v_base := _fin_base_currency(v_tenant); v_bdec := _fin_currency_decimals(v_base); v_ddec := _fin_currency_decimals(v_cur);
  v_num  := get_next_number('credit_note');

  INSERT INTO credit_notes (
    tenant_id, credit_note_number, credit_note_date, status, credit_type,
    invoice_id, case_id, customer_id, company_id, currency, exchange_rate, rate_source,
    subtotal, tax_rate, tax_amount, total_amount,
    subtotal_base, tax_amount_base, total_amount_base, reason_code, reason_notes, created_by
  ) VALUES (
    v_tenant, v_num, COALESCE(NULLIF(p_cn->>'credit_note_date','')::timestamptz, now()), 'issued',
    COALESCE(NULLIF(p_cn->>'credit_type',''),'adjustment'),
    NULLIF(p_cn->>'invoice_id','')::uuid, NULLIF(p_cn->>'case_id','')::uuid,
    NULLIF(p_cn->>'customer_id','')::uuid, NULLIF(p_cn->>'company_id','')::uuid,
    v_cur, v_rate, COALESCE(NULLIF(p_cn->>'rate_source',''),'derived'),
    COALESCE(NULLIF(p_cn->>'subtotal','')::numeric, v_total - v_tax),
    COALESCE(NULLIF(p_cn->>'tax_rate','')::numeric, 0), v_tax, v_total,
    round((v_total - v_tax) * v_rate, v_bdec), round(v_tax * v_rate, v_bdec), round(v_total * v_rate, v_bdec),
    NULLIF(p_cn->>'reason_code',''), NULLIF(p_cn->>'reason_notes',''), v_uid
  ) RETURNING * INTO v_cn;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items)='array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO credit_note_items (tenant_id, credit_note_id, description, quantity, unit_price, discount, tax_rate, tax_amount, total, sort_order)
      VALUES (v_tenant, v_cn.id, COALESCE(v_item->>'description',''),
              COALESCE(NULLIF(v_item->>'quantity','')::numeric,1), COALESCE(NULLIF(v_item->>'unit_price','')::numeric,0),
              COALESCE(NULLIF(v_item->>'discount','')::numeric,0), COALESCE(NULLIF(v_item->>'tax_rate','')::numeric,0),
              COALESCE(NULLIF(v_item->>'tax_amount','')::numeric,0), COALESCE(NULLIF(v_item->>'total','')::numeric,0),
              COALESCE(NULLIF(v_item->>'sort_order','')::int,0));
    END LOOP;
  END IF;

  -- Revenue reduction (append-only ledger): negative income for the net (ex-VAT) value.
  INSERT INTO financial_transactions (tenant_id, transaction_type, amount, currency, transaction_date,
    description, reference_type, reference_id, exchange_rate, rate_source, amount_base, status, created_by)
  VALUES (v_tenant, 'income', -(v_total - v_tax), v_cur, v_cn.credit_note_date,
    'Credit note '||v_num, 'credit_note', v_cn.id, v_rate, 'derived', round(-(v_total - v_tax)*v_rate, v_bdec), 'posted', v_uid);

  -- Output VAT reversal feeds the VAT return.
  IF v_tax <> 0 THEN
    INSERT INTO vat_transactions (tenant_id, transaction_type, amount, vat_amount, reference_type, reference_id, transaction_date, description)
    VALUES (v_tenant, 'output_reversal', -(v_total - v_tax), -v_tax, 'credit_note', v_cn.id, v_cn.credit_note_date, 'Credit note '||v_num);
  END IF;

  RETURN v_cn;
END; $fn$;

-- apply_credit_note: allocate to invoice(s); adjustment/refund/writeoff → credited_amount,
-- advance_adjustment → amount_paid (prepaid cash). Recompute balance/status. Σ ≤ remaining credit.
CREATE OR REPLACE FUNCTION public.apply_credit_note(p_credit_note_id uuid, p_allocations jsonb)
 RETURNS public.credit_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid; v_uid uuid; v_cn public.credit_notes%ROWTYPE; v_ddec int;
  v_remaining numeric; v_alloc jsonb; v_amt numeric; v_inv_id uuid; v_inv public.invoices%ROWTYPE;
  v_new_paid numeric; v_new_credited numeric; v_new_due numeric; v_new_status text; v_applied numeric := 0;
  v_is_advance boolean;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'apply_credit_note: no tenant context' USING ERRCODE='insufficient_privilege'; END IF;
  v_uid := auth.uid();

  SELECT * INTO v_cn FROM credit_notes WHERE id=p_credit_note_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'apply_credit_note: credit note % not found', p_credit_note_id USING ERRCODE='foreign_key_violation'; END IF;
  IF v_cn.tenant_id <> v_tenant THEN RAISE EXCEPTION 'apply_credit_note: cross-tenant' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_cn.status NOT IN ('issued','applied') THEN RAISE EXCEPTION 'apply_credit_note: status % not applyable', v_cn.status USING ERRCODE='check_violation'; END IF;

  v_is_advance := (v_cn.credit_type = 'advance_adjustment');
  v_ddec := _fin_currency_decimals(v_cn.currency);
  v_remaining := round(v_cn.total_amount - v_cn.applied_amount - v_cn.refunded_amount, v_ddec);

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_amt := (v_alloc->>'amount')::numeric; v_inv_id := (v_alloc->>'invoice_id')::uuid;
    IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'apply_credit_note: amount must be > 0' USING ERRCODE='check_violation'; END IF;

    SELECT * INTO v_inv FROM invoices WHERE id=v_inv_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'apply_credit_note: invoice % not found', v_inv_id USING ERRCODE='foreign_key_violation'; END IF;
    IF v_inv.tenant_id <> v_tenant THEN RAISE EXCEPTION 'apply_credit_note: invoice cross-tenant' USING ERRCODE='insufficient_privilege'; END IF;
    IF COALESCE(v_inv.currency,'USD') <> v_cn.currency THEN RAISE EXCEPTION 'apply_credit_note: currency mismatch' USING ERRCODE='check_violation'; END IF;
    IF v_amt > round(COALESCE(v_inv.balance_due,0), v_ddec) THEN RAISE EXCEPTION 'apply_credit_note: allocation % exceeds invoice balance %', v_amt, v_inv.balance_due USING ERRCODE='check_violation'; END IF;

    INSERT INTO credit_note_allocations (tenant_id, credit_note_id, invoice_id, amount, created_by)
    VALUES (v_tenant, p_credit_note_id, v_inv_id, v_amt, v_uid);

    v_new_paid     := COALESCE(v_inv.amount_paid,0)     + CASE WHEN v_is_advance THEN v_amt ELSE 0 END;
    v_new_credited := COALESCE(v_inv.credited_amount,0) + CASE WHEN v_is_advance THEN 0 ELSE v_amt END;
    v_new_due      := round(COALESCE(v_inv.total_amount,0) - v_new_paid - v_new_credited, v_ddec);
    v_new_status   := CASE WHEN v_new_due <= 0 THEN 'paid' WHEN (v_new_paid + v_new_credited) > 0 THEN 'partial' ELSE 'sent' END;

    UPDATE invoices SET
      amount_paid = round(v_new_paid, v_ddec),
      credited_amount = round(v_new_credited, v_ddec),
      balance_due = GREATEST(0, v_new_due),
      amount_paid_base = round(v_new_paid * COALESCE(v_inv.exchange_rate,1), _fin_currency_decimals(_fin_base_currency(v_tenant))),
      credited_amount_base = round(v_new_credited * COALESCE(v_inv.exchange_rate,1), _fin_currency_decimals(_fin_base_currency(v_tenant))),
      balance_due_base = round(GREATEST(0, v_new_due) * COALESCE(v_inv.exchange_rate,1), _fin_currency_decimals(_fin_base_currency(v_tenant))),
      status = v_new_status,
      paid_at = CASE WHEN v_new_due <= 0 THEN now() ELSE paid_at END
    WHERE id = v_inv_id;

    v_applied := v_applied + v_amt;
  END LOOP;

  IF round(v_applied, v_ddec) > v_remaining THEN
    RAISE EXCEPTION 'apply_credit_note: applied % exceeds remaining credit %', v_applied, v_remaining USING ERRCODE='check_violation';
  END IF;

  UPDATE credit_notes SET applied_amount = applied_amount + v_applied,
    status = CASE WHEN applied_amount + v_applied + refunded_amount >= total_amount THEN 'applied' ELSE status END
  WHERE id = p_credit_note_id RETURNING * INTO v_cn;
  RETURN v_cn;
END; $fn$;

-- void_credit_note: reverse allocations + ledger + VAT (append-only), mark void.
CREATE OR REPLACE FUNCTION public.void_credit_note(p_credit_note_id uuid, p_reason text)
 RETURNS public.credit_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid; v_uid uuid; v_cn public.credit_notes%ROWTYPE; v_ddec int; v_bdec int; v_base text;
  v_a RECORD; v_inv public.invoices%ROWTYPE; v_is_advance boolean; v_new_paid numeric; v_new_credited numeric; v_new_due numeric; v_new_status text;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'void_credit_note: no tenant context' USING ERRCODE='insufficient_privilege'; END IF;
  v_uid := auth.uid();
  SELECT * INTO v_cn FROM credit_notes WHERE id=p_credit_note_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'void_credit_note: not found' USING ERRCODE='foreign_key_violation'; END IF;
  IF v_cn.tenant_id <> v_tenant THEN RAISE EXCEPTION 'void_credit_note: cross-tenant' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_cn.status = 'void' THEN RAISE EXCEPTION 'void_credit_note: already void' USING ERRCODE='check_violation'; END IF;
  IF v_cn.refunded_amount > 0 THEN RAISE EXCEPTION 'void_credit_note: refunded credit cannot be voided' USING ERRCODE='check_violation'; END IF;
  IF COALESCE(NULLIF(p_reason,''),'') = '' THEN RAISE EXCEPTION 'void_credit_note: reason required' USING ERRCODE='check_violation'; END IF;

  v_is_advance := (v_cn.credit_type='advance_adjustment');
  v_base := _fin_base_currency(v_tenant); v_bdec := _fin_currency_decimals(v_base); v_ddec := _fin_currency_decimals(v_cn.currency);

  FOR v_a IN SELECT invoice_id, amount FROM credit_note_allocations WHERE credit_note_id=p_credit_note_id AND deleted_at IS NULL LOOP
    SELECT * INTO v_inv FROM invoices WHERE id=v_a.invoice_id FOR UPDATE;
    IF FOUND THEN
      v_new_paid     := GREATEST(0, COALESCE(v_inv.amount_paid,0)     - CASE WHEN v_is_advance THEN v_a.amount ELSE 0 END);
      v_new_credited := GREATEST(0, COALESCE(v_inv.credited_amount,0) - CASE WHEN v_is_advance THEN 0 ELSE v_a.amount END);
      v_new_due      := round(COALESCE(v_inv.total_amount,0) - v_new_paid - v_new_credited, v_ddec);
      v_new_status   := CASE WHEN v_new_due <= 0 THEN 'paid' WHEN (v_new_paid + v_new_credited) > 0 THEN 'partial' ELSE 'sent' END;
      UPDATE invoices SET amount_paid=round(v_new_paid,v_ddec), credited_amount=round(v_new_credited,v_ddec),
        balance_due=GREATEST(0,v_new_due), status=v_new_status,
        paid_at = CASE WHEN v_new_due <= 0 THEN paid_at ELSE NULL END
      WHERE id=v_a.invoice_id;
    END IF;
  END LOOP;

  UPDATE credit_note_allocations SET deleted_at=now() WHERE credit_note_id=p_credit_note_id AND deleted_at IS NULL;

  INSERT INTO financial_transactions (tenant_id, transaction_type, amount, currency, transaction_date,
    description, reference_type, reference_id, exchange_rate, rate_source, amount_base, status, created_by)
  VALUES (v_tenant, 'income', (v_cn.total_amount - v_cn.tax_amount), v_cn.currency, now(),
    'Void credit note '||v_cn.credit_note_number||' — '||p_reason, 'credit_note', v_cn.id, v_cn.exchange_rate, 'derived',
    round((v_cn.total_amount - v_cn.tax_amount)*v_cn.exchange_rate, v_bdec), 'posted', v_uid);
  IF v_cn.tax_amount <> 0 THEN
    INSERT INTO vat_transactions (tenant_id, transaction_type, amount, vat_amount, reference_type, reference_id, transaction_date, description)
    VALUES (v_tenant, 'output_reversal', (v_cn.total_amount - v_cn.tax_amount), v_cn.tax_amount, 'credit_note', v_cn.id, now(), 'Void credit note '||v_cn.credit_note_number);
  END IF;

  UPDATE credit_notes SET status='void', applied_amount=0, voided_at=now(), reason_notes=COALESCE(reason_notes,'')||' | VOID: '||p_reason
  WHERE id=p_credit_note_id RETURNING * INTO v_cn;
  RETURN v_cn;
END; $fn$;

REVOKE ALL ON FUNCTION public.issue_credit_note(jsonb,jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.apply_credit_note(uuid,jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.void_credit_note(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_credit_note(jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_note(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_credit_note(uuid,text) TO authenticated;
```

> **Confirm before applying:** that `vat_transactions` accepts the `transaction_type` value `'output_reversal'` (Task 1 can `SELECT DISTINCT transaction_type FROM vat_transactions` or inspect any CHECK). If a CHECK constrains it, use an allowed value (e.g. `'output'` with a negative amount) — same net effect.

- [ ] **Step 2: Verify behavior with a rolled-back transaction** (no data persists)

Via `mcp__supabase__execute_sql`, against a real issued tax invoice id `$INV` for the current tenant:

```sql
BEGIN;
SELECT balance_due AS before FROM invoices WHERE id='$INV';
SELECT issue_credit_note(
  jsonb_build_object('invoice_id','$INV','credit_type','adjustment','currency',(SELECT currency FROM invoices WHERE id='$INV'),
                     'total_amount',10,'tax_amount',0,'reason_code','test'), '[]'::jsonb) AS cn;
-- apply it (use the returned id):
SELECT apply_credit_note((SELECT id FROM credit_notes ORDER BY created_at DESC LIMIT 1),
  jsonb_build_array(jsonb_build_object('invoice_id','$INV','amount',10)));
SELECT credited_amount, balance_due AS after FROM invoices WHERE id='$INV';
ROLLBACK;
```

Expected: `after = before − 10`, `credited_amount = 10`, one `financial_transactions` row with `reference_type='credit_note'` and negative amount. Then verify `void_credit_note` restores `credited_amount` to 0 and posts the reversing entry (repeat in a second `BEGIN…ROLLBACK`).

- [ ] **Step 3: Commit** — manifest entry.

---

## Task 5: Teach the payment RPCs about `credited_amount`

**Files:** migration `payment_rpcs_credited_amount` (MCP). Uses the live bodies captured in Task 1 Step 2.

- [ ] **Step 1: In `record_payment`, subtract credited_amount in the balance computation**

In the live `record_payment` body, replace:

```sql
v_new_due  := round(COALESCE(v_inv.total_amount, 0) - v_new_paid, v_doc_decimals);
```
with:
```sql
v_new_due  := round(COALESCE(v_inv.total_amount, 0) - v_new_paid - COALESCE(v_inv.credited_amount, 0), v_doc_decimals);
```
and the status line:
```sql
v_new_status := CASE WHEN v_new_due <= 0 THEN 'paid'
                     WHEN v_new_paid > 0 THEN 'partial'
                     ELSE 'sent' END;
```
with:
```sql
v_new_status := CASE WHEN v_new_due <= 0 THEN 'paid'
                     WHEN (v_new_paid + COALESCE(v_inv.credited_amount,0)) > 0 THEN 'partial'
                     ELSE 'sent' END;
```
Re-`CREATE OR REPLACE` the full function with these two lines changed (keep everything else identical to the captured body).

- [ ] **Step 2: Apply the same two-line change to `void_payment`** (its `v_new_due`/`v_new_status` block), re-`CREATE OR REPLACE`.

- [ ] **Step 3: If `payment_status` is a generated column (Task 1 Step 1), update its expression to include credits**

Only if `is_generated='ALWAYS'`. Generated columns can't be altered in place — drop and re-add inside the migration:

```sql
ALTER TABLE public.invoices DROP COLUMN payment_status;
ALTER TABLE public.invoices ADD COLUMN payment_status text GENERATED ALWAYS AS (
  CASE WHEN (COALESCE(amount_paid,0) + COALESCE(credited_amount,0)) >= COALESCE(total_amount,0) AND COALESCE(total_amount,0) > 0 THEN 'paid'
       WHEN (COALESCE(amount_paid,0) + COALESCE(credited_amount,0)) > 0 THEN 'partial'
       ELSE 'unpaid' END) STORED;
```
(Re-create any index/view that depended on it — check `pg_depend` first. If `payment_status` is **not** generated, skip this step entirely.)

- [ ] **Step 4: Verify** — re-run the Task 4 Step 2 rollback test; additionally confirm a `record_payment` on a credited invoice computes `balance_due = total − paid − credited`. Expected: correct, non-negative balances; `payment_status` reflects credits.

- [ ] **Step 5: Commit** — manifest entry.

---

## Task 6: Regenerate `database.types.ts`

**Files:** `src/types/database.types.ts`.

- [ ] **Step 1: Regenerate** via `mcp__supabase__generate_typescript_types` (`project_id: ssmbegiyjivrcwgcqutu`); write the full output to `src/types/database.types.ts` (never hand-edit).

- [ ] **Step 2: Verify** — `npm run check:tsc`. Expected: `OK: tsc clean (0 errors)`. New `credit_notes`/`credit_note_items`/`credit_note_allocations` row types and `invoices.credited_amount` should now exist.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.types.ts
git commit -m "feat(db): credit-note tables, RPCs, and credited_amount derivation"
```

---

## Task 7: Fold `credited_amount` into the settlement helper (TDD)

**Files:** Modify `src/lib/invoicePermissions.ts`; Create `src/lib/invoicePermissions.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/invoicePermissions.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabaseClient', () => ({ supabase: {}, resolveTenantId: vi.fn() }));
import { getPaymentSummary, getInvoiceEditability } from './invoicePermissions';

describe('credited_amount in settlement', () => {
  it('counts credit notes toward settlement: 100 total, 60 paid, 40 credited => paid, balance 0', () => {
    const s = getPaymentSummary({ status: 'sent', total_amount: 100, amount_paid: 60, credited_amount: 40 });
    expect(s.balance).toBe(0);
    expect(s.settlement).toBe('paid');
  });

  it('partial when only credited: 100 total, 0 paid, 30 credited => partial, balance 70', () => {
    const s = getPaymentSummary({ status: 'sent', total_amount: 100, amount_paid: 0, credited_amount: 30 });
    expect(s.balance).toBe(70);
    expect(s.settlement).toBe('partial');
  });

  it('prefers explicit balance_due when provided', () => {
    const s = getPaymentSummary({ status: 'sent', total_amount: 100, amount_paid: 60, credited_amount: 40, balance_due: 0 });
    expect(s.balance).toBe(0);
  });

  it('a fully-credited invoice is financially locked', () => {
    const e = getInvoiceEditability({ status: 'sent', total_amount: 100, amount_paid: 0, credited_amount: 100 });
    expect(e.isLocked).toBe(true);
    expect(e.mode).toBe('restricted');
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/invoicePermissions.test.ts`
Expected: FAIL (settlement ignores `credited_amount`; first test gets `partial`/balance 40).

- [ ] **Step 3: Implement**

In `src/lib/invoicePermissions.ts`:
- Add to `InvoiceFinancials`: `credited_amount?: number | null;`
- In `deriveSettlement`, fold credits into the fallback branch:

```ts
function deriveSettlement(inv: InvoiceFinancials): Settlement {
  const ps = inv.payment_status;
  if (ps === 'unpaid' || ps === 'partial' || ps === 'paid') return ps;
  const total = num(inv.total_amount);
  const settled = num(inv.amount_paid) + num(inv.credited_amount);
  if (settled >= total && total > 0) return 'paid';
  if (settled > 0) return 'partial';
  return 'unpaid';
}
```
- In `getPaymentSummary`, make the balance/progress fallback include credits:

```ts
const settled = paid + num(inv.credited_amount);
const balance = inv.balance_due != null ? Math.max(0, num(inv.balance_due)) : Math.max(0, total - settled);
const progress = total > 0 ? Math.min(1, Math.max(0, settled / total)) : settled > 0 ? 1 : 0;
```
(Keep `paid` as `num(inv.amount_paid)` for the returned `paid` field; only balance/progress/settlement use `settled`.)

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/invoicePermissions.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoicePermissions.ts src/lib/invoicePermissions.test.ts
git commit -m "feat(invoices): count credit notes toward settlement"
```

---

## Task 8: `creditNoteService.ts` typed wrappers (TDD)

**Files:** Create `src/lib/creditNoteService.ts`; Create `src/lib/creditNoteService.test.ts`. Modify `src/lib/queryKeys.ts`.

- [ ] **Step 1: Write the failing test** (mock the supabase client per the repo pattern)

Create `src/lib/creditNoteService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { rpc, from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
import { issueCreditNote, applyCreditNote, voidCreditNote } from './creditNoteService';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('creditNoteService', () => {
  it('issueCreditNote calls issue_credit_note and returns the row', async () => {
    rpc.mockResolvedValue({ data: { id: 'cn1', credit_note_number: 'CRED-0001' }, error: null });
    const out = await issueCreditNote({ invoice_id: 'i1', credit_type: 'adjustment', currency: 'OMR', total_amount: 10, tax_amount: 0, reason_code: 'discount' }, []);
    expect(rpc).toHaveBeenCalledWith('issue_credit_note', { p_cn: expect.objectContaining({ invoice_id: 'i1' }), p_items: [] });
    expect(out.credit_note_number).toBe('CRED-0001');
  });

  it('applyCreditNote forwards allocations', async () => {
    rpc.mockResolvedValue({ data: { id: 'cn1', applied_amount: 10 }, error: null });
    await applyCreditNote('cn1', [{ invoice_id: 'i1', amount: 10 }]);
    expect(rpc).toHaveBeenCalledWith('apply_credit_note', { p_credit_note_id: 'cn1', p_allocations: [{ invoice_id: 'i1', amount: 10 }] });
  });

  it('voidCreditNote requires a reason and throws on RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'refunded credit cannot be voided' } });
    await expect(voidCreditNote('cn1', 'mistake')).rejects.toThrow('refunded credit cannot be voided');
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/lib/creditNoteService.test.ts`
Expected: FAIL (`Cannot find module './creditNoteService'`).

- [ ] **Step 3: Implement `src/lib/creditNoteService.ts`**

```ts
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type CreditNote = Database['public']['Tables']['credit_notes']['Row'];

export interface CreditNoteInput {
  invoice_id?: string | null;
  case_id?: string | null;
  customer_id?: string | null;
  company_id?: string | null;
  credit_type: 'adjustment' | 'refund' | 'advance_adjustment' | 'writeoff';
  currency: string;
  exchange_rate?: number;
  subtotal?: number;
  tax_rate?: number;
  tax_amount: number;
  total_amount: number;
  reason_code?: string;
  reason_notes?: string;
}
export interface CreditNoteItemInput {
  description?: string; quantity?: number; unit_price?: number;
  discount?: number; tax_rate?: number; tax_amount?: number; total?: number; sort_order?: number;
}
export interface CreditNoteAllocationInput { invoice_id: string; amount: number; }

export async function issueCreditNote(input: CreditNoteInput, items: CreditNoteItemInput[]): Promise<CreditNote> {
  const { data, error } = await supabase.rpc('issue_credit_note', { p_cn: input, p_items: items });
  if (error) throw new Error(error.message);
  return data as CreditNote;
}

export async function applyCreditNote(creditNoteId: string, allocations: CreditNoteAllocationInput[]): Promise<CreditNote> {
  const { data, error } = await supabase.rpc('apply_credit_note', { p_credit_note_id: creditNoteId, p_allocations: allocations });
  if (error) throw new Error(error.message);
  return data as CreditNote;
}

export async function voidCreditNote(creditNoteId: string, reason: string): Promise<CreditNote> {
  if (!reason.trim()) throw new Error('A reason is required to void a credit note');
  const { data, error } = await supabase.rpc('void_credit_note', { p_credit_note_id: creditNoteId, p_reason: reason });
  if (error) throw new Error(error.message);
  return data as CreditNote;
}

export async function getCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]> {
  const { data, error } = await supabase
    .from('credit_notes').select('*')
    .eq('invoice_id', invoiceId).is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CreditNote[];
}
```

> If the regenerated types don't yet include `issue_credit_note` in the `rpc()` overloads, that means Task 6 didn't capture the functions — re-run Task 6. Do not cast `supabase.rpc` to `any`.

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/creditNoteService.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Add query keys** in `src/lib/queryKeys.ts` (follow the existing factory shape in that file):

```ts
creditNotes: {
  all: ['credit_notes'] as const,
  byInvoice: (invoiceId: string) => ['credit_notes', 'invoice', invoiceId] as const,
  byCase: (caseId: string) => ['credit_notes', 'case', caseId] as const,
},
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/creditNoteService.ts src/lib/creditNoteService.test.ts src/lib/queryKeys.ts
git commit -m "feat(credit-notes): typed RPC service wrappers + query keys"
```

---

## Task 9: Full verification gate

**Files:** none (CI parity).

- [ ] **Step 1:** `npm run check:tsc` → `OK: tsc clean (0 errors)`
- [ ] **Step 2:** `npx eslint src/lib/creditNoteService.ts src/lib/invoicePermissions.ts src/lib/creditNoteService.test.ts src/lib/invoicePermissions.test.ts` → 0 errors
- [ ] **Step 3:** `npm run test` → full suite green (new tests included)
- [ ] **Step 4:** `npm run build` → builds
- [ ] **Step 5:** `npm run check:tokens` → OK (no banned colors; this layer adds none)
- [ ] **Step 6:** Confirm the migration manifest contains all four new migrations (the `migration-manifest` gate) and the schema-drift gate passes (regenerated types match live).
- [ ] **Step 7: Final commit / push**; open or update the draft PR using `.github/PULL_REQUEST_TEMPLATE/migration.md`.

---

## Self-Review

**Spec coverage (vs §3.1–3.3, §5, Phase A):**
- §3.1 `invoices.credited_amount` + derivation → Tasks 2, 5, 7. ✔
- §3.2 `credit_notes` header → Task 3. ✔
- §3.3 `credit_note_items` + `credit_note_allocations` (append-only, unique active) → Task 3. ✔
- §5 `issue/apply/void_credit_note` RPCs (money-conserving, ledger + VAT reversal) → Task 4. ✔
- §3.1 cash-vs-credit (advance_adjustment → `amount_paid`, else `credited_amount`) → Task 4 `apply_credit_note` branch. ✔
- §3.9 number sequence → `get_next_number('credit_note')` in Task 4 (prefix tenant-configurable; defaults `CRED`). ✔
- **Out of scope (Phase A.2):** UI, PDF, portal, the Settle/Revise wizard. Refunds/advances/policy are Phases B–C. ✔

**Placeholder scan:** No "TBD"/"handle later". The two "confirm before applying" notes are CLAUDE.md-mandated live-schema introspection with exact fallback SQL, not placeholders.

**Type consistency:** `credit_type` values (`adjustment|refund|advance_adjustment|writeoff`), `apply_credit_note(p_credit_note_id, p_allocations)`, and `{ invoice_id, amount }` allocation shape are identical across the table CHECK (Task 3), the RPC (Task 4), and the service (Task 8). `credited_amount` derivation (`total − amount_paid − credited_amount`) is identical in the RPCs (Tasks 4, 5) and the TS helper (Task 7).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-credit-notes-phase-a1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best here because each migration task benefits from live-DB introspection in its own context.

**2. Inline Execution** — execute tasks in this session via executing-plans, with checkpoints for review (especially before each `apply_migration` on the live DB).

**Which approach?**
