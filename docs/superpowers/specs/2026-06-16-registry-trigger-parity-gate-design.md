# Registry ↔ Trigger Parity CI Gate — Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Parent initiative:** Country Engine worldwide (`docs/superpowers/specs/2026-06-15-country-engine-design.md`, §2.7)
**Branch:** `feat/registry-trigger-parity-gate`

## 1. Problem

The Country Engine has **two independent declarations** of which config keys are
*jurisdiction-derived* (country-locked — no tenant/entity may override them, e.g.
`tax.zatca_qr.enabled`):

1. **TypeScript (source of truth):** `STATUTORY_KEYS` in `src/lib/country/registry.ts`
   — derived as the registry entries whose `maxOverrideLayer === 'country'`.
2. **Postgres (enforcer):** the `statutory_keys text[] := ARRAY[...]` literal inside
   the `validate_country_config_overrides()` trigger function, wired to `tenants`
   via `trg_validate_country_config_overrides_tenants` (BEFORE INSERT/UPDATE OF
   `country_config_overrides`). It `RAISE EXCEPTION`s if a write targets one of
   those keys.

Today both sets equal `{tax.zatca_qr.enabled}` — in parity. But nothing keeps them
in parity. If someone adds a new country-locked key to the registry (say
`tax.eosb_required`) and forgets the SQL array, the app *believes* the key is
locked while the DB silently accepts a tenant override — the exact failure mode
**D11** represents (a non-KSA tenant faking ZATCA, or any tenant faking a
statutory value). The reverse drift (SQL has a key the registry dropped) is also a
defect: a now-overridable key gets rejected server-side.

The design spec §2.7 already names this a **CI-asserted deliverable**, not a noted
risk: a required-status check `registry-trigger-parity` that
"asserts `validate_country_config_overrides()`'s key-class list matches
`COUNTRY_CONFIG_REGISTRY`."

This spec implements **only the CI gate** (detect drift). It is **read-only**
against the database — no migration, no DDL.

## 2. Contract

The gate **fails** iff `set(STATUTORY_KEYS) ≠ set(trigger statutory_keys array)`.

- "registry" side = `STATUTORY_KEYS` imported directly from the module (no source
  regex — robust against refactors of the derivation).
- "trigger" side = the array literal extracted from the **live** function body
  (`pg_get_functiondef`). The live DB is the source of truth for schema in this
  repo (CLAUDE.md), and — per the migration workflow — the trigger migration is
  applied to prod *before* the PR is opened, so the live DB is in sync with (not
  behind) any PR that touches statutory keys, exactly as the `schema-drift` and
  `country-config-completeness` gates already assume.

## 3. Architecture

One new test file, `scripts/country-engine/registry-trigger-parity.test.ts`, run
under the existing `vitest.config.scripts.ts` (node env, globs
`scripts/**/*.test.ts`). Chosen because it is the only home that can both
`import { STATUTORY_KEYS }` and reach the DB, matches the established
country-engine-scripts convention (`geo:test`), and adds **zero new dependencies**.

Three pure functions + one thin live layer — all fragile logic is pure and
unit-tested; the live layer is glue:

| Unit | Signature | Responsibility |
|------|-----------|----------------|
| `parseTriggerStatutoryKeys` | `(funcDef: string) => string[]` | Extract the `statutory_keys ... := ARRAY[ ... ]` literal from a `pg_get_functiondef` string and return the quoted keys. Returns `[]` if no array is found (a missing/renamed function surfaces as empty → guaranteed mismatch vs the non-empty registry). |
| `diffStatutoryKeys` | `(registry: string[], trigger: string[]) => { missingInTrigger: string[]; extraInTrigger: string[]; inParity: boolean }` | Pure set diff. `missingInTrigger` = locked in TS but not enforced in SQL (the dangerous direction). `extraInTrigger` = enforced in SQL but no longer locked in TS. |
| `expectedTriggerArraySql` | `(registry: string[]) => string` | Emit the corrective literal, e.g. `ARRAY['currency.code','tax.zatca_qr.enabled']` (sorted, single-quoted), for the failure message so fixing a real drift is copy-paste into a migration. |
| live `describe` | — | `it.skip` when `process.env.SUPABASE_DB_URL` is unset (local/fork). Otherwise `execSync` a `psql -t -A -c` query returning `pg_get_functiondef(...)` for `validate_country_config_overrides`, feed it through `parseTriggerStatutoryKeys`, `diffStatutoryKeys` against `STATUTORY_KEYS`, and assert `inParity`. On failure, the message lists both diff directions and prints `expectedTriggerArraySql(STATUTORY_KEYS)`. |

### DB access

Via `node:child_process` `execSync('psql ...')`. The `pg` package is **not**
installed and is not added — `psql` is present on `ubuntu-latest` and is already
used directly by the `country-config-completeness` job. The query:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'validate_country_config_overrides';
```

`-t -A` (tuples-only, unaligned) yields the raw definition string for the parser.
If the function does not exist, the query returns no rows → empty def → parser
returns `[]` → mismatch → fail loud (correct: a missing enforcer is a parity
failure worth blocking on).

## 4. CI wiring

New job in `.github/workflows/ci.yml`. It is modeled on
`country-config-completeness` but **runs unconditionally** — a deliberate
departure from the full-skip DB gates. The pure parse/diff layer needs no DB and
is valuable on every PR (including forks); only the *live* `describe` requires
creds and self-skips via `describe.skipIf(!SUPABASE_DB_URL)`. So the job always
executes the command; the test file decides what runs:

```yaml
  registry-trigger-parity:
    runs-on: ubuntu-latest
    env:
      SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      # Runs unconditionally: pure parse/diff specs always assert; the live-DB
      # spec self-skips (describe.skipIf) when SUPABASE_DB_URL is absent
      # (Dependabot/fork PRs). Live parity is enforced on internal PRs + push to main.
      - run: npm run check:registry-trigger-parity
```

New `package.json` script:

```json
"check:registry-trigger-parity": "vitest run --config vitest.config.scripts.ts scripts/country-engine/registry-trigger-parity.test.ts"
```

Result: the parse/diff/emit logic is protected on **every** PR; the live
registry↔trigger comparison is enforced wherever `SUPABASE_DB_URL` is available
(internal PRs and push to `main`), matching the enforcement envelope of the other
DB-backed gates without sacrificing fork-side coverage of the pure logic.

## 5. Failure UX (worked example)

If a dev adds `tax.eosb_required` (`maxOverrideLayer:'country'`) to the registry
but not the trigger, the gate prints:

```
registry<->trigger parity FAILED.
  Locked in TS registry but NOT enforced by validate_country_config_overrides():
    - tax.eosb_required
  Fix: update the trigger's statutory_keys in a migration to:
    statutory_keys text[] := ARRAY['tax.eosb_required','tax.zatca_qr.enabled'];
```

## 6. Out of scope (flagged)

- **Generating the trigger body from the registry** (true codegen at migration
  time) — needs DDL approval; the `expectedTriggerArraySql` output reduces it to a
  copy-paste whenever drift is caught. Not in this work.
- **Extending the trigger to `legal_entities`** (§2.3 "and later `legal_entities`")
  — that trigger does not exist yet; when it does, the gate's live query widens to
  cover both functions. Out of scope now.
- **Operator note (required-status check):** after merge, add
  `registry-trigger-parity` to the branch-protection required checks in GitHub
  settings (same place the other six gates are registered). Documented in the PR.

## 7. Testing strategy (TDD)

1. Write `parseTriggerStatutoryKeys` tests first against the **real captured
   function body** (the `CREATE OR REPLACE FUNCTION ... ARRAY['tax.zatca_qr.enabled'] ...`
   string) → expect `['tax.zatca_qr.enabled']`; plus: no-array def → `[]`;
   multi-key `ARRAY['a','b']` → `['a','b']`; whitespace/newline tolerance.
2. `diffStatutoryKeys` tests: in-parity; missing-in-trigger; extra-in-trigger;
   both.
3. `expectedTriggerArraySql` test: sorted, single-quoted, comma-joined.
4. Live `describe`: proven by the parser fixture (cannot/should not mutate prod);
   the glue is asserted to be a no-op skip without creds and to call the pure
   pipeline with creds.

## 8. Risks

- **Parser fragility** vs `pg_get_functiondef` formatting — mitigated by anchoring
  on `statutory_keys` + `ARRAY[` and unit-testing against the real captured output.
  If the trigger is ever rewritten to source keys differently, the parser fails
  loud (empty → mismatch) rather than silently passing.
- **psql availability** — present on `ubuntu-latest`; the live layer self-skips
  with a clear message anywhere it is absent, so it never produces a false red.
