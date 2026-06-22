-- EXP-017: atomic expense disbursement (Mark as Paid records the cash/bank side).
-- Accrual GL already posts at approval (expense_date, EXP-024); this records ONLY the
-- cash side: payment_disbursement + bank_transaction + balance debit + expense stamp.

-- 1. Traceability: which expense a disbursement paid (answers "which account, when";
--    also the anchor for a future reverse/void-disbursement path).
ALTER TABLE public.payment_disbursements
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id);

CREATE INDEX IF NOT EXISTS idx_payment_disbursements_expense_id
  ON public.payment_disbursements(expense_id) WHERE deleted_at IS NULL;

-- 2. Atomic disbursement RPC.
CREATE OR REPLACE FUNCTION public.record_expense_disbursement(
  p_expense_id uuid,
  p_bank_account_id uuid,
  p_paid_at date DEFAULT CURRENT_DATE,
  p_reference text DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := get_current_tenant_id();
  v_exp public.expenses;
  v_acct public.bank_accounts;
  v_disb_no text;
  v_new_balance numeric;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant context';
  END IF;

  -- Server-side authorization (RLS is bypassed under SECURITY DEFINER): mirror the
  -- expenses UPDATE policy (has_role('accounts') => owner/admin/manager/accounts).
  IF NOT has_role('accounts') THEN
    RAISE EXCEPTION 'Not authorized to disburse expenses';
  END IF;

  -- Lock the expense; tenant-scoped, not deleted.
  SELECT * INTO v_exp FROM public.expenses
   WHERE id = p_expense_id AND tenant_id = v_tenant AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  -- Idempotent state guard: only approved -> paid (a second call sees 'paid' and errors).
  IF v_exp.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved expense can be paid (current status: %)', v_exp.status;
  END IF;

  -- Validate + lock the bank account: same tenant, active, not deleted, matching currency.
  SELECT * INTO v_acct FROM public.bank_accounts
   WHERE id = p_bank_account_id AND tenant_id = v_tenant AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  IF COALESCE(v_acct.is_active, true) = false THEN
    RAISE EXCEPTION 'Bank account is inactive';
  END IF;
  IF COALESCE(v_acct.currency, 'USD') <> COALESCE(v_exp.currency, 'USD') THEN
    RAISE EXCEPTION 'Account currency (%) does not match expense currency (%)',
      COALESCE(v_acct.currency, 'USD'), COALESCE(v_exp.currency, 'USD');
  END IF;

  -- Block on insufficient balance.
  IF COALESCE(v_acct.current_balance, 0) < v_exp.amount THEN
    RAISE EXCEPTION 'Insufficient funds in % (balance %, required %)',
      v_acct.name, COALESCE(v_acct.current_balance, 0), v_exp.amount;
  END IF;

  v_new_balance := COALESCE(v_acct.current_balance, 0) - v_exp.amount;
  v_disb_no := public.get_next_disbursement_number();

  -- Cash-side record.
  INSERT INTO public.payment_disbursements(
    tenant_id, expense_id, bank_account_id, amount, disbursement_number,
    disbursement_date, payee_name, payee_type, reference, status, created_by
  ) VALUES (
    v_tenant, v_exp.id, p_bank_account_id, v_exp.amount, v_disb_no,
    p_paid_at, COALESCE(v_exp.description, v_exp.expense_number, 'Expense'), 'expense',
    COALESCE(p_reference, v_exp.expense_number), 'completed', auth.uid()
  );

  -- Bank movement.
  INSERT INTO public.bank_transactions(
    tenant_id, bank_account_id, transaction_date, description, reference,
    amount, type, debit_amount, credit_amount, running_balance, category, created_by
  ) VALUES (
    v_tenant, p_bank_account_id, p_paid_at,
    'Expense payment: ' || COALESCE(v_exp.description, v_exp.expense_number, v_exp.id::text),
    COALESCE(p_reference, v_exp.expense_number), v_exp.amount, 'debit', v_exp.amount, 0,
    v_new_balance, 'expense', auth.uid()
  );

  -- Debit the account (native + base).
  UPDATE public.bank_accounts
     SET current_balance = v_new_balance,
         current_balance_base = COALESCE(current_balance_base, 0) - (v_exp.amount * COALESCE(exchange_rate, 1)),
         updated_at = now()
   WHERE id = p_bank_account_id;

  -- Stamp the expense paid (audit trigger sets updated_by).
  UPDATE public.expenses
     SET status = 'paid', paid_at = p_paid_at, bank_account_id = p_bank_account_id
   WHERE id = p_expense_id
   RETURNING * INTO v_exp;

  RETURN v_exp;
END;
$$;

REVOKE ALL ON FUNCTION public.record_expense_disbursement(uuid, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_disbursement(uuid, uuid, date, text) TO authenticated;
