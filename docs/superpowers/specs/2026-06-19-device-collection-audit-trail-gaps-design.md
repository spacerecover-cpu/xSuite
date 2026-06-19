# Device-Collection Audit-Trail Gaps — Scoping & Design

> _2026-06-19._ Follow-up to the device-checkout fix (`DeviceCheckoutModal` detached-`this` bug,
> commit `aecc6b9`). That fix **restored** checkout recording; this document scopes the
> remaining chain-of-custody / accountability gaps into executable workstreams.
>
> **Status: scoping/design.** No code yet. Detailed TDD plans (one per workstream) follow on approval.

## 1. Verified current state (post-checkout-fix)

`log_case_checkout` (live def — `supabase/migrations/20260610162638_custody_ledger_write_paths.sql:87-185`, **read & verified**) records, in one transaction:

| What | Where (verified) |
|---|---|
| Append-only audit | `case_job_history` (`action='checkout'`, details JSON, `performed_by` = staff `auth.uid()`) |
| Queryable case projection | `cases.checkout_collector_name/_mobile/_id`, `checkout_date`, `recovery_outcome` (`database.types.ts:2673-2697`) |
| Per-device transfer | `chain_of_custody_transfers` (`from_person_name`=staff → `to_person_name`=collector, `transfer_reason='checkout'`) |
| Per-device forensic ledger | `chain_of_custody` (`DEVICE_CHECKED_OUT`, `actor_*`=staff, `custody_status='checked_out'`, collector in `metadata`) |

**Shown today** (recon-derived; confirm exact components at build): Case Details → **Chain of Custody** tab and **Activity** tab; **Checkout Form PDF**.

## 2. Gap catalog

| # | Gap | Root cause | Verified? | Type |
|---|---|---|---|---|
| G1 | Collecting staff not on the case projection | RPC writes staff only to ledger/history, not `cases` | ✅ (read RPC) | Capture (minor) |
| G2 | Checkout invisible in **Admin Audit Log** | `AuditTrails.tsx` queries `audit_trails` only; checkout lives in `case_job_history`/`chain_of_custody` | ✅ component exists; query scope per recon | Visibility |
| G3 | **Customer Timeline** doesn't exist | `CustomerProfilePage` has no activity/timeline surface | recon | Visibility |
| G4 | No **per-device History** view | transfers/ledger stored per `device_id`, no per-device UI | recon | Visibility |
| G5 | **Device condition / seal** at handoff not captured | `chain_of_custody_transfers` has **no** `condition_*`/`seal_*` columns (verified absent in `database.types.ts`); modal has no fields | ✅ columns absent | Capture (schema) |
| G6 | `checkout_notes` shown in PDF but never stored | PDF adapter reads `caseData.checkout_notes`; no column, no modal field (`dataFetcher` sets it `undefined`) | recon | Capture (schema) |
| G7 | No **evidence hash / photos** on checkout | `chain_of_custody.evidence_hash` exists (`database.types.ts:3498`) but never populated; no upload UI | ✅ column exists, unused | Capture |
| G8 | No **supervisor approval** / no **payment-or-QA gate** before release | `log_case_checkout` best-effort transitions; no separation-of-duties or release gate | ✅ (read RPC) | **Control** |

## 3. Workstreams

The gaps split into three independent subsystems. Per the writing-plans scope check, each becomes its **own** executable plan so each ships working software on its own.

### Workstream A — Visibility (read-only; no schema) · **recommended first**
Surfaces data that is *already captured*. Lowest risk, highest "is it visible?" payoff.

- **G2 Admin Audit Log:** add a "Case custody/activity" view. Options: (a) a new tab in `AuditTrails.tsx` that reads `chain_of_custody` + `case_job_history` (tenant-scoped) alongside the existing `audit_trails`; (b) a unified read model. **Recommend (a)** — additive, no backfill.
- **G3 Customer Timeline:** add a tenant-side timeline tab on `CustomerProfilePage` aggregating that customer's cases' `case_job_history` + custody events. **Decision:** portal-customer visibility is **out of scope** here (privacy/forensic) unless explicitly wanted.
- **G4 Per-device History:** a `DeviceHistory` panel (per `case_devices.id`) reading `chain_of_custody` + `chain_of_custody_transfers` filtered by `device_id`; reuse the existing Chain-of-Custody tab renderer.

No migration. Pure TanStack Query + components. Reuses existing custody read helpers in `src/lib/chainOfCustodyService.ts`.

### Workstream B — Forensic capture (schema + RPC + modal)
Enriches what checkout records. Additive migrations only (no destructive change; append-only custody tables stay append-only).

- **G6 `checkout_notes`:** add `cases.checkout_notes text`; add `p_checkout_notes` to `log_case_checkout` (write to the `cases` projection + `case_job_history` details + ledger `metadata`); add a notes `<textarea>` to `DeviceCheckoutModal`. The PDF adapter already reads it.
- **G1 staff on projection:** add `cases.checkout_by uuid REFERENCES profiles(id)`; set `= auth.uid()` in the RPC. Surface via the existing `AuditInfo` component.
- **G5 device condition / seal:** capture per device at handoff. **Recommend MVP** = store structured condition in the existing `chain_of_custody.metadata` jsonb (no migration) + modal fields; **follow-up** = normalize into dedicated `chain_of_custody_transfers` columns (`condition_at_handoff text`, `seal_number text`, `seal_intact boolean`) for queryability. **Decision:** MVP-jsonb vs normalized-columns.
- **G7 evidence hash / photos:** populate `chain_of_custody.evidence_hash`; optional photo upload to Storage. Larger; can defer.

All RPC edits go through `mcp__supabase__apply_migration` + regenerate `database.types.ts` + the migration PR template (per CLAUDE.md). RESTRICTIVE tenant isolation preserved.

### Workstream C — Control gates (policy) · **defer / fold into existing C3**
- **G8** (supervisor approval, payment-before-release, QA-before-close) is **already scoped** in `docs/critical-fixes-scope.md` (C3: enforce `qa_passed`+recovery inside `transition_case_status`, route `log_case_checkout` through it). **This plan does not duplicate C3.** Recommendation: fold the custody-audit aspects (record `supervisor_id`/approval on the ledger) into the C3 work when it lands.

## 4. Prioritization

| Order | Workstream | Rationale | Risk |
|---|---|---|---|
| 1 | **A — Visibility** | Data already exists; pure UI; immediate accountability win | Low |
| 2 | **B — Capture** | Closes real forensic gaps; additive migrations | Medium (schema + RPC + types) |
| 3 | **C — Control** | High value but already owned by C3; sequencing/policy heavy | High (state machine, policy) |

## 5. Open decisions (product owner)
1. **Customer Timeline audience:** tenant-staff only, or also portal customers? (privacy)
2. **Device condition capture:** ship MVP in `metadata` jsonb, or do normalized columns now?
3. **National ID:** keep optional, or enforce required for checkout (regulatory)?
4. **Control gates (C3):** confirm we fold custody-audit into C3 rather than a parallel effort.

## 6. Recommendation / handoff
Split into three plans. Start with **Workstream A (Visibility)** — lowest risk, surfaces already-captured data, no migration. On approval I'll write the bite-sized TDD plan `docs/superpowers/plans/2026-06-19-custody-visibility.md` (Admin Audit Log tab → per-device History → Customer Timeline), then proceed to Workstream B.
