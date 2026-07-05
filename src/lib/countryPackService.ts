import { supabase } from './supabaseClient';
import { runPublishGate, type PackFixture, type FixtureRunResult } from './tax/publishGate';
import type { Database, Json } from '../types/database.types';

export type PackVersionRow = Database['public']['Tables']['master_country_pack_versions']['Row'];
export type PackTestRow = Database['public']['Tables']['master_country_pack_tests']['Row'];
export type CountryTaxRateRow = Database['public']['Tables']['geo_country_tax_rates']['Row'];
export type DocumentRequirementRow = Database['public']['Tables']['master_document_requirements']['Row'];
export type EinvoiceRegimeRow = Database['public']['Tables']['master_einvoice_regimes']['Row'];
export type NumberingPolicyRow = Database['public']['Tables']['master_numbering_policies']['Row'];

export interface PackCountrySummary {
  countryId: string; code: string; name: string; taxSystem: string | null;
  configStatus: string; publishedVersion: number | null; openVersion: PackVersionRow | null;
  stalenessDays: number | null; nextReviewDate: string | null;
}
export interface PublishGateResult {
  published: boolean; config_status: string;
  gate: {
    fixtures: { total: number; passed: number; stale: number };
    capabilities: { required: string[]; missing: string[] };
    dual_control: boolean;
    coverage: {
      standard_rate: boolean; invalid_requirement_conditions: number;
      numbering_over_max_length: number; numbering_missing_seq_token: number;
    };
    blockers: string[];
  };
}
export interface PackDetail {
  country: {
    id: string; code: string; name: string; taxSystem: string | null;
    configStatus: string; countryConfig: Record<string, unknown>;
    scalars: Record<string, unknown>;                       // allowlisted geo_countries facts (Facts tab pre-fill)
  };
  versions: PackVersionRow[];
  rates: CountryTaxRateRow[]; requirements: DocumentRequirementRow[]; regimes: EinvoiceRegimeRow[];
  numbering: NumberingPolicyRow[]; tests: PackTestRow[];
}
export interface FixtureRunSummary { total: number; passed: number; results: FixtureRunResult[]; }

export async function listPackCountries(): Promise<PackCountrySummary[]> {
  const { data: countries, error } = await supabase
    .from('geo_countries')
    .select('id, code, name, tax_system, config_status')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  const { data: versions, error: vErr } = await supabase
    .from('master_country_pack_versions')
    .select('*')
    .order('version', { ascending: false });
  if (vErr) throw vErr;
  return (countries ?? []).map((c) => {
    const mine = (versions ?? []).filter((v) => v.country_id === c.id);
    const published = mine.find((v) => v.status === 'published') ?? null;
    const open = mine.find((v) => v.status === 'draft' || v.status === 'in_review') ?? null;
    return {
      countryId: c.id, code: c.code, name: c.name, taxSystem: c.tax_system,
      configStatus: c.config_status,
      publishedVersion: published?.version ?? null,
      openVersion: open,
      stalenessDays: published?.staleness_days ?? null,
      nextReviewDate: published?.next_review_date ?? null,
    };
  });
}

export async function getPackDetail(countryId: string): Promise<PackDetail> {
  const { data: country, error } = await supabase
    .from('geo_countries')
    .select('id, code, name, tax_system, config_status, country_config, currency_code, currency_symbol, decimal_places, tax_label, tax_number_label, default_tax_rate, locale_code, timezone, date_format, fiscal_year_start, language_code')
    .eq('id', countryId)
    .maybeSingle();
  if (error) throw error;
  if (!country) throw new Error(`getPackDetail: country ${countryId} not found`);
  const q = <T>(p: PromiseLike<{ data: T[] | null; error: unknown }>) =>
    p.then((r) => { if (r.error) throw r.error; return r.data ?? []; });
  const [versions, rates, requirements, regimes, numbering, tests] = await Promise.all([
    q(supabase.from('master_country_pack_versions').select('*').eq('country_id', countryId).order('version', { ascending: false })),
    q(supabase.from('geo_country_tax_rates').select('*').eq('country_id', countryId).is('deleted_at', null).order('sort_order')),
    q(supabase.from('master_document_requirements').select('*').eq('country_id', countryId)),
    q(supabase.from('master_einvoice_regimes').select('*').eq('country_id', countryId).is('deleted_at', null)),
    q(supabase.from('master_numbering_policies').select('*').eq('country_id', countryId).is('deleted_at', null)),
    q(supabase.from('master_country_pack_tests').select('*').eq('country_id', countryId)),
  ]);
  const c = country as Record<string, unknown>;
  return {
    country: {
      id: country.id, code: country.code, name: country.name, taxSystem: country.tax_system,
      configStatus: country.config_status, countryConfig: (country.country_config ?? {}) as Record<string, unknown>,
      scalars: {
        currency_code: c.currency_code, currency_symbol: c.currency_symbol, decimal_places: c.decimal_places,
        tax_system: country.tax_system, tax_label: c.tax_label, tax_number_label: c.tax_number_label,
        default_tax_rate: c.default_tax_rate, locale_code: c.locale_code, timezone: c.timezone,
        date_format: c.date_format, fiscal_year_start: c.fiscal_year_start, language_code: c.language_code,
      },
    },
    versions, rates, requirements, regimes, numbering, tests,
  };
}

async function rpcReturningString(name: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as string;
}
export const createPackDraft = (countryId: string, changelog: string) =>
  rpcReturningString('create_country_pack_draft', { p_country_id: countryId, p_changelog: changelog });
export async function submitPackForReview(packVersionId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_country_pack_for_review', { p_pack_version_id: packVersionId });
  if (error) throw error;
}
export async function publishPack(countryId: string, version: number): Promise<PublishGateResult> {
  const { data, error } = await supabase.rpc('publish_country_pack', { p_country_id: countryId, p_version: version });
  if (error) throw error;
  return data as unknown as PublishGateResult;
}
export const upsertTaxRate = (row: Record<string, unknown>) => rpcReturningString('upsert_country_tax_rate', { p_row: row });
export const upsertRequirement = (row: Record<string, unknown>) => rpcReturningString('upsert_document_requirement', { p_row: row });
export const upsertEinvoiceRegime = (row: Record<string, unknown>) => rpcReturningString('upsert_country_einvoice_regime', { p_row: row });
export const upsertNumberingPolicy = (row: Record<string, unknown>) => rpcReturningString('upsert_country_numbering_policy', { p_row: row });
export const upsertPackTest = (row: Record<string, unknown>) => rpcReturningString('upsert_country_pack_test', { p_row: row });
export async function updatePackFacts(countryId: string, scalars: Record<string, unknown>, config: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('update_country_pack_facts',
    { p_country_id: countryId, p_scalars: scalars as unknown as Json, p_config: config as unknown as Json });
  if (error) throw error;
}

/** Replays every DB-resident fixture through the shared runner and RECORDS each
 *  result — this is what makes gate part ① satisfiable. Mode: 'kernel' (pure
 *  kernel replay). */
export async function runPackFixtures(countryId: string, countryCode: string): Promise<FixtureRunSummary> {
  const { data: tests, error } = await supabase
    .from('master_country_pack_tests')
    .select('*')
    .eq('country_id', countryId);
  if (error) throw error;
  const fixtures: PackFixture[] = (tests ?? []).map((t) => ({
    name: t.name, input_document: t.input_document as Record<string, unknown>,
    expected: t.expected as Record<string, unknown>,
  }));
  const outcome = await runPublishGate({ countryCode, fixtures, mode: 'kernel' });
  for (const t of tests ?? []) {
    const result = outcome.results.find((r) => r.name === t.name);
    const { error: recErr } = await supabase.rpc('record_pack_test_result', {
      p_test_id: t.id,
      p_result: { pass: result?.pass ?? false, diffs: result?.diffs ?? [], name: t.name } as unknown as Json,
    });
    if (recErr) throw recErr;
  }
  return { total: fixtures.length, passed: outcome.results.filter((r) => r.pass).length, results: outcome.results };
}
