/**
 * Tenant-configurable PDF document template — config schema, built-in defaults,
 * and the cascade resolver.
 *
 * Pure TypeScript: no DB, no I/O, no side effects. This module is the type-level
 * + default-value contract for the template engine described in
 * `docs/superpowers/specs/2026-06-13-pdf-template-engine-design.md` (M0/M2).
 * Nothing here touches pdfmake, Supabase, Storage, RLS, or payments — it is the
 * config layer only. The assembler (`renderTemplate`) and the persistence layer
 * (`document_templates_pdf` / `document_template_versions`) are separate work.
 *
 * Cascade (most-specific-wins): built-in default → tenant branding/theme →
 * doc-type template → per-instance override. See {@link resolveTemplateConfig}.
 */

/** Bilingual label. `en` is mandatory; `ar` is optional (Arabic/RTL). */
export interface LabelText {
  en: string;
  ar?: string;
}

/**
 * Per-document language behavior.
 * - `en` / `ar`: single language.
 * - `bilingual_stacked`: EN then AR stacked vertically.
 * - `bilingual_sidebyside`: EN and AR mirrored side-by-side (RTL-aware).
 */
export type LanguageMode = 'en' | 'ar' | 'bilingual_stacked' | 'bilingual_sidebyside';

export interface LanguageConfig {
  mode: LanguageMode;
  /** Which language leads when both are shown. */
  primary: 'en' | 'ar';
}

/**
 * Page geometry. `margins` is pdfmake order: [top, right, bottom, left].
 *
 * `size` is normally a predefined sheet (`'A4'` / `'Letter'`). For physical
 * LABELS (stock / case labels), set `size: 'custom'` and supply `dimensions`
 * as a `[width, height]` pair in POINTS (1pt = 1/72"); `renderTemplate` then
 * passes that literal page box to pdfmake instead of a predefined size. This
 * mirrors the legacy `StockLabelDocument`'s `pageSize: { width: 283, height: 170 }`
 * label sheet. `dimensions` is ignored for the predefined sizes, and a `'custom'`
 * size with no `dimensions` falls back to A4 — so existing configs (which never
 * set `'custom'`) are completely unaffected.
 */
export interface PaperConfig {
  size: 'A4' | 'Letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  margins: [number, number, number, number];
  /** Literal page box `[width, height]` in points; used only when `size === 'custom'`. */
  dimensions?: [number, number];
}

/**
 * Branding selection for a document.
 * - `themeId`: reusable tenant branding theme (Xero-style). Empty = built-in.
 * - `logo`: whether to render the logo (falls back to company name if no logo).
 * - `accent`: `'inherit'` keeps the neutral PDF default; a hex opts into a bounded accent.
 * - `watermark`: text watermark, or `null` for none.
 */
export interface BrandingConfig {
  themeId: string;
  logo: boolean;
  accent: 'inherit' | string;
  watermark: string | null;
}

/** A toggleable, renamable, resizable column within a table section. */
export interface ColumnConfig {
  key: string;
  visible: boolean;
  label: LabelText;
  /** pdfmake column width in points; omit for auto/star sizing. */
  width?: number;
}

/**
 * A document section (header, party block, line-item table, totals, terms, …).
 * - `order`: ascending render order.
 * - `columns`: present on table-style sections (e.g. line items).
 * - `lines`: present on aggregate sections (e.g. totals) — per-line on/off toggles.
 */
export interface SectionConfig {
  key: string;
  visible: boolean;
  order: number;
  columns?: ColumnConfig[];
  lines?: Record<string, boolean>;
  /** Bank section only: how the bank-account details render — a bordered box
   *  (`'boxed'`, default) or a single compact pipe-separated line (`'inline'`). */
  bankStyle?: 'boxed' | 'inline';
  /** Bank section, boxed style only: box width — `'auto'` hugs the content
   *  (default), `'half'` a fixed ~half-page column, `'full'` spans the row. */
  bankWidth?: 'auto' | 'half' | 'full';
  /** Bank section, boxed non-full width only: horizontal placement of the box. */
  bankAlign?: 'left' | 'center' | 'right';
}

// ---------------------------------------------------------------------------
// Premium template controls (all OPTIONAL; absent group/field = neutral/legacy)
//
// Every group below is additive and optional. The built-in defaults
// (`defaultFor`) populate NONE of them, so a stored config that omits them
// resolves to today's exact behavior. Render-time defaults are applied by pure
// resolvers in `engine/branding.ts` (validate-or-fall-back-to-neutral), so a
// malformed value can never break a render. PDFs stay neutral by default and
// the engine never reads the app theme — `PDF_COLORS` is the fixed fallback.
// ---------------------------------------------------------------------------

/** PDF-safe font families (the VFS bundles Roboto + Tajawal + Noto Sans Arabic). */
export type PdfFontFamily = 'Roboto' | 'Tajawal' | 'NotoSansArabic';

/** The subset of named PDF styles the studio exposes for per-section sizing. */
export type TypographyStyleKey =
  | 'documentTitle'
  | 'sectionTitle'
  | 'tableHeader'
  | 'tableCell'
  | 'label'
  | 'value'
  | 'totalValue'
  | 'footer'
  | 'termsText';

export interface TypographyConfig {
  /** Base Latin family. Default `'Roboto'` (= `DEFAULT_FONT`). */
  fontFamily?: PdfFontFamily;
  /** Multiplier applied to every named style's fontSize (0.85–1.3). Default 1. */
  baseScale?: number;
  /** Absolute per-style fontSize overrides (points); omitted keys use the engine default. */
  sizes?: Partial<Record<TypographyStyleKey, number>>;
}

/**
 * Full per-template color set. Every field is OPT-IN; an omitted field resolves
 * to its neutral `PDF_COLORS.*` default, so PDFs stay neutral unless a tenant
 * opts a surface in. Never sourced from the app theme.
 */
export interface ColorsConfig {
  /** Accent (rules, emphasis). Default `PDF_COLORS.primary`. Supersedes `branding.accent`. */
  accent?: string;
  /** Body text. Default `PDF_COLORS.text`. */
  text?: string;
  /** Muted label text. Default `PDF_COLORS.textLight`. */
  label?: string;
  /** Table-header / section band fill. Default `PDF_COLORS.headerBg`. */
  headerBackground?: string;
  /** Whether the header-background fill is painted. Default true. */
  headerBackgroundEnabled?: boolean;
}

export type HeaderLayout = 'classic' | 'modern' | 'minimal' | 'boxed' | 'split' | 'spreadsheet';
export type LogoPlacement = 'left' | 'center' | 'right';
export type AddressZone = 'left' | 'center' | 'right' | 'hidden';
export type DividerStyle = 'thin' | 'thick' | 'none';

export interface HeaderConfig {
  /** Header arrangement. Default `'classic'` (current behavior). */
  layout?: HeaderLayout;
  /** Logo edge. Default `'left'`. */
  logoPlacement?: LogoPlacement;
  /** Logo box in points. Default width 130, height auto-from-width. */
  logoWidth?: number;
  logoHeight?: number;
  /** Bottom margin under the logo in points. Default 5 (today's value). */
  logoMarginBottom?: number;
  /** Cap the logo height in points (aspect-preserving via pdfmake `fit`). 0/undefined = no cap. */
  logoMaxHeight?: number;
  /** Address zone in the 3-zone layouts. Default `'right'`. */
  addressZone?: AddressZone;
  /** Divider rule under the letterhead. Default `'thin'` (0.5pt today). */
  divider?: DividerStyle;
  /** Nudge the divider rule endpoints / baseline (points). Default 0/0/0. */
  dividerNudge?: { start?: number; end?: number; vertical?: number };
}

export interface FooterConfig {
  /** Custom footer text; empty/omitted uses the identity tagline + website. */
  customText?: string;
  /** Fill behind the footer; omitted = none. */
  background?: string;
  /** Footer text color. Default `PDF_COLORS.textMuted`. */
  fontColor?: string;
  /** Footer font size. Default 8. */
  fontSize?: number;
  /** Footer alignment. Default `'center'`. */
  alignment?: 'left' | 'center' | 'right';
}

export interface PageNumbersConfig {
  /** Default false (legacy = no page numbers). */
  enabled?: boolean;
  /** Default `'right'`. */
  position?: 'left' | 'center' | 'right';
  /** `{page}` / `{pages}` tokens. Default `'Page {page} of {pages}'`. */
  format?: string;
}

export interface ContinuationConfig {
  /** Suppress the full letterhead on pages 2+. Default false. */
  suppressLetterhead?: boolean;
}

export interface OrganizationConfig {
  /** Where the header identity is sourced. Default `'company_info'`. */
  source?: 'company_info' | 'manual';
  /** Per-line visibility. All default true except the `*Ar` lines (false). */
  show?: {
    logo?: boolean;
    name?: boolean;
    nameAr?: boolean;
    legalName?: boolean;
    legalNameAr?: boolean;
    address?: boolean;
    taxId?: boolean;
  };
  /** Address font size. Default 8. */
  addressFontSize?: number;
  /** Header address column width. Default `'auto'`. */
  columnWidth?: 'auto' | number;
  /** Literal values used when `source === 'manual'`. */
  manual?: {
    name?: string;
    nameAr?: string;
    legalName?: string;
    legalNameAr?: string;
    address?: string;
    taxId?: string;
  };
}

export interface TaxBarConfig {
  /** Default false (no VAT/GST identification bar). */
  enabled?: boolean;
  /** Bar label, e.g. `{ en: 'VAT Reg. No.', ar: 'الرقم الضريبي' }`. */
  label?: LabelText;
  /** `'company_info'` pulls the registration number from identity; `'manual'` uses `value`. */
  source?: 'company_info' | 'manual';
  value?: string;
}

export interface TableConfig {
  /** Table-header fill. Default `PDF_COLORS.headerBg`. */
  headerBackground?: string;
  /** Prepend an S/N row-number column. Default false. */
  rowNumbering?: boolean;
  /** Alternating row fill. Default false. */
  zebra?: boolean;
  /** Grouped section subtotals. Default false. */
  sectionSubtotals?: boolean;
}

export type DensityPreset = 'comfortable' | 'compact' | 'dense';

export interface PageFittingConfig {
  /** Scale spacing/fonts to keep the document on one page. Default false. */
  autoFitOnePage?: boolean;
  /** Spacing density. Default `'comfortable'` (current margins/sizes). */
  density?: DensityPreset;
  /** Legibility floor for auto-fit scaling. Default 0.8. */
  minScale?: number;
}

export interface WatermarkConfig {
  /** Watermark text (supersedes `branding.watermark`). */
  text?: string;
  /** Render an uploaded watermark image instead of text. Default false. */
  image?: boolean;
  /** Diagonal angle in degrees. Default -45. */
  angle?: number;
  /** Opacity 0–1. Default 0.3. */
  opacity?: number;
  /** Text watermark font size. Default 60. */
  fontSize?: number;
}

export interface SignatureImageOptions {
  show?: boolean;
  width?: number;
  placement?: 'left' | 'center' | 'right';
}
export interface StampImageOptions extends SignatureImageOptions {
  /** 0–1 image opacity for a semi-transparent seal. */
  opacity?: number;
}
export interface SignatureImagesConfig {
  stamp?: StampImageOptions;
  signature?: SignatureImageOptions;
}

/**
 * Document body LAYOUT options (opt-in). Absent → legacy stacked layout.
 */
export interface LayoutConfig {
  /**
   * Render the parties (customer) info box and the meta (document details) box
   * SIDE BY SIDE in two columns instead of stacked full-width. Applies only when
   * both sections are visible and the parties block holds a single box — the
   * common financial case (a customer block, with the issuer in the letterhead),
   * which otherwise leaves the right half of the page empty. Default false
   * (legacy stacked); the engine falls back to stacking automatically when the
   * conditions are not met, so this never produces an overlapping layout.
   */
  partiesMetaSideBySide?: boolean;
}

export type TranslationPolicyMode = 'all' | 'system_only' | 'custom';

/** Per data-block field-label bilingual toggle (used only when mode === 'custom'). */
export interface TranslationPolicyGroups {
  parties?: boolean;
  meta?: boolean;
  caseInfo?: boolean;
  collector?: boolean;
  payslip?: boolean;
  diagnostics?: boolean;
  /** Payment-history statement column headers (financial documents). */
  paymentHistory?: boolean;
}

/** Controls which FIELD-ROW labels render bilingually (no effect on data values). */
export interface TranslationPolicyConfig {
  /** Default 'all' (every label bilingual when the document is bilingual). */
  mode?: TranslationPolicyMode;
  /** Per-group field-label toggle for mode === 'custom' (default true = bilingual). */
  groups?: TranslationPolicyGroups;
}

/** Resolved locale slice threaded by applyTenantLocale / the country layer
 *  (§8d/§8g). Absent = today's neutral PDF default (date 'dd MMM yyyy', Western
 *  grouping, document-currency decimals). */
export interface LocaleConfig {
  dateFormat?: string;
  groupingStyle?: 'standard' | 'indian';
  decimalPlaces?: number;
}

/**
 * Per-document-type Terms & Conditions content (Studio-edited, bilingual).
 * Each document type's template carries its own — a Quote's terms differ from
 * an Invoice's. Rendered by the `terms` section; headings come from
 * `labels.terms` / `labels.notes`. The template is the single source of truth
 * (no tenant-wide or per-record override).
 */
export interface TermsContentConfig {
  terms?: { en?: string; ar?: string };
  notes?: { en?: string; ar?: string };
}

/** The resolved, render-ready template configuration for one document. */
export interface DocumentTemplateConfig {
  paper: PaperConfig;
  branding: BrandingConfig;
  language: LanguageConfig;
  sections: SectionConfig[];
  /** Tenant-extendable label dictionary (e.g. `documentTitle`). */
  labels: Record<string, LabelText>;
  // ── Premium controls (optional; absent = neutral/legacy) ──────────────────
  typography?: TypographyConfig;
  colors?: ColorsConfig;
  header?: HeaderConfig;
  footer?: FooterConfig;
  pageNumbers?: PageNumbersConfig;
  continuation?: ContinuationConfig;
  organization?: OrganizationConfig;
  taxBar?: TaxBarConfig;
  table?: TableConfig;
  pageFitting?: PageFittingConfig;
  watermark?: WatermarkConfig;
  layout?: LayoutConfig;
  translationPolicy?: TranslationPolicyConfig;
  signatureImages?: SignatureImagesConfig;
  /** Resolved date/number locale (§8d). Absent = neutral PDF default. */
  locale?: LocaleConfig;
  /** Per-document-type Terms & Conditions content (bilingual). */
  termsContent?: TermsContentConfig;
}

/**
 * The document types this config layer ships built-in defaults for. This is the
 * existing PDF `DocumentType` family (`src/lib/pdf/types.ts`) intersected with
 * what has a real builder today, plus `report` and `stock_label`, which live
 * outside that union but are real generated documents.
 */
export type TemplateDocumentType =
  | 'office_receipt'
  | 'customer_copy'
  | 'checkout_form'
  | 'case_label'
  | 'quote'
  | 'invoice'
  | 'payment_receipt'
  | 'payslip'
  | 'chain_of_custody'
  | 'report'
  | 'stock_label';

/**
 * A partial, layer-specific override of a {@link DocumentTemplateConfig}.
 * Every level of the cascade (theme, doc-type, instance) supplies one of these;
 * the resolver deep-merges them onto the built-in base. Sections and labels are
 * keyed merges (by `key` for sections), so a layer can touch one section/column
 * without restating the rest.
 */
export interface TemplateConfigOverride {
  paper?: Partial<PaperConfig>;
  branding?: Partial<BrandingConfig>;
  language?: Partial<LanguageConfig>;
  sections?: SectionConfigOverride[];
  labels?: Record<string, LabelText>;
  // ── Premium controls — the interfaces are all-optional, so they double as
  //    their own override shape. Scalars replace; the nested objects
  //    (`typography.sizes`, `header.dividerNudge`, `organization.show`/`manual`)
  //    deep-merge by key. ──────────────────────────────────────────────────
  typography?: TypographyConfig;
  colors?: ColorsConfig;
  header?: HeaderConfig;
  footer?: FooterConfig;
  pageNumbers?: PageNumbersConfig;
  continuation?: ContinuationConfig;
  organization?: OrganizationConfig;
  taxBar?: TaxBarConfig;
  table?: TableConfig;
  pageFitting?: PageFittingConfig;
  watermark?: WatermarkConfig;
  layout?: LayoutConfig;
  translationPolicy?: TranslationPolicyConfig;
  signatureImages?: SignatureImagesConfig;
  locale?: LocaleConfig;
  /** Per-document-type Terms & Conditions content (deep-merged: terms + notes). */
  termsContent?: TermsContentConfig;
}

/** Partial section override; `key` identifies the target section. */
export interface SectionConfigOverride {
  key: string;
  visible?: boolean;
  order?: number;
  columns?: ColumnConfigOverride[];
  lines?: Record<string, boolean>;
  bankStyle?: 'boxed' | 'inline';
  bankWidth?: 'auto' | 'half' | 'full';
  bankAlign?: 'left' | 'center' | 'right';
}

/** Partial column override; `key` identifies the target column. */
export interface ColumnConfigOverride {
  key: string;
  visible?: boolean;
  label?: Partial<LabelText>;
  width?: number;
}

// ---------------------------------------------------------------------------
// Built-in defaults
// ---------------------------------------------------------------------------

const A4_PORTRAIT: PaperConfig = {
  size: 'A4',
  orientation: 'portrait',
  margins: [40, 40, 40, 40],
};

/** Compact case-label paper (case labels print on a small landscape sheet). */
const LABEL_PAPER: PaperConfig = {
  size: 'A4',
  orientation: 'landscape',
  margins: [16, 16, 16, 16],
};

/**
 * Physical stock-label paper — a small custom sheet matching the legacy
 * `StockLabelDocument`'s `{ width: 283, height: 170 }` (points) label, with the
 * same tight 12pt margins. `size: 'custom'` tells `renderTemplate` to use the
 * literal `dimensions` box rather than a predefined sheet.
 */
const STOCK_LABEL_PAPER: PaperConfig = {
  size: 'custom',
  orientation: 'portrait',
  dimensions: [283, 170],
  margins: [12, 12, 12, 12],
};

const NEUTRAL_BRANDING: BrandingConfig = {
  themeId: '',
  logo: true,
  accent: 'inherit',
  watermark: null,
};

const ENGLISH_ONLY: LanguageConfig = {
  mode: 'en',
  primary: 'en',
};

/** Standard line-item table columns used by quote / invoice. */
function lineItemColumns(): ColumnConfig[] {
  return [
    { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, width: 220 },
    { key: 'quantity', visible: true, label: { en: 'Qty', ar: 'الكمية' }, width: 40 },
    { key: 'unitPrice', visible: true, label: { en: 'Unit Price', ar: 'سعر الوحدة' } },
    { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' } },
  ];
}

/** Helper to build a section with a sequential order. */
function section(
  key: string,
  order: number,
  extra?: Pick<SectionConfig, 'columns' | 'lines' | 'bankStyle' | 'bankWidth' | 'bankAlign'> & { visible?: boolean },
): SectionConfig {
  return {
    key,
    visible: extra?.visible ?? true,
    order,
    ...(extra?.columns ? { columns: extra.columns } : {}),
    ...(extra?.lines ? { lines: extra.lines } : {}),
    ...(extra?.bankStyle ? { bankStyle: extra.bankStyle } : {}),
    ...(extra?.bankWidth ? { bankWidth: extra.bankWidth } : {}),
    ...(extra?.bankAlign ? { bankAlign: extra.bankAlign } : {}),
  };
}

/** A financial document (quote/invoice/payment receipt) base section set. */
function financialSections(): SectionConfig[] {
  return [
    section('header', 0),
    section('parties', 1),
    section('meta', 2),
    // VAT/GST identification bar — hidden by default (opt-in for GCC tax
    // invoices); renders nothing unless `config.taxBar.enabled` and visible.
    section('taxBar', 3, { visible: false }),
    section('lineItems', 4, { columns: lineItemColumns() }),
    section('totals', 5, {
      lines: {
        subtotal: true,
        discount: true,
        vat: true,
        total: true,
        // Amount Paid / Balance Due lines: emitted by the invoice adapter for
        // non-proforma invoices with a recorded payment. Off for quotes (no
        // payment concept) — the adapter is the gate, this is the config toggle.
        amountPaid: true,
        balanceDue: true,
        amountInWords: false,
      },
    }),
    // Payment-history statement — rendered between totals and terms, mirroring
    // the legacy InvoiceDocument layout. Returns null on docs with no history
    // (proforma, quotes), so it is harmless on the shared financial base.
    section('paymentHistory', 6),
    // Standard Terms & Conditions (Studio content only; omitted when blank).
    section('terms', 7),
    // Per-record "Quote Terms" / "Invoice Terms" — the terms entered on the
    // record (from Terms & Templates). Its own positionable section; omitted when
    // the record carries none.
    section('recordTerms', 8),
    // Bank account as its own movable section — visible by default and rendered
    // here (no longer inline in terms). Reorder / show-hide like any section, with
    // a Boxed | Single line display style.
    section('bank', 9, { bankStyle: 'boxed', bankWidth: 'auto', bankAlign: 'left' }),
    section('signature', 10, { visible: false }),
    section('qr', 11),
    section('footer', 12),
  ];
}

/**
 * An intake document base section set (office_receipt / customer_copy):
 * case-info header + device-intake table + consent box, not money. Uses the
 * case-doc section keys (`caseInfo`, `devices`, `legalTerms`) and ends with the
 * signature lines, then `qr` + `footer` (promoted to the repeating page footer).
 */
function intakeSections(): SectionConfig[] {
  return [
    section('header', 0),
    section('parties', 1),
    section('caseInfo', 2),
    section('devices', 3),
    section('legalTerms', 4),
    section('signature', 5),
    section('qr', 6),
    section('footer', 7),
  ];
}

function defaultFor(docType: TemplateDocumentType): DocumentTemplateConfig {
  const base: Omit<DocumentTemplateConfig, 'sections' | 'labels'> = {
    paper: A4_PORTRAIT,
    branding: NEUTRAL_BRANDING,
    language: ENGLISH_ONLY,
    // Comfortable default font size (~+20%): the hardcoded section sizes (7pt body)
    // are too small to read. Tenants adjust this in the Studio (Font size). Physical
    // labels opt out below (their tight layouts can't absorb a bump).
    typography: { baseScale: 1.2 },
  };

  switch (docType) {
    case 'invoice':
      return {
        ...base,
        sections: financialSections(),
        labels: { documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' } },
        // Customer block (left) + document details (right) side by side — the
        // standard invoice letterhead, and it fills the otherwise-empty space
        // beside a single customer box.
        layout: { partiesMetaSideBySide: true },
      };
    case 'quote':
      return {
        ...base,
        sections: financialSections(),
        labels: { documentTitle: { en: 'QUOTATION', ar: 'عرض سعر' } },
        layout: { partiesMetaSideBySide: true },
      };
    case 'payment_receipt':
      return {
        ...base,
        sections: [
          section('header', 0),
          section('parties', 1),
          section('meta', 2),
          section('totals', 3, { lines: { amountReceived: true, amountInWords: false } }),
          // Standard Terms & Conditions (Studio content only; omitted when blank).
          section('terms', 4),
          // Per-record notes entered on the receipt (returns null when empty).
          section('recordTerms', 5),
          // Bank account as its own visible section.
          section('bank', 6, { bankStyle: 'boxed', bankWidth: 'auto', bankAlign: 'left' }),
          section('qr', 7),
          section('footer', 8),
        ],
        labels: { documentTitle: { en: 'PAYMENT RECEIPT', ar: 'إيصال دفع' } },
        layout: { partiesMetaSideBySide: true },
      };
    case 'office_receipt':
      return {
        ...base,
        sections: intakeSections(),
        labels: { documentTitle: { en: 'DEVICE CHECK-IN RECEIPT', ar: 'إيصال استلام جهاز' } },
        // Customer block (left) + case-details block (right) side by side.
        layout: { partiesMetaSideBySide: true },
      };
    case 'customer_copy':
      return {
        ...base,
        sections: intakeSections(),
        labels: { documentTitle: { en: 'DEVICE CHECK-IN RECEIPT', ar: 'إيصال استلام جهاز' } },
        layout: { partiesMetaSideBySide: true },
      };
    case 'checkout_form':
      return {
        ...base,
        sections: [
          section('header', 0),
          section('parties', 1),
          section('caseInfo', 2),
          section('devices', 3),
          section('collector', 4),
          section('legalTerms', 5),
          section('signature', 6),
          section('qr', 7),
          section('footer', 8),
        ],
        labels: { documentTitle: { en: 'DEVICE CHECKOUT / RETURN FORM', ar: 'نموذج تسليم الجهاز' } },
        layout: { partiesMetaSideBySide: true },
      };
    case 'case_label':
      return {
        ...base,
        paper: LABEL_PAPER,
        typography: { baseScale: 1 }, // physical label: keep native sizes (no +20%)
        sections: [
          // Header is OPTIONAL on a compact label (off by default): the label
          // body (large case number + priority + received date + device summary)
          // is the self-contained focal content. A tenant may switch it on to
          // print the company identity above the label.
          section('header', 0, { visible: false }),
          section('caseLabel', 1),
          section('footer', 2),
        ],
        labels: { documentTitle: { en: 'CASE LABEL', ar: 'ملصق الحالة' } },
      };
    case 'stock_label':
      return {
        ...base,
        paper: STOCK_LABEL_PAPER,
        typography: { baseScale: 1 }, // physical label: keep native sizes (no +20%)
        sections: [
          section('header', 0, { visible: false }),
          section('stockLabel', 1),
          section('qr', 2, { visible: false }),
        ],
        labels: { documentTitle: { en: 'STOCK LABEL', ar: 'ملصق المخزون' } },
      };
    case 'payslip':
      return {
        ...base,
        sections: [
          section('header', 0),
          // payslipInfo = employee identity + pay period + payment date +
          // working-days/hours rows, in one bilingual info box (generalized from
          // the legacy "Employee Information" + "Attendance Summary" boxes).
          section('payslipInfo', 1),
          section('earnings', 2),
          section('deductions', 3),
          // netPay = the emphasized Net Salary line (its own block, not a totals
          // line, mirroring the legacy boxed net-salary treatment).
          section('netPay', 4),
          section('footer', 5),
        ],
        labels: { documentTitle: { en: 'PAYSLIP', ar: 'قسيمة الراتب' } },
      };
    case 'chain_of_custody':
      return {
        ...base,
        sections: [
          section('header', 0),
          section('caseInfo', 1),
          section('custodyLog', 2, {
            // The adapter owns the DATA + default column set (entry / action /
            // description / actor / date-time / category). These config entries
            // let a tenant rename / resize / toggle those columns; the adapter
            // merges them by key. Order here mirrors the legacy entries table.
            // Hashes / signatures are NOT columns — they render in their own
            // dedicated sections below (custodySummary / hashVerification /
            // digitalSignatures), matching the legacy builder's separate tables.
            columns: [
              { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 38 },
              { key: 'action', visible: true, label: { en: 'Action Type', ar: 'نوع الإجراء' }, width: 65 },
              { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' } },
              { key: 'actor', visible: true, label: { en: 'Actor', ar: 'المنفّذ' }, width: 80 },
              { key: 'occurredAt', visible: true, label: { en: 'Date/Time', ar: 'التاريخ/الوقت' }, width: 70 },
              { key: 'actionCategory', visible: true, label: { en: 'Category', ar: 'الفئة' }, width: 65 },
            ],
          }),
          // Forensic summary box (total entries / categories / actors / date
          // range) — always rendered, restoring the legacy Summary section.
          section('custodySummary', 3),
          // Hash Verification + Digital Signatures tables — the adapter only
          // emits these blocks when the report's includeHashes / includeSignatures
          // options are on (and some entry carries the data), so the sections
          // render nothing otherwise. They mirror the legacy dedicated tables.
          section('hashVerification', 4),
          section('digitalSignatures', 5),
          // Signature lines are OPTIONAL on a custody report (off by default):
          // the immutable ledger + hashes are the evidentiary record. A tenant
          // may switch them on for a wet-ink custodian/witness sign-off.
          section('signature', 6, { visible: false }),
          section('footer', 7),
        ],
        labels: { documentTitle: { en: 'CHAIN OF CUSTODY', ar: 'سلسلة الحيازة' } },
      };
    case 'report':
      return {
        ...base,
        sections: [
          section('header', 0),
          // caseInfo = customer + report meta in one bilingual info box
          // (generalized from the legacy Customer Information + Report Details
          // boxes). diagnostics = the HDD/SSD-aware Device Details / Component
          // Diagnostics box. reportSections = the ordered DB-driven prose
          // sections.
          section('caseInfo', 1),
          section('diagnostics', 2),
          section('reportSections', 3),
          // custodyLog is OPTIONAL: only forensic reports with custody events
          // populate it (the adapter returns no block otherwise, so the section
          // renders nothing). Its columns are the report timeline's
          // event/description/actor/date-time; a tenant may rename/resize/toggle
          // them and the adapter merges by key.
          section('custodyLog', 4, {
            columns: [
              { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 38 },
              { key: 'action', visible: true, label: { en: 'Event', ar: 'الحدث' }, width: 90 },
              { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' } },
              { key: 'actor', visible: true, label: { en: 'Actor', ar: 'المنفّذ' }, width: 80 },
              { key: 'occurredAt', visible: true, label: { en: 'Date/Time', ar: 'التاريخ/الوقت' }, width: 75 },
            ],
          }),
          section('footer', 5),
        ],
        labels: { documentTitle: { en: 'CASE REPORT', ar: 'تقرير الحالة' } },
      };
    default: {
      // Exhaustiveness guard: adding a TemplateDocumentType without a default
      // here is a compile error.
      const _exhaustive: never = docType;
      return _exhaustive;
    }
  }
}

/**
 * Built-in default config for every supported document type. This is the most
 * general layer of the cascade — what a brand-new tenant gets before any
 * customization. Keyed by {@link TemplateDocumentType}.
 */
export const BUILT_IN_TEMPLATE_CONFIGS: Record<TemplateDocumentType, DocumentTemplateConfig> = {
  office_receipt: defaultFor('office_receipt'),
  customer_copy: defaultFor('customer_copy'),
  checkout_form: defaultFor('checkout_form'),
  case_label: defaultFor('case_label'),
  quote: defaultFor('quote'),
  invoice: defaultFor('invoice'),
  payment_receipt: defaultFor('payment_receipt'),
  payslip: defaultFor('payslip'),
  chain_of_custody: defaultFor('chain_of_custody'),
  report: defaultFor('report'),
  stock_label: defaultFor('stock_label'),
};

// ---------------------------------------------------------------------------
// Cascade resolver (pure)
// ---------------------------------------------------------------------------

function mergeColumns(
  base: ColumnConfig[] | undefined,
  override: ColumnConfigOverride[] | undefined,
): ColumnConfig[] | undefined {
  if (!override) return base;
  const baseCols = base ?? [];
  const byKey = new Map<string, ColumnConfig>(baseCols.map((c) => [c.key, { ...c }]));

  for (const ov of override) {
    const existing = byKey.get(ov.key);
    if (existing) {
      byKey.set(ov.key, {
        ...existing,
        ...(ov.visible !== undefined ? { visible: ov.visible } : {}),
        ...(ov.label ? { label: { ...existing.label, ...ov.label } } : {}),
        ...(ov.width !== undefined ? { width: ov.width } : {}),
      });
    } else {
      // New column introduced by an override layer. Requires an `en` label;
      // fall back to the key if a partial label omitted it.
      byKey.set(ov.key, {
        key: ov.key,
        visible: ov.visible ?? true,
        label: { en: ov.label?.en ?? ov.key, ...(ov.label?.ar ? { ar: ov.label.ar } : {}) },
        ...(ov.width !== undefined ? { width: ov.width } : {}),
      });
    }
  }

  // Preserve base order, then append any newly-introduced columns.
  const result: ColumnConfig[] = [];
  for (const c of baseCols) {
    const merged = byKey.get(c.key);
    if (merged) {
      result.push(merged);
      byKey.delete(c.key);
    }
  }
  for (const remaining of byKey.values()) result.push(remaining);
  return result;
}

function mergeSections(
  base: SectionConfig[],
  override: SectionConfigOverride[] | undefined,
): SectionConfig[] {
  if (!override) return base.map((s) => ({ ...s }));
  const byKey = new Map<string, SectionConfig>(base.map((s) => [s.key, { ...s }]));

  for (const ov of override) {
    const existing = byKey.get(ov.key);
    if (existing) {
      byKey.set(ov.key, {
        ...existing,
        ...(ov.visible !== undefined ? { visible: ov.visible } : {}),
        ...(ov.order !== undefined ? { order: ov.order } : {}),
        ...(ov.columns ? { columns: mergeColumns(existing.columns, ov.columns) } : {}),
        ...(ov.lines ? { lines: { ...existing.lines, ...ov.lines } } : {}),
        ...(ov.bankStyle !== undefined ? { bankStyle: ov.bankStyle } : {}),
        ...(ov.bankWidth !== undefined ? { bankWidth: ov.bankWidth } : {}),
        ...(ov.bankAlign !== undefined ? { bankAlign: ov.bankAlign } : {}),
      });
    } else {
      // New section introduced by an override layer.
      byKey.set(ov.key, {
        key: ov.key,
        visible: ov.visible ?? true,
        order: ov.order ?? base.length,
        ...(ov.columns ? { columns: mergeColumns(undefined, ov.columns) } : {}),
        ...(ov.lines ? { lines: { ...ov.lines } } : {}),
        ...(ov.bankStyle !== undefined ? { bankStyle: ov.bankStyle } : {}),
        ...(ov.bankWidth !== undefined ? { bankWidth: ov.bankWidth } : {}),
        ...(ov.bankAlign !== undefined ? { bankAlign: ov.bankAlign } : {}),
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.order - b.order);
}

function mergeLabels(
  base: Record<string, LabelText>,
  override: Record<string, LabelText> | undefined,
): Record<string, LabelText> {
  if (!override) return { ...base };
  const result: Record<string, LabelText> = { ...base };
  for (const [key, label] of Object.entries(override)) {
    result[key] = { ...result[key], ...label };
  }
  return result;
}

/**
 * Shallow-merge an optional config group. Returns `undefined` when neither layer
 * sets it (so absent premium groups stay absent → neutral/legacy), the lone
 * defined layer when only one sets it, or the spread of both (later wins).
 */
function mergeGroup<T extends object>(base: T | undefined, override: T | undefined): T | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

/** Merge typography, deep-merging the per-style `sizes` map by key. */
function mergeTypography(
  base: TypographyConfig | undefined,
  override: TypographyConfig | undefined,
): TypographyConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const sizes = mergeGroup(base.sizes, override.sizes);
  return { ...base, ...override, ...(sizes ? { sizes } : {}) };
}

/** Merge header config, deep-merging the `dividerNudge` triplet by key. */
function mergeHeader(
  base: HeaderConfig | undefined,
  override: HeaderConfig | undefined,
): HeaderConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const dividerNudge = mergeGroup(base.dividerNudge, override.dividerNudge);
  return { ...base, ...override, ...(dividerNudge ? { dividerNudge } : {}) };
}

/** Merge organization config, deep-merging the `show` toggles and `manual` values by key. */
function mergeOrganization(
  base: OrganizationConfig | undefined,
  override: OrganizationConfig | undefined,
): OrganizationConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const show = mergeGroup(base.show, override.show);
  const manual = mergeGroup(base.manual, override.manual);
  return {
    ...base,
    ...override,
    ...(show ? { show } : {}),
    ...(manual ? { manual } : {}),
  };
}

/** Merge signature-images config, deep-merging stamp + signature option objects. */
function mergeSignatureImages(
  base: SignatureImagesConfig | undefined,
  override: SignatureImagesConfig | undefined,
): SignatureImagesConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const stamp = mergeGroup(base.stamp, override.stamp);
  const signature = mergeGroup(base.signature, override.signature);
  return { ...base, ...override, ...(stamp ? { stamp } : {}), ...(signature ? { signature } : {}) };
}

/** Merge translation policy, deep-merging the `groups` toggles by key. */
function mergeTranslationPolicy(
  base: TranslationPolicyConfig | undefined,
  override: TranslationPolicyConfig | undefined,
): TranslationPolicyConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const groups = mergeGroup(base.groups, override.groups);
  return { ...base, ...override, ...(groups ? { groups } : {}) };
}

/** Merge T&C content, deep-merging the `terms` and `notes` EN/AR bodies by key. */
function mergeTermsContent(
  base: TermsContentConfig | undefined,
  override: TermsContentConfig | undefined,
): TermsContentConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const terms = mergeGroup(base.terms, override.terms);
  const notes = mergeGroup(base.notes, override.notes);
  return { ...(terms ? { terms } : {}), ...(notes ? { notes } : {}) };
}

function applyOverride(
  base: DocumentTemplateConfig,
  override: TemplateConfigOverride | undefined,
): DocumentTemplateConfig {
  if (!override) return base;
  return {
    paper: { ...base.paper, ...override.paper },
    branding: { ...base.branding, ...override.branding },
    language: { ...base.language, ...override.language },
    sections: mergeSections(base.sections, override.sections),
    labels: mergeLabels(base.labels, override.labels),
    // Premium groups — undefined-safe (absent layers leave the group absent →
    // neutral/legacy); the three nested objects deep-merge by key.
    typography: mergeTypography(base.typography, override.typography),
    colors: mergeGroup(base.colors, override.colors),
    header: mergeHeader(base.header, override.header),
    footer: mergeGroup(base.footer, override.footer),
    pageNumbers: mergeGroup(base.pageNumbers, override.pageNumbers),
    continuation: mergeGroup(base.continuation, override.continuation),
    organization: mergeOrganization(base.organization, override.organization),
    taxBar: mergeGroup(base.taxBar, override.taxBar),
    table: mergeGroup(base.table, override.table),
    pageFitting: mergeGroup(base.pageFitting, override.pageFitting),
    watermark: mergeGroup(base.watermark, override.watermark),
    layout: mergeGroup(base.layout, override.layout),
    translationPolicy: mergeTranslationPolicy(base.translationPolicy, override.translationPolicy),
    signatureImages: mergeSignatureImages(base.signatureImages, override.signatureImages),
    locale: mergeGroup(base.locale, override.locale),
    termsContent: mergeTermsContent(base.termsContent, override.termsContent),
  };
}

/**
 * Resolve the effective template config via the cascade (most-specific-wins):
 *
 *   built-in default → theme → doc-type → instance
 *
 * Pure and non-mutating: `builtIn` and every override are read-only inputs; a
 * fresh {@link DocumentTemplateConfig} is returned. Scalar fields (paper,
 * branding, language) take the latest layer that sets them; `sections` merge by
 * `key` (and `columns` by column key) preserving base order then re-sorting by
 * `order`; `labels` merge per-key.
 *
 * @param builtIn  The base config (typically `BUILT_IN_TEMPLATE_CONFIGS[docType]`).
 * @param theme    Tenant branding-theme overrides (least specific override).
 * @param docType  Doc-type template overrides (deployed version).
 * @param instance Per-instance overrides (most specific).
 */
export function resolveTemplateConfig(
  builtIn: DocumentTemplateConfig,
  theme?: TemplateConfigOverride,
  docType?: TemplateConfigOverride,
  instance?: TemplateConfigOverride,
): DocumentTemplateConfig {
  let resolved = applyOverride(builtIn, theme);
  resolved = applyOverride(resolved, docType);
  resolved = applyOverride(resolved, instance);
  return resolved;
}

/** Resolve with a derived COUNTRY layer beneath theme (§8b): the cascade is
 *  built-in -> country -> theme -> doc-type -> instance. `country` undefined =
 *  identity, so all existing resolveTemplateConfig call sites are unaffected. */
export function resolveTemplateConfigWithCountry(
  builtIn: DocumentTemplateConfig,
  country?: TemplateConfigOverride,
  theme?: TemplateConfigOverride,
  docType?: TemplateConfigOverride,
  instance?: TemplateConfigOverride,
): DocumentTemplateConfig {
  const withCountry = applyOverride(builtIn, country);
  return resolveTemplateConfig(withCountry, theme, docType, instance);
}
