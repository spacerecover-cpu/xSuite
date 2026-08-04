# Case Check-In — Proof of Receipt & Consent Capture — Design

**Date:** 2026-08-04
**Status:** Draft — awaiting approval
**Lifecycle stages:** 3 (Device Intake), 4 (Device Labeling & Tracking), 1 (Customer Enquiry — consent)
**Mirrors:** `docs/superpowers/specs/2026-06-20-per-device-checkout-handover-design.md` (Stage 13 release). This is the **receipt** side of the same custody boundary and deliberately reuses its shapes.
**Split from:** the combined check-in/check-out brief. **OTP identity verification is spec 2** and is out of scope here.

---

## Problem (verified)

Intake is a chain-of-custody **acquisition** — the moment the lab takes legal possession of someone else's physical media.

**Most of the paperwork already exists and is correct.** The check-in receipt is a fully-built, bilingual, tenant-templatable document:

- `office_receipt` — "Office check-in receipt", the lab's retained copy.
- `customer_copy` — "Customer check-in copy", the customer-facing acknowledgment.
- Both are built by `src/lib/pdf/engine/adapters/receiptAdapter.ts`, titled **DEVICE CHECK-IN RECEIPT**, with a `Device(s) Received` table (Type · Brand · Capacity · Serial · Role), a case-info header, and a `legalTerms` consent box whose customer variant already reads *"By signing, I confirm that I am the owner or authorized representative of the device and authorize [lab] to proceed…"* (`receiptAdapter.ts:162-177`).
- Both are surfaced in Settings → Documents under the **Intake & Custody** category (`documentTypeMeta.ts:139-153`), and the engine already renders signature/stamp images on `office_receipt` (`signatureImages.test.ts:11`).

**So this spec is not "build a receipt."** It is "the receipt is signed on paper and the signature never comes back." The verified gaps:

| # | Gap | Verified state |
|---|---|---|
| 1 | **Signatures are blank printed lines** | `receiptAdapter.ts:219-222` emits `signatures: LabelText[]` = `['Customer Signature', 'Company Representative']` — captions for wet ink. Nothing writes to `document_signatures`, so the lab's proof of handover is a sheet of paper in a drawer, outside every audit and custody query. |
| 2 | **No depositor identity** | Nothing records *who physically stood at the counter*. The receipt prints the **customer** party (`customerParty()`), so a courier, spouse, or IT contractor dropping off is indistinguishable from the customer. Checkout solved exactly this with `checkout_collector_*` + relationship + ID gate; intake has no counterpart. |
| 3 | **Receipt can't scope itself** | `receiptAdapter.ts:212` renders `devices.map(deviceRow)` — *every* device on the case. Devices added after intake retroactively appear on a re-render of an earlier receipt. This is the identical defect the checkout spec fixed ("the checkout form prints every device on the case"). |
| 4 | **Consent is prose, not a record** | The `legalTerms` box is rendered text. No row asserts *this customer consented to X on this date*, and the three things being consented to (service authorization, destructive attempts, messaging) are fused into one sentence — individually unprovable. |
| 5 | **WhatsApp consent is never captured at the counter** | `whatsapp-send/index.ts:302-310` gates automated template sends on recorded consent and calls `failMessage(…, "consent_missing")` when absent. A first-time walk-in has no `whatsapp_consents` row, so every automated notification for that case fails until someone records consent by hand. The failure *is* recorded in the ledger (not silent) — the customer is simply never notified. |

**What already works and must not be disturbed:** `trg_log_device_received_custody` (v1.2.0) writes `DEVICE_RECEIVED`/`in_custody` to `chain_of_custody` on every `case_devices` INSERT, DB-side. Custody logging is correct. This spec adds *evidence* to that event; it does not replace it.

---

## Decisions

1. **Staff-authenticated surface with a hand-over step.** A dedicated front-desk route (standalone from `CreateCaseWizard`, per the earlier approval) running inside the *staff* session; the tablet is handed to the customer for the consent + signature step only. **No `anon` write path to `cases`/`case_devices` is created.** — _See Open Decisions; this is the reversible one._
2. **Extend the existing receipt — do not create a new document type.** No `document_instance_type` enum value is added. `office_receipt` / `customer_copy` gain captured signatures and batch scope.
3. **Reuse, don't fork, the creation sequence** (§4) so one creation path remains.
4. **Signatures land in `document_signatures`** via the existing `SignatureCaptureModal`. Slot `customer` already exists in the `signature_slot` enum — no enum migration.
5. **Consent is decomposed** into independently-recorded facts (§3), captured at the counter, before it is needed.
6. **Paper stays valid.** Wet-ink signing remains fully supported; digital capture is additive. A lab with no tablet loses nothing.

---

## 1. Data model — per-device intake state (`case_devices`)

Additive migration, all nullable, no RLS change (`case_devices` is already tenant-scoped). Deliberately mirrors the checkout columns so both halves of custody read symmetrically.

| Column | Type | Meaning |
|---|---|---|
| `received_at` | `timestamptz` | When this device was physically taken into custody |
| `intake_batch_id` | `uuid` | Groups devices received in one handover — **the receipt's scope** (fixes gap 3) |
| `depositor_name` | `text` | Who physically handed it over |
| `depositor_mobile` | `text` | |
| `depositor_id` | `text` | National ID / passport |
| `depositor_relationship` | `text` | CHECK in (`self`,`authorized_agent`,`company_rep`,`courier`) |
| `received_by` | `uuid` | Staff who accepted (`auth.uid`) |

Index: partial index on `(case_id) WHERE received_at IS NOT NULL`.

**Backfill:** set `received_at` from the existing `chain_of_custody` `DEVICE_RECEIVED` event timestamp where one exists; leave depositor fields null (unknowable retroactively). Historical devices read as "received, depositor unrecorded" rather than "never received".

---

## 2. Receipt changes (`receiptAdapter.ts`)

Three surgical changes to the existing adapter. No new document, no new type.

**2a. Batch scope (gap 3).** `ReceiptData.devices` is filtered to one `intake_batch_id` when the caller supplies one. Absent a batch (legacy cases, template preview), fall back to all devices — matching how `checkoutAdapter` falls back when no checkout has been recorded.

**2b. Depositor block (gap 2).** When `depositor_relationship = 'self'`, print "Delivered by customer." Otherwise print "Delivered by **[name]** · on behalf of **[customer]**" with the relationship label, National ID, and mobile — mirroring the checkout form's collector block verbatim, including its bilingual treatment.

**2c. Captured signatures (gap 1).** `signatures: LabelText[]` becomes a block that renders either a caption line (wet ink, unchanged default) **or** a captured signature — image for `drawn`/`uploaded_image`, rendered name plus method/timestamp for `typed`/`click_to_accept` — read from `document_signatures` for the receipt instance. The engine already places signature images on `office_receipt`, so this reuses existing rendering rather than adding it.

**Persistence.** `portal_sign_off_document` (`src/lib/portalDocumentService.ts:33-44`) is portal-scoped and cannot be reused. Add a sibling `staff_sign_off_document(p_instance_id, p_slot, p_method, p_typed_value, p_signer_name, p_signer_customer_id, p_user_agent)` SECURITY DEFINER RPC writing the same `document_signatures` shape from a staff session. Both must produce byte-identical row shapes so downstream readers stay single-path.

**Signature ≠ staff.** Captured inside a staff session, the row must carry `signer_customer_id` (never `signer_user_id`) for slot `customer`; `received_by` records whose session it was taken under. This is the honest limit of hand-over-the-tablet, recorded in §7.

---

## 3. Consent decomposition

One acknowledgment step, three **independently recorded** consents. Never a single bundled "I agree" — that is what makes each consent unprovable today (gap 4).

| Consent | Recorded to | Required? |
|---|---|---|
| Service authorization / T&C (the existing `legalTerms` text) | `document_signatures` — the signed receipt *is* the record | Yes — blocks completion |
| WhatsApp `utility` notifications | `whatsapp_consents` via `recordConsent` (`src/lib/whatsappService.ts:213`) | No — declining is valid |
| Destructive-attempt authorization | `case_internal_notes` + custody metadata | No — can be granted later |

`whatsapp_consents` is append-only; capture inserts, never updates. Marketing consent is **not** solicited at intake — bundling marketing into a service-intake signature is precisely the dark pattern GDPR Art. 7(2) prohibits.

---

## 4. Shared creation service + `log_case_intake` RPC

**Extract first.** Lift the creation sequence out of `CreateCaseWizard.tsx:349-497` into `src/lib/caseIntakeService.ts` as `createCaseWithDevices(input)`, preserving order exactly: `get_next_number('case')` → `getIntakeStatusForCreation()` → insert `cases` → insert `case_devices` → `setPrimaryDevice`. Refactor the wizard onto it (behavior-neutral, covered by existing wizard tests) **before** the front-desk surface is built.

**Then** add `log_case_intake(p_case_id, p_device_ids uuid[], p_depositor_name, p_depositor_mobile, p_depositor_id, p_depositor_relationship, p_receipt_instance_id)`:

- Generates one `intake_batch_id`; stamps the §1 columns on each device in `p_device_ids`.
- **ID gate**, mirroring `log_case_checkout`: `IF p_depositor_relationship IS NOT NULL AND p_depositor_relationship <> 'self' AND coalesce(trim(p_depositor_id),'') = '' THEN RAISE`. A null relationship (legacy callers) is not gated.
- Writes the receipt instance id + depositor relationship into the `metadata` of the `DEVICE_RECEIVED` custody events the trigger already created, linking evidence to custody.
- Does **not** touch case status. Intake status is set by the creation path; this RPC records evidence only.

---

## 5. UI surfaces

**Route** `/cases/check-in` — staff-authenticated, `is_staff_user()`, hidden from `viewer`.

Four sections on one scrolling surface (not a stepper — front-desk work is interrupt-driven and must be resumable):

1. **Customer** — search `customers_enhanced`, or create inline via `CustomerFormModal` (the canonical modal contract, `DESIGN.md → Overlays → Form modal`).
2. **Depositor** — relationship selector defaulting to `self`, prefilled from the customer. Switching off `self` clears the prefill and makes National ID required (client validation mirroring the RPC gate).
3. **Devices** — repeatable rows reusing existing device-entry components. Condition and visible damage are mandatory per device: they are the lab's only defense against a later "it arrived scratched" claim.
4. **Acknowledge & sign** — renders the receipt preview, the three §3 checkboxes, then `SignatureCaptureModal` with `allowedMethods={['drawn','typed','click_to_accept']}` (`uploaded_image` is excluded at a counter). **This is the step the tablet is turned around for**, and it must be skippable in favour of print-and-wet-sign (Decision 6).

On completion: create case + devices (§4) → create/locate the receipt `document_instances` row → capture signature → `log_case_intake` → `recordConsent` → label print per existing `shouldAutoPrintLabel('case')` → deliver the customer copy (print, or WhatsApp/email if consented).

Per CLAUDE.md this surface is UI-facing: implementation loads `ui-ux-pro-max` + `frontend-design`.

---

## 6. Custody

- No new custody table, no new event category — existing `DEVICE_RECEIVED`/`in_custody` events are enriched via `metadata`.
- Append-only guarantees (`prevent_audit_mutation`) untouched.
- A signed receipt whose case is later cancelled remains valid evidence; receipts are never soft-deleted by case lifecycle changes.

---

## 7. Open decisions (flag for veto)

1. **Surface model.** Staff-authenticated hand-over was chosen without explicit sign-off after the question went unanswered twice. Consequence: the signature proves *a person at the counter signed*, not cryptographically *which* person. If that is insufficient for your jurisdiction, the tokenized-link alternative (customer signs on their own phone via existing portal link infrastructure) is a contained swap of §2's capture path only — §1, §3, §4, §6 are unaffected.
2. **Customer-copy delivery when WhatsApp consent is declined.** Falls back to print + email. Confirm print alone is acceptable for a customer with no email.

---

## Testing

- **Service:** `createCaseWithDevices` preserves the exact original call order; wizard behavior unchanged (existing tests pass untouched).
- **RPC:** batch id stamped on the selected subset only; ID gate fires when relationship ≠ `self` and ID blank; null relationship not gated; custody `metadata` carries the receipt instance id; case status unchanged.
- **Adapter (TDD):** receipt prints only the batch's devices — add a device post-intake and assert it does **not** appear on a re-render of the earlier receipt; depositor block shows "on behalf of" + ID when not `self`, "Delivered by customer" when `self`; captured signature renders as image/typed value while an unsigned receipt still renders the wet-ink caption line (no regression for paper labs).
- **Signature:** `staff_sign_off_document` writes `signer_customer_id` (never `signer_user_id`) for slot `customer`; row shape matches `portal_sign_off_document` field-for-field.
- **Consent:** each checkbox writes an independent record; declining WhatsApp still completes intake; marketing scope is never written at intake.
- **UI:** ID required when relationship ≠ `self`; cannot reach the sign step with a device missing condition; T&C checkbox blocks completion; wet-ink path completes with no signature captured.

---

## Out of scope

- **OTP identity verification of the depositor** — spec 2.
- **ID document upload** (scan/photo to Storage) — still deferred, as in the checkout spec.
- **Public/anon check-in** — explicitly rejected for spec 1 (Decision 1).
- **New receipt document type** — explicitly rejected (Decision 2); the existing pair is extended.
- **`log_case_checkout` swallowing `check_violation`** — a real defect found during this research: when the payment-before-release gate blocks a case, devices are still released and custody still written while only the status hop is skipped. It belongs to the checkout path, not intake. **Track separately; do not fold into this spec.**
