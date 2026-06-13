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

import { PDF_COLORS } from '../styles';
import type { BrandingConfig } from '../templateConfig';

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
