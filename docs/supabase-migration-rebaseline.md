# Supabase Preview re-baseline — completing the migration file history

## TL;DR

The **Supabase Preview** check has been red on every PR (and the `main`
preview branch sits at `MIGRATIONS_FAILED`) for a structural reason, **not**
because of any single PR: the `supabase/migrations/` folder is a sparse subset
of the migration history that prod actually has.

- **Prod** (`supabase_migrations.schema_migrations`): **127 applied migrations**.
- **Committed files** (`supabase/migrations/*.sql`): **23**.
- → **~104 migrations were applied to prod (via the Supabase MCP
  `apply_migration`) but never committed as files.**

Supabase branching replays the **committed files** onto a fresh database from
scratch. It dies at the first committed file that references an object created
by an *uncommitted* migration. The first such break is
`20260616142738_backfill_tenant_config_overrides_from_default_locale`, which
reads `tenants.resolved_country_config` / `tenants.country_config_overrides` —
columns created by `20260615082952_country_engine_phase1_foundation`, which is
**not** committed.

Fix: complete the file history so the committed folder once again matches prod.

## Why a script (and why it isn't generated in-agent)

Faithful reconstruction means copying ~427 kB of recorded SQL verbatim. The
authoritative source is prod's own `supabase_migrations.schema_migrations`
table, which stores the exact `statements` for all 127 migrations. The script
below streams each missing migration's recorded SQL straight from the database
to a file, so nothing is transcribed by hand.

> The agent that opened this PR runs in a sandbox **without** database
> credentials (and credential discovery is intentionally blocked), so it cannot
> run the reconstruction itself. Run the script once from an environment that
> has `SUPABASE_DB_URL` (your machine, or CI).

## How to run

```bash
SUPABASE_DB_URL='postgresql://postgres:<password>@<host>:5432/postgres' \
  bash scripts/regenerate-missing-migrations.sh
```

It will write the ~104 missing `supabase/migrations/<version>_<name>.sql` files
and **skip** every version that already has a committed file (the 23
hand-authored ones are never touched). Then:

```bash
git status                      # review the new files
git add supabase/migrations
git commit -m "chore(db): backfill missing migration files to repair branching replay"
git push
```

…and confirm the **Supabase Preview** check goes green on the PR.

## Why it's production-safe

- The reconstructed content is **byte-identical** to what prod recorded
  (`array_to_string(statements, E'\n')`), and every file's **version already
  exists** in prod's `schema_migrations`.
- On merge, the Supabase integration applies committed migration files to prod
  but **skips versions already applied** — so backfilling already-applied
  versions changes **nothing** on prod. (This is also why a single squashed
  baseline with a *new* version would be unsafe: the integration would try to
  apply it to prod, which already has the schema.)

## Validation & caveats

- Branching replays the full history from an empty database. Prod's statements
  built prod in this exact order, so they should replay cleanly. If the Preview
  still fails on a *specific* migration after regeneration, that migration isn't
  replay-clean from scratch (e.g. it depends on runtime/seed data) and should be
  guarded or fixed individually — the failing version is named in the check log.
- Keep it green going forward: commit a migration file for every schema change
  (the migration PR template already requires this). If a gap ever reappears,
  re-running this script is idempotent and repairs it.
