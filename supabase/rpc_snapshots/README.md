# RPC source snapshots

Migrations are applied to the canonical Supabase DB via `mcp__supabase__apply_migration`
(never by dropping files into `supabase/migrations/` — see `CLAUDE.md`). For migrations
that **re-sign a SECURITY DEFINER RPC by anchored edits against its live body**, we keep a
byte-identical **source snapshot** of the applied SQL here so that:

1. the change is reviewable in git (not only as a live `pg_get_functiondef`), and
2. drift tests can read the actual SQL text without a live DB connection.

**These snapshots are the exact text applied via MCP.** If a future migration re-signs one of
these functions, update the snapshot in the same change — the drift tests
(`src/lib/regimes/gcc_tax_invoice/issuanceGateDrift.test.ts`) read this text and will fail if
the TS profile's notation strings, or the two duplicated buyer-identity SQL blocks, drift out
of sync (OWNER RULING #1, Localization Phase 2 WP-5).

| snapshot | applied migration (manifest) |
|---|---|
| `phase2_requirement_gate_and_snapshots.sql` | `20260704062125 phase2_requirement_gate_and_snapshots` |
| `phase2_record_stock_sale_tax.sql` | `20260704083618 phase2_record_stock_sale_tax` |
