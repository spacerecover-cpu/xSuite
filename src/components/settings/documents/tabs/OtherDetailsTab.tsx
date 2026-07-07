import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { Textarea } from '../../../ui/Textarea';
import { ColorField, FieldGroup, SegmentedControl, ToggleRow } from '../controls';
import { PDF_COLORS } from '../../../../lib/pdf/styles';
import { resolveSecondary, secondaryText, type SectionConfig, type TranslationPolicyConfig } from '../../../../lib/pdf/templateConfig';
import { isRTLLanguage, type LanguageCode } from '../../../../lib/documentTranslations';
import {
  SECONDARY_LANGUAGE_OPTIONS,
  languageName,
  layoutOptions,
  patchForLayout,
  patchForSecondary,
  type StudioLayoutMode,
} from '../languageOptions';
import type { StudioApi } from '../TemplateStudio';

/** Sections that render a coloured header band / table-header row, so a per-section
 *  "Header background" picker actually does something. */
const HEADER_SECTIONS = new Set<string>([
  'parties', 'meta', 'caseInfo', 'bank', 'collector', 'custodySummary', 'payslipInfo', 'recordTerms',
  'lineItems', 'devices', 'paymentHistory', 'custodyLog', 'earnings', 'deductions', 'taxBar',
]);

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
    'The STANDARD Terms & Conditions for this document type — set the content in the Terms & Conditions section above. Printed only when you fill it in; it never falls back to the per-record terms.',
  recordTerms:
    'The terms entered on each quote/invoice (from Terms & Templates). The content comes from the record — position, rename, or hide the section here. Omitted automatically when a record has no terms.',
  bank:
    'The bank-account box renders as its own section — reorder or hide it like any other, and pick Boxed or Single line below.',
};

const SECTION_LABELS: Record<string, string> = {
  header: 'Header & logo',
  docRef: 'Case ID banner',
  parties: 'Customer / party details',
  meta: 'Document details',
  caseInfo: 'Case information',
  devices: 'Devices',
  collector: 'Collector',
  lineItems: 'Line items table',
  totals: 'Totals',
  paymentHistory: 'Payment history',
  terms: 'Terms & Conditions',
  recordTerms: 'Quote / Invoice Terms',
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

/**
 * The per-block translation toggles offered under "Custom — choose per block",
 * each paired with the document SECTION it governs and its UI label. A block is
 * offered only when that section is present on the current document type — so
 * Collector shows on the checkout form but never on an invoice. `payslip`
 * governs the `payslipInfo` section (the only non-1:1 mapping).
 */
const TRANSLATION_BLOCKS: ReadonlyArray<
  readonly [keyof NonNullable<TranslationPolicyConfig['groups']>, string, string]
> = [
  ['parties', 'parties', 'Customer / party details'],
  ['meta', 'meta', 'Document details'],
  ['caseInfo', 'caseInfo', 'Case information'],
  ['collector', 'collector', 'Collector'],
  ['payslip', 'payslipInfo', 'Payslip'],
  ['diagnostics', 'diagnostics', 'Diagnostics'],
  ['paymentHistory', 'paymentHistory', 'Payment history'],
  ['totals', 'totals', 'Total box'],
];

export const OtherDetailsTab: React.FC<{ api: StudioApi }> = ({ api }) => {
  const ordered = useMemo(
    () => [...api.resolved.sections].sort((a, b) => a.order - b.order),
    [api.resolved.sections],
  );

  const language = api.resolved.language;
  // The effective secondary language for the current config (any of the 13, or
  // null for English-only). Drives every authored-content secondary field below.
  const secondary: LanguageCode | null = language.mode === 'en' ? null : resolveSecondary(language);
  const secondaryName = languageName(secondary);
  const secondaryRTL = secondary ? isRTLLanguage(secondary) : false;

  // The side-by-side layout only makes sense when the document has both a
  // customer/party block and a document-details block — the financial "meta" box
  // or, on intake/checkout docs, the "case information" box.
  const hasPartiesAndDetails = useMemo(
    () =>
      ordered.some((s) => s.key === 'parties') &&
      ordered.some((s) => s.key === 'meta' || s.key === 'caseInfo'),
    [ordered],
  );

  // Only offer per-block translation toggles for blocks whose section actually
  // exists on this document type (so e.g. Collector never shows on an invoice).
  const customBlocks = useMemo(() => {
    const present = new Set(api.resolved.sections.map((s) => s.key));
    return TRANSLATION_BLOCKS.filter(([, sectionKey]) => present.has(sectionKey));
  }, [api.resolved.sections]);

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

  // The per-record terms section is named for the document it lives on.
  const recordTermsLabel =
    api.docType === 'invoice' ? 'Invoice Terms'
    : api.docType === 'quote' ? 'Quote Terms'
    : 'Document Terms';
  const displayLabel = (key: string): string =>
    key === 'recordTerms' ? recordTermsLabel : sectionLabel(key);

  return (
    <div className="space-y-7">
      <FieldGroup title="Document language (this template)" description="Sets the language for THIS document type — overrides the workspace default in Settings → Localization Center. Add a secondary language (any of 13) and choose the layout; reading direction (RTL) is automatic.">
        <Select
          label="Secondary language"
          value={secondary ?? ''}
          onChange={(e) =>
            api.setLanguage(patchForSecondary((e.target.value || null) as LanguageCode | null, language.mode))
          }
          options={SECONDARY_LANGUAGE_OPTIONS}
        />
        {secondary && (
          <Select
            label="Layout"
            value={language.mode === 'en' ? 'bilingual_stacked' : (language.mode as StudioLayoutMode)}
            onChange={(e) => api.setLanguage(patchForLayout(e.target.value as StudioLayoutMode, secondary))}
            options={layoutOptions(secondary)}
          />
        )}
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
        {api.resolved.translationPolicy?.mode === 'custom' &&
          (customBlocks.length > 0 ? (
            <div className="space-y-2">
              {customBlocks.map(([group, , label]) => (
                <ToggleRow
                  key={group}
                  label={`Translate ${label} labels`}
                  checked={api.resolved.translationPolicy?.groups?.[group] ?? true}
                  onChange={(v) => api.setTranslationGroup(group, v)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No translatable blocks on this document type.</p>
          ))}
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
        description={
          secondary
            ? `Printed on this document type — a Quotation's terms differ from an Invoice's, so each template has its own. Fill in the ${secondaryName} text to show terms in both languages on bilingual documents.`
            : "Printed on this document type — a Quotation's terms differ from an Invoice's, so each template has its own."
        }
      >
        <div className="space-y-4">
          <Textarea
            label="Terms & Conditions (English)"
            value={api.resolved.termsContent?.terms?.en ?? ''}
            onChange={(e) => api.setTermsContent({ terms: { en: e.target.value } })}
            rows={4}
            placeholder="e.g. This quotation is valid for 30 days. 50% advance required to begin."
          />
          {secondary && (
            <Textarea
              label={`Terms & Conditions (${secondaryName})`}
              value={secondaryText(api.resolved.termsContent?.terms, secondary) ?? ''}
              onChange={(e) => api.setTermsContent({ terms: { i18n: { [secondary]: e.target.value } } })}
              rows={4}
              dir={secondaryRTL ? 'rtl' : undefined}
              className={secondaryRTL ? 'text-right' : undefined}
              placeholder={`${secondaryName} translation of the terms…`}
            />
          )}
          <Textarea
            label="Notes (English)"
            value={api.resolved.termsContent?.notes?.en ?? ''}
            onChange={(e) => api.setTermsContent({ notes: { en: e.target.value } })}
            rows={3}
            placeholder="Optional — shown beneath the terms."
          />
          {secondary && (
            <Textarea
              label={`Notes (${secondaryName})`}
              value={secondaryText(api.resolved.termsContent?.notes, secondary) ?? ''}
              onChange={(e) => api.setTermsContent({ notes: { i18n: { [secondary]: e.target.value } } })}
              rows={3}
              dir={secondaryRTL ? 'rtl' : undefined}
              className={secondaryRTL ? 'text-right' : undefined}
              placeholder={`${secondaryName} notes…`}
            />
          )}
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
                      aria-label={`Move ${displayLabel(section.key)} up`}
                      disabled={index === 0}
                      onClick={() => api.moveSection(section.key, -1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Move ${displayLabel(section.key)} down`}
                      disabled={index === ordered.length - 1}
                      onClick={() => api.moveSection(section.key, 1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-800">{displayLabel(section.key)}</span>
                  <button
                    onClick={() => toggleSection(section)}
                    aria-pressed={section.visible}
                    aria-label={`${section.visible ? 'Hide' : 'Show'} ${displayLabel(section.key)}`}
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
                {section.key === 'bank' && (
                  <div className="mt-3 space-y-3">
                    <SegmentedControl
                      label="Display style"
                      columns={2}
                      value={section.bankStyle ?? 'boxed'}
                      onChange={(v) => api.patchSection('bank', { bankStyle: v })}
                      options={[
                        { value: 'boxed', label: 'Boxed' },
                        { value: 'inline', label: 'Single line' },
                      ]}
                    />
                    {(section.bankStyle ?? 'boxed') === 'boxed' && (
                      <>
                        <SegmentedControl
                          label="Box width"
                          columns={3}
                          value={section.bankWidth ?? 'auto'}
                          onChange={(v) => api.patchSection('bank', { bankWidth: v })}
                          options={[
                            { value: 'auto', label: 'Auto' },
                            { value: 'half', label: 'Half' },
                            { value: 'full', label: 'Full' },
                          ]}
                        />
                        {(section.bankWidth ?? 'auto') !== 'full' && (
                          <SegmentedControl
                            label="Alignment"
                            columns={3}
                            value={section.bankAlign ?? 'left'}
                            onChange={(v) => api.patchSection('bank', { bankAlign: v })}
                            options={[
                              { value: 'left', label: 'Left' },
                              { value: 'center', label: 'Center' },
                              { value: 'right', label: 'Right' },
                            ]}
                          />
                        )}
                      </>
                    )}
                    <p className="text-xs text-slate-500">
                      Single line prints the details on one compact line. Boxed: Auto hugs the content, Half is a fixed
                      half-width panel, Full spans the row.
                    </p>
                  </div>
                )}
                {(label || section.key === 'recordTerms') && (
                  <div className={`mt-3 grid gap-2 ${secondary ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <Input aria-label={`${displayLabel(section.key)} heading (English)`} placeholder={section.key === 'recordTerms' ? `Heading (EN) — ${recordTermsLabel}` : 'Heading (EN)'} value={label?.en ?? ''} onChange={(e) => api.setSectionLabel(section.key, 'en', e.target.value)} />
                    {secondary && (
                      <Input
                        aria-label={`${displayLabel(section.key)} heading (${secondaryName})`}
                        placeholder={`Heading (${secondaryName})`}
                        dir={secondaryRTL ? 'rtl' : undefined}
                        value={secondaryText(label, secondary) ?? ''}
                        onChange={(e) => api.setSectionLabel(section.key, secondary, e.target.value)}
                      />
                    )}
                  </div>
                )}
                {section.visible && HEADER_SECTIONS.has(section.key) && (
                  <div className="mt-3">
                    <ColorField
                      label="Header background"
                      value={section.headerBackground}
                      neutral={api.resolved.colors?.headerBackground ?? PDF_COLORS.headerBg}
                      onChange={(hex) => api.patchSection(section.key, { headerBackground: hex })}
                      against={api.resolved.colors?.text ?? PDF_COLORS.text}
                      againstLabel="vs text"
                      hint="Overrides this template's Header background for THIS section only."
                    />
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
