#!/usr/bin/env bash
#
# regenerate-missing-migrations.sh
#
# Reconstructs the migration FILES that exist in the remote Supabase migration
# history (supabase_migrations.schema_migrations) but were never committed to
# supabase/migrations/.
#
# WHY THIS EXISTS
# ---------------
# Schema changes in this repo are applied to prod via the Supabase MCP
# (apply_migration) and recorded in supabase_migrations.schema_migrations, but
# only a subset of those migrations were ever committed as .sql files. The
# Supabase branching / "Supabase Preview" check replays the committed files onto
# a fresh database from scratch, so it fails the moment a committed migration
# references an object that an *uncommitted* migration created (e.g. a committed
# backfill reading tenants.resolved_country_config, a column added by an
# uncommitted migration). Completing the file history makes the replay match
# prod again and the Preview check pass.
#
# WHY A SCRIPT (and not the agent)
# --------------------------------
# Faithful reconstruction means copying every recorded statement verbatim. This
# script pulls each migration's recorded SQL straight from the database and
# writes it to disk, so the (large) SQL never has to be transcribed by hand.
#
# SAFETY
# ------
#  * Idempotent: skips any version that already has a committed file, so the
#    hand-authored files are never overwritten.
#  * The written content is byte-identical to what prod recorded
#    (array_to_string(statements, E'\n')), so every file matches the version
#    already applied to prod. On merge the Supabase integration skips
#    already-applied versions -> zero production risk.
#
# USAGE
# -----
#   SUPABASE_DB_URL='postgresql://postgres:<pw>@<host>:5432/postgres' \
#     bash scripts/regenerate-missing-migrations.sh
#
# Then review `git status`, commit the new files, push, and confirm the
# "Supabase Preview" check goes green on the PR.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to your Supabase Postgres connection string}"

MIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/migrations"
mkdir -p "$MIG_DIR"

written=0
skipped=0

# Pull every recorded migration (version + name) in apply order.
while IFS=$'\t' read -r version name; do
  [ -z "$version" ] && continue

  # Skip versions that already have a committed file (preserve hand-authored ones).
  if ls "$MIG_DIR/${version}_"*.sql >/dev/null 2>&1; then
    skipped=$((skipped + 1))
    continue
  fi

  out="$MIG_DIR/${version}_${name}.sql"
  # Write the recorded SQL verbatim (statements joined exactly as recorded).
  psql "$SUPABASE_DB_URL" -At \
    -v ON_ERROR_STOP=1 \
    -c "SELECT array_to_string(statements, E'\n') FROM supabase_migrations.schema_migrations WHERE version = '${version}'" \
    > "$out"
  echo "wrote ${out#"$MIG_DIR/"}"
  written=$((written + 1))
done < <(psql "$SUPABASE_DB_URL" -At -F $'\t' -v ON_ERROR_STOP=1 \
            -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version")

echo "----"
echo "reconstructed ${written} missing migration file(s); ${skipped} already present."
echo "Review with 'git status', commit the new files, and push to validate the Supabase Preview check."
