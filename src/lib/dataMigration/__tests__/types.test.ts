import { describe, it, expect, expectTypeOf } from 'vitest';
import fs from 'node:fs';
import type { Database } from '../../../types/database.types';

type Tables = Database['public']['Tables'];

describe('P0 generated types', () => {
  it('exposes data_migration_runs Row with the anchor columns', () => {
    expectTypeOf<Tables['data_migration_runs']['Row']>().toMatchTypeOf<{
      id: string; tenant_id: string; kind: string; status: string;
      file_hash: string | null; totals: unknown; counts: unknown;
    }>();
  });
  it('exposes data_migration_entity_map Row with the remap columns', () => {
    expectTypeOf<Tables['data_migration_entity_map']['Row']>().toMatchTypeOf<{
      run_id: string; entity_type: string; legacy_id: string;
      new_id: string | null; status: string;
    }>();
  });
});

describe('P0 legacy types removed', () => {
  const src = fs.readFileSync('src/types/database.types.ts', 'utf8');
  it.each(['import_export_templates','import_export_jobs','import_export_logs','import_field_mappings'])(
    'no longer declares %s', (name) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(src.includes(`${name}: {`)).toBe(false);
    });
  it('no longer declares the lookup_* functions', () => {
    expect(src.includes('lookup_brand:')).toBe(false);
  });
});
