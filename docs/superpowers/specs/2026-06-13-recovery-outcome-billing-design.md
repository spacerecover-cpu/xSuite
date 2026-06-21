# Recovery-Outcome Billing — Credit Notes, Advances/Retainers, Refunds & Policy Deductions — Design Spec

**Date:** 2026-06-13
**Status:** Draft for approval
**Supersedes/extends:** `docs/superpowers/specs/2026-06-07-payment-workflow-financial-documents-design.md` (this is its deferred **Phase 2**)

**Decisions (locked in brainstorming):**
1. **Credit-note-first.** Issued tax invoices stay immutable; every post-issue change is a separate, linked document.
2. **Retainer/advance-invoice model** for advances (Zoho "Retainer Invoice" / ERPNext "advance against order"), not unapplied customer credits.
3. **One phased spec, all 10 deliverables**, implemented phase-by-phase (A→E), each its own migration PR.

> **Domain guardrail (CLAUDE.md):** xSuite is a **data-recovery lab platform**, not a generic CRM. Money events are custody-relevant: data release is gated on settlement; cancelling a case returns physically-tracked devices. Audit/custody tables stay **append-only**; tenant isolation stays **RESTRICTIVE**. This design adds documents and gates — it never weakens those.

---

## 0. Grounding — what already exists (do not rebuild)

From the live schema + `invoicePermissions.ts` + the payment RPCs:

| Primitive | Where | Reuse for |
|---|---|---|
| Append-only ledger; only `SECURITY DEFINER` RPCs INSERT (`prevent_financial_transactions_mutation`) | `financial_transactions` | All new money events post here via new RPCs |
| Money-conserving `record_payment(p_payment, p_allocations)` (Σ allocations = amount) | RPC | Paying advance & final invoices |
| `void_payment` (full reversal + reversing ledger entry); `reverse_financial_transaction` (contra) | RPC | Pattern for void/refund reversibility |
| Derived `payment_status` (`unpaid/partial/paid`), never hand-set | `invoices` | Extend to account for credits (§3.1) |
| Restricted-edit-after-lock (line items/amounts lock once issued/paid) | `invoicePermissions.ts` | **This is the reported limitation — kept by design** |
| Proforma→tax 1:1 conversion (`invoice_type`, `proforma_invoice_id`, `converted_to_invoice_id`, `convert_proforma_to_tax_invoice`) | `invoices` | Pattern for the new `advance` type |
| Outbound cash record | `payment_disbursements` | Wire to refunds (currently unlinked) |
| Multi-currency (`*_base`, `exchange_rate`, `rate_source`); same-currency invariant in RPCs | all financial | Same invariant for credit notes/refunds |
| VAT ledger | `vat_records`, `vat_returns`, `vat_transactions` | Credit notes reverse output VAT |
| Number generator | `get_next_number(sequence)` / `number_sequences` | `credit_notes`, `refunds`, `advance_invoices` sequences |

**What does NOT exist (the three gaps):** credit notes; advances/retainers (`record_payment` *forces* allocation to an invoice); partial/policy refunds with approval (`void_payment` is all-or-nothing; `payment_disbursements` unlinked). Plus no **case-outcome→billing bridge** (`cases.recovery_outcome` / `resolution` are free-text and drive nothing financial).

---

## 1. Recommended Business Workflow

Bolt an **outcome → settlement** bridge onto lifecycle stages **7 (Quote/Approval)**, **12 (Delivery Approval)**, **14 (Billing)**, **15 (Closure)**.

```
Quote approved ──► Advance Invoice issued ──► Advance paid (liability)
        │                                            │
        ▼                                            ▼
   Recovery work ───────────────────────────► Lab sets CASE OUTCOME
                                                     │
        ┌────────────────────────────────────────────┼───────────────────────────────┐
        ▼                          ▼                  ▼               ▼                 ▼
 full_recovery            partial_recovery   unsuccessful     customer_rejected   cancelled_by_*
        │                          │                  │               │                 │
        ▼                          ▼                  ▼               ▼                 ▼
 Final tax invoice         Final invoice @     Refund advance    Refund advance    Forfeit/Refund
 (quote total),            negotiated total    (full/partial,    minus policy      per policy
 advance adjusted,         via CREDIT NOTE     minus policy      deductions
 collect balance           to the delta;       deductions)
                           advance adjusted
        └──────────────► DATA-RELEASE GATE (settlement state per tenant policy) ──► Closure
```

**Case Outcome enum** (deliverable: *Case Outcome-Based Billing*) — new `cases.billing_outcome` (distinct from free-text `recovery_outcome`):

`full_recovery | partial_recovery | unsuccessful_recovery | customer_rejected_data | cancelled_by_customer | cancelled_by_company`

Each outcome yields a **recommended** billing action (tenant confirms — never auto-posts money). Recommendations are policy-driven (§8):

| Outcome | Recommended action |
|---|---|
| full_recovery | Issue final tax invoice = quote; adjust advance; collect balance; release data on settlement |
| partial_recovery | Final invoice at negotiated total → **credit note** for the delta; adjust advance; collect/refund difference |
| unsuccessful_recovery | **Refund** advance minus non-refundable policy deductions (diagnostic/donor/etc.) |
| customer_rejected_data | Final invoice for earned/agreed portion; **refund** remainder minus deductions; data NOT released |
| cancelled_by_customer | **Forfeit** advance per policy (or refund minus cancellation deduction) |
| cancelled_by_company | **Refund** advance in full (company at fault) unless policy says otherwise |

**Data-release gate (custody):** recovered data/devices are released only when the case reaches a tenant-defined *releasable* financial state (default: `paid` or `agreed-and-deposit-met`). Release logs `chain_of_custody` + `case_job_history`. Cancellation returns devices via the existing `log_case_checkout` custody path.

---

## 2. Recommended Accounting Workflow

**Document model (each is a distinct, immutable-once-issued artifact):**

| Document | xSuite representation | On issue | On payment |
|---|---|---|---|
| Quote | `quotes` (existing) | none (estimate) | n/a |
| **Advance/Retainer Invoice** | `invoices` w/ `invoice_type='advance'` (NEW value) | optional VAT (tax-point config §8) | cash↑, **liability↑** (unearned) — not income |
| Final **Tax Invoice** | `invoices` `invoice_type='tax_invoice'` | revenue recognized + output VAT | cash↑, income recognized |
| **Advance Adjustment** | `credit_notes` `credit_type='advance_adjustment'` | moves retainer value onto final invoice | liability↓, income↑, invoice balance↓ |
| **Credit Note** | `credit_notes` `credit_type='adjustment'` | revenue↓ + output VAT↓ (proportional) | reduces invoice balance / spawns refund |
| **Refund** | `refunds` → `payment_disbursements` | n/a | cash↓ (net of deductions) |

**Core accounting principles**

1. **Issued invoices are immutable.** Decreases = credit note; increases = supplementary invoice. (Odoo/ERPNext/Zoho/QB all do this.)
2. **Advances are a liability** (unearned revenue) until earned. The simplified cashbook (`financial_transactions.transaction_type ∈ income|expense|asset|equity`) needs **one additive value: `liability`** (§3.4). Recognition happens at adjustment/forfeit, not receipt.
3. **Credit notes reverse revenue *and* output VAT** proportionally; a `vat_transactions` reversal feeds the VAT return. This is why a refund is VAT-correct without "withholding" the customer's VAT.
4. **"Non-refundable" deductions are earned, taxable supplies — not withheld VAT.** A diagnostic fee, consumed donor part, or shipping you actually rendered is a *real supply*: it stays invoiced and its VAT is correctly retained because the supply happened. Only the **unearned** remainder is credited/refunded with its VAT reversed. → "VAT non-refundable" emerges from *VAT follows the supply*, which is compliant; we additionally expose a tenant override (§8) with a compliance warning.
5. **Money conservation everywhere.** Credit-note allocations + refunded portion ≤ credit-note total (append-only allocations, mirroring `payment_allocations`).
6. **Reversibility, not deletion.** Issued credit notes / completed refunds are immutable; correct via void/reverse with a reversing ledger entry (the `void_payment` pattern).

**New ledger `reference_type` values:** `credit_note`, `refund`, `advance`, `advance_adjustment`, `advance_forfeit`. **New `transaction_type`:** `liability` (additive enum).

---

## 3. Recommended Database Design

All new tenant-scoped tables get the mandatory package: `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, RLS **enabled + forced**, **RESTRICTIVE** isolation policy (`tenant_id = get_current_tenant_id() OR is_platform_admin()`), `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index `WHERE deleted_at IS NULL`, `deleted_at` soft delete, `created_by/updated_by` (via `set_audit_actor_fields` per v1.2.0). DELETE restricted to `has_role('admin')`.

### 3.1 `invoices` — additive columns (no edit to existing data)
- `credited_amount numeric NOT NULL DEFAULT 0` (+ `credited_amount_base`) — Σ applied credit notes.
- **Redefine derivation** (in the RPCs, not a stored edit):
  `balance_due = total_amount − amount_paid − credited_amount`
  `payment_status = 'paid' when (amount_paid + credited_amount) ≥ total_amount AND total_amount > 0; 'partial' when (amount_paid + credited_amount) > 0; else 'unpaid'`
- `invoice_type` CHECK extended to include `'advance'`.
- `advance_source_invoice_id uuid` (nullable) — links a final tax invoice to the advance invoice adjusted into it (audit lineage).

> **Cash vs credit.** Applying a paid advance routes prepaid **cash** to the final invoice's `amount_paid` (it *is* the customer's money, received earlier); `credited_amount` holds **non-cash** reductions only (discounts, write-offs, refund credits). Both reduce `balance_due`, but only `credited_amount` reverses revenue/VAT.

### 3.2 `credit_notes` (header)
`id, tenant_id, credit_note_number (uq per tenant), credit_note_date, status (draft|issued|applied|void), credit_type (adjustment|refund|advance_adjustment|writeoff), invoice_id (FK→invoices, nullable for pure advance credits), case_id, customer_id, company_id, currency, exchange_rate, rate_source, subtotal, tax_rate, tax_amount, total_amount, subtotal_base, tax_amount_base, total_amount_base, applied_amount (Σ allocations), refunded_amount, reason_code, reason_notes, approved_by, approved_at, voided_at, created_by, updated_by, timestamps, deleted_at`.
Constraints: `total_amount > 0`; `applied_amount + refunded_amount ≤ total_amount`; uq number per tenant `WHERE deleted_at IS NULL`.

### 3.3 `credit_note_items` & `credit_note_allocations`
- `credit_note_items` — mirrors `invoice_line_items` (`description, quantity, unit_price, discount, tax_rate, tax_amount, total, sort_order`). Lets a *partial* credit name exactly what's being credited.
- `credit_note_allocations` — `id, tenant_id, credit_note_id, invoice_id, amount (>0), created_by, created_at, deleted_at`. Append-only; unique active per `(credit_note_id, invoice_id)` (parity with `payment_allocations`). Application reduces the target invoice's open balance: `adjustment`/`refund`/`writeoff` → `credited_amount`; `advance_adjustment` → `amount_paid` (see §3.1, §5).

### 3.4 Advances/Retainers
No new header table — an advance **is** an `invoices` row (`invoice_type='advance'`), paid via existing `record_payment` but classified as `liability` (new RPC variant, §5/§6). On the advance invoice, **available retainer** = `amount_paid − credited_amount`, where its `credited_amount` accumulates both value adjusted into final invoices and value refunded out.
**Ledger:** add enum value `transaction_type='liability'`. (Optional future: a `customer_advances` sub-ledger view — **YAGNI for now**; the advance invoice + ledger reference_type suffice.)

### 3.5 `refunds` (outbound, approval-gated)
`id, tenant_id, refund_number (uq), refund_date, status (pending_approval|approved|completed|rejected|cancelled), source (advance|credit_note|overpayment), credit_note_id (nullable), source_payment_id (nullable, original receipt), advance_invoice_id (nullable), customer_id, company_id, case_id, currency, exchange_rate, rate_source, gross_amount (refundable base), deductions_total, net_amount (cash out = gross − deductions), bank_account_id, payment_method_id, disbursement_id (FK→payment_disbursements, set on completion), requested_by, reason_code, reason_notes, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, completed_at, created_by, updated_by, timestamps, deleted_at`.
Constraints: `net_amount = gross_amount − deductions_total ≥ 0`; `gross_amount > 0`.

### 3.6 `refund_deductions` (itemized retained charges)
`id, tenant_id, refund_id, deduction_type_id (FK→master_refund_deduction_types, nullable), label, amount (>0), is_taxable, tax_amount, notes, created_at, deleted_at`. Append-only.

### 3.7 `master_refund_deduction_types` (GLOBAL master)
`id, code (vat|donor_parts|shipping|diagnostic_fee|cleanroom_consumables|engineering|other), label, default_is_taxable, sort_order, is_active, created_at`. SELECT for all authenticated; write `is_platform_admin()` only.

### 3.8 `tenant_billing_policies` (per-tenant config)
One row per tenant (singleton), JSONB rules + typed columns where queried often:
`id, tenant_id (uq), enabled_deduction_types jsonb, default_deduction_values jsonb (code→{type:fixed|percent, value, is_taxable}), vat_retention_stance (supply_based[default]|always_retain|never_retain), refund_approval_threshold numeric, refund_approver_roles text[], advance_refundable_default bool, outcome_action_map jsonb (outcome→recommended action + default deductions), data_release_states text[] (default ['paid']), created_by, updated_by, timestamps, deleted_at`.
Admin/owner-gated. Consistent with the existing `company_settings.metadata` pattern but promoted to a typed table for auditability + RLS clarity.

### 3.9 Number sequences
Add `credit_notes` (e.g. `CN-0001`), `refunds` (`REF-0001`), `advance_invoices` (`ADV-0001`) to `number_sequences`; audited via `number_sequences_audit`.

---

## 4. Invoice Revision Strategy (credit-note-first)

**Issued invoices are never edited.** A "revision" is a **Settle/Revise wizard** that nets the invoice to a new agreed total by emitting linked documents:

- **Decrease** (discount / partial recovery / negotiated-down): one `credit_notes` row (`adjustment`) for the delta, allocated to the invoice (`credited_amount↑`, `balance_due↓`). Original invoice + line items untouched.
- **Increase** (extra work agreed): a **supplementary tax invoice** for the delta on the same case (new `invoices` row), not an edit.
- **Non-financial fields** (notes, due date, terms, bank account) stay editable via the existing restricted-edit path.

Audit lineage: `credit_notes.invoice_id` and `invoices.advance_source_invoice_id` link the documents; `case_job_history` records the revision event with before/after totals. Result: a defensible, regulator-friendly trail instead of a mutated tax document.

---

## 5. Credit-Note & Refund Strategy

**Credit-note types** → behavior:
- `adjustment` — applied to an invoice (reduces balance). Discount, partial-recovery, negotiated settlement.
- `advance_adjustment` — applies a paid **advance** invoice's value onto the final tax invoice.
- `refund` — customer already paid and is owed money back → spawns a `refunds` record.
- `writeoff` — bad debt / goodwill (optional, role-gated).

**New RPCs (all `SECURITY DEFINER`, money-conserving, ledger-posting):**
- `issue_credit_note(p_cn jsonb, p_items jsonb)` — creates header+items, status `issued`; posts revenue↓ + `vat_transactions` reversal.
- `apply_credit_note(p_credit_note_id, p_allocations jsonb)` — append `credit_note_allocations`; recompute `balance_due`/`payment_status` (§3.1). `adjustment`/`refund`/`writeoff` bump `invoices.credited_amount`; `advance_adjustment` bumps the final invoice's `amount_paid` (prepaid cash, not a discount). Σ allocations ≤ remaining credit.
- `void_credit_note(p_credit_note_id, p_reason)` — reverses allocations + ledger + VAT (the `void_payment` pattern); only if not refunded.
- `request_refund(p_refund jsonb, p_deductions jsonb)` — status `pending_approval`; computes `net_amount`; no cash yet.
- `approve_refund(p_refund_id)` / `reject_refund(p_refund_id, p_reason)` — role + threshold gated (§8); audited.
- `complete_refund(p_refund_id, p_bank_account_id, p_method)` — creates the `payment_disbursements` row, decrements bank, posts ledger `reference_type='refund'`; if `source='advance'`, decrements the advance liability.

**Refund flows:** advance refund (Scenarios 2/3), post-payment refund via a `refund` credit note (customer overpaid / data rejected after paying). Non-refundable deductions are itemized in `refund_deductions`; taxable deductions keep their VAT (they're real supplies), non-taxable ones don't.

---

## 6. Advance Payment Management Strategy (retainer model)

**Lifecycle:** Advance invoice issued → paid via `record_advance` (a thin wrapper over `record_payment` that classifies the ledger entry as `liability`, `reference_type='advance'`) → then one of:

- **Adjust** into final invoice: `apply_credit_note` with `credit_type='advance_adjustment'` moves the retainer onto the final tax invoice — liability↓, income↑ recognized, final invoice `amount_paid↑` ⇒ `balance_due↓`.
- **Forfeit** (cancelled_by_customer per policy): `forfeit_advance(p_advance_invoice_id, p_reason)` — liability↓, income↑ (recognized as a cancellation fee); audited.
- **Refund** (full/partial): `request_refund(source='advance', …)` → approve → `complete_refund` (liability↓, cash↓ net of deductions).

**VAT tax-point:** configurable (§8). Default: if the advance invoice carries VAT at issue, VAT is accounted then (tax point = invoice); adjustment nets it on the final invoice. Jurisdictions where the tax point is the **payment** are supported by the `record_advance` VAT hook. Multi-currency: advance and final invoice must share currency (Phase-1 invariant).

---

## 7. Audit-Trail Requirements

- **Append-only ledger** preserved: all money events post via the new `SECURITY DEFINER` RPCs only; no client writes to `financial_transactions`.
- **Actor stamping**: `set_audit_actor_fields` on every new table (created_by/updated_by), per v1.2.0.
- **Reason codes + notes mandatory** on credit notes, refunds, write-offs, forfeits (enforced in RPC, not just UI).
- **Approval audit**: refund `requested_by → approved_by/rejected_by` transitions recorded in `audit_trails` with timestamps and the policy threshold that applied.
- **Case history & custody**: every financial event on a case (advance received, credit note issued, refund completed, outcome set, data released, devices returned) logs `case_job_history`; custody-relevant events (data release, device checkout on cancellation) log `chain_of_custody` via existing paths (`log_case_checkout`, `log_chain_of_custody`).
- **Immutability/reversibility**: issued credit notes & completed refunds cannot be edited/deleted — only voided/reversed with a reversing ledger entry, mirroring `void_payment`.
- **VAT auditability**: each credit note writes a `vat_transactions` reversal tied to the period for the VAT return.

---

## 8. Tenant Policy Configuration Design

Surfaced in **Settings → Billing Policies** (owner/admin-gated). Backed by `tenant_billing_policies` (§3.8) + global `master_refund_deduction_types` catalog (§3.7).

Configurable:
- **Enabled deduction types** + default value per type (fixed amount or % of advance) and `is_taxable` flag.
- **VAT-retention stance**: `supply_based` (default, compliant), `always_retain`, `never_retain` — non-default choices render a **compliance warning** in the UI.
- **Refund approval**: threshold amount → required approver role(s); below threshold may auto-approve if policy allows.
- **Advance defaults**: refundable-by-default? forfeiture rule for customer cancellation?
- **Outcome→action map**: per outcome, the recommended action + default deduction set (drives §1's recommendation engine).
- **Data-release states**: which `payment_status`/settlement states permit releasing recovered data (default `['paid']`).

Policies are **recommendations + guardrails**, never silent auto-posting of money; the operator always confirms.

---

## 9. UI/UX Recommendations

*(ui-ux-pro-max + frontend-design applied; reuse existing patterns; semantic tokens only per DESIGN.md — no purple/indigo; `tabular-nums` for money; lucide icons; PDFs theme-neutral.)*

- **Case Settlement panel** (extend `CaseFinancesTab`): a single net-position view — Quote · Advance(s) · Invoices · Credit Notes · Refunds · **Net owed / Net to refund** — reusing the `RecordReceiptModal` meter idiom (and the new "still outstanding after" pattern) so figures reconcile at a glance. `aria-live` on computed nets.
- **Settle / Revise wizard**: select **outcome** → see the policy **recommendation** → preview the document(s) and ledger impact → confirm. One primary CTA per step; preview before any money posts.
- **Credit Note editor**: mirrors `InvoiceFormModal`; immutable-after-issue with the same restricted-edit affordance and "Locked — issued" hint.
- **Refund request + approval**: two-step UI. Requester itemizes deductions (live net calc, deduction breakdown table with `aria-sort`); approver sees gross/deductions/net + reason + threshold, with explicit approve/reject + reason. Destructive/asymmetric actions use `danger` token and are visually separated.
- **Policy config**: card-based Settings screen (like `AppearanceSettings`); compliance warning banner when VAT stance ≠ `supply_based`.
- **Documents (pdfmake)**: Credit Note and Refund Voucher builders in `src/lib/pdf/documents/`; theme-neutral; Arabic/RTL support via the existing font loader.
- **Portal**: customer sees credit notes + refund status (read paths only), consistent with existing portal document views.
- **A11y/quality**: 44px targets, focus management on wizard steps, color-not-only (icon+text on every status), reduced-motion respected.

---

## 10. End-to-End Examples (OMR; ledger + custody shown)

> Notation: **CN** credit note, **ADV** advance invoice, **INV** final tax invoice, **REF** refund. VAT 5% for illustration.

### Scenario 1 — Partial recovery, discount, customer pays balance
- Quote OMR 500. **ADV-0001** issued 200 → paid (`record_advance`): bank +200, **liability +200**; device already `in_custody`.
- Recovery partial. Lab sets outcome `partial_recovery` and approves a **50 goodwill discount**.
- **INV-0027** issued at the quote 500 (subtotal 476.190 + VAT 23.810) — revenue + output VAT recognized.
- **CN-0001** (`adjustment`, the discount) for 50 → applied to INV-0027: `credited_amount` 50; revenue −47.619, output VAT −2.381 (`vat_transactions` reversal).
- **Advance applied** (advance_adjustment) 200 → INV-0027 `amount_paid` 200; liability −200 (recognized).
- `balance_due` = 500 − 200 (paid) − 50 (credited) = **250**. Customer pays 250 (`record_payment`) → `amount_paid` 450, `payment_status='paid'`.
- **Data-release gate** met (`paid`) → release data; `chain_of_custody` DATA_RELEASED + `case_job_history`. Close.

### Scenario 2 — Unsuccessful, full refund (company-side)
- Quote 500. **ADV-0001** 250 paid (liability +250).
- Outcome `unsuccessful_recovery`; policy (cancelled_by_company-like, no fault) → full refund.
- **REF-0001** `source='advance'`, gross 250, deductions 0, net 250 → `request_refund` → `approve_refund` (above threshold ⇒ manager) → `complete_refund`: `payment_disbursements` 250, bank −250, **liability −250**.
- Devices returned via `log_case_checkout` (custody DEVICE_CHECKED_OUT). Data NOT released. Close.

### Scenario 3 — Partial refund with non-refundable deductions
- Quote 500. **ADV-0001** 300 paid (liability +300).
- Outcome `customer_rejected_data`. Per policy (§8) the non-refundable, **earned** charges are: diagnostic_fee 50, donor_parts 40, shipping 10 (all `is_taxable=true`, `supply_based`).
- **REF-0002** `source='advance'`: `gross_amount` 300, three `refund_deductions` rows summing `deductions_total` 100, `net_amount` **200**.
- `request_refund` → `approve_refund` (manager — above threshold) → `complete_refund`: `payment_disbursements` 200, bank −200; advance **liability −300** = 200 cash out **+ 100 recognized** as earned diagnostic/donor/shipping income, with output VAT on that 100 (the retained amounts are real supplies — this is why their VAT is correctly kept, not "withheld").
- Data NOT released; devices returned via `log_case_checkout` (custody). Close.
- *Alternative (also supported):* issue a small tax invoice for the earned 100 and refund the rest with zero deductions — identical economics, an explicit invoice instead of itemized deductions; the `supply_based` policy can require this.

### Scenario 4 — Negotiated settlement (quote 500, advance 250, settle 350)
- **INV-0030** issued at the full quote 500 (subtotal 476.190 + VAT 23.810) — then revised down, to demonstrate the revision strategy (§4).
- Outcome `partial_recovery`, **agreed total 350**. **CN-0005** (`adjustment`) for the **150 delta** (142.857 + VAT 7.143): revenue −142.857, output VAT −7.143 (`vat_transactions` reversal); applied to INV-0030 → `credited_amount` 150.
- **Advance applied** (advance_adjustment) 250 → INV-0030 `amount_paid` 250; liability −250 (recognized).
- `balance_due` = 500 − 250 (paid) − 150 (credited) = **100**. Customer pays 100 → `amount_paid` 350, `payment_status='paid'`.
- **INV-0030 stays immutable**; CN-0005 + the advance adjustment are the audit trail of how a 500 invoice settled at 350. Release data; close.

---

## Phased Build Order (each phase = its own migration PR, types regen, callers updated, CI gates green)

| Phase | Scope | Unblocks |
|---|---|---|
| **A. Credit Notes** | `credit_notes`/`_items`/`_allocations`; `invoices.credited_amount` + derivation; `issue/apply/void_credit_note` RPCs; service+UI+PDF; tests | Invoice revision, partial-recovery discount, negotiated settlement (Scenarios 1, 4) |
| **B. Advances/Retainers** | `invoice_type='advance'`; ledger `liability` value; `record_advance`/`adjust`(via CN)/`forfeit_advance`; VAT tax-point config; UI; tests | Advance handling across all scenarios |
| **C. Refunds + Policy** | `refunds`/`refund_deductions`/`master_refund_deduction_types`/`tenant_billing_policies`; `request/approve/reject/complete_refund` wired to `payment_disbursements`; approval UI; tests | Scenarios 2, 3 |
| **D. Outcome→Billing bridge** | `cases.billing_outcome`; recommendation engine; Settle/Revise wizard; data-release custody gate; tests | Closure automation, all outcomes |
| **E. UI/UX & Portal polish** | Settlement panel, PDFs, portal read paths, end-to-end QA, docs | Customer-facing completeness |

---

## Risks / Constraints / Open Items

- **Simplified ledger:** adding `transaction_type='liability'` is additive and low-risk, but downstream P&L/report views must learn to exclude liabilities from income. (Audit needed in Phase B.)
- **VAT tax-point on advances** is jurisdiction-specific (`geo_countries`/tenant config) — default sensible, expose override; verify with the `accounting_locales` model.
- **payment_status derivation** now depends on `credited_amount`; every reader of balance/status must use the RPC-recomputed values (covered by the schema-drift gate).
- **Same-currency invariant** for credit notes/refunds in Phase 1 (mirrors `record_payment`); cross-currency deferred.
- **Do not weaken**: RESTRICTIVE RLS, append-only audit/custody, restricted-edit-after-lock. Data-release gating is *additive* domain safety.
- **YAGNI deferred**: dedicated `customer_advances` sub-ledger, cross-currency settlements, automated dunning — out of scope unless a scenario demands them.

---

## Acceptance (per phase)
`tsc` 0 errors · `eslint` 0 errors · full `vitest` suite green · `vite build` OK · `check:tokens` OK · migration via `mcp__supabase__apply_migration` + regenerated `database.types.ts` + `.github/PULL_REQUEST_TEMPLATE/migration.md` · new tenant tables pass `check-tenant-table-requirements.sql` · unit tests for each RPC's money-conservation, VAT reversal, and policy/approval gating.
