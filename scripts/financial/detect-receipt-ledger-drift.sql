-- Phase 5 P1 / F2 — read-only reconciliation detection for the receipt ledger-bypass bug.
-- Run by ops/CI report only. DOES NOT WRITE. Scopes the separate corrective backfill PR.
-- See docs/superpowers/specs/2026-06-01-phase5-p1-critical-fixes-design.md §3.

-- (a) receipts with NO matching append-only income ledger posting (pre-fix corruption)
SELECT r.id, r.receipt_number, r.amount, r.created_at
FROM receipts r
LEFT JOIN financial_transactions ft
  ON ft.reference_type = 'receipt' AND ft.reference_id = r.id AND ft.deleted_at IS NULL
WHERE r.deleted_at IS NULL AND ft.id IS NULL
ORDER BY r.created_at;

-- (b) invoices whose amount_paid disagrees with the sum of live allocations
SELECT i.id, i.invoice_number, i.amount_paid,
       COALESCE(pa.s, 0) + COALESCE(ra.s, 0) AS allocated_sum
FROM invoices i
LEFT JOIN (SELECT invoice_id, SUM(amount) s FROM payment_allocations WHERE deleted_at IS NULL GROUP BY 1) pa ON pa.invoice_id = i.id
LEFT JOIN (SELECT invoice_id, SUM(amount) s FROM receipt_allocations WHERE deleted_at IS NULL GROUP BY 1) ra ON ra.invoice_id = i.id
WHERE i.deleted_at IS NULL
  AND round(i.amount_paid, 2) <> round(COALESCE(pa.s, 0) + COALESCE(ra.s, 0), 2)
ORDER BY i.invoice_number;
