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

import { DOCUMENT_TRANSLATIONS, getTranslation, type LanguageCode, type TranslationKey } from '../documentTranslations';

/**
 * Bilingual label. `en` is mandatory. A secondary translation can be supplied
 * for ANY of the 13 supported languages via `i18n` (the generalized field).
 *
 * `ar` is the LEGACY Arabic-only secondary slot. It is kept for backward
 * compatibility — deployed templates + `company_settings` store the old
 * `{ en, ar }` shape — but is DEPRECATED in favor of `i18n.ar`. Read secondary
 * text through {@link secondaryText}, which treats a legacy `.ar` as `i18n.ar`,
 * so existing configs keep rendering byte-identically with no data migration.
 */
export interface LabelText {
  en: string;
  /**
   * @deprecated Use `i18n.ar`. Retained so legacy `{ en, ar }` configs render
   * unchanged; {@link secondaryText} reads it as the Arabic secondary.
   */
  ar?: string;
  /** Generalized per-language secondary translations (any of the 13). */
  i18n?: Partial<Record<LanguageCode, string>>;
}

/**
 * Resolve the secondary-language string for a label, generalizing the legacy
 * Arabic-only `LabelText.ar` to all 13 languages:
 *
 *   `label.i18n?.[lang] ?? (lang === 'ar' ? label.ar : undefined)`
 *
 * A label authored the new way (`{ en, i18n: { fr } }`) returns its French text
 * for `lang === 'fr'`; a legacy label (`{ en, ar }`) still returns its Arabic
 * text for `lang === 'ar'`. Returns `undefined` when no secondary is selected or
 * none is authored for the requested language (callers degrade to English).
 */
/**
 * Reverse index: Arabic value → translation key, built once (lazily) from the
 * central {@link DOCUMENT_TRANSLATIONS} Arabic block. This is what lets a LEGACY
 * `{ en, ar }` label — the shape the financial adapters (invoice/quote/receipt/
 * checkout) still emit, with NO `i18n` map — be translated into ANY of the 13
 * languages: we join the label's Arabic string back to its key, then read the
 * requested language from the same table. First key wins on duplicate Arabic
 * values (synonym keys share a translation, so the collision is harmless).
 */
let _arabicToKey: Map<string, TranslationKey> | null = null;
function arabicLabelKey(ar: string): TranslationKey | undefined {
  if (_arabicToKey === null) {
    _arabicToKey = new Map();
    const arBlock = DOCUMENT_TRANSLATIONS.ar as Record<string, string>;
    for (const key of Object.keys(arBlock)) {
      const value = arBlock[key];
      if (value && !_arabicToKey.has(value)) _arabicToKey.set(value, key as TranslationKey);
    }
  }
  return _arabicToKey.get(ar);
}

/**
 * Hand-authored Arabic in the financial adapters drifted from the central table
 * (synonyms / colon variants), so the pure value-join misses. These map the
 * adapter's EXACT Arabic to the right key — the keys already exist in all 13
 * languages, so no new translations are needed; only the join is repaired.
 */
const ARABIC_ALIASES: Record<string, TranslationKey> = {
  'البريد:': 'emailLabel', // adapter "Email:" vs table 'البريد الإلكتروني:'
  'الآيبان:': 'ibanLabel', // adapter "IBAN:" vs table 'آيبان:'
  'تفاصيل البنك': 'bankAccount', // adapter "Bank Account" vs 'تفاصيل الحساب البنكي'
  'عرض أسعار': 'quotation', // adapter "QUOTATION" (plural) vs 'عرض سعر'
  'الإجمالي:': 'total', // adapter "Total:" (colon) vs 'الإجمالي'
  المجموع: 'total', // adapter line-item "Total" column vs 'الإجمالي'
};

function keyForArabic(ar: string): TranslationKey | undefined {
  return arabicLabelKey(ar) ?? ARABIC_ALIASES[ar];
}

/** Normalize an English label to a comparison key: lowercase, strip non-alphanum
 *  (drops spaces, ':' , '%', punctuation). 'Invoice Terms' / 'Net Amount:' →
 *  'invoiceterms' / 'netamount'. */
function normalizeEnglish(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Reverse index normalized-English → key, built from the key NAMES (which ARE the
 * English label in camelCase: `invoiceTerms`, `total`, `customerInformation`).
 * The LAST-RESORT join when a label's Arabic is empty / whitespace / missing —
 * e.g. a saved template override that dropped the secondary
 * (`{ en:'Invoice Terms', ar:'' }`), or a label authored English-only. Works for
 * Arabic too, so such a label still renders bilingually in an Arabic document.
 */
let _englishToKey: Map<string, TranslationKey> | null = null;
function englishLabelKey(enText: string): TranslationKey | undefined {
  if (_englishToKey === null) {
    _englishToKey = new Map();
    for (const key of Object.keys(DOCUMENT_TRANSLATIONS.ar)) {
      const n = normalizeEnglish(key);
      if (n && !_englishToKey.has(n)) _englishToKey.set(n, key as TranslationKey);
    }
  }
  const n = normalizeEnglish(enText);
  return n ? _englishToKey.get(n) : undefined;
}

export function secondaryText(
  label: SecondaryTextSource | undefined,
  lang: LanguageCode | null,
): string | undefined {
  if (!label || !lang) return undefined;
  const direct = label.i18n?.[lang] ?? (lang === 'ar' ? label.ar?.trim() || undefined : undefined);
  if (direct) return direct;
  // Join the legacy Arabic to the central table — TRIMMED, because some authored
  // labels carry stray whitespace ('الكمية ' / 'المجموع '), which silently broke
  // the join. Then a drift alias; then an interpolated split ("VAT 5%:" → translate
  // the term, keep the rate). This is what makes the invoice/quote/receipt/checkout
  // adapters (legacy `{ en, ar }`, no i18n) render bilingually in all 13 languages.
  const arTrim = label.ar?.trim();
  if (arTrim && lang !== 'ar') {
    const key = keyForArabic(arTrim);
    if (key) {
      const t = getTranslation(key, lang);
      if (t) return t;
    }
    const m = arTrim.match(/^(.*?)(\s*\d+(?:[.,]\d+)?\s*%\s*:?)\s*$/);
    if (m) {
      const baseKey = keyForArabic(m[1].trim());
      if (baseKey) {
        const t = getTranslation(baseKey, lang);
        if (t) return `${t}${m[2]}`;
      }
    }
  }
  // Last resort — join by the ENGLISH label name. Handles a label whose Arabic is
  // empty / whitespace / missing (a saved override that stripped the secondary,
  // e.g. config.labels.recordTerms = { en:'Invoice Terms', ar:'' }), in EVERY
  // language including Arabic.
  if (label.en) {
    const key = englishLabelKey(label.en);
    if (key) {
      const t = getTranslation(key, lang);
      if (t) return t;
    }
  }
  return undefined;
}

/**
 * The minimal shape {@link secondaryText} reads — a legacy `.ar` slot plus the
 * generalized `i18n` map. Both {@link LabelText} (heading: `en` required) and
 * {@link TermsBodyText} (body: `en` optional) satisfy it, so the same resolver
 * serves headings and prose bodies alike.
 */
export interface SecondaryTextSource {
  /** Present on {@link LabelText} (required there) / {@link TermsBodyText}; not read here. */
  en?: string;
  ar?: string;
  i18n?: Partial<Record<LanguageCode, string>>;
}

/**
 * Per-document language behavior.
 * - `en`: single (English only).
 * - `ar`: SECONDARY-only (single secondary language; legacy name = Arabic-only).
 * - `bilingual_stacked`: English + secondary stacked vertically.
 * - `bilingual_sidebyside`: English + secondary mirrored side-by-side (RTL-aware).
 *
 * NOTE: the `'ar'` literal is kept for backward-compat (many files switch on it);
 * its SEMANTICS are "secondary-only", with the secondary chosen by
 * {@link resolveSecondary} (Arabic when none is set).
 */
export type LanguageMode = 'en' | 'ar' | 'bilingual_stacked' | 'bilingual_sidebyside';

export interface LanguageConfig {
  mode: LanguageMode;
  /**
   * Which language leads when both are shown. `'ar'` is the legacy "secondary
   * leads" value; the union is intentionally unchanged for back-compat.
   */
  primary: 'en' | 'ar';
  /**
   * Which of the 13 languages is the secondary. Undefined ⇒ Arabic (legacy
   * behavior), resolved via {@link resolveSecondary}. A config with no
   * `secondary` therefore behaves EXACTLY as today; `secondary: 'fr'` renders
   * English + French.
   */
  secondary?: LanguageCode;
}

/**
 * The effective secondary language for a config, generalizing the legacy
 * Arabic-only model. Explicit `secondary` wins; otherwise any bilingual /
 * secondary-only / Arabic-primary config falls back to Arabic (today's
 * behavior); a pure-English config has no secondary (`null`).
 */
export function resolveSecondary(language: LanguageConfig): LanguageCode | null {
  if (language.secondary) return language.secondary;
  if (
    language.mode === 'ar' ||
    language.mode === 'bilingual_stacked' ||
    language.mode === 'bilingual_sidebyside' ||
    language.primary === 'ar'
  ) {
    return 'ar';
  }
  return null;
}

/**
 * Page geometry. `margins` is CSS order: [top, right, bottom, left] (matching the
 * Studio inputs). renderTemplate reorders to pdfmake's [left, top, right, bottom];
 * the Typst assembler maps each side by name.
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
/**
 * Status-tone for a section (Option B data-recovery REPORT design). Drives a
 * fixed-hex tinted header bar / left accent rule per tone — theme-INVARIANT
 * status semantics, never brand color (see `PDF_TONES` in `styles.ts`). Absent =
 * `neutral`; sections without a `tone` behave exactly as today, so no other
 * document type is affected.
 */
export type SectionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface SectionConfig {
  key: string;
  visible: boolean;
  order: number;
  columns?: ColumnConfig[];
  lines?: Record<string, boolean>;
  /** Status-tone (Option B reports only). Absent → neutral; no effect on other doc types. */
  tone?: SectionTone;
  /**
   * Optional named condition gate evaluated by the adapter when building the
   * report config — e.g. omit the device column for subtypes without device
   * data. Purely advisory metadata for adapter-built configs; the assembler does
   * not read it (visibility is the gate the assembler honours). Absent = always.
   */
  condition?: string;
  /** Bank section only: how the bank-account details render — a bordered box
   *  (`'boxed'`, default) or a single compact pipe-separated line (`'inline'`). */
  bankStyle?: 'boxed' | 'inline';
  /** Bank section, boxed style only: box width — `'auto'` hugs the content
   *  (default), `'half'` a fixed ~half-page column, `'full'` spans the row. */
  bankWidth?: 'auto' | 'half' | 'full';
  /** Bank section, boxed non-full width only: horizontal placement of the box. */
  bankAlign?: 'left' | 'center' | 'right';
  /** Per-section header band / table-header fill (hex). Overrides the global
   *  `colors.headerBackground` for THIS section only; absent → global, then neutral. */
  headerBackground?: string;
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
  /** Divider rule under the letterhead. Default `'thin'` (0.5pt today). */
  divider?: DividerStyle;
  /** Opt-in divider rule colour (hex). Unset → follows the accent (neutral navy by default). */
  dividerColor?: string;
  /** Nudge the divider rule endpoints / baseline (points). Default 0/0/0. */
  dividerNudge?: { start?: number; end?: number; vertical?: number };
}

export interface FooterConfig {
  /** Custom footer text; empty/omitted uses the identity tagline + website. */
  customText?: string;
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

/**
 * Presentation finish — the premium "design pack" knobs (all OPTIONAL; absent
 * group/field = the legacy finish, byte-identical output).
 *
 * These control the visual FINISH of surfaces the engine already renders:
 * info-box cards, data-table headers, the document title, signature rules, the
 * consent/terms box, and the footer. A preset (or the Studio) opts a template
 * into the airy, reference-grade look; templates that never set the group keep
 * today's exact rendering, so the parity/golden wall is unaffected.
 */
export type InfoCardStyle = 'band' | 'open';
export type TableHeaderStyle = 'filled' | 'light';
export type TitleStyle = 'inline' | 'display';
export type DocRefStyle = 'none' | 'banner' | 'pill';
export type SignatureLineStyle = 'solid' | 'dotted';
export type TermsLayoutStyle = 'boxed' | 'open';

export interface PresentationConfig {
  /** Info-box finish: `'band'` filled header band (legacy) or `'open'` white
   *  header + inset hairline divider + roomier rows. Default `'band'`. */
  infoCardStyle?: InfoCardStyle;
  /** Data-table header finish: `'filled'` colored band (legacy) or `'light'`
   *  white header with dark bold text + hairline grid. Default `'filled'`. */
  tableHeaderStyle?: TableHeaderStyle;
  /** Document title: `'inline'` single line (legacy) or `'display'` — larger,
   *  letter-spaced English with the secondary stacked beneath. Default `'inline'`. */
  titleStyle?: TitleStyle;
  /** Document-reference banner under the title (Job ID / case no): `'none'`
   *  (legacy), `'banner'` full-width box, or `'pill'` compact centered chip.
   *  Renders only when the adapter supplies {@link EngineDocData.docRef} data
   *  and the config lists a visible `docRef` section. Default `'none'`. */
  docRef?: DocRefStyle;
  /** Signature rules: `'solid'` (legacy) or `'dotted'`. Default `'solid'`. */
  signatureStyle?: SignatureLineStyle;
  /** Signature label alignment under the rule. Default `'left'` (legacy). */
  signatureAlign?: 'left' | 'center';
  /** Consent/terms box: `'boxed'` bordered (legacy) or `'open'` free two-column
   *  prose. Default `'boxed'`. */
  termsStyle?: TermsLayoutStyle;
  /** Footer: accent-colored tagline + social icon glyphs beside the network
   *  names. Default false (legacy text-only footer). */
  footerSocialIcons?: boolean;
  /** Letterhead: append the website line to the identity block. Default false. */
  headerWebsite?: boolean;
  /** Device tables: draw the device-type icon beside the type cell. Default false. */
  deviceIcons?: boolean;
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
  /** Payment-history statement heading + column headers (financial documents). */
  paymentHistory?: boolean;
  /** Totals box labels — subtotal/VAT/total/etc (financial documents). */
  totals?: boolean;
}

/** Controls which FIELD-ROW labels render bilingually (no effect on data values). */
export interface TranslationPolicyConfig {
  /** Default 'all' (every label bilingual when the document is bilingual). */
  mode?: TranslationPolicyMode;
  /** Per-group field-label toggle for mode === 'custom' (default true = bilingual). */
  groups?: TranslationPolicyGroups;
}

/** The stable keys for the totals lines (used for label/colour overrides). */
export type TotalsLineKey =
  | 'subtotal' | 'discount' | 'netAmount' | 'tax' | 'total' | 'amountPaid' | 'balanceDue' | 'amountInWords';

/** Opt-in background/text colour for a totals row (hex; absent = neutral). */
export interface TotalsRowColor {
  background?: string;
  text?: string;
}

/**
 * Per-template customisation of the Total section (all OPTIONAL → neutral/legacy
 * when absent). Common to every language combination + both renderers.
 */
export interface TotalsConfig {
  /** Custom English wording per line — overrides the default label (the secondary
   *  translation, when bilingual, keeps its default). */
  labels?: Partial<Record<TotalsLineKey, string>>;
  /** Opt-in per-row colours for the grand total, balance-due and tax rows. */
  rowColors?: {
    total?: TotalsRowColor;
    balanceDue?: TotalsRowColor;
    tax?: TotalsRowColor;
  };
  /** Visual style of the totals block. Default `'plain'`. */
  style?: 'plain' | 'bordered' | 'striped';
  /** Tint the grand-total row with a band. Default true. */
  highlightTotal?: boolean;
}

/**
 * The standalone VAT/GST breakdown table (rate → taxable → tax). OPT-IN: the
 * adapter only emits the data when `show` is true. All styling is optional →
 * neutral defaults (navy header, bordered).
 */
export interface TaxSummaryConfig {
  /** Render the tax-summary table. Default false. */
  show?: boolean;
  /** Heading override (English); blank → "Tax Summary". */
  title?: string;
  /** Table style. Default `'bordered'`. */
  style?: 'bordered' | 'borderless' | 'striped';
  /** Header fill + text colours (hex; default navy / white). */
  headerBackground?: string;
  headerText?: string;
  /** Body text colour (hex; default dark slate). */
  bodyText?: string;
  /** Tint + emphasise the totals row. Default true. */
  highlightTotalRow?: boolean;
  /** Totals-row fill (hex; default the neutral shade). */
  totalRowBackground?: string;
  /** Spell the total tax out in words below the table. Default false. */
  showAmountInWords?: boolean;
}

/** Resolved locale slice threaded by applyTenantLocale / the country layer
 *  (§8d/§8g). Absent = today's neutral PDF default (date 'dd MMM yyyy', Western
 *  grouping, document-currency decimals). */
export interface LocaleConfig {
  dateFormat?: string;
  groupingStyle?: 'standard' | 'indian';
  /** Amount-in-words scale for the English speller: absent/'western' = million/
   *  billion (today's output), 'indian' = lakh/crore (WP-L1). */
  amountWordsScale?: 'western' | 'indian';
  decimalPlaces?: number;
  /** Country decimal separator ('.' or ','); absent = engine default '.'. */
  decimalSeparator?: string;
  /** Country thousands separator (',', '.', ' ', or '' for none). */
  thousandsSeparator?: string;
  /** Country address_format lists the postal code before the city (Task 22).
   *  Absent/false = today's city-then-postal ordering (GCC/US/UK unchanged). */
  postalFirst?: boolean;
}

/**
 * A Terms/Notes body: mandatory(-ish) English text plus per-language secondary
 * translations. Generalized from the legacy Arabic-only `{ en, ar }` shape to all
 * 13 languages via `i18n` (same model as {@link LabelText}). `en` is optional
 * here because a tenant may author only the secondary side, or leave a body
 * blank; read the secondary through {@link secondaryText}, which treats a legacy
 * `.ar` as `i18n.ar` so deployed `{ en, ar }` content keeps rendering unchanged.
 */
export interface TermsBodyText {
  en?: string;
  /** @deprecated Use `i18n.ar`. Retained for legacy `{ en, ar }` compatibility. */
  ar?: string;
  /** Generalized per-language secondary translations (any of the 13). */
  i18n?: Partial<Record<LanguageCode, string>>;
}

/**
 * Per-document-type Terms & Conditions content (Studio-edited, bilingual).
 * Each document type's template carries its own — a Quote's terms differ from
 * an Invoice's. Rendered by the `terms` section; headings come from
 * `labels.terms` / `labels.notes`. The template is the single source of truth
 * (no tenant-wide or per-record override).
 */
export interface TermsContentConfig {
  terms?: TermsBodyText;
  notes?: TermsBodyText;
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
  organization?: OrganizationConfig;
  taxBar?: TaxBarConfig;
  table?: TableConfig;
  pageFitting?: PageFittingConfig;
  watermark?: WatermarkConfig;
  layout?: LayoutConfig;
  /** Premium presentation finish (cards/tables/title/signatures/footer). */
  presentation?: PresentationConfig;
  translationPolicy?: TranslationPolicyConfig;
  signatureImages?: SignatureImagesConfig;
  /** Resolved date/number locale (§8d). Absent = neutral PDF default. */
  locale?: LocaleConfig;
  /** Per-document-type Terms & Conditions content (bilingual). */
  termsContent?: TermsContentConfig;
  /** Total-section customisation (labels, per-row colours, style). */
  totals?: TotalsConfig;
  /** Standalone VAT/GST breakdown table (opt-in). */
  taxSummary?: TaxSummaryConfig;
  /** Resolved DocumentComplianceProfile key (set by countryTemplateOverride).
   *  Drives regime-owned statutory meta injection in the financial adapters. */
  statutoryProfileKey?: string;
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
  | 'credit_note'
  | 'payment_receipt'
  | 'payslip'
  | 'chain_of_custody'
  | 'report'
  | 'stock_label';

/**
 * Storage key for a tenant template row (`document_templates_pdf.document_type`,
 * a free-text column): either a plain {@link TemplateDocumentType}, or a
 * report-subtype-scoped `report:<subtype>` key so each of the 8 report types can
 * carry its own template. The bare `report` key remains the legacy shared base
 * that any subtype without its own template falls back to.
 */
export type TemplateStorageKey = string;

const REPORT_KEY_PREFIX = 'report:';

/** The subtype-scoped storage key for one report type's template. */
export function reportTemplateKey(subtype: string): TemplateStorageKey {
  return `${REPORT_KEY_PREFIX}${subtype}`;
}

/** Recover the engine doc type (and report subtype, if any) from a storage key. */
export function parseTemplateStorageKey(key: TemplateStorageKey): {
  docType: TemplateDocumentType;
  reportSubtype?: string;
} {
  if (key.startsWith(REPORT_KEY_PREFIX)) {
    return { docType: 'report', reportSubtype: key.slice(REPORT_KEY_PREFIX.length) };
  }
  return { docType: key as TemplateDocumentType };
}

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
  /** Resolved DocumentComplianceProfile key — drives statutory meta injection. */
  statutoryProfileKey?: string;
  // ── Premium controls — the interfaces are all-optional, so they double as
  //    their own override shape. Scalars replace; the nested objects
  //    (`typography.sizes`, `header.dividerNudge`, `organization.show`/`manual`)
  //    deep-merge by key. ──────────────────────────────────────────────────
  typography?: TypographyConfig;
  colors?: ColorsConfig;
  header?: HeaderConfig;
  footer?: FooterConfig;
  pageNumbers?: PageNumbersConfig;
  organization?: OrganizationConfig;
  taxBar?: TaxBarConfig;
  table?: TableConfig;
  pageFitting?: PageFittingConfig;
  watermark?: WatermarkConfig;
  layout?: LayoutConfig;
  /** Premium presentation finish (scalars; shallow-merged). */
  presentation?: PresentationConfig;
  translationPolicy?: TranslationPolicyConfig;
  signatureImages?: SignatureImagesConfig;
  locale?: LocaleConfig;
  /** Per-document-type Terms & Conditions content (deep-merged: terms + notes). */
  termsContent?: TermsContentConfig;
  /** Total-section customisation (deep-merged: labels + rowColors by key). */
  totals?: TotalsConfig;
  /** Standalone VAT/GST breakdown table (scalars; shallow-merged). */
  taxSummary?: TaxSummaryConfig;
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
  tone?: SectionTone;
  condition?: string;
  headerBackground?: string;
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

/** Standard line-item table columns used by quote / invoice.
 *  `itemCode` / `unit` are hidden by default (visible:false) and flipped on by a
 *  compliance profile's `forcedColumns` (via `forcedColumnOverrides` in the
 *  country layer) or a tenant Studio toggle — GCC hides them, India shows them. */
function lineItemColumns(): ColumnConfig[] {
  return [
    { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, width: 220 },
    { key: 'quantity', visible: true, label: { en: 'Qty', ar: 'الكمية' }, width: 40 },
    { key: 'itemCode', visible: false, label: { en: 'Code', ar: 'الرمز' }, width: 50 },
    { key: 'unit', visible: false, label: { en: 'Unit', ar: 'الوحدة' }, width: 45 },
    { key: 'unitPrice', visible: true, label: { en: 'Unit Price', ar: 'سعر الوحدة' } },
    { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' } },
  ];
}

/** Helper to build a section with a sequential order. */
function section(
  key: string,
  order: number,
  extra?: Pick<SectionConfig, 'columns' | 'lines' | 'bankStyle' | 'bankWidth' | 'bankAlign' | 'tone' | 'condition'> & { visible?: boolean },
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
    ...(extra?.tone ? { tone: extra.tone } : {}),
    ...(extra?.condition ? { condition: extra.condition } : {}),
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
    // VAT/GST breakdown table (rate → taxable → tax). Opt-in: renders nothing
    // unless `config.taxSummary.show` (the adapter only emits the data then).
    section('taxSummary', 6),
    // Payment-history statement — rendered between totals and terms, mirroring
    // the legacy InvoiceDocument layout. Returns null on docs with no history
    // (proforma, quotes), so it is harmless on the shared financial base.
    section('paymentHistory', 7),
    // Standard Terms & Conditions (Studio content only; omitted when blank).
    section('terms', 8),
    // Per-record "Quote Terms" / "Invoice Terms" — the terms entered on the
    // record (from Terms & Templates). Its own positionable section; omitted when
    // the record carries none.
    section('recordTerms', 9),
    // Bank account as its own movable section — visible by default and rendered
    // here (no longer inline in terms). Reorder / show-hide like any section, with
    // a Boxed | Single line display style.
    section('bank', 10, { bankStyle: 'boxed', bankWidth: 'auto', bankAlign: 'left' }),
    section('signature', 11, { visible: false }),
    section('qr', 12),
    section('footer', 13),
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
        labels: { documentTitle: { en: 'QUOTATION', ar: 'عرض أسعار' } },
        layout: { partiesMetaSideBySide: true },
      };
    case 'credit_note':
      // A credit note is a simpler statutory document than an invoice/quote: no
      // tax bar / tax summary / payment history / bank / signature / QR sections
      // (CreditNoteData carries no bank_accounts and the legacy builder never
      // resolves a QR image for it either) — just the identity + customer/
      // credit-note-details header, the credited line items, the STORED totals,
      // and the Reason box (via `terms`). Mirrors the legacy two-column
      // Customer Information | Credit Note Details layout from
      // `documents/CreditNoteDocument.ts`.
      return {
        ...base,
        sections: [
          section('header', 0),
          section('parties', 1),
          section('meta', 2),
          section('lineItems', 3, { columns: lineItemColumns() }),
          section('totals', 4, {
            lines: {
              subtotal: true,
              tax: true,
              total: true,
              amountPaid: false,
              balanceDue: false,
              amountInWords: false,
            },
          }),
          section('terms', 5),
          section('footer', 6),
        ],
        labels: { documentTitle: { en: 'CREDIT NOTE', ar: 'إشعار دائن' } },
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
        labels: { documentTitle: { en: 'PAYMENT RECEIPT', ar: 'إيصال الدفع' } },
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
      // The report built-in is the Option B "Modern lab" UNIVERSAL SHELL (the
      // evaluation default): a navy header band, the summary-tile row, the
      // two-column General | Device info region, the toned editorial prose
      // sections, an optional forensic custody timeline, and the provable report
      // footer. The per-SUBTYPE config (title + visible sections + tones) is
      // built by `reportConfigForSubtype` in the report adapter, which cascades
      // over this base; the Studio preview and any caller resolving this built-in
      // get the Option B layout by default.
      return {
        ...base,
        sections: [
          section('reportHeader', 0),
          section('reportSummary', 1),
          section('reportInfoColumns', 2),
          // reportSections = the ordered, tone-stamped editorial prose sections
          // (the adapter selects + orders + tones them per subtype).
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
          section('reportFooter', 5),
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
  credit_note: defaultFor('credit_note'),
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
        label: {
          en: ov.label?.en ?? ov.key,
          ...(ov.label?.ar ? { ar: ov.label.ar } : {}),
          ...(ov.label?.i18n ? { i18n: ov.label.i18n } : {}),
        },
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
        ...(ov.tone !== undefined ? { tone: ov.tone } : {}),
        ...(ov.condition !== undefined ? { condition: ov.condition } : {}),
        ...(ov.headerBackground !== undefined ? { headerBackground: ov.headerBackground } : {}),
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
        ...(ov.tone !== undefined ? { tone: ov.tone } : {}),
        ...(ov.condition !== undefined ? { condition: ov.condition } : {}),
        ...(ov.headerBackground !== undefined ? { headerBackground: ov.headerBackground } : {}),
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

/** Merge one Terms/Notes body, deep-merging the per-language `i18n` map by key
 *  (so a layer can add a French translation without dropping an existing Arabic). */
function mergeTermsBody(
  base: TermsBodyText | undefined,
  override: TermsBodyText | undefined,
): TermsBodyText | undefined {
  if (!base) return override;
  if (!override) return base;
  const i18n = mergeGroup(base.i18n, override.i18n);
  return { ...base, ...override, ...(i18n ? { i18n } : {}) };
}

/** Merge T&C content, deep-merging the `terms` and `notes` bodies (incl. i18n) by key. */
function mergeTermsContent(
  base: TermsContentConfig | undefined,
  override: TermsContentConfig | undefined,
): TermsContentConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const terms = mergeTermsBody(base.terms, override.terms);
  const notes = mergeTermsBody(base.notes, override.notes);
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
    organization: mergeOrganization(base.organization, override.organization),
    taxBar: mergeGroup(base.taxBar, override.taxBar),
    table: mergeGroup(base.table, override.table),
    pageFitting: mergeGroup(base.pageFitting, override.pageFitting),
    watermark: mergeGroup(base.watermark, override.watermark),
    layout: mergeGroup(base.layout, override.layout),
    presentation: mergeGroup(base.presentation, override.presentation),
    translationPolicy: mergeTranslationPolicy(base.translationPolicy, override.translationPolicy),
    signatureImages: mergeSignatureImages(base.signatureImages, override.signatureImages),
    locale: mergeGroup(base.locale, override.locale),
    termsContent: mergeTermsContent(base.termsContent, override.termsContent),
    totals: mergeTotals(base.totals, override.totals),
    taxSummary: mergeGroup(base.taxSummary, override.taxSummary),
  };
}

/** Merge totals customisation, deep-merging the `labels` + `rowColors` maps. */
function mergeTotals(
  base: TotalsConfig | undefined,
  override: TotalsConfig | undefined,
): TotalsConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  return {
    ...base,
    ...override,
    ...(base.labels || override.labels ? { labels: { ...base.labels, ...override.labels } } : {}),
    ...(base.rowColors || override.rowColors
      ? {
          rowColors: {
            ...base.rowColors,
            ...override.rowColors,
            ...(base.rowColors?.total || override.rowColors?.total ? { total: { ...base.rowColors?.total, ...override.rowColors?.total } } : {}),
            ...(base.rowColors?.balanceDue || override.rowColors?.balanceDue ? { balanceDue: { ...base.rowColors?.balanceDue, ...override.rowColors?.balanceDue } } : {}),
            ...(base.rowColors?.tax || override.rowColors?.tax ? { tax: { ...base.rowColors?.tax, ...override.rowColors?.tax } } : {}),
          },
        }
      : {}),
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
