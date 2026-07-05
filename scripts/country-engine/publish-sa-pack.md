# Runbook — SA country pack: zatca_ph1 + line-rounding → publish (P3 WP-7 Task 30)

**Executed 2026-07-05 against `ssmbegiyjivrcwgcqutu`. Result: SA `formatting_ready` (HONEST degradation — see Finding 4).**

Same two admins + impersonation mechanism as `publish-ae-pack.md`.

## Repo fixtures (kernel-verified)
`sa_standard_invoice.json` (VAT 15% → 150 / 1150) and `sa_multiline_line_rounding.json`
(2 × SAR 10.10, `roundingPolicy.level='line'` → per-line 10.10×15% = 1.515 → **1.52**, Σ **3.04**;
the document-level alternative 3.03 is ruled out). Wired into `simpleVat.test.ts`: green — this is the
proof SA's line-level rounding is real, not the document default.

## Pre-req — `zatca_ph1` capability seeded
T27 registered the `zatca_ph1` transport in code; the DB manifest row was seeded (what the fixed
`syncEngineCapabilities` would push: einvoice kind → `regime_adapter`):
`INSERT INTO master_engine_capabilities (capability_key,kind,min_engine_version) VALUES ('zatca_ph1','regime_adapter','1.0.0')`.

## Author + submit (admin A)
`create_country_pack_draft(SA, …)` → `update_country_pack_facts(SA, {}, {tax.rounding_policy:{mode:'half_up',level:'line'}})`
→ `upsert_country_pack_test` ×2 (sa_standard, sa_multiline) → `record_pack_test_result(pass=true)` ×2 → submit.
**SA's VAT 15% rate AND its `zatca_ph1` render_artifact einvoice regime row (mandatory 2021-12-04) were
already seeded** — so no rate/regime upsert was needed. (The plan's "row #1" already existed; the T28
retirement of `einvoiceRouting.ts` now reads it as data.)

## Publish (admin B) — recorded gate result
```json
{ "published": true, "config_status": "formatting_ready",
  "gate": { "dual_control": true, "blockers": [],
    "fixtures": { "total": 2, "passed": 2, "stale": 0 },
    "capabilities": { "required": ["simple_vat","prefix_numbering","generic_invoice","no_einvoice","gcc_return","zatca_ph1","zatca_ph2"], "missing": ["zatca_ph2"] },
    "coverage": { "standard_rate": true, "invalid_requirement_conditions": 0, "numbering_over_max_length": 0, "numbering_missing_seq_token": 0 } } }
```
Persisted: SA `config_status='formatting_ready'`; `country_config->'tax.rounding_policy' = {mode:half_up, level:line}`;
pack v1 `published`, dual-control held.

## Finding 4 — HONEST DEGRADATION is correct, and reveals a real product gap (zatca_ph2)
SA's seeded data carries **two** einvoice regimes: `zatca_ph1` (render_artifact, mandatory 2021-12-04 —
**implemented** by T27/T28) AND `zatca_ph2` (clearance_api, mandatory 2023-01-01 — **NOT implemented**;
Phase-2 clearance is future work). The publish capability gate therefore requires `zatca_ph2`, which is
not a registered capability, so it honestly caps SA at `formatting_ready` (the pack still publishes;
config just does not overclaim `statutory_ready`). This is the honesty bridge working exactly as designed.

**Deliberate decision (not asked, per session directive):** I did NOT (a) seed a fake `zatca_ph2`
capability (that would be a dishonest claim of an unimplemented feature) nor (b) soft-delete the real
`zatca_ph2` regulatory row. SA is correctly `formatting_ready` until the Phase-2 clearance transport ships.

**Consequence for the QR (regime-routed, T28):** `countryFactsService` resolves `einvoiceRegimeKey` as the
adapter of the **latest** `mandatory_from <= today` = `zatca_ph2`. Since the adapter only emits for
`zatca_ph1`, SA invoices currently emit **no** QR. **Carry-forward:** the resolver should pick the latest
**implemented/registered** regime (skip unregistered adapters), and/or the publish capability gate should
only require regimes whose phase is implemented — so `zatca_ph1` QR emits while `zatca_ph2` remains a
declared-but-future obligation. Both are WP-4/T28 design refinements to raise with the owner.
