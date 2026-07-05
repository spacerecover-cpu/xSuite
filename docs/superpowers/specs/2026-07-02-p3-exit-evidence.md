# P3 Localization Phase 3 — Exit Evidence (WP-4→WP-7)

_Recorded 2026-07-05 against canonical DB `ssmbegiyjivrcwgcqutu`. This is the phase's exit artifact.
Session scope = WP-4 (publish governance), WP-5 (Country Authoring Studio), WP-6 (CLDR import),
WP-7 (zatca_ph1 + retire einvoiceRouting + AE/SA packs). WP-1/2/3 shipped earlier on `main` (#369/#370/#371)._

## 1. AE/SA governed-pipeline proof (Task 32 Step 2)
```
code | config_status    | version | status    | dual_control
AE   | statutory_ready  | 1       | published | true
SA   | formatting_ready | 1       | published | true
```
- **AE reached `statutory_ready` end-to-end** through the governed pipeline: author (admin A) →
  fixtures gate (2/2, fresh) → **dual-control publish (admin B, author refused)** → machine-derived
  `statutory_ready`. Recorded gate JSON in `scripts/country-engine/publish-ae-pack.md`.
- **SA published `formatting_ready` — HONEST degradation**, not a failure: SA's seeded data mandates
  `zatca_ph2` (clearance_api, 2023) which this codebase does not implement, so the honesty bridge
  refuses to overclaim `statutory_ready`. `missing:["zatca_ph2"]`. SA carries `zatca_ph1` (implemented)
  + `tax.rounding_policy={half_up, level:line}`. See `publish-sa-pack.md`.
- `ae_sa_stale_fixtures = 0` — every AE/SA fixture recorded fresh + passing.
- Both published rows: `authored_by <> approved_by` (dual control held).

**Honest note on OM/SA vs the plan's "all three statutory_ready" exit line:** live GCC status is
`AE:statutory_ready, OM:formatting_ready, SA:formatting_ready`. OM was never governed-published
(Phase 1 left it `formatting_ready`; publishing an OM pack through the new gate is a trivial follow-up).
SA is capped by the unimplemented `zatca_ph2` (above). Only AE went through the full governed publish
this session — which is sufficient to prove the data path end-to-end.

## 2. Hardcode retirement + gates (Task 32 Step 3)
- `src/lib/pdf/engine/einvoiceRouting.ts` — **RETIRED** (deleted).
- `grep -rn "einvoiceRouting|normalizeSaudi|shouldEmitZatcaQr" src/` → **0**.
- `npm run typecheck` → **0**. `src/lib/pdf/engine` vitest → 515 green. zatca_ph1 3/3, gcc_return, CLDR 3/3.
- `statutory-fixtures` repo half gates OM+AE+SA through `runPublishGate(kernel)`.

## 3. Governance infra (WP-4)
- 11 authoring/publish RPCs live, SECURITY DEFINER, anon-revoked, provenance to `platform_audit_logs`,
  freshness via `content_updated_at`. `publish_country_pack` enforces all four gate parts.
- pg_cron `pack-staleness-daily` scheduled (`staleness_cron = 1`).
- WP-4 adversarial review: 8 confirmed findings remediated (incl. the critical capability-kind bridge
  + the bare-`{SEQ}` country-wide-issuance-break class).

## 4. Studio (WP-5) + CLDR (WP-6)
- Studio: list + staleness dashboard, editor over rates/requirements/regimes/numbering/facts/fixtures,
  reserved keys read-only, draft→in_review→published lifecycle, publish disabled-for-author in UI + RPC.
- WP-5 adversarial review: 12 confirmed findings remediated (incl. HIGH silent data-loss on edit).
- CLDR: fill-only operator seed (266 territories, zero DELETE/DROP), offline mapping suite green.

## 5. Findings surfaced by LIVE runbook execution (static review could not reach these)
| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | med | `submit_country_pack_for_review` bumped `content_updated_at` → stales fixtures → publish blocks | **FIXED** `phase3_wp7_submit_no_content_bump` |
| 2 | high | `platform_audit_logs.admin_id` FKs `platform_admins.id`, but `_pack_touch` inserted `auth.uid()` (=user_id) → 23503 on every authoring RPC | **FIXED** `phase3_wp7_pack_audit_admin_id_fk` (`_pack_admin_id()`) |
| 3 | med | `upsert_country_tax_rate` (no id) always INSERTs → collides with seeded effective rate; not the "idempotent upsert" the plan assumed | carry-forward (add ON CONFLICT) |
| 4 | design | publish capability gate requires ALL einvoice adapters incl. future/unimplemented (`zatca_ph2`) → SA capped at formatting_ready | carry-forward (gate on implemented/active phase only) |
| 5 | design | `countryFactsService` resolves the LATEST-mandated regime (`zatca_ph2`) over the implemented `zatca_ph1` → SA invoice QR does not emit | carry-forward (prefer latest REGISTERED regime) |

## 6. Carry-forwards for the owner
- Publish an OM pack through the gate to lift OM to `statutory_ready` (parity with AE).
- Resolve findings 3/4/5 (idempotent rate upsert; phase-aware capability gate; registered-regime QR resolver)
  so SA reaches `statutory_ready` and emits the Phase-1 QR once those refinements land.
- Apply the CLDR operator seed (`supabase/seeds/cldr_locale_facts.operator.sql`) after review — a deliberate operator step.
