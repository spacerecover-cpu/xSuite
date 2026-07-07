/**
 * Curated, ready-to-use template presets for the "Choose a Template" gallery.
 *
 * Presets are TypeScript constants (not DB rows): selecting one seeds the Studio
 * with its {@link TemplateConfigOverride}, which then persists as a normal
 * version through the existing create+publish flow. Each preset is purely
 * additive config — PDFs stay neutral unless the preset opts colors in, and the
 * app theme is never involved.
 */

import type { TemplateConfigOverride, TemplateDocumentType } from '../../lib/pdf/templateConfig';

export type PresetCategory = 'premium' | 'standard' | 'vip' | 'retail_pos' | 'tally';

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  premium: 'Premium',
  standard: 'Standard',
  vip: 'VIP',
  retail_pos: 'Retail & POS',
  tally: 'Tally Style',
};

export interface TemplatePreset {
  id: string;
  docType: TemplateDocumentType;
  name: string;
  description: string;
  category: PresetCategory;
  /** Display-only font label, e.g. "Roboto · classic". */
  fontLabel: string;
  /** A short layout hint used by the lightweight mini-preview skeleton. */
  thumbnailHint: 'classic' | 'modern' | 'minimal' | 'boxed' | 'split' | 'spreadsheet' | 'premium';
  config: TemplateConfigOverride;
}

/** A reusable design recipe applied to financial documents. */
interface Recipe {
  key: string;
  name: string;
  description: string;
  category: PresetCategory;
  fontLabel: string;
  thumbnailHint: TemplatePreset['thumbnailHint'];
  config: TemplateConfigOverride;
}

/** Financial recipes (quote / invoice / payment receipt). */
const FINANCIAL_RECIPES: Recipe[] = [
  {
    key: 'classic-professional',
    name: 'Classic Professional',
    description: 'Traditional business layout with restrained navy accents. Ideal for firms and consultancies.',
    category: 'standard',
    fontLabel: 'Roboto · classic',
    thumbnailHint: 'classic',
    config: { header: { layout: 'classic', divider: 'thin' } },
  },
  {
    key: 'modern-minimal',
    name: 'Modern Minimal',
    description: 'Clean and understated. Perfect for tech companies and studios.',
    category: 'standard',
    fontLabel: 'Roboto · minimal',
    thumbnailHint: 'minimal',
    config: {
      header: { layout: 'minimal', divider: 'thin' },
      typography: { baseScale: 0.95 },
      pageFitting: { density: 'compact' },
    },
  },
  {
    key: 'corporate-blue',
    name: 'Corporate Blue',
    description: 'Authoritative blue branding with a centered header. For enterprises and agencies.',
    category: 'vip',
    fontLabel: 'Roboto · modern',
    thumbnailHint: 'modern',
    config: {
      header: { layout: 'modern', logoPlacement: 'center', divider: 'thick' },
      colors: { accent: '#1d4ed8', headerBackground: '#eff6ff', headerBackgroundEnabled: true },
      table: { headerBackground: '#eff6ff' },
    },
  },
  {
    key: 'emerald-premium',
    name: 'Emerald Premium',
    description: 'Polished split header with emerald accents and a tinted item table. A premium feel.',
    category: 'vip',
    fontLabel: 'Tajawal · split',
    thumbnailHint: 'split',
    config: {
      header: { layout: 'split', divider: 'thick' },
      colors: { accent: '#10b981', text: '#064e3b', headerBackground: '#ecfdf5', headerBackgroundEnabled: true },
      table: { headerBackground: '#ecfdf5', zebra: true },
    },
  },
  {
    key: 'warm-commerce',
    name: 'Warm Commerce',
    description: 'Friendly amber tones. Great for retail, hospitality, and creative businesses.',
    category: 'retail_pos',
    fontLabel: 'Roboto · classic',
    thumbnailHint: 'boxed',
    config: {
      header: { layout: 'boxed' },
      colors: { accent: '#b45309', headerBackground: '#fff7ed', headerBackgroundEnabled: true },
      table: { headerBackground: '#fff7ed', zebra: true },
    },
  },
  {
    key: 'retail-pos',
    name: 'Retail Receipt',
    description: 'Compact, scannable layout with row numbers — tuned for point-of-sale printing.',
    category: 'retail_pos',
    fontLabel: 'Roboto · compact',
    thumbnailHint: 'spreadsheet',
    config: {
      header: { layout: 'spreadsheet', divider: 'thin' },
      typography: { baseScale: 0.9 },
      table: { rowNumbering: true },
      pageFitting: { density: 'dense' },
    },
  },
  {
    key: 'tally-classic',
    name: 'Tally Style',
    description: 'Dense, ledger-style header band with serial-numbered rows. Familiar to Tally users.',
    category: 'tally',
    fontLabel: 'Roboto · spreadsheet',
    thumbnailHint: 'spreadsheet',
    config: {
      header: { layout: 'spreadsheet', divider: 'thick' },
      table: { rowNumbering: true, headerBackground: '#f1f5f9' },
      pageNumbers: { enabled: true, position: 'right', format: 'Page {page} of {pages}' },
      pageFitting: { density: 'compact' },
    },
  },
];

// ---------------------------------------------------------------------------
// Premium presets — the reference-grade "lab suite" finish: airy classic
// letterhead with the website line, display title, Job-ID banner, open info
// cards, light device tables with device icons, open two-column bilingual
// terms, dotted centered signatures, and an accent tagline + social-icon
// footer. Colors are explicit opt-ins (never the app theme).
// ---------------------------------------------------------------------------

/** Shared premium look (colors + presentation + airy page geometry). */
const PREMIUM_BASE: TemplateConfigOverride = {
  paper: { margins: [38, 44, 84, 44] },
  header: { layout: 'classic', divider: 'thin', dividerColor: '#e2e8f0', logoWidth: 150, logoMaxHeight: 46 },
  colors: { accent: '#2563eb', text: '#1e293b', label: '#64748b', headerBackground: '#f8fafc' },
  presentation: {
    infoCardStyle: 'open',
    tableHeaderStyle: 'light',
    titleStyle: 'display',
    signatureStyle: 'dotted',
    signatureAlign: 'center',
    termsStyle: 'open',
    footerSocialIcons: true,
    headerWebsite: true,
    deviceIcons: true,
  },
  // Field-row labels stay single-language (headings remain bilingual) — the
  // reference look. Tenants flip this back under Other Details → Translation.
  translationPolicy: { mode: 'system_only' },
};

/** Premium intake/checkout preset: Job-ID banner after the header, no QR. */
function premiumLabPreset(
  docType: TemplateDocumentType,
  sectionOrders: Record<string, number>,
): TemplatePreset {
  return {
    id: `${docType}-premium-lab`,
    docType,
    name: 'Premium Lab',
    description:
      'Flagship reference design — airy cards, Job ID banner, light device table, dotted signatures, and a branded social footer.',
    category: 'premium',
    fontLabel: 'Roboto · premium',
    thumbnailHint: 'premium',
    config: {
      ...PREMIUM_BASE,
      presentation: { ...PREMIUM_BASE.presentation, docRef: 'banner' },
      sections: [
        { key: 'docRef', visible: true, order: 1 },
        ...Object.entries(sectionOrders).map(([key, order]) => ({ key, order })),
        { key: 'qr', visible: false },
      ],
    },
  };
}

const PREMIUM_INTAKE_ORDERS: Record<string, number> = {
  parties: 2,
  caseInfo: 3,
  devices: 4,
  legalTerms: 5,
  signature: 6,
  qr: 7,
  footer: 8,
};

const PREMIUM_CHECKOUT_ORDERS: Record<string, number> = {
  parties: 2,
  caseInfo: 3,
  devices: 4,
  collector: 5,
  legalTerms: 6,
  signature: 7,
  qr: 8,
  footer: 9,
};

/** Premium evaluation-report preset: classic letterhead + Job-ID pill + tinted cards. */
const PREMIUM_REPORT: TemplatePreset = {
  id: 'report-premium-evaluation',
  docType: 'report',
  name: 'Premium Evaluation',
  description:
    'Reference evaluation-report design — classic letterhead, Job ID pill, tinted info cards, and toned findings sections.',
  category: 'premium',
  fontLabel: 'Roboto · premium',
  thumbnailHint: 'premium',
  config: {
    ...PREMIUM_BASE,
    presentation: {
      ...PREMIUM_BASE.presentation,
      docRef: 'pill',
      deviceIcons: false,
      signatureStyle: 'dotted',
    },
    sections: [
      // Swap the navy band + tile row for the classic letterhead + pill.
      { key: 'reportHeader', visible: false },
      { key: 'reportSummary', visible: false },
      { key: 'header', visible: true, order: 0 },
      { key: 'docRef', visible: true, order: 1 },
      // Reference info cards carry a light-blue tinted band.
      { key: 'reportInfoColumns', headerBackground: '#dbeafe' },
    ],
  },
};

/** Premium financial preset (invoice/quote/…): the same finish, no banner. */
const PREMIUM_BUSINESS: Recipe = {
  key: 'premium-business',
  name: 'Premium Business',
  description:
    'Flagship reference finish for financial documents — display title, open cards, light item table, and a branded social footer.',
  category: 'premium',
  fontLabel: 'Roboto · premium',
  thumbnailHint: 'premium',
  config: PREMIUM_BASE,
};

/** Premium payslip preset: the same finish on the payslip component tables. */
const PREMIUM_PAYSLIP: TemplatePreset = {
  id: 'payslip-premium-lab',
  docType: 'payslip',
  name: 'Premium Lab',
  description:
    'Flagship reference finish — display title, open employee card, light earnings/deductions tables, and a branded social footer.',
  category: 'premium',
  fontLabel: 'Roboto · premium',
  thumbnailHint: 'premium',
  config: PREMIUM_BASE,
};

/** Premium chain-of-custody preset: the finish without the case-number banner
 *  (the forensic ledger keeps the Case ID row inside the case-info card). */
const PREMIUM_CUSTODY: TemplatePreset = {
  id: 'chain_of_custody-premium-lab',
  docType: 'chain_of_custody',
  name: 'Premium Lab',
  description:
    'Flagship reference finish — display title, open case card, and a light forensic entries table with zebra rows.',
  category: 'premium',
  fontLabel: 'Roboto · premium',
  thumbnailHint: 'premium',
  config: PREMIUM_BASE,
};

/** GCC tax-compliant invoice preset (ZATCA/FTA): TRN bar + page numbers. */
const GCC_INVOICE: Recipe = {
  key: 'gcc-compliance',
  name: 'GCC Tax Invoice',
  description: 'GCC-ready: VAT/GST registration bar, bilingual-friendly, and page numbers for audit.',
  category: 'vip',
  fontLabel: 'Tajawal · classic',
  thumbnailHint: 'classic',
  config: {
    header: { layout: 'classic', divider: 'thick' },
    colors: { accent: '#0f766e', headerBackground: '#f0fdfa', headerBackgroundEnabled: true },
    taxBar: { enabled: true, label: { en: 'VAT Reg. No.', ar: 'الرقم الضريبي' }, source: 'company_info' },
    sections: [
      { key: 'taxBar', visible: true },
      { key: 'totals', lines: { amountInWords: true } },
    ],
    pageNumbers: { enabled: true, position: 'right', format: 'Page {page} of {pages}' },
  },
};

function fromRecipe(docType: TemplateDocumentType, r: Recipe): TemplatePreset {
  return {
    id: `${docType}-${r.key}`,
    docType,
    name: r.name,
    description: r.description,
    category: r.category,
    fontLabel: r.fontLabel,
    thumbnailHint: r.thumbnailHint,
    config: r.config,
  };
}

/** A compact two-preset set for the non-financial document types. */
function genericPresets(docType: TemplateDocumentType): TemplatePreset[] {
  return [
    {
      id: `${docType}-clean`,
      docType,
      name: 'Clean Classic',
      description: 'Neutral, professional letterhead with a thin rule.',
      category: 'standard',
      fontLabel: 'Roboto · classic',
      thumbnailHint: 'classic',
      config: { header: { layout: 'classic', divider: 'thin' } },
    },
    {
      id: `${docType}-branded`,
      docType,
      name: 'Branded Boxed',
      description: 'A boxed, centered letterhead with a brand accent.',
      category: 'vip',
      fontLabel: 'Roboto · boxed',
      thumbnailHint: 'boxed',
      config: {
        header: { layout: 'boxed', logoPlacement: 'center', divider: 'thick' },
        colors: { accent: '#1e3a5f', headerBackground: '#f1f5f9', headerBackgroundEnabled: true },
      },
    },
  ];
}

const financialFor = (docType: TemplateDocumentType): TemplatePreset[] =>
  FINANCIAL_RECIPES.map((r) => fromRecipe(docType, r));

/** All curated presets, keyed by document type. */
export const TEMPLATE_PRESETS: Record<TemplateDocumentType, TemplatePreset[]> = {
  invoice: [fromRecipe('invoice', PREMIUM_BUSINESS), ...financialFor('invoice'), fromRecipe('invoice', GCC_INVOICE)],
  quote: [fromRecipe('quote', PREMIUM_BUSINESS), ...financialFor('quote')],
  credit_note: [fromRecipe('credit_note', PREMIUM_BUSINESS), ...financialFor('credit_note')],
  payment_receipt: [
    fromRecipe('payment_receipt', PREMIUM_BUSINESS),
    fromRecipe('payment_receipt', FINANCIAL_RECIPES[0]),
    fromRecipe('payment_receipt', FINANCIAL_RECIPES[1]),
    fromRecipe('payment_receipt', FINANCIAL_RECIPES[5]),
  ],
  office_receipt: [premiumLabPreset('office_receipt', PREMIUM_INTAKE_ORDERS), ...genericPresets('office_receipt')],
  customer_copy: [premiumLabPreset('customer_copy', PREMIUM_INTAKE_ORDERS), ...genericPresets('customer_copy')],
  checkout_form: [premiumLabPreset('checkout_form', PREMIUM_CHECKOUT_ORDERS), ...genericPresets('checkout_form')],
  case_label: genericPresets('case_label'),
  stock_label: genericPresets('stock_label'),
  chain_of_custody: [PREMIUM_CUSTODY, ...genericPresets('chain_of_custody')],
  report: [PREMIUM_REPORT, ...genericPresets('report')],
  payslip: [PREMIUM_PAYSLIP, ...genericPresets('payslip')],
};

/** The categories present for a given document type, in display order. */
export function categoriesFor(docType: TemplateDocumentType): PresetCategory[] {
  const order: PresetCategory[] = ['premium', 'standard', 'vip', 'retail_pos', 'tally'];
  const present = new Set(TEMPLATE_PRESETS[docType].map((p) => p.category));
  return order.filter((c) => present.has(c));
}
