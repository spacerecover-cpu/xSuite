import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { Textarea } from '../../../ui/Textarea';
import { FieldGroup, ToggleRow } from '../controls';
import type { LanguageMode, SectionConfig, TranslationPolicyConfig } from '../../../../lib/pdf/templateConfig';
import type { StudioApi } from '../TemplateStudio';

/** Sections whose content depends on record data — a hint avoids "I toggled it but nothing showed". */
const DATA_DEPENDENT_HINTS: Record<string, string> = {
  taxBar: 'Needs a VAT/GST number (Transaction Details → set one, or use a manual value).',
  paymentHistory: 'Shows only when the document has recorded payments.',
  signature: 'Adds signature lines to the document.',
  qr: 'Renders a scannable verification QR code.',
};

/**
 * Always-on guidance for sections whose CONTENT or behavior is configured
 * elsewhere — so the option isn't a scavenger hunt. Shown regardless of the
 * section's show/hide state (e.g. the bank hint is most useful while hidden).
 */
const GUIDANCE_HINTS: Record<string, string> = {
  terms:
    'Body text uses your Standard Terms & Conditions (Settings → General → Legal & Compliance) when set; otherwise the terms entered on the document. Add the Arabic Standard T&C there to show terms in both languages on bilingual documents.',
  bank:
    'Shown inside the Terms section by default. Enable it here to place the bank-account details as their own movable, reorderable section.',
};

const SECTION_LABELS: Record<string, string> = {
  header: 'Header & logo',
  parties: 'Customer / party details',
  meta: 'Document details',
  caseInfo: 'Case information',
  devices: 'Devices',
  collector: 'Collector',
  lineItems: 'Line items table',
  totals: 'Totals',
  paymentHistory: 'Payment history',
  terms: 'Terms & notes',
  legalTerms: 'Consent / T&C',
  bank: 'Bank details',
  signature: 'Signature block',
  qr: 'QR code',
  footer: 'Footer',
  taxBar: 'VAT/GST bar',
  custodyLog: 'Chain-of-custody log',
  custodySummary: 'Custody summary',
  diagnostics: 'Diagnostics',
  reportSections: 'Report sections',
};
const sectionLabel = (key: string): string =>
  SECTION_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2');

export const OtherDetailsTab: React.FC<{ api: StudioApi }> = ({ api }) => {
  const ordered = useMemo(
    () => [...api.resolved.sections].sort((a, b) => a.order - b.order),
    [api.resolved.sections],
  );

  // The side-by-side layout only makes sense when the document has both a
  // customer/party block and a document-details block — the financial "meta" box
  // or, on intake/checkout docs, the "case information" box.
  const hasPartiesAndDetails = useMemo(
    () =>
      ordered.some((s) => s.key === 'parties') &&
      ordered.some((s) => s.key === 'meta' || s.key === 'caseInfo'),
    [ordered],
  );

  /**
   * Toggle a section's visibility. The VAT/GST bar is gated by BOTH section
   * visibility and `taxBar.enabled`, so flip both here — otherwise toggling it on
   * in this list would render nothing.
   */
  const toggleSection = (section: SectionConfig) => {
    const next = !section.visible;
    api.patchSection(section.key, { visible: next });
    if (section.key === 'taxBar') api.setTaxBar({ enabled: next });
  };

  return (
    <div className="space-y-7">
      <FieldGroup title="Language" description="Single language or bilingual (English + Arabic, RTL-aware).">
        <Select
          label="Document language"
          value={api.resolved.language.mode}
          onChange={(e) => api.setLanguage(e.target.value as LanguageMode)}
          options={[
            { value: 'en', label: 'English only' },
            { value: 'ar', label: 'Arabic only' },
            { value: 'bilingual_stacked', label: 'Bilingual — stacked (English over Arabic)' },
            { value: 'bilingual_sidebyside', label: 'Bilingual — side by side (English | Arabic)' },
          ]}
        />
      </FieldGroup>

      <FieldGroup title="Translation" description="Which labels render bilingually. Only affects bilingual documents; data values always stay as entered.">
        {(api.resolved.language.mode === 'en' || api.resolved.language.mode === 'ar') && (
          <p className="text-xs text-slate-500">Only applies to bilingual documents — set a bilingual document language above to use this.</p>
        )}
        <Select
          label="Translate"
          value={api.resolved.translationPolicy?.mode ?? 'all'}
          onChange={(e) => api.setTranslationPolicy({ mode: e.target.value as NonNullable<TranslationPolicyConfig['mode']> })}
          options={[
            { value: 'all', label: 'All labels (customer/employee field labels too)' },
            { value: 'system_only', label: 'System labels only (keep customer/employee field labels single-language)' },
            { value: 'custom', label: 'Custom — choose per block' },
          ]}
        />
        {api.resolved.translationPolicy?.mode === 'custom' && (
          <div className="space-y-2">
            {([
              ['parties', 'Customer / party details'],
              ['meta', 'Document details'],
              ['caseInfo', 'Case information'],
              ['collector', 'Collector'],
              ['payslip', 'Payslip'],
              ['diagnostics', 'Diagnostics'],
            ] as const).map(([group, label]) => (
              <ToggleRow
                key={group}
                label={`Translate ${label} labels`}
                checked={api.resolved.translationPolicy?.groups?.[group] ?? true}
                onChange={(v) => api.setTranslationGroup(group, v)}
              />
            ))}
          </div>
        )}
      </FieldGroup>

      {hasPartiesAndDetails && (
        <FieldGroup title="Layout" description="How the customer and document-details blocks are arranged.">
          <ToggleRow
            label="Customer & document details side by side"
            description="Place the customer block and the details block (document details, or case information) in two columns to fill the space; off stacks them full-width."
            checked={api.resolved.layout?.partiesMetaSideBySide ?? false}
            onChange={(v) => api.setLayout({ partiesMetaSideBySide: v })}
          />
        </FieldGroup>
      )}

      <FieldGroup
        title="Terms & Conditions"
        description="Printed on this document type — a Quotation's terms differ from an Invoice's, so each template has its own. Fill in the Arabic to show terms in both languages on bilingual documents."
      >
        <div className="space-y-4">
          <Textarea
            label="Terms & Conditions (English)"
            value={api.resolved.termsContent?.terms?.en ?? ''}
            onChange={(e) => api.setTermsContent({ terms: { en: e.target.value } })}
            rows={4}
            placeholder="e.g. This quotation is valid for 30 days. 50% advance required to begin."
          />
          <Textarea
            label="Terms & Conditions (Arabic)"
            value={api.resolved.termsContent?.terms?.ar ?? ''}
            onChange={(e) => api.setTermsContent({ terms: { ar: e.target.value } })}
            rows={4}
            dir="rtl"
            className="text-right"
            placeholder="الترجمة العربية للشروط والأحكام…"
          />
          <Textarea
            label="Notes (English)"
            value={api.resolved.termsContent?.notes?.en ?? ''}
            onChange={(e) => api.setTermsContent({ notes: { en: e.target.value } })}
            rows={3}
            placeholder="Optional — shown beneath the terms."
          />
          <Textarea
            label="Notes (Arabic)"
            value={api.resolved.termsContent?.notes?.ar ?? ''}
            onChange={(e) => api.setTermsContent({ notes: { ar: e.target.value } })}
            rows={3}
            dir="rtl"
            className="text-right"
            placeholder="ملاحظات اختيارية…"
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Sections" description="Show, hide, reorder, and rename each section.">
        <ul className="space-y-2">
          {ordered.map((section, index) => {
            const label = api.resolved.labels[section.key];
            return (
              <li key={section.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      aria-label={`Move ${sectionLabel(section.key)} up`}
                      disabled={index === 0}
                      onClick={() => api.moveSection(section.key, -1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Move ${sectionLabel(section.key)} down`}
                      disabled={index === ordered.length - 1}
                      onClick={() => api.moveSection(section.key, 1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-800">{sectionLabel(section.key)}</span>
                  <button
                    onClick={() => toggleSection(section)}
                    aria-pressed={section.visible}
                    aria-label={`${section.visible ? 'Hide' : 'Show'} ${sectionLabel(section.key)}`}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      section.visible ? 'bg-success-muted text-success' : 'bg-slate-100 text-slate-500',
                    ].join(' ')}
                  >
                    {section.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {section.visible ? 'Shown' : 'Hidden'}
                  </button>
                </div>
                {section.visible && DATA_DEPENDENT_HINTS[section.key] && (
                  <p className="mt-2 text-xs text-slate-500">{DATA_DEPENDENT_HINTS[section.key]}</p>
                )}
                {GUIDANCE_HINTS[section.key] && (
                  <p className="mt-2 text-xs text-slate-500">{GUIDANCE_HINTS[section.key]}</p>
                )}
                {label && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Input aria-label={`${sectionLabel(section.key)} heading (English)`} placeholder="Heading (EN)" value={label.en} onChange={(e) => api.setSectionLabel(section.key, 'en', e.target.value)} />
                    <Input aria-label={`${sectionLabel(section.key)} heading (Arabic)`} placeholder="العنوان (AR)" dir="rtl" value={label.ar ?? ''} onChange={(e) => api.setSectionLabel(section.key, 'ar', e.target.value)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </FieldGroup>
    </div>
  );
};
