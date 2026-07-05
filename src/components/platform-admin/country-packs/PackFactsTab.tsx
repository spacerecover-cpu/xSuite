import React, { useState } from 'react';
import { updatePackFacts, type PackDetail } from '../../../lib/countryPackService';
import { Button } from '../../ui/Button';

type FieldKind = 'text' | 'number' | 'select';
interface FactField { key: string; group: 'scalar' | 'config'; label: string; kind: FieldKind; options?: string[]; }

// Allowlist mirrors update_country_pack_facts(p_scalars) columns + the country-
// locked config keys a pack author sets. Units (master_unit_codes) are edited on
// the global Phase-2 surface, not per-pack here (see this WP's Non-goal note).
const FACT_FIELDS: FactField[] = [
  { key: 'currency_code', group: 'scalar', label: 'Currency code', kind: 'text' },
  { key: 'currency_symbol', group: 'scalar', label: 'Currency symbol', kind: 'text' },
  { key: 'decimal_places', group: 'scalar', label: 'Decimal places', kind: 'number' },
  { key: 'tax_system', group: 'scalar', label: 'Tax system', kind: 'select', options: ['VAT', 'GST', 'SALES_TAX', 'NONE'] },
  { key: 'tax_label', group: 'scalar', label: 'Tax label', kind: 'text' },
  { key: 'tax_number_label', group: 'scalar', label: 'Tax number label', kind: 'text' },
  { key: 'default_tax_rate', group: 'scalar', label: 'Default tax rate (display only)', kind: 'number' },
  { key: 'locale_code', group: 'scalar', label: 'Locale', kind: 'text' },
  { key: 'timezone', group: 'scalar', label: 'Timezone (IANA)', kind: 'text' },
  { key: 'date_format', group: 'scalar', label: 'Date format', kind: 'text' },
  { key: 'fiscal_year_start', group: 'scalar', label: 'Fiscal year start (MM-DD)', kind: 'text' },
  { key: 'language_code', group: 'scalar', label: 'Language code', kind: 'text' },
  { key: 'regime.tax', group: 'config', label: 'Tax regime', kind: 'select', options: ['simple_vat', 'in_gst', 'us_sales_tax'] },
  { key: 'regime.einvoice', group: 'config', label: 'E-invoice regime', kind: 'select', options: ['no_einvoice', 'zatca_ph1', 'zatca_ph2', 'in_irn', 'uk_mtd'] },
  { key: 'regime.numbering', group: 'config', label: 'Numbering regime', kind: 'select', options: ['prefix_numbering', 'in_fiscal_numbering'] },
  { key: 'regime.documents', group: 'config', label: 'Document profile', kind: 'select', options: ['generic_invoice', 'gcc_tax_invoice', 'in_gst_invoice', 'us_plain_invoice'] },
  { key: 'regime.payroll', group: 'config', label: 'Payroll pack', kind: 'select', options: ['none', 'om_payroll'] },
  { key: 'tax.filing_frequency', group: 'config', label: 'Filing frequency', kind: 'select', options: ['monthly', 'quarterly', 'annual'] },
  { key: 'tax.period_anchor', group: 'config', label: 'Period anchor (MM-DD)', kind: 'text' },
  { key: 'tax.return_composer', group: 'config', label: 'Return composer', kind: 'select', options: ['gcc_return', 'gstr', 'us_jurisdiction_remit', 'uk_mtd_9box'] },
  { key: 'format.amount_words_scale', group: 'config', label: 'Amount-in-words scale', kind: 'select', options: ['western', 'indian'] },
];
const ROUNDING_MODES = ['half_up', 'half_even'] as const;
const ROUNDING_LEVELS = ['line', 'document'] as const;

export const PackFactsTab: React.FC<{ detail: PackDetail; disabled: boolean; onChanged: () => void }> = ({ detail, disabled, onChanged }) => {
  const cfg = detail.country.countryConfig ?? {};
  const scalars = detail.country.scalars ?? {};
  const initial: Record<string, string> = {};
  for (const f of FACT_FIELDS) {
    const raw = f.group === 'scalar' ? scalars[f.key] : cfg[f.key];
    initial[f.key] = raw == null ? '' : String(raw);
  }
  const rp = (cfg['tax.rounding_policy'] ?? {}) as { mode?: string; level?: string; cash_increment?: number };
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [rMode, setRMode] = useState<string>(rp.mode ?? 'half_up');
  const [rLevel, setRLevel] = useState<string>(rp.level ?? 'document');
  const [rCash, setRCash] = useState<string>(rp.cash_increment == null ? '' : String(rp.cash_increment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const outScalars: Record<string, unknown> = {};
      const outConfig: Record<string, unknown> = {};
      for (const f of FACT_FIELDS) {
        const v = values[f.key];
        if (v === '') continue;                                   // blank = leave unchanged (RPC COALESCEs scalars)
        const parsed: unknown = f.kind === 'number' ? Number(v) : v;
        if (f.group === 'scalar') outScalars[f.key] = parsed;
        else outConfig[f.key] = parsed;
      }
      const rounding: Record<string, unknown> = { mode: rMode, level: rLevel };
      if (rCash !== '') rounding.cash_increment = Number(rCash);
      outConfig['tax.rounding_policy'] = rounding;
      await updatePackFacts(detail.country.id, outScalars, outConfig);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Formatting scalars, jurisdiction regime bindings, filing shape, rounding policy and amount-in-words scale.
        The <code>regime.*</code> / <code>tax.*</code> keys are country-locked — a tenant can never override them.
        Blank leaves a value unchanged.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {FACT_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">{f.label} <span className="font-mono text-xs text-slate-400">{f.key}</span></span>
            {f.kind === 'select' ? (
              <select aria-label={`${f.label} (${f.key})`} disabled={disabled} value={values[f.key]}
                      className="rounded border border-border px-2 py-1" onChange={(e) => set(f.key, e.target.value)}>
                <option value="">—</option>
                {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input aria-label={`${f.label} (${f.key})`} disabled={disabled} value={values[f.key]}
                     type={f.kind === 'number' ? 'number' : 'text'}
                     className="rounded border border-border px-2 py-1" onChange={(e) => set(f.key, e.target.value)} />
            )}
          </label>
        ))}
      </div>
      <fieldset className="rounded border border-border p-3">
        <legend className="px-1 text-sm font-medium">tax.rounding_policy</legend>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">Mode
            <select aria-label="tax.rounding_policy.mode" disabled={disabled} value={rMode}
                    className="rounded border border-border px-2 py-1" onChange={(e) => setRMode(e.target.value)}>
              {ROUNDING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Level
            <select aria-label="tax.rounding_policy.level" disabled={disabled} value={rLevel}
                    className="rounded border border-border px-2 py-1" onChange={(e) => setRLevel(e.target.value)}>
              {ROUNDING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Cash increment
            <input aria-label="tax.rounding_policy.cash_increment" disabled={disabled} value={rCash} type="number"
                   className="rounded border border-border px-2 py-1" onChange={(e) => setRCash(e.target.value)} />
          </label>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button variant="primary" disabled={disabled || saving} onClick={save}>
        {saving ? 'Saving…' : 'Save facts'}
      </Button>
    </div>
  );
};
