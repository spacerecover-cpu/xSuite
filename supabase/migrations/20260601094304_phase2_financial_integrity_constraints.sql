-- =====================================================================
-- Phase 2 — DB-level financial integrity backstops. These make the
-- guarantees enforced by record_payment/void_payment hold against ANY
-- write path (imports, manual SQL, future services), not just the RPC.
-- Pre-flight verified zero existing violations on 2026-06-01.
-- Applied via mcp__supabase__apply_migration (version 20260601094304).
-- =====================================================================

-- payment_allocations: positive amounts, no duplicate active allocation per (payment, invoice)
ALTER TABLE public.payment_allocations
  ADD CONSTRAINT chk_payment_allocations_amount_positive CHECK (amount > 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_allocations_active
  ON public.payment_allocations (payment_id, invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id
  ON public.payment_allocations (payment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_id
  ON public.payment_allocations (invoice_id) WHERE deleted_at IS NULL;

-- receipt_allocations: parity (second invoice-settlement writer)
ALTER TABLE public.receipt_allocations
  ADD CONSTRAINT chk_receipt_allocations_amount_positive CHECK (amount > 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_allocations_active
  ON public.receipt_allocations (receipt_id, invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_receipt_id
  ON public.receipt_allocations (receipt_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_invoice_id
  ON public.receipt_allocations (invoice_id) WHERE deleted_at IS NULL;

-- payments: positive amount, unique payment_number per tenant, index legacy invoice_id
ALTER TABLE public.payments
  ADD CONSTRAINT chk_payments_amount_positive CHECK (amount > 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_number_per_tenant
  ON public.payments (tenant_id, payment_number) WHERE deleted_at IS NULL AND payment_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
  ON public.payments (invoice_id) WHERE deleted_at IS NULL;

-- invoices: non-negative money, unique invoice_number per tenant (tax-document integrity)
ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_amount_paid_nonneg CHECK (amount_paid >= 0);
ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_balance_due_nonneg CHECK (balance_due >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_number_per_tenant
  ON public.invoices (tenant_id, invoice_number) WHERE deleted_at IS NULL AND invoice_number IS NOT NULL;
