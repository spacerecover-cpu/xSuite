/**
 * branding — engine-side resolution of the OPT-IN PDF branding controls
 * (watermark + accent), kept in one pure module so the assembler
 * (`renderTemplate`) and the section renderers share a single source of truth.
 *
 * ## PDFs are NEUTRAL by default; accent is OPT-IN
 *
 * Generated PDFs are intentionally non-themed: they read in the fixed neutral
 * {@link PDF_COLORS} palette (Royal navy) for ALL tenants regardless of the live
 * UI theme. See `DESIGN.md → Non-Themed Surfaces`. This module does NOT change
 * that default. A tenant only deviates from neutral by EXPLICITLY setting
 * `config.branding.accent` to a hex string (e.g. `'#7C3AED'`); the sentinel
 * `'inherit'` (the built-in default) and any empty/blank/malformed value all
 * resolve back to the neutral palette. The accent, when opted into, touches a
 * deliberately SMALL set of surfaces — the header divider rule color and the
 * section-title text color — never the body text, tables, totals, or status
 * colors, so an accent can never harm legibility.
 *
 * Nothing here touches pdfmake, the DB, RLS, payments, or the legacy builders —
 * it is a pure config→color/string resolver.
 */

import { PDF_COLORS, PDF_STYLES } from '../styles';
import type {
  AddressZone,
  BrandingConfig,
  ColorsConfig,
  DensityPreset,
  DocumentTemplateConfig,
  DividerStyle,
  HeaderLayout,
  LogoPlacement,
  TypographyStyleKey,
  WatermarkConfig,
} from '../templateConfig';

/** The sentinel value of `branding.accent` that means "stay neutral". */
export const ACCENT_INHERIT = 'inherit' as const;

/** Strict `#RGB` / `#RRGGBB` hex test (case-insensitive). */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The accent-driven colors for the two surfaces the engine accents. When the
 * tenant has NOT opted in, both fall back to the neutral {@link PDF_COLORS}
 * defaults the legacy builders use, so output is unchanged.
 */
export interface AccentColors {
  /** Color of the header divider rule (neutral = `PDF_COLORS.primary`). */
  rule: string;
  /** Text color of section titles / bilingual headers (neutral = `PDF_COLORS.primary`). */
  sectionTitle: string;
}

/**
 * Whether `branding.accent` is an explicit, well-formed hex opt-in (not the
 * `'inherit'` sentinel, empty, or a malformed value). Whitespace is tolerated.
 */
export function isAccentOptIn(branding: Pick<BrandingConfig, 'accent'>): boolean {
  return resolveAccentHex(branding) !== null;
}

/**
 * Resolve `branding.accent` to a normalized lowercase hex string, or `null` when
 * the tenant has not opted in (sentinel `'inherit'`, empty, or malformed). A
 * malformed value degrades to `null` (neutral) rather than producing an invalid
 * pdfmake color — a bad config can never break a render.
 */
export function resolveAccentHex(branding: Pick<BrandingConfig, 'accent'>): string | null {
  const raw = branding.accent;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === ACCENT_INHERIT) return null;
  return HEX_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Resolve the accent-driven colors for the header rule and section titles.
 *
 * Default / `'inherit'` / malformed → neutral {@link PDF_COLORS.primary} on both
 * surfaces (no behavior change). An explicit hex opts BOTH the header divider and
 * the section-title text into that hex — the bounded accent surface set.
 */
export function resolveAccentColors(branding: Pick<BrandingConfig, 'accent'>): AccentColors {
  const hex = resolveAccentHex(branding);
  if (hex === null) {
    return { rule: PDF_COLORS.primary, sectionTitle: PDF_COLORS.primary };
  }
  return { rule: hex, sectionTitle: hex };
}

/**
 * Resolve the watermark to a non-empty trimmed string, or `null` when there is
 * none. Absent / empty / whitespace-only watermarks resolve to `null` so the
 * assembler emits no pdfmake `watermark` key at all (default = no watermark).
 */
export function resolveWatermark(branding: Pick<BrandingConfig, 'watermark'>): string | null {
  const raw = branding.watermark;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Premium control resolvers
//
// Each resolver reads a premium config group and returns a fully-populated,
// render-ready value, defaulting to the NEUTRAL / LEGACY constant when the group
// (or a field) is absent. A malformed color degrades to neutral rather than
// breaking a render. The assembler gates on group presence before applying
// these, so an unconfigured template stays byte-for-byte unchanged.
// ---------------------------------------------------------------------------

/** Normalize a candidate hex to lowercase `#rgb`/`#rrggbb`, or null when invalid. */
function normalizeHex(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return HEX_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

export interface ResolvedColors {
  accent: string;
  text: string;
  label: string;
  headerBackground: string;
  headerBackgroundEnabled: boolean;
}

/**
 * Resolve the full per-template color set. Accent precedence: `colors.accent`
 * (opt-in) → legacy `branding.accent` opt-in → neutral `PDF_COLORS.primary`.
 * Every other field falls back to its neutral default; malformed → neutral.
 */
export function resolveColors(config: {
  colors?: ColorsConfig;
  branding?: Pick<BrandingConfig, 'accent'>;
}): ResolvedColors {
  const colors = config.colors;
  const accent =
    normalizeHex(colors?.accent) ??
    (config.branding ? resolveAccentHex(config.branding) : null) ??
    PDF_COLORS.primary;
  return {
    accent,
    text: normalizeHex(colors?.text) ?? PDF_COLORS.text,
    label: normalizeHex(colors?.label) ?? PDF_COLORS.textLight,
    headerBackground: normalizeHex(colors?.headerBackground) ?? PDF_COLORS.headerBg,
    headerBackgroundEnabled: colors?.headerBackgroundEnabled !== false,
  };
}

export interface ResolvedTypography {
  fontFamily: string;
  /** The clamped base font scale (1 when absent) — applied to inline content too. */
  scale: number;
  sizeFor(key: TypographyStyleKey): number;
}

/** Clamp a font scale to a legible range; default 1 when absent/invalid. */
function clampScale(scale: number | undefined): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(2, Math.max(0.6, scale));
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Resolve typography: the font family (default `fallbackFont`) and a `sizeFor`
 * accessor. A named style's size is its absolute override when set, else the
 * built-in `PDF_STYLES` size scaled by the (clamped) base scale.
 */
export function resolveTypography(
  config: Pick<DocumentTemplateConfig, 'typography'>,
  fallbackFont: string,
): ResolvedTypography {
  const typography = config.typography;
  const scale = clampScale(typography?.baseScale);
  const sizes = typography?.sizes;
  return {
    fontFamily: typography?.fontFamily ?? fallbackFont,
    scale,
    sizeFor(key) {
      const override = sizes?.[key];
      if (typeof override === 'number' && override > 0) return override;
      const baseSize = (PDF_STYLES[key] as { fontSize?: number } | undefined)?.fontSize ?? 9;
      return round1(baseSize * scale);
    },
  };
}

export interface ResolvedWatermark {
  text: string | null;
  image: boolean;
  angle: number;
  opacity: number;
  fontSize: number;
}

const WATERMARK_DEFAULT_OPACITY = (PDF_STYLES.watermark as { opacity?: number }).opacity ?? 0.3;
const WATERMARK_DEFAULT_SIZE = (PDF_STYLES.watermark as { fontSize?: number }).fontSize ?? 60;

/**
 * Resolve the watermark settings, or `null` when there is none. Reads
 * `watermark.text` first, then the legacy `branding.watermark` (back-compat). An
 * image watermark needs no text. Angle/opacity/fontSize default to the shared
 * neutral params.
 */
export function resolveWatermarkSettings(config: {
  watermark?: WatermarkConfig;
  branding?: Pick<BrandingConfig, 'watermark'>;
}): ResolvedWatermark | null {
  const wm = config.watermark;
  const text =
    (typeof wm?.text === 'string' && wm.text.trim() !== '' ? wm.text.trim() : null) ??
    (config.branding ? resolveWatermark(config.branding) : null);
  const image = wm?.image === true;
  if (!text && !image) return null;
  return {
    text,
    image,
    angle: typeof wm?.angle === 'number' ? wm.angle : -45,
    opacity: typeof wm?.opacity === 'number' ? wm.opacity : WATERMARK_DEFAULT_OPACITY,
    fontSize: typeof wm?.fontSize === 'number' ? wm.fontSize : WATERMARK_DEFAULT_SIZE,
  };
}

export interface ResolvedHeader {
  layout: HeaderLayout;
  logoPlacement: LogoPlacement;
  logoWidth: number;
  logoHeight: number | null;
  logoMarginBottom: number;
  logoMaxHeight: number | null;
  addressZone: AddressZone;
  divider: DividerStyle;
  dividerNudge: { start: number; end: number; vertical: number };
}

/** Resolve the header-builder settings, defaulting to today's classic layout. */
export function resolveHeader(config: Pick<DocumentTemplateConfig, 'header'>): ResolvedHeader {
  const h = config.header;
  const nudge = h?.dividerNudge;
  return {
    layout: h?.layout ?? 'classic',
    logoPlacement: h?.logoPlacement ?? 'left',
    logoWidth: typeof h?.logoWidth === 'number' && h.logoWidth > 0 ? h.logoWidth : 130,
    logoHeight: typeof h?.logoHeight === 'number' && h.logoHeight > 0 ? h.logoHeight : null,
    logoMarginBottom: typeof h?.logoMarginBottom === 'number' && h.logoMarginBottom >= 0 ? h.logoMarginBottom : 5,
    logoMaxHeight: typeof h?.logoMaxHeight === 'number' && h.logoMaxHeight > 0 ? h.logoMaxHeight : null,
    addressZone: h?.addressZone ?? 'right',
    divider: h?.divider ?? 'thin',
    dividerNudge: {
      start: typeof nudge?.start === 'number' ? nudge.start : 0,
      end: typeof nudge?.end === 'number' ? nudge.end : 0,
      vertical: typeof nudge?.vertical === 'number' ? nudge.vertical : 0,
    },
  };
}

export interface ResolvedFooter {
  customText: string | null;
  background: string | null;
  fontColor: string;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
}

/** Resolve footer settings, defaulting to the neutral identity-driven footer. */
export function resolveFooter(config: Pick<DocumentTemplateConfig, 'footer'>): ResolvedFooter {
  const f = config.footer;
  const customText =
    typeof f?.customText === 'string' && f.customText.trim() !== '' ? f.customText : null;
  return {
    customText,
    background: normalizeHex(f?.background),
    fontColor: normalizeHex(f?.fontColor) ?? PDF_COLORS.textMuted,
    fontSize: typeof f?.fontSize === 'number' && f.fontSize > 0 ? f.fontSize : 8,
    alignment: f?.alignment ?? 'center',
  };
}

export interface ResolvedPageNumbers {
  enabled: boolean;
  position: 'left' | 'center' | 'right';
  format: string;
}

/** Resolve page-number settings; disabled by default (legacy = none). */
export function resolvePageNumbers(
  config: Pick<DocumentTemplateConfig, 'pageNumbers'>,
): ResolvedPageNumbers {
  const p = config.pageNumbers;
  return {
    enabled: p?.enabled === true,
    position: p?.position ?? 'right',
    format:
      typeof p?.format === 'string' && p.format.trim() !== ''
        ? p.format
        : 'Page {page} of {pages}',
  };
}

export interface ResolvedOrganization {
  source: 'company_info' | 'manual';
  show: {
    logo: boolean;
    name: boolean;
    nameAr: boolean;
    legalName: boolean;
    legalNameAr: boolean;
    address: boolean;
    taxId: boolean;
  };
  addressFontSize: number;
  columnWidth: 'auto' | number;
  manual: {
    name?: string;
    nameAr?: string;
    legalName?: string;
    legalNameAr?: string;
    address?: string;
    taxId?: string;
  };
}

/**
 * Resolve the header organization-detail settings. All identity lines show by
 * default except the Arabic variants (off until a bilingual tenant opts in).
 */
export function resolveOrganization(
  config: Pick<DocumentTemplateConfig, 'organization'>,
): ResolvedOrganization {
  const o = config.organization;
  const show = o?.show;
  return {
    source: o?.source ?? 'company_info',
    show: {
      logo: show?.logo !== false,
      name: show?.name !== false,
      nameAr: show?.nameAr === true,
      legalName: show?.legalName !== false,
      legalNameAr: show?.legalNameAr === true,
      address: show?.address !== false,
      taxId: show?.taxId !== false,
    },
    addressFontSize:
      typeof o?.addressFontSize === 'number' && o.addressFontSize > 0 ? o.addressFontSize : 8,
    columnWidth: o?.columnWidth ?? 'auto',
    manual: o?.manual ?? {},
  };
}

export interface ResolvedTable {
  headerBackground: string;
  rowNumbering: boolean;
  zebra: boolean;
  sectionSubtotals: boolean;
}

/** Resolve table styling. Header fill precedence: table → colors → neutral. */
export function resolveTable(
  config: Pick<DocumentTemplateConfig, 'table' | 'colors'>,
): ResolvedTable {
  const t = config.table;
  return {
    headerBackground:
      normalizeHex(t?.headerBackground) ??
      normalizeHex(config.colors?.headerBackground) ??
      PDF_COLORS.headerBg,
    rowNumbering: t?.rowNumbering === true,
    zebra: t?.zebra === true,
    sectionSubtotals: t?.sectionSubtotals === true,
  };
}

export interface ResolvedPageFitting {
  autoFitOnePage: boolean;
  density: DensityPreset;
  minScale: number;
}

/** Resolve page-fitting/density; auto-fit off and comfortable by default. */
export function resolvePageFitting(
  config: Pick<DocumentTemplateConfig, 'pageFitting'>,
): ResolvedPageFitting {
  const p = config.pageFitting;
  const minScale =
    typeof p?.minScale === 'number' && p.minScale > 0 ? Math.min(1, p.minScale) : 0.8;
  return {
    autoFitOnePage: p?.autoFitOnePage === true,
    density: p?.density ?? 'comfortable',
    minScale,
  };
}
