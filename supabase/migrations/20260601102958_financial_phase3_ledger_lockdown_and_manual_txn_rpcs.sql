-- =====================================================================
-- Financial Phase 3 — append-only ledger lockdown + manual-transaction RPCs.
--
-- financial_transactions is the record of record. Before this it was freely
-- UPDATE/DELETE-able by any authenticated (and anon) tenant user
-- (RLS USING(true)/CHECK(true)) — the audit's CRITICAL "mutable ledger"
-- finding. This makes it append-only (mirrors the p0_s4 audit-table lockdown:
-- REVOKE + prevent_audit_mutation trigger) and routes the only two breaking
-- writers (manual create + void on the Transactions page) through SECURITY
-- DEFINER RPCs that set created_by server-side and maintain the bank-account
-- balance atomically — replacing the prior non-atomic insert + separate JS
-- balance write, and the void soft-delete (now forbidden).
--
-- Applied via mcp__supabase__apply_migration (version 20260601102958).
-- Verified RED->GREEN against live DB under authenticated-role simulation:
-- post/expense/reverse balances (1100/1050/950), created_by server-side,
-- contra row -amount/ref=reversal, original preserved; rejects double-reversal
-- (unique_violation), reverse-of-reversal (check_violation), zero amount,
-- bad type, insufficient balance; and post-lockdown: authenticated
-- UPDATE/DELETE/soft-delete blocked, INSERT + definer reversal still work.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. post_manual_transaction — atomic manual ledger entry.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_manual_transaction(p_txn jsonb)
RETURNS financial_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_uid uuid;
  v_type text;
  v_amount numeric;
  v_currency text;
  v_rate numeric;
  v_rate_source text;
  v_base_currency text;
  v_base_decimals integer;
  v_bank_account_id uuid;
  v_bank_balance numeric;
  v_row financial_transactions%ROWTYPE;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'post_manual_transaction: no tenant context for caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();

  v_type   := NULLIF(p_txn->>'transaction_type','');
  v_amount := (p_txn->>'amount')::numeric;

  IF v_type IS NULL OR v_type NOT IN ('income','expense','asset','equity') THEN
    RAISE EXCEPTION 'post_manual_transaction: transaction_type must be income/expense/asset/equity (got %)', v_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'post_manual_transaction: amount must be > 0 (got %)', v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  v_base_currency := _fin_base_currency(v_tenant);
  v_base_decimals := _fin_currency_decimals(v_base_currency);
  v_currency      := COALESCE(NULLIF(p_txn->>'currency',''), v_base_currency);
  v_rate          := COALESCE(NULLIF(p_txn->>'exchange_rate','')::numeric, 1);
  v_rate_source   := COALESCE(NULLIF(p_txn->>'rate_source',''), 'derived');
  v_bank_account_id := NULLIF(p_txn->>'bank_account_id','')::uuid;

  -- Lock the bank account up-front so the balance check + update are atomic.
  IF v_bank_account_id IS NOT NULL THEN
    SELECT current_balance INTO v_bank_balance
    FROM bank_accounts WHERE id = v_bank_account_id AND tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'post_manual_transaction: bank account % not found in tenant', v_bank_account_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_type = 'income' THEN
      v_bank_balance := COALESCE(v_bank_balance, 0) + v_amount;          -- credit
    ELSE
      IF COALESCE(v_bank_balance, 0) < v_amount THEN
        RAISE EXCEPTION 'post_manual_transaction: insufficient balance (available %, required %)',
          v_bank_balance, v_amount USING ERRCODE = 'check_violation';
      END IF;
      v_bank_balance := COALESCE(v_bank_balance, 0) - v_amount;          -- debit
    END IF;
  END IF;

  INSERT INTO financial_transactions (
    tenant_id, transaction_type, amount, currency, transaction_date,
    description, category_id, reference_type, reference_id, bank_account_id,
    exchange_rate, rate_source, amount_base, status, notes, created_by
  ) VALUES (
    v_tenant, v_type, v_amount, v_currency,
    COALESCE(NULLIF(p_txn->>'transaction_date','')::timestamptz, now()),
    NULLIF(p_txn->>'description',''),
    NULLIF(p_txn->>'category_id','')::uuid,
    NULLIF(p_txn->>'reference_type',''),
    NULLIF(p_txn->>'reference_id','')::uuid,
    v_bank_account_id,
    v_rate, v_rate_source, round(v_amount * v_rate, v_base_decimals),
    'posted', NULLIF(p_txn->>'notes',''), v_uid
  )
  RETURNING * INTO v_row;

  IF v_bank_account_id IS NOT NULL THEN
    UPDATE bank_accounts SET current_balance = v_bank_balance WHERE id = v_bank_account_id;
  END IF;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.post_manual_transaction(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_manual_transaction(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. reverse_financial_transaction — append-only correction (contra entry).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_financial_transaction(
  p_transaction_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS financial_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_uid uuid;
  v_orig financial_transactions%ROWTYPE;
  v_row financial_transactions%ROWTYPE;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'reverse_financial_transaction: no tenant context for caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();

  SELECT * INTO v_orig FROM financial_transactions
  WHERE id = p_transaction_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_financial_transaction: transaction % not found', p_transaction_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_orig.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'reverse_financial_transaction: transaction % belongs to another tenant', p_transaction_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_orig.reference_type = 'reversal' THEN
    RAISE EXCEPTION 'reverse_financial_transaction: cannot reverse a reversal entry (%)', p_transaction_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM financial_transactions
    WHERE reference_type = 'reversal' AND reference_id = p_transaction_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'reverse_financial_transaction: transaction % is already reversed', p_transaction_id
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO financial_transactions (
    tenant_id, transaction_type, amount, currency, transaction_date,
    description, category_id, reference_type, reference_id, bank_account_id,
    exchange_rate, rate_source, amount_base, status, notes, created_by
  ) VALUES (
    v_tenant, v_orig.transaction_type, -v_orig.amount, v_orig.currency, now(),
    'Reversal of ' || COALESCE(NULLIF(v_orig.description,''), v_orig.id::text)
      || COALESCE(' — ' || NULLIF(p_reason,''), ''),
    v_orig.category_id, 'reversal', v_orig.id, v_orig.bank_account_id,
    v_orig.exchange_rate, v_orig.rate_source,
    -COALESCE(v_orig.amount_base, round(v_orig.amount * v_orig.exchange_rate, _fin_currency_decimals(_fin_base_currency(v_tenant)))),
    'posted', p_reason, v_uid
  )
  RETURNING * INTO v_row;

  -- Reverse the original's bank-balance effect (income credited; expense/asset/equity debited).
  IF v_orig.bank_account_id IS NOT NULL THEN
    UPDATE bank_accounts SET current_balance =
      COALESCE(current_balance, 0)
      - CASE WHEN v_orig.transaction_type = 'income' THEN v_orig.amount ELSE -v_orig.amount END
    WHERE id = v_orig.bank_account_id AND tenant_id = v_tenant;
  END IF;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_financial_transaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_financial_transaction(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Ledger lockdown — append-only enforcement on financial_transactions.
--    Trigger is UPDATE/DELETE-only (INSERT-exempt) so definer RPCs that
--    INSERT (record_payment, void_payment, the two above) are unaffected.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS financial_transactions_update ON public.financial_transactions;
DROP POLICY IF EXISTS financial_transactions_delete ON public.financial_transactions;

REVOKE UPDATE, DELETE, TRUNCATE ON public.financial_transactions FROM authenticated, anon;

DROP TRIGGER IF EXISTS prevent_financial_transactions_mutation ON public.financial_transactions;
CREATE TRIGGER prevent_financial_transactions_mutation
  BEFORE UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();
