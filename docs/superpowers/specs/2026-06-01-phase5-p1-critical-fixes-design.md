# Phase 5 — P1 Critical Fixes (Design Spec)

- **Date:** 2026-06-01
- **Status:** Draft for review
- **Program:** Phase 5 of the UI program. This is **P1 (Critical Fixes)** — the pre-foundation PR(s) that fix *live data-integrity, routing, accessibility, and silent-failure defects* **decoupled from the composition layer**. None of these fixes requires `FormModal`/`DataGrid`/`Tabs` to exist.
- **Evidence base:** `docs/audits/2026-06-01-platform-ux-consistency-audit.md`, `docs/superpowers/specs/2026-06-01-platform-design-system-design.md`, and a 10-agent source-verification sweep (2026-06-01) that **overturned two doc claims** and **resized three workstreams** (see the execution-strategy synthesis).
- **Non-negotiable constraints:** soft-deletes only; **never hard-delete financial rows**; `financial_transactions` is **append-only** (`prevent_audit_mutation` trigger + REVOKE — PR #137); RESTRICTIVE tenant isolation preserved; locked 14-token theme vocabulary; `lucide-react`/`pdfmake` only; Tailwind v3.4; this is a **data-recovery lab platform, not a generic CRM**. Hold `tsc=0` and schema-drift green on every PR; regenerate `database.types.ts` after any migration.

---

## §0. Why these seven items, and why now

The verification sweep found that the audit's flagship "Record Payment UX split" is **not a UX problem** — it is **live financial data corruption** writing through a path that bypasses the append-only ledger PR #137 just built. Two of the audit's five "high-severity defects" turned out to be **stale** (already fixed) or **in dead code**. The genuinely-critical, genuinely-live defects are below. They share one property: **each is cheap, self-contained, and blocks or contaminates the foundation work if left in place.**

| # | Fix | Class | Live impact | Verified evidence |
|---|---|---|---|---|
| **F1** | Atomic receipt recording via `create_receipt_with_allocations` RPC | 🔴🔴 Data integrity | Every UI-recorded invoice payment bypasses the ledger; detail-page payments never update `amount_paid` | `InvoiceDetailPage.tsx:636`, `InvoicesListPage.tsx:768` |
| **F2** | Reconciliation **detection** (read-only). ~~delete dead `RecordPaymentModal.tsx`~~ **CANCELLED** | 🔴 Data integrity | Corrupted rows are invisible to ops | **CORRECTION:** `RecordPaymentModal` is **live** in `PaymentsList.tsx:614` + `CaseDetail.tsx:1267` — do NOT delete |
| **F3** | Fix dead `/invoices/:id/edit` → modal edit | 🔴 Routing | Edit button 404s to a blank page | `InvoiceDetailPage.tsx:521` vs `App.tsx:309/317` |
| **F4** | `AuditTrails` JIT-stripped dynamic class → static `ACTION_TONE` map | 🔴 Prod-visual | Action chips render with no background in production | `AuditTrails.tsx:170` |
| **F5** | Re-point `--color-ring` to `primary` (DESIGN.md drift #2) | 🔴 a11y/brand | Banned indigo focus ring fails WCAG 2.4.11 on every focusable element | `index.css:37` (`99 102 241`) |
| **F6** | Global `prefers-reduced-motion` block + kill looping modal bounce | 🔴 a11y | 205 `animate-*` sites, zero motion-reduction; vestibular risk | `index.css` (no `@media` block), `CaseSuccessModal.tsx:43` |
| **F7** | Stop silent validation swallow on money forms; ban `alert`/`window.confirm` on financial+custody | 🔴 silent-failure/a11y | Money-form errors vanish; native dialogs guard destructive financial/custody actions | `ExpenseFormModal.tsx:105`, `TransactionFormModal.tsx:60` |
| **F8** | Label fix `'OK'`→`'Approve'` | 🟡 correctness | Approve action mislabeled "OK" | `ExpensesList.tsx:690` |

Plus a **re-baseline task (F0)**: confirm the two stale items (dead "History" tab; portal quote-approval guard) so later phases don't allocate work to already-fixed code.

**Decisions locked (operator sign-off, 2026-06-01):**
1. **F1 data path** = new `create_receipt_with_allocations` RPC on the *existing* `receipts`/`receipt_allocations` tables (not a rewire onto `payments`). Keeps the table the pages already use; defers the `receipts↔payments↔payment_receipts` consolidation to the Phase-4 financial workstream; makes no unilateral data-model commitment.
2. **Backfill** = Phase 1 ships **read-only detection only**; the corrective money backfill is a **separate, independently-reviewed migration**.

---

## §1. Goals / Non-Goals

**Goals**
- Make UI receipt recording **atomic, money-conserving, ledger-posting, and balance-correct** on both entry points.
- Eliminate the four live user-visible/a11y defects (dead route, invisible chips, off-brand focus ring, unbounded motion).
- Stop money-form silent failures; remove inaccessible native dialogs from financial/custody surfaces.
- Quantify the existing corruption so the separate backfill is scoped against real numbers.

**Non-Goals (explicit — do not let scope creep here)**
- ❌ No composition components (`FormModal`/`DataGrid`/`Tabs`/`DropdownMenu`) — those are Phase 2–3.
- ❌ No `receipts`/`payment_receipts` → `payments` consolidation (Phase 4, owned by financial).
- ❌ No corrective backfill of historical rows (separate reviewed PR).
- ❌ No multi-currency receipts, overpayment-as-credit, or unapplied cash (deferred; rejected with clear errors — mirrors `record_payment`'s Phase-1 constraints).
- ❌ No forensic-lifecycle gates (NDA/consent, payment-before-release, QA-before-close, recovered-file manifest, custody-at-intake) — those are lab-workflow work owned elsewhere; **"P1 done" ≠ "lab workflow hardened."**

---

## §2. F1 — Atomic receipt recording (the keystone)

### 2.1 Problem (verified)
Both entry points open `banking/RecordReceiptModal` and persist via an **inline `onSave`** that writes directly to `receipts` + `receipt_allocations`:

- **`InvoiceDetailPage.tsx:619–670`** — inserts `receipts`, then `receipt_allocations`, then `handlePaymentRecorded()`. **It never updates `invoices.amount_paid`/`balance_due`/`status`.** Balance is permanently wrong after a detail-page payment.
- **`InvoicesListPage.tsx:756–844`** — inserts `receipts` + `receipt_allocations`, then a **per-invoice read-modify-write loop with no lock** (`:800–823`, lost-update race), then a **non-atomic bank-balance read-modify-write** (`:828–843`).
- **Neither posts a `financial_transactions` ledger row.** Both bypass the `record_payment` RPC (PR #134) and the append-only ledger (PR #137). Money "succeeds" in the UI with **no ledger entry**.

This is the unfixed half of audit RC8 — but it is a **data-integrity bug, not a styling one.**

### 2.2 Fix — `create_receipt_with_allocations(p_receipt jsonb, p_allocations jsonb)`
A `SECURITY DEFINER` RPC that **mirrors `record_payment`'s invariants** on the receipts tables: single transaction, `FOR UPDATE` invoice locks, `Σ(allocations)=amount`, `amount_paid`/`balance_due`/`status` recompute, and **one append-only income posting** to `financial_transactions` (`reference_type='receipt'`).

**Schema reality that shapes it:** `receipts` is **currency-naive** (columns: `id, tenant_id, receipt_number, customer_id, amount, receipt_date, payment_method (text), reference, notes, status, created_by, …` — **no `currency`/`exchange_rate`/`amount_base`**). So the RPC operates in **tenant base currency** and **rejects foreign-currency invoices** with a clear "use the payments path / Phase 2" error (exactly the same posture `record_payment` takes on mixed currency).

```sql
-- migration: create_receipt_with_allocations
CREATE OR REPLACE FUNCTION public.create_receipt_with_allocations(
  p_receipt jsonb, p_allocations jsonb
) RETURNS receipts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_uid uuid;
  v_amount numeric; v_receipt_date timestamptz; v_bank_account uuid;
  v_base_currency text; v_base_decimals integer;
  v_receipt receipts%ROWTYPE; v_receipt_number text;
  v_alloc jsonb; v_alloc_amount numeric; v_inv_id uuid; v_inv invoices%ROWTYPE;
  v_new_paid numeric; v_new_due numeric; v_new_status text;
  v_total_alloc numeric := 0;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'create_receipt_with_allocations: no tenant context for caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();

  v_amount       := (p_receipt->>'amount')::numeric;
  v_receipt_date := COALESCE(NULLIF(p_receipt->>'receipt_date','')::timestamptz, now());
  v_bank_account := NULLIF(p_receipt->>'bank_account_id','')::uuid;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'create_receipt_with_allocations: amount must be > 0 (got %)', v_amount
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array'
     OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'create_receipt_with_allocations: at least one allocation is required; unapplied/advance receipts are not yet supported (Phase 4)'
      USING ERRCODE = 'check_violation';
  END IF;

  v_base_currency := _fin_base_currency(v_tenant);
  v_base_decimals := _fin_currency_decimals(v_base_currency);
  v_receipt_number := get_next_number('receipt');   -- OPEN ITEM: confirm 'receipt' sequence scope exists

  INSERT INTO receipts (tenant_id, receipt_number, amount, receipt_date,
                        customer_id, payment_method, reference, notes, status, created_by)
  VALUES (v_tenant, v_receipt_number, v_amount, v_receipt_date,
          NULLIF(p_receipt->>'customer_id','')::uuid,
          NULLIF(p_receipt->>'payment_method',''),
          NULLIF(p_receipt->>'reference',''),
          NULLIF(p_receipt->>'notes',''),
          COALESCE(NULLIF(p_receipt->>'status',''), 'completed'),
          v_uid)
  RETURNING * INTO v_receipt;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_alloc_amount := (v_alloc->>'amount')::numeric;
    v_inv_id       := (v_alloc->>'invoice_id')::uuid;
    IF v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'create_receipt_with_allocations: allocation amount must be > 0 (invoice %)', v_inv_id
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_inv FROM invoices WHERE id = v_inv_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'create_receipt_with_allocations: invoice % not found', v_inv_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_inv.tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'create_receipt_with_allocations: invoice % belongs to another tenant', v_inv_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(v_inv.currency, v_base_currency) <> v_base_currency THEN
      RAISE EXCEPTION 'create_receipt_with_allocations: invoice % is in % ; foreign-currency receipts are not supported in Phase 1 (use the payments path)', v_inv_id, v_inv.currency
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_alloc_amount > round(COALESCE(v_inv.balance_due, 0), v_base_decimals) THEN
      RAISE EXCEPTION 'create_receipt_with_allocations: allocation % exceeds invoice % balance due %', v_alloc_amount, v_inv_id, v_inv.balance_due
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO receipt_allocations (tenant_id, receipt_id, invoice_id, amount, created_by)
    VALUES (v_tenant, v_receipt.id, v_inv_id, v_alloc_amount, v_uid);

    v_new_paid := round(COALESCE(v_inv.amount_paid, 0) + v_alloc_amount, v_base_decimals);
    v_new_due  := round(COALESCE(v_inv.total_amount, 0) - v_new_paid, v_base_decimals);
    v_new_status := CASE WHEN v_new_due <= 0 THEN 'paid'
                         WHEN v_new_paid > 0 THEN 'partial' ELSE 'sent' END;

    UPDATE invoices SET
      amount_paid      = v_new_paid,
      balance_due      = GREATEST(0, v_new_due),
      amount_paid_base = round(v_new_paid, v_base_decimals),
      balance_due_base = round(GREATEST(0, v_new_due), v_base_decimals),
      status           = v_new_status,
      paid_at          = CASE WHEN v_new_due <= 0 THEN now() ELSE paid_at END
    WHERE id = v_inv_id;

    v_total_alloc := v_total_alloc + v_alloc_amount;
  END LOOP;

  IF round(v_total_alloc, v_base_decimals) <> round(v_amount, v_base_decimals) THEN
    RAISE EXCEPTION 'create_receipt_with_allocations: allocations (%) must sum to receipt amount (%)', v_total_alloc, v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- Append-only income posting (base currency).
  INSERT INTO financial_transactions (
    tenant_id, transaction_type, amount, currency, transaction_date,
    description, reference_type, reference_id, bank_account_id,
    exchange_rate, rate_source, amount_base, status, created_by
  ) VALUES (
    v_tenant, 'income', v_total_alloc, v_base_currency, v_receipt_date,
    'Receipt ' || v_receipt_number, 'receipt', v_receipt.id, v_bank_account,
    1, 'derived', v_total_alloc, 'posted', v_uid
  );

  -- Atomic bank-balance maintenance (preserves the list-page behavior, now locked).
  -- OPEN ITEM: confirm with the financial-integrity owner whether bank balance should be
  -- ledger-derived instead; if so, drop this block. Kept for behavior parity in Phase 1.
  IF v_bank_account IS NOT NULL THEN
    PERFORM 1 FROM bank_accounts WHERE id = v_bank_account AND tenant_id = v_tenant FOR UPDATE;
    UPDATE bank_accounts SET current_balance = COALESCE(current_balance, 0) + v_total_alloc
      WHERE id = v_bank_account AND tenant_id = v_tenant;
  END IF;

  RETURN v_receipt;
END;
$function$;
```

> **Grants:** `REVOKE ALL … FROM public/anon; GRANT EXECUTE … TO authenticated;` (match `record_payment`). Run `mcp__supabase__get_advisors` after apply — expect the same `authenticated_security_definer_function_executable` info-lint as the other money RPCs (by design).

### 2.3 Service wrapper
Add `createReceiptWithAllocations(receipt, allocations)` to a `receiptsService.ts` mirroring `paymentsService.createPayment` (throws on error; requires ≥1 allocation; logs an audit trail):

```ts
export const createReceiptWithAllocations = async (
  receipt: { amount: number; receipt_date?: string | null; customer_id?: string | null;
             payment_method?: string | null; reference?: string | null; notes?: string | null;
             status?: string; bank_account_id?: string | null; },
  allocations: Array<{ invoice_id: string; amount: number }>
) => {
  if (!allocations?.length) throw new Error('A receipt must be allocated to at least one invoice.');
  const { data, error } = await supabase.rpc('create_receipt_with_allocations', {
    p_receipt: { ...receipt, status: receipt.status ?? 'completed' },
    p_allocations: allocations.map(a => ({ invoice_id: a.invoice_id, amount: a.amount })),
  });
  if (error) throw error;
  if (!data) throw new Error('Failed to create receipt');
  await logAuditTrail('create', 'receipts', data.id, {}, { receipt_number: data.receipt_number, amount: receipt.amount });
  return data;
};
```

### 2.4 Caller rewire
Replace **both** inline `onSave` blocks with a single call. Map the modal draft → RPC inputs:

| Modal draft field | RPC `p_receipt` |
|---|---|
| `amount` | `amount` |
| `receipt_date` | `receipt_date` |
| `customer_id` | `customer_id` |
| `payment_method_id` | `payment_method` *(preserves current text-column mapping; flag the uuid-in-text smell for Phase 4)* |
| `reference_number` | `reference` |
| `notes` | `notes` |
| `account_id` | `bank_account_id` |
| allocations `[{invoice_id, allocated_amount}]` | `[{invoice_id, amount: allocated_amount}]` |

```tsx
// InvoiceDetailPage.tsx (replaces :619–670) and InvoicesListPage.tsx (replaces :756–844)
onSave={async (receiptData, allocations) => {
  const r = receiptData as Partial<PaymentReceipt> & { status?: string };
  await receiptsService.createReceiptWithAllocations(
    { amount: r.amount as number, receipt_date: r.receipt_date ?? null,
      customer_id: r.customer_id ?? null, payment_method: r.payment_method_id ?? null,
      reference: r.reference_number ?? null, notes: r.notes ?? null,
      status: r.status ?? 'completed', bank_account_id: r.account_id ?? null },
    (allocations ?? []).map(a => ({ invoice_id: a.invoice_id, amount: a.allocated_amount })),
  );
  handlePaymentRecorded(); // detail page; list page: invalidate ['invoices'|'invoice'|'invoice_stats']
}}
```
Delete the now-dead `resolveTenantId` import and the manual `bank_accounts`/`invoices` loops in the list page (the RPC owns them).

> **OPEN ITEM (must verify before coding):** confirm `RecordReceiptModal` emits a non-empty `allocations` array in `singleInvoiceMode` (detail page). If it does not, the detail page must construct one allocation = full amount to `invoiceId`. The RPC **requires** allocations.

### 2.5 Behavior changes (call out in the PR)
- Overpayment / unapplied / foreign-currency receipts now **fail with a clear error** instead of silently writing a wrong-ledger row. This matches the case-detail/payments path and the Phase-1 financial posture. The modal already renders inline errors (`RecordReceiptModal:239–243,274–279`), so the rejection is visible.
- Detail-page payments now correctly update the invoice balance (previously they never did).

### 2.6 Tests (TDD — RED first)
**SQL/RPC characterization tests** (run via `execute_sql` against a scratch tenant, mirroring the `record_payment` RED→GREEN harness):
1. Happy path: receipt + allocation → `receipts` row, `receipt_allocations` row, **exactly one** `financial_transactions` income row (`reference_type='receipt'`), invoice `amount_paid`/`balance_due`/`status` recomputed, base columns set.
2. `Σ(alloc) ≠ amount` → `check_violation`, **nothing committed**.
3. Allocation > `balance_due` → rejected.
4. Foreign-currency invoice → rejected with the Phase-2 message.
5. Cross-tenant invoice id → `insufficient_privilege`.
6. Soft-deleted invoice → `foreign_key_violation`.
7. No allocations → rejected (Phase-4 message).
8. Concurrency: two parallel calls allocating to the same invoice cannot both pass `balance_due` (FOR UPDATE serializes).
9. `financial_transactions` row cannot be UPDATE/DELETEd afterward (append-only trigger still holds).
**Vitest:** `createReceiptWithAllocations` maps fields correctly and throws on RPC error; both pages call the service (no direct `.from('receipts')` insert remains — grep assertion).

### 2.7 Acceptance
- [ ] Zero `\.from\('receipts'\)\.insert` / `\.from\('receipt_allocations'\)` in `src/pages` or `src/components` (RPC-only).
- [ ] Recording a payment from invoice **detail** and **list** both: post one ledger row, recompute `amount_paid`, and survive a forced error mid-way with no partial write.
- [ ] `tsc=0`; `database.types.ts` regenerated; advisors clean (expected info-lint only).

---

## §3. F2 — Reconciliation detection (read-only) + dead-code removal

### 3.1 Detection (no writes)
Add `scripts/financial/detect-receipt-ledger-drift.sql` (committed; run by ops/CI report, not in app):
```sql
-- (a) receipts with NO matching ledger posting
SELECT r.id, r.receipt_number, r.amount, r.created_at
FROM receipts r
LEFT JOIN financial_transactions ft
  ON ft.reference_type = 'receipt' AND ft.reference_id = r.id AND ft.deleted_at IS NULL
WHERE r.deleted_at IS NULL AND ft.id IS NULL;

-- (b) invoices whose amount_paid disagrees with the sum of live allocations
SELECT i.id, i.invoice_number, i.amount_paid,
       COALESCE(pa.s,0) + COALESCE(ra.s,0) AS allocated_sum
FROM invoices i
LEFT JOIN (SELECT invoice_id, SUM(amount) s FROM payment_allocations WHERE deleted_at IS NULL GROUP BY 1) pa ON pa.invoice_id = i.id
LEFT JOIN (SELECT invoice_id, SUM(amount) s FROM receipt_allocations WHERE deleted_at IS NULL GROUP BY 1) ra ON ra.invoice_id = i.id
WHERE i.deleted_at IS NULL
  AND round(i.amount_paid,2) <> round(COALESCE(pa.s,0)+COALESCE(ra.s,0),2);
```
Record the counts in the PR description so the separate backfill PR is scoped against real numbers. **Do not write anything.**

### 3.2 ~~Delete dead `RecordPaymentModal.tsx`~~ — CANCELLED (it is live)
**Correction (verified by grep during execution):** `RecordPaymentModal` is imported and used in `PaymentsList.tsx:614` and `CaseDetail.tsx:1267` (both write the atomic `payments` path via `paymentsService`). It is **not** dead code; the audit/verification claim was wrong. **Do not delete it.** Its `:516`/`:219` line citations were stale (different/older file), not live bugs in the receipt path. The receipts ledger-bypass fixed by F1 lives in the `RecordReceiptModal` inline `onSave`, which is a separate component.

---

## §4. F3 — Dead `/invoices/:id/edit` route → modal edit
`InvoiceDetailPage.tsx:521` navigates to an unregistered route (`App.tsx` registers only `invoices`, `invoices/:id`). Match the Quote pattern: replace the navigate with opening the existing invoice edit modal (`InvoiceFormModal` if present; else add a minimal `editing` state + the form already used by the list/create path). **Do not** register a dead `:id/edit` route. Test: clicking Edit opens the modal; saving invalidates `['invoice', id]`.

---

## §5. F4 — `AuditTrails` JIT-stripped class
`AuditTrails.tsx:170` builds `` `bg-${getActionColor(...)}-100` `` → Tailwind JIT cannot see it → invisible chips in prod. Replace `getActionColor` (returns `'green'|'blue'|'red'|'gray'`) with a **static** map to semantic-muted classes, and fix the sibling `<Badge color={…}>` (Badge takes `variant`, not `color`):
```ts
const ACTION_TONE: Record<string, { chip: string; badge: BadgeVariant }> = {
  create: { chip: 'bg-success-muted', badge: 'success' },
  update: { chip: 'bg-info-muted',    badge: 'info' },
  delete: { chip: 'bg-danger-muted',  badge: 'danger' },
  view:   { chip: 'bg-surface-muted', badge: 'secondary' },
};
const tone = ACTION_TONE[trail.action] ?? ACTION_TONE.view;
// <div className={`mt-1 p-2 rounded-lg ${tone.chip}`}> … <Badge variant={tone.badge}>
```
Author the **AST dynamic-class lint** (`eslint-rules/no-dynamic-tw-class.js`) flagging any `className` template literal interpolating into `bg-/text-/border-/ring-/from-/to-`; land it as **warn** in P1 (flips to error in P2). Test: rendered chip has a static class present in the production CSS.

---

## §6. F5 — Focus ring (DESIGN.md drift #2)
`index.css:37` sets `--color-ring: 99 102 241` (`#6366F1`, the exact banned indigo) — it ships on every `focus-visible:ring-ring` element and fails WCAG **2.4.11 Focus Appearance** (~1.9:1 on Royal navy). Re-point it to the active theme's primary:
```css
/* constant :root block */
--color-ring: var(--color-primary);   /* was: 99 102 241 */
```
This resolves per active theme automatically (primary is a per-theme triplet). Add a CI assertion (`scripts/check-tokens.sh` or a unit test) that `index.css`/`tailwind.config.js` contain **no** banned triplet `99 102 241` or `59 130 246`. (Drift #1 glow-blue and #3 PDF cyan are handled in P2 — out of scope here, but noted so they're not lost.) Verify contrast ≥3:1 for the resulting ring against primary surfaces.

---

## §7. F6 — Motion reduction
No `@media (prefers-reduced-motion: reduce)` block exists anywhere; 205 `animate-*` sites; `CaseSuccessModal.tsx:43` loops `animate-bounce` on open (worst vestibular offender). Add to `index.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Change `CaseSuccessModal` bounce → static `CheckCircle`. (WCAG 2.3.3 / vestibular safety.)

---

## §8. F7 — Silent money-form failures + native dialogs
### 8.1 Silent validation
`ExpenseFormModal.tsx:105` and `TransactionFormModal.tsx:60` both `if (amount <= 0 || !description.trim()) return;` — failures vanish on **money** forms. Minimal pre-`FormModal` fix: surface the reason (per-field inline error state + `useToast().error()` on submit), never silently `return`. (Full RHF+Zod migration is P3; this is the targeted bleed-stopper.) *(Leave the `#10b981`/`#ef4444` inline style at `TransactionFormModal.tsx:256` for the P2 token sweep — note it, don't fix it here, to keep the diff focused.)*

### 8.2 Native dialogs on financial/custody surfaces
Introduce `useConfirm(): (opts) => Promise<boolean>` backed by `ConfirmDialog` (with a **return-focus** contract to the triggering element). Replace `window.confirm` on the **financial + custody** subset now: `PaymentsList` (void), `TransactionsList` (reconcile/void), `VATAuditPage` (submit/mark-paid), `InvoicesListPage` (bulk archive/send), `CaseEngineersTab` (remove engineer), `CaseFilesTab` (delete attachment). Replace `alert(` on the lab-critical report surfaces' destructive paths where trivial; defer the bulk of the 33 `alert`/22 `confirm` sites to P2/P5. Add `eslint no-restricted-globals: [warn] alert, confirm` scoped to `src/pages/financial/**`, `src/components/financial/**`, `src/components/cases/**` (warn in P1 → error in P2).

---

## §9. F8 — Label fix
`ExpensesList.tsx:690`: `{approveExpenseMutation.isPending ? 'Approving...' : 'OK'}` → `'Approve'`. One line.

---

## §10. F0 — Re-baseline (verification, no code)
Confirm and record (so P5.7/§6.2 don't allocate work to fixed code):
- "History" tab renders `ChainOfCustodyTab` correctly; **no orphan `case_job_history` fetch** (`CaseDetail.tsx:738`). → P5.7 "wire/remove dead query" likely empty; instead consider **surfacing** `case_job_history` as a real Activity tab (Stage-16 log) rather than deleting anything.
- Portal quote approve/reject is **already guarded** with confirm + reason (`PortalQuotes.tsx`). → P5.6 quote-guard scope re-points to the **staff** path (`QuoteDetailPage.tsx:734`, unguarded `<select>`), and the staff guard must align to the portal's existing reason shape — **and** is gated on a separate cases/financial ticket fixing the broken `case_quotes`/status-name loop.

---

## §11. Migration & rollout
1. Apply `create_receipt_with_allocations` via `mcp__supabase__apply_migration`; add to the migration manifest; regenerate `database.types.ts`.
2. Run `get_advisors` (expect only the by-design SECURITY DEFINER info-lint).
3. Land code in small PRs that each hold `tsc=0`:
   - **PR-A (data):** RPC + `receiptsService` + both caller rewires + RPC/Vitest tests + detection SQL + delete dead modal. *(F1, F2)*
   - **PR-B (defects):** dead route, AuditTrails, focus ring, motion, label. *(F3–F6, F8)* — pure, low-risk; can ship in parallel.
   - **PR-C (silent-failure/a11y):** money-form validation + `useConfirm` + scoped lint. *(F7)*
4. F0 is a checklist item closed in PR-A's description.

---

## §12. Risks & mitigations
| Risk | Mitigation |
|---|---|
| RPC rejects overpayment/foreign-currency that the old path silently accepted (behavior change) | Documented as intentional; modal already shows inline errors; matches `record_payment` posture; foreign-currency invoices keep working via the payments path |
| `singleInvoiceMode` modal may not emit allocations | **Verify before coding** (§2.4 open item); construct a single full-amount allocation if absent |
| Bank-balance double-counting if a ledger-derived balance exists | RPC bank-balance block flagged as an open item to confirm with the financial-integrity owner; drop the block if balances are ledger-derived |
| `get_next_number('receipt')` scope may not exist | Verify; fall back to leaving `receipt_number` null (current behavior) if no sequence configured |
| Backfill of historical drift is high-risk | **Out of scope** — detection only in P1; corrective migration is a separate, independently-reviewed PR scoped from the detection counts |
| Focus-ring re-point changes appearance subtly | One-line, theme-correct; verify 3:1 contrast; visually QA all three themes |

## §13. Definition of Done
- [ ] `create_receipt_with_allocations` live; advisors clean; types regenerated; manifest updated.
- [ ] No inline `receipts`/`receipt_allocations` inserts remain; both entry points atomic, ledger-posting, balance-correct; full RED→GREEN test suite green.
- [ ] Detection SQL committed; corruption counts recorded in PR-A.
- [ ] Dead `RecordPaymentModal.tsx` removed (or repointed); dead `/invoices/:id/edit` replaced with modal edit.
- [ ] AuditTrails chips render in prod (static classes); dynamic-class lint live (warn).
- [ ] `--color-ring` = primary; banned-triplet CI check passing; `prefers-reduced-motion` block live; no looping modal bounce.
- [ ] Money-form validation visible (no silent return); `useConfirm` replaces `window.confirm` on financial+custody; scoped `no-restricted-globals` lint live (warn).
- [ ] `ExpensesList` "OK"→"Approve".
- [ ] F0 re-baseline recorded; later-phase scopes corrected.
- [ ] `tsc=0` and schema-drift green on every PR.

## §14. References
- `docs/audits/2026-06-01-platform-ux-consistency-audit.md` (RC8, §7.1, §10, §11)
- `docs/superpowers/specs/2026-06-01-platform-design-system-design.md` (§6/P5.6, §0.5)
- `docs/financial-integrity-audit-2026-06-01.md` (coordinate the Phase-4 consolidation + backfill)
- `record_payment`/`void_payment` (PR #134), ledger lockdown (PR #137) — the invariants this RPC mirrors
- `CLAUDE.md` › append-only audit/custody, soft-deletes, RESTRICTIVE isolation, Theming
