# Per-Device Checkout Handover + Distinct Collector — Design

**Date:** 2026-06-20
**Status:** Approved (scope: full per-device handover; require ID when collector ≠ customer)
**Extends:** `docs/superpowers/specs/2026-06-19-device-collection-audit-trail-gaps-design.md` (per-device checkout *state* and the "on-behalf-of" model are net-new beyond that doc).

## Problem (verified)

Device checkout (Stage 13) is a chain-of-custody **release**. Today:
- The capture modal already lets staff tick a subset of devices, and `log_case_checkout` already writes **per-device** custody rows for that subset — but there is **no per-device checkout *state***, so partial collection is invisible, non-resumable, and a second collection overwrites the first on `cases`.
- The **checkout form prints every device** on the case (ignores the collected subset).
- The form **duplicates** customer Name/Company/Phone across the Customer Information and Case Details boxes.
- The **collector "on behalf of" the customer is not modeled** — three free-text strings pre-filled with the customer; no relationship, no authorization, ID optional.

## Decisions (approved)
- **Full per-device handover** (track partial collection in the data model; form prints only the collected devices; modal marks already-returned devices).
- **Require National ID when the collector's relationship ≠ self.**

## 1. Data model — per-device checkout state (`case_devices`)

Additive migration (all nullable; no RLS change — `case_devices` is already tenant-scoped):

| Column | Type | Meaning |
|---|---|---|
| `checked_out_at` | `timestamptz` | When this device was handed over (null = still in the lab) |
| `checkout_batch_id` | `uuid` | Groups the devices collected in one checkout event |
| `checkout_collector_name` | `text` | Who collected this device |
| `checkout_collector_mobile` | `text` | |
| `checkout_collector_id` | `text` | National ID / passport |
| `checkout_collector_relationship` | `text` | CHECK in (`self`,`authorized_agent`,`company_rep`,`courier`) |
| `checkout_by` | `uuid` | Staff who processed (auth.uid) |

`checked_out_at IS NULL` is the queryable "still here" state. Index: partial index on `(case_id) WHERE checked_out_at IS NULL` (optional).

## 2. `log_case_checkout` rework (backward-compatible)

- New param `p_collector_relationship text DEFAULT NULL` (added last → existing callers unaffected).
- Generate one `checkout_batch_id`; **stamp the per-device columns** for each device in `p_device_ids` (keep the existing per-device custody-ledger writes; record relationship in the custody `metadata`).
- **ID gate:** `IF p_collector_relationship IS NOT NULL AND p_collector_relationship <> 'self' AND coalesce(trim(p_collector_id),'') = '' THEN RAISE`. (A null relationship — old callers — is NOT gated, so it stays backward-compatible.)
- **Status semantics:** transition the case to **delivered** only when **all** non-deleted `case_devices` have `checked_out_at` (full collection). A partial collection updates `cases.checkout_*` (last-collection convenience) + `recovery_outcome` but does **not** flip the status.

## 3. Checkout form (`dataFetcher` + `checkoutAdapter`)

- **Devices:** fetch only the **latest batch** (`checkout_batch_id` of the most recent `checked_out_at`) for the form; print those. Fallback to all devices only when no checkout has been recorded (e.g. preview).
- **Dedupe:** Customer Information keeps Name/Company/Phone/Email. **Case Details** → Case ID · Service · Recovery Outcome · Checkout Date (drop the repeated Name/Company/Phone).
- **Collector block:** read the batch's collector fields. When relationship = `self` → "Collected by customer." Otherwise → "Collected by **[name]** · **on behalf of [customer]**" with relationship label, **National ID**, and mobile.

## 4. Checkout modal / UX (`DeviceCheckoutModal`, `useCaseQueries`)

- Device fetch includes the new checkout columns; **already-returned devices** render greyed with "Returned · [date]" and are non-selectable (resumable partial collection).
- New **Relationship** selector (default `self`, prefilled with the customer). Switching off `self` clears the prefill and makes **National ID required** (client validation mirrors the RPC gate).
- Pass `p_collector_relationship` to the RPC.

## 5. Custody & migration safety

- Custody stays per-device + append-only (already correct); relationship goes into the transfer/ledger `metadata`.
- Migration is additive. **Best-effort backfill:** set `checked_out_at` (+ collector fields) on `case_devices` from existing `chain_of_custody` `DEVICE_CHECKED_OUT` events so historical cases don't show as "still here." Where a case was checked out case-level only (`CASE_CHECKED_OUT`, no device ids), leave devices null (cannot attribute).

## Testing
- RPC: per-device stamp for the selected subset; batch id set; ID gate fires when relationship≠self and ID empty; case → delivered only when all devices out; partial leaves status.
- Form (TDD on adapter): prints only the batch's devices; Case Details has no customer duplication; collector block shows "on behalf of" + ID when not self, "Collected by customer" when self.
- Modal: already-returned devices non-selectable; ID required when relationship≠self.

## Out of scope (follow-ups)
- ID document upload (scan/photo to Storage) and signature capture (the "fullest forensic trail" option) — deferred.
- Reprinting a specific historical batch (form defaults to latest batch).
