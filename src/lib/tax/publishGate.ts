//
// ONE fixture runner, resident in two harnesses (graft 1): repo CI runs mode
// 'kernel' on every commit; the Phase-3 publish_country_pack RPC harness runs
// mode 'dry_run_rpc' against the live engine at every data publish. Fixture
// JSON shape is identical to master_country_pack_tests rows by construction.

import { registerAllRegimePlugins } from '../regimes/register';
import { resolveTaxStrategy } from '../regimes/registry';
import type { RuleTrace, TaxContext } from '../regimes/types';

export interface PackFixture {
  name: string;
  input_document: Record<string, unknown>;
  expected: Record<string, unknown>;
}
export interface FixtureRunResult {
  name: string;
  pass: boolean;
  diffs: Array<{ path: string; expected: unknown; actual: unknown }>;
  trace: RuleTrace | null;
}

/** Leaf-wise subset diff: every leaf in `expected` must equal `actual`'s leaf. */
function diffSubset(
  expected: unknown, actual: unknown, path: string,
  out: Array<{ path: string; expected: unknown; actual: unknown }>,
): void {
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
      const next = actual !== null && typeof actual === 'object'
        ? (actual as Record<string, unknown>)[k] : undefined;
      diffSubset(v, next, path ? `${path}.${k}` : k, out);
    }
    return;
  }
  if (Array.isArray(expected)) {
    const arr = Array.isArray(actual) ? actual : [];
    expected.forEach((v, i) => diffSubset(v, arr[i], `${path}[${i}]`, out));
    return;
  }
  if (expected !== actual) out.push({ path, expected, actual });
}

export async function runPublishGate(args: {
  countryCode: string;
  fixtures: PackFixture[];
  mode: 'kernel' | 'dry_run_rpc';
}): Promise<{ pass: boolean; results: FixtureRunResult[] }> {
  if (args.mode === 'dry_run_rpc') {
    throw new Error(
      'runPublishGate mode "dry_run_rpc" is the publish_country_pack harness and ships in Phase 3. ' +
      'Repo CI uses mode "kernel".',
    );
  }
  registerAllRegimePlugins();
  const results: FixtureRunResult[] = [];
  for (const fixture of args.fixtures) {
    const ctx = fixture.input_document as unknown as TaxContext;
    const regimeKey = (fixture.input_document.regimeKey as string | undefined) ?? 'simple_vat';
    let result: FixtureRunResult;
    try {
      const strategy = resolveTaxStrategy(regimeKey);
      const computation = await strategy.compute(ctx);
      const diffs: FixtureRunResult['diffs'] = [];
      diffSubset(fixture.expected, computation as unknown as Record<string, unknown>, '', diffs);
      result = { name: fixture.name, pass: diffs.length === 0, diffs, trace: computation.trace };
    } catch (err) {
      result = {
        name: fixture.name, pass: false,
        diffs: [{ path: '(execution)', expected: 'computation completes', actual: String(err) }],
        trace: null,
      };
    }
    results.push(result);
  }
  return { pass: results.every((r) => r.pass), results };
}
