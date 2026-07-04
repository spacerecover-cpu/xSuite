import { describe, it, expect } from 'vitest';
import type { DynamicContent } from 'pdfmake/interfaces';
import { BUILT_IN_TEMPLATE_CONFIGS, type TemplateDocumentType } from '../templateConfig';
import { buildPreviewEngineData } from './sampleData';
import { renderTemplate } from './renderTemplate';
import type { CompanySettingsData, TranslationContext } from '../types';

// ---------------------------------------------------------------------------
// Regression guard for the broken live preview: BEFORE the fix every doc type
// rendered with invoice sample data, so non-financial sections (devices,
// collector, custody log, earnings, …) had no data and the preview was blank.
// This asserts each doc type now renders NON-EMPTY content carrying its OWN
// doc-specific sample data.
// ---------------------------------------------------------------------------

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const pageSize = { width: 595, height: 842 } as never;

function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  Object.values(o).forEach((v) => collectText(v, out));
}

/** A doc-specific substring that only appears when the RIGHT sample data flows. */
const MARKERS: Record<TemplateDocumentType, string> = {
  invoice: 'RAID-5 logical recovery (4 × 4TB)',
  quote: 'RAID-5 logical recovery',
  credit_note: 'RAID-5 recovery attempt (refunded)',
  payment_receipt: 'RCPT-2026-0042',
  office_receipt: 'Seagate',
  customer_copy: 'Seagate',
  checkout_form: 'Bob Courier',
  case_label: 'CASE-0007',
  stock_label: 'Samsung 870 EVO 500GB',
  chain_of_custody: 'Drive received at intake counter.',
  report: 'Recoverability',
  payslip: 'Basic Salary',
};

const docTypes = Object.keys(BUILT_IN_TEMPLATE_CONFIGS) as TemplateDocumentType[];

describe('buildPreviewEngineData', () => {
  it('has a marker for every built-in document type (no type unverified)', () => {
    for (const t of docTypes) expect(MARKERS[t], `missing marker for ${t}`).toBeDefined();
  });

  it.each(docTypes)('renders non-empty, doc-specific preview content for "%s"', (docType) => {
    const config = BUILT_IN_TEMPLATE_CONFIGS[docType];
    const data = buildPreviewEngineData(docType, config);
    const def = renderTemplate(config, data, ctx, 'LOGO', 'QR');

    const texts: string[] = [];
    collectText(def.content, texts);
    if (typeof def.footer === 'function') {
      collectText((def.footer as DynamicContent)(1, 1, pageSize), texts);
    }

    expect(texts.length, `${docType} preview is empty`).toBeGreaterThan(0);
    expect(
      texts.some((t) => t.includes(MARKERS[docType])),
      `${docType} preview should contain "${MARKERS[docType]}"`,
    ).toBe(true);
  });

  it('renders the tenant company in place of the sample company when provided', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.quote;
    const tenant = {
      basic_info: { company_name: 'Tenant Recovery Labs', legal_name: 'Tenant Recovery Labs LLC' },
      location: { address_line1: '1 Tenant Way', city: 'Muscat', country: 'Oman' },
      contact_info: { phone_primary: '+968 1234 5678', email_general: 'lab@tenant.example' },
      branding: {},
      online_presence: {},
      legal_compliance: {},
      localization: { document_language_settings: { mode: 'english_only', secondary_language: null } },
    } as unknown as CompanySettingsData;

    const data = buildPreviewEngineData('quote', config, tenant);
    const def = renderTemplate(config, data, ctx, 'LOGO', 'QR');
    const texts: string[] = [];
    collectText(def.content, texts);
    if (typeof def.header === 'function') collectText((def.header as DynamicContent)(1, 1, pageSize), texts);
    if (typeof def.footer === 'function') collectText((def.footer as DynamicContent)(1, 1, pageSize), texts);

    // The tenant's company identity + contact (from companySettings) replace the
    // sample company; the sample customer/line items stay illustrative.
    expect(texts.some((t) => t.includes('Tenant Recovery Labs'))).toBe(true);
    expect(texts.some((t) => t.includes('+968 1234 5678'))).toBe(true);
    expect(texts.some((t) => t.includes('RAID-5 logical recovery'))).toBe(true);
  });
});
