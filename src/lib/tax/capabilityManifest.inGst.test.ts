import { describe, it, expect } from 'vitest';
import { registerAllRegimePlugins } from '../regimes/register';
import { listRegisteredCapabilities } from '../regimes/registry';
import { KIND_TO_CAPABILITY } from './capabilityManifest';

describe('in_gst_invoice is present in the code capability registry (never hand-seeded)', () => {
  it('the documents profile is registered and maps to a regime_adapter row', () => {
    registerAllRegimePlugins();
    const caps = listRegisteredCapabilities();
    const row = caps.find((c) => c.capability_key === 'in_gst_invoice' && c.kind === 'documents');
    expect(row).toBeDefined();
    expect(row?.version).toBe('1.0.0');
    expect(KIND_TO_CAPABILITY[row!.kind]).toBe('regime_adapter');
  });
});
