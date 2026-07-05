import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPackDetail, upsertTaxRate, upsertRequirement, upsertEinvoiceRegime, upsertNumberingPolicy,
  type CountryTaxRateRow, type DocumentRequirementRow, type EinvoiceRegimeRow, type NumberingPolicyRow,
} from '../../lib/countryPackService';
import { countryPackKeys } from '../../lib/queryKeys';
import { PackRowsTable, type PackColumn } from '../../components/platform-admin/country-packs/PackRowsTable';
import { PackFactsTab } from '../../components/platform-admin/country-packs/PackFactsTab';
import { PackFixturesTab } from '../../components/platform-admin/country-packs/PackFixturesTab';
import { PackPublishPanel } from '../../components/platform-admin/country-packs/PackPublishPanel';

const TABS = ['Rates', 'Facts', 'Requirements', 'E-invoice', 'Numbering', 'Fixtures', 'Reserved', 'Lifecycle'] as const;
type Tab = (typeof TABS)[number];

// Owner decisions E8/E9 + E6: created in the Phase-1 pack schema, surfaced here
// so authors SEE the dimensions exist — but no consumer ships until Phase 6, so
// the Studio must not let them leak into tenants yet.
const RESERVED_KEYS = ['compliance.audit_file_exports', 'custody.unclaimed_property', 'privacy.regime'] as const;

export const CountryPackEditorPage: React.FC = () => {
  const { countryId = '' } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('Rates');

  const { data: detail, isLoading, isError, error } = useQuery({
    queryKey: countryPackKeys.detail(countryId),
    queryFn: () => getPackDetail(countryId),
    enabled: !!countryId,
  });
  if (isError) return <div role="alert" className="p-6 text-sm text-danger">Failed to load country pack: {error instanceof Error ? error.message : 'unknown error'}</div>;
  if (isLoading || !detail) return <div className="p-6 text-slate-500">Loading…</div>;

  const openVersion = detail.versions.find((v) => v.status === 'draft' || v.status === 'in_review') ?? null;
  const disabled = !openVersion;
  // Invalidate the whole country-pack tree (detail AND the list) so config_status /
  // lifecycle changes made here reflect immediately on the Country Packs list too.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: countryPackKeys.all });
  // On EDIT, round-trip the FULL existing row: the upsert_* RPCs overwrite the whole
  // column set unconditionally, so any column the grid doesn't surface (component_label_i18n,
  // sort_order, effective_from, config, …) would be silently nulled if we sent only the
  // edited fields. Spreading `existing` first preserves them; the RPC ignores keys it doesn't read.
  const withCountry = (draft: Record<string, unknown>, existing: Record<string, unknown> | null) => ({
    ...(existing ?? {}), ...draft, country_id: countryId,
  });

  const rateColumns: PackColumn<CountryTaxRateRow>[] = [
    { key: 'component_code', label: 'Component', render: (r) => r.component_code, input: { type: 'text', required: true } },
    { key: 'component_label', label: 'Label', render: (r) => r.component_label, input: { type: 'text', required: true } },
    { key: 'tax_category', label: 'Category', render: (r) => r.tax_category,
      input: { type: 'select', options: ['standard', 'reduced', 'zero', 'exempt'], required: true } },
    { key: 'rate', label: 'Rate %', render: (r) => String(r.rate), input: { type: 'number', required: true } },
    { key: 'valid_from', label: 'Valid from', render: (r) => r.valid_from, input: { type: 'date', required: true } },
    { key: 'valid_to', label: 'Valid to', render: (r) => r.valid_to ?? '—', input: { type: 'date' } },
  ];
  const requirementColumns: PackColumn<DocumentRequirementRow>[] = [
    { key: 'doc_type', label: 'Doc type', render: (r) => r.doc_type,
      input: { type: 'select', options: ['quote', 'invoice', 'credit_note', 'stock_sale'], required: true } },
    { key: 'field_key', label: 'Field', render: (r) => r.field_key,
      input: { type: 'select', required: true, options: [
        'buyer_tax_number', 'buyer_address', 'place_of_supply_subdivision_id', 'supply_date',
        'seller_tax_number', 'line.item_code', 'line.unit_code'] } },
    { key: 'level', label: 'Level', render: (r) => r.level, input: { type: 'select', options: ['block', 'warn'], required: true } },
    { key: 'condition', label: 'Condition (closed vocabulary)', render: (r) => JSON.stringify(r.condition), input: { type: 'json' } },
    { key: 'message_i18n', label: 'Message i18n', render: (r) => JSON.stringify(r.message_i18n), input: { type: 'json' } },
  ];
  const regimeColumns: PackColumn<EinvoiceRegimeRow>[] = [
    { key: 'code', label: 'Code', render: (r) => r.code, input: { type: 'text', required: true } },
    { key: 'regime_class', label: 'Class', render: (r) => r.regime_class,
      input: { type: 'select', required: true, options: [
        'render_artifact', 'clearance_api', 'chained_document', 'certified_software', 'filing_api'] } },
    { key: 'adapter_key', label: 'Adapter', render: (r) => r.adapter_key ?? '—', input: { type: 'text', required: true } },
    { key: 'mandatory_from', label: 'Mandatory from', render: (r) => r.mandatory_from ?? '—', input: { type: 'date' } },
    { key: 'thresholds', label: 'Thresholds', render: (r) => JSON.stringify(r.thresholds), input: { type: 'json' } },
  ];
  const numberingColumns: PackColumn<NumberingPolicyRow>[] = [
    { key: 'scope', label: 'Scope', render: (r) => r.scope, input: { type: 'text', required: true } },
    { key: 'format_template', label: 'Template', render: (r) => r.format_template ?? 'legacy prefix', input: { type: 'text' } },
    { key: 'reset_basis', label: 'Reset', render: (r) => r.reset_basis,
      input: { type: 'select', options: ['never', 'calendar_year', 'fiscal_year'], required: true } },
    { key: 'fiscal_year_anchor', label: 'FY anchor', render: (r) => r.fiscal_year_anchor ?? '—', input: { type: 'text' } },
    { key: 'max_length', label: 'Max len', render: (r) => (r.max_length != null ? String(r.max_length) : '—'), input: { type: 'number' } },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{detail.country.name}</h1>
        <p className="text-sm text-slate-500">
          {detail.country.code} · {detail.country.taxSystem ?? 'no tax system'} · {detail.country.configStatus}
          {openVersion && <> · editing v{openVersion.version} ({openVersion.status})</>}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t} role="tab" id={`packtab-${t}`} aria-controls="packtab-panel" aria-selected={tab === t}
                  className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-primary font-medium text-primary' : 'text-slate-500'}`}
                  onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="packtab-panel" aria-labelledby={`packtab-${tab}`} className="space-y-6">
      {tab === 'Rates' && (
        <PackRowsTable title="Effective-dated tax rates (geo_country_tax_rates)" rows={detail.rates}
          columns={rateColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertTaxRate(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'Facts' && (
        <PackFactsTab detail={detail} disabled={disabled} onChanged={invalidate} />
      )}
      {tab === 'Requirements' && (
        <PackRowsTable title="Document requirements (master_document_requirements)" rows={detail.requirements}
          columns={requirementColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertRequirement(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'E-invoice' && (
        <PackRowsTable title="E-invoice regimes (master_einvoice_regimes)" rows={detail.regimes}
          columns={regimeColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertEinvoiceRegime(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'Numbering' && (
        <PackRowsTable title="Numbering policies (master_numbering_policies)" rows={detail.numbering}
          columns={numberingColumns} disabled={disabled}
          onSave={async (d, e) => { await upsertNumberingPolicy(withCountry(d, e)); invalidate(); }} />
      )}
      {tab === 'Fixtures' && (
        <PackFixturesTab detail={detail} disabled={disabled} onChanged={invalidate} />
      )}
      {tab === 'Reserved' && (
        <div className="space-y-3">
          {RESERVED_KEYS.map((key) => (
            <div key={key} className="rounded-lg border border-dashed border-border bg-surface-muted p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{key}</span>
                <span className="rounded bg-warning-muted px-2 py-0.5 text-xs text-warning">
                  Reserved — not consumed yet (Phase 6)
                </span>
              </div>
              <pre className="mt-2 overflow-x-auto text-xs text-slate-500">
                {JSON.stringify(detail.country.countryConfig[key] ?? null, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
      {tab === 'Lifecycle' && (
        <PackPublishPanel detail={detail} onChanged={invalidate} />
      )}
      </div>
    </div>
  );
};
