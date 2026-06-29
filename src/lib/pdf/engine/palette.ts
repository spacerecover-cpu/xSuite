/**
 * palette — pure WCAG color math + the "smart palette" generator.
 *
 * Differentiator: a tenant picks ONE brand color and we derive a complete,
 * contrast-safe document palette (accent + body text + muted label + a tinted
 * header background) that meets WCAG AA/AAA. The same contrast helpers power the
 * in-editor contrast guard. No I/O, no pdfmake, no app-theme — pure functions.
 */

import type { ColorsConfig } from '../templateConfig';
import { PDF_COLORS } from '../styles';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Whether a string is a `#rgb` / `#rrggbb` hex color. */
export function isHex(value: string): boolean {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

function parseHex(hex: string): [number, number, number] | null {
  if (!isHex(hex)) return null;
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white). Malformed → 0. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}

/** Pick the more readable of white / dark body text for a given background fill. */
export function readableTextOn(bg: string): string {
  return contrastRatio('#ffffff', bg) >= contrastRatio(PDF_COLORS.text, bg) ? '#ffffff' : PDF_COLORS.text;
}

/** WCAG 2.1 contrast ratio (1–21). Malformed input → 1 (worst), never throws. */
export function contrastRatio(a: string, b: string): number {
  if (!isHex(a) || !isHex(b)) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

/** Mix the seed toward black until it meets `target` contrast on white. */
function darkenToContrast(seed: [number, number, number], target: number): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const candidate = toHex(mix(seed, BLACK, t));
    if (contrastRatio(candidate, '#ffffff') >= target) return candidate;
  }
  return '#000000';
}

/** Mix the seed toward white until dark `text` meets `target` contrast on it. */
function lightenForText(seed: [number, number, number], text: string, target: number): string {
  let last = '#ffffff';
  for (let t = 1; t >= 0; t -= 0.05) {
    const candidate = toHex(mix(seed, WHITE, t));
    last = candidate;
    if (contrastRatio(text, candidate) >= target) return candidate;
  }
  return last;
}

/**
 * Derive a complete, WCAG-safe {@link ColorsConfig} from a single seed color:
 * - `accent` = the seed (the brand color),
 * - `text` = the seed darkened until it clears AAA (7:1) on white,
 * - `label` = the seed darkened until it clears AA (4.5:1) on white,
 * - `headerBackground` = a light tint of the seed on which the body text clears
 *   AA (4.5:1).
 *
 * A malformed seed falls back to the neutral PDF palette, so a bad value can
 * never produce an unreadable document.
 */
export function generatePalette(seedHex: string): ColorsConfig {
  const rgb = parseHex(seedHex);
  if (!rgb) {
    return {
      accent: PDF_COLORS.primary,
      text: PDF_COLORS.text,
      label: PDF_COLORS.textLight,
      headerBackground: PDF_COLORS.headerBg,
      headerBackgroundEnabled: true,
    };
  }
  const accent = toHex(rgb);
  const text = darkenToContrast(rgb, 7);
  const label = darkenToContrast(rgb, 4.5);
  const headerBackground = lightenForText(rgb, text, 4.5);
  return { accent, text, label, headerBackground, headerBackgroundEnabled: true };
}
