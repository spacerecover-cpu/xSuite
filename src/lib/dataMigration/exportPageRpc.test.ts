import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const MIG_DIR = resolve(__dirname, '../../../supabase/migrations');
const file = readdirSync(MIG_DIR).find((f) => f.endsWith('_data_migration_export_rpc.sql'));
const sql = file ? readFileSync(resolve(MIG_DIR, file), 'utf8') : '';

describe('data_migration_export_rpc migration', () => {
  it('the migration file exists', () => {
    expect(file).toBeTruthy();
  });
  it('declares the exact RPC signature', () => {
    expect(sql).toMatch(
      /create or replace function public\.data_migration_export_page\s*\(\s*p_entity_type text,\s*p_after_created_at timestamptz,\s*p_after_id uuid,\s*p_limit int,\s*p_filters jsonb\s*\)\s*returns jsonb/i,
    );
  });
  it('is SECURITY DEFINER with a pinned search_path', () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*public/i);
  });
  it('is tenant-scoped via get_current_tenant_id and platform-admin escape', () => {
    expect(sql).toMatch(/get_current_tenant_id\(\)/);
    expect(sql).toMatch(/is_platform_admin\(\)/);
  });
  it('keyset-paginates on (created_at, id)', () => {
    expect(sql).toMatch(/p_after_created_at/);
    expect(sql).toMatch(/order by\s+created_at\s*,\s*id/i);
    expect(sql).toMatch(/limit\s+(?:p_limit|v_limit)/i);
  });
  it('resolves catalog uuids to names for devices (round-trips into import name-resolution)', () => {
    expect(sql).toMatch(/catalog_device_types/);
    expect(sql).toMatch(/catalog_interfaces/);
    expect(sql).toMatch(/'device_type'/);
    expect(sql).toMatch(/'interface'/);
  });
  it('emits the row id as legacy_id and parent uuids as *_legacy_id', () => {
    expect(sql).toMatch(/'legacy_id'/);
    expect(sql).toMatch(/'case_legacy_id'/);
  });
  it('grants EXECUTE to authenticated', () => {
    expect(sql).toMatch(/grant execute on function public\.data_migration_export_page.*to authenticated/is);
  });
});
