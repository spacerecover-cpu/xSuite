import { describe, it, expect } from 'vitest';
import { runPublishGate, type PackFixture } from './publishGate';
import omStandard from '../regimes/simple_vat/fixtures/om-standard-invoice.json';

describe('runPublishGate', () => {
  it('kernel mode: green fixture passes with a trace and no diffs', async () => {
    const { pass, results } = await runPublishGate({
      countryCode: 'OM', fixtures: [omStandard as unknown as PackFixture], mode: 'kernel',
    });
    expect(pass).toBe(true);
    expect(results[0]).toMatchObject({ name: omStandard.name, pass: true, diffs: [] });
    expect(results[0].trace?.regimeKey).toBe('simple_vat');
  });
  it('kernel mode: a wrong expectation fails with a path-addressed diff', async () => {
    const bad = JSON.parse(JSON.stringify(omStandard)) as PackFixture;
    (bad.expected as { totals: { taxTotal: number } }).totals.taxTotal = 999;
    const { pass, results } = await runPublishGate({ countryCode: 'OM', fixtures: [bad], mode: 'kernel' });
    expect(pass).toBe(false);
    expect(results[0].diffs).toContainEqual({ path: 'totals.taxTotal', expected: 999, actual: 72 });
  });
  it('dry_run_rpc mode throws until the Phase-3 publish RPC harness ships', async () => {
    await expect(runPublishGate({ countryCode: 'OM', fixtures: [], mode: 'dry_run_rpc' }))
      .rejects.toThrowError(/Phase 3/);
  });
});
