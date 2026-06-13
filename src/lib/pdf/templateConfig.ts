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
}

/** The resolved, render-ready template configuration for one document. */
export interface DocumentTemplateConfig {
  paper: PaperConfig;
  branding: BrandingConfig;
  language: LanguageConfig;
  sections: SectionConfig[];
  /** Tenant-extendable label dictionary (e.g. `documentTitle`). */
  labels: Record<string, LabelText>;
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
}

/** Partial section override; `key` identifies the target section. */
export interface SectionConfigOverride {
  key: string;
  visible?: boolean;
  order?: number;
  columns?: ColumnConfigOverride[];
  lines?: Record<string, boolean>;
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
  extra?: Pick<SectionConfig, 'columns' | 'lines'> & { visible?: boolean },
): SectionConfig {
  return {
    key,
    visible: extra?.visible ?? true,
    order,
    ...(extra?.columns ? { columns: extra.columns } : {}),
    ...(extra?.lines ? { lines: extra.lines } : {}),
  };
}

/** A financial document (quote/invoice/payment receipt) base section set. */
function financialSections(): SectionConfig[] {
  return [
    section('header', 0),
    section('parties', 1),
    section('meta', 2),
    section('lineItems', 3, { columns: lineItemColumns() }),
    section('totals', 4, {
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
    section('paymentHistory', 5),
    section('terms', 6),
    section('signature', 7, { visible: false }),
    section('qr', 8),
    section('footer', 9),
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
  };

  switch (docType) {
    case 'invoice':
      return {
        ...base,
        sections: financialSections(),
        labels: { documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' } },
      };
    case 'quote':
      return {
        ...base,
        sections: financialSections(),
        labels: { documentTitle: { en: 'QUOTATION', ar: 'عرض سعر' } },
      };
    case 'payment_receipt':
      return {
        ...base,
        sections: [
          section('header', 0),
          section('parties', 1),
          section('meta', 2),
          section('totals', 3, { lines: { amountReceived: true, amountInWords: false } }),
          // Terms is visible: the payment-receipt adapter routes notes (and the
          // bank box) through the terms section's structured-blocks layout. It
          // returns null when there are no notes/bank, so it is harmless when empty.
          section('terms', 4),
          section('qr', 5),
          section('footer', 6),
        ],
        labels: { documentTitle: { en: 'PAYMENT RECEIPT', ar: 'إيصال دفع' } },
      };
    case 'office_receipt':
      return {
        ...base,
        sections: intakeSections(),
        labels: { documentTitle: { en: 'DEVICE CHECK-IN RECEIPT', ar: 'إيصال استلام جهاز' } },
      };
    case 'customer_copy':
      return {
        ...base,
        sections: intakeSections(),
        labels: { documentTitle: { en: 'DEVICE CHECK-IN RECEIPT', ar: 'إيصال استلام جهاز' } },
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
      };
    case 'case_label':
      return {
        ...base,
        paper: LABEL_PAPER,
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
            // description / actor / date-time / category, plus optional hash &
            // signature gated on the report options). These config entries let a
            // tenant rename / resize / toggle those columns; the adapter merges
            // them by key. Order here mirrors the legacy entries table.
            columns: [
              { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 38 },
              { key: 'action', visible: true, label: { en: 'Action Type', ar: 'نوع الإجراء' }, width: 65 },
              { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' } },
              { key: 'actor', visible: true, label: { en: 'Actor', ar: 'المنفّذ' }, width: 80 },
              { key: 'occurredAt', visible: true, label: { en: 'Date/Time', ar: 'التاريخ/الوقت' }, width: 70 },
              { key: 'actionCategory', visible: true, label: { en: 'Category', ar: 'الفئة' }, width: 65 },
            ],
          }),
          // Signature lines are OPTIONAL on a custody report (off by default):
          // the immutable ledger + hashes are the evidentiary record. A tenant
          // may switch them on for a wet-ink custodian/witness sign-off.
          section('signature', 3, { visible: false }),
          section('footer', 4),
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
          // boxes). diagnostics = the HDD/SSD-aware Media Details / Component
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
      });
    } else {
      // New section introduced by an override layer.
      byKey.set(ov.key, {
        key: ov.key,
        visible: ov.visible ?? true,
        order: ov.order ?? base.length,
        ...(ov.columns ? { columns: mergeColumns(undefined, ov.columns) } : {}),
        ...(ov.lines ? { lines: { ...ov.lines } } : {}),
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
