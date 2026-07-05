import { describe, expect, it } from 'vitest';
import { registerAllRegimePlugins } from '../regimes/register';
import { listRegisteredCapabilities } from '../regimes/registry';
import { KIND_TO_CAPABILITY } from './capabilityManifest';

// Real-registry drift guard (NOT mocked). If a new regime plugin is registered under a
// kind that KIND_TO_CAPABILITY doesn't translate into the DB's accepted vocabulary,
// sync_engine_capabilities would RAISE at runtime — this catches it in CI without a DB.
const DB_KINDS = new Set(['regime_adapter', 'scheme_mode', 'speller_scale', 'bank_file_op', 'filing_transport']);

describe('capability manifest — every registered plugin kind is DB-mappable', () => {
  it('maps the full live code registry into the DB kind vocabulary', () => {
    registerAllRegimePlugins();
    const caps = listRegisteredCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      const mapped = KIND_TO_CAPABILITY[c.kind] ?? c.kind;
      expect(DB_KINDS.has(mapped), `capability ${c.capability_key}: kind '${c.kind}' -> '${mapped}' not in DB vocabulary`).toBe(true);
    }
  });
});
