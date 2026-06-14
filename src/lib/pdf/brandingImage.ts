/**
 * Branding-image handling for document logos. One module owns: classifying a
 * logo input into a typed shape (raster / svg / none+reason), resolving a URL
 * over the network with a typed FAILURE REASON (for preview diagnostics), and
 * building the single pdfmake logo node used by BOTH the engine header and the
 * legacy document builders. Keeping it in one place means there is exactly one
 * logo code path across PDF / print / email / preview.
 */

import type { Content } from 'pdfmake/interfaces';

export type BrandingImageFailure =
  | 'empty'
  | 'http_error'
  | 'timeout'
  | 'decode_failed'
  | 'unsupported';

export type BrandingImage =
  | { kind: 'raster'; dataUrl: string }
  | { kind: 'svg'; markup: string }
  | { kind: 'none'; reason: BrandingImageFailure };

/** A human-readable note for a failed/empty logo, or null when the logo is fine. */
export function brandingImageWarning(img: BrandingImage): string | null {
  if (img.kind !== 'none') return null;
  if (img.reason === 'empty') return 'No logo uploaded — showing a placeholder.';
  return `Logo couldn't load (${img.reason}) — showing the text header.`;
}

function decodeBase64Utf8(b64: string): string {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Turn any logo input into a typed {@link BrandingImage}. The existing loaders
 * hand us a `data:<mime>;base64,…` string; the preview path may hand us an
 * already-resolved BrandingImage. A `data:image/svg+xml` string routes to svg
 * (decoded), any other non-empty string routes to raster, and null/'' is empty.
 */
export function classifyLogo(input: string | BrandingImage | null | undefined): BrandingImage {
  if (input == null || input === '') return { kind: 'none', reason: 'empty' };
  if (typeof input !== 'string') return input;
  if (/^data:image\/svg\+xml/i.test(input)) {
    const comma = input.indexOf(',');
    const payload = comma >= 0 ? input.slice(comma + 1) : '';
    try {
      const markup = /;base64/i.test(input.slice(0, comma)) ? decodeBase64Utf8(payload) : decodeURIComponent(payload);
      return markup ? { kind: 'svg', markup } : { kind: 'none', reason: 'decode_failed' };
    } catch {
      return { kind: 'none', reason: 'decode_failed' };
    }
  }
  return { kind: 'raster', dataUrl: input };
}

/** Options describing how the logo node should be sized/placed. */
export interface LogoNodeOptions {
  width: number;
  height?: number | null;
  /** When > 0, the logo is fit into a [width, maxHeight] box (aspect-preserving). */
  maxHeight?: number | null;
  margin?: [number, number, number, number];
  alignment?: 'left' | 'center' | 'right';
}

/**
 * The single pdfmake logo node. Raster → `{ image }`, svg → `{ svg }`, none →
 * `null`. For raster with no maxHeight this is byte-identical to the inline
 * `{ image, width, … }` the builders used before (golden parity).
 */
export function buildLogoNode(
  input: string | BrandingImage | null | undefined,
  opts: LogoNodeOptions,
): Content | null {
  const img = classifyLogo(input);
  if (img.kind === 'none') return null;
  const node: Record<string, unknown> = {};
  if (opts.maxHeight != null && opts.maxHeight > 0) {
    node.fit = [opts.width, opts.maxHeight];
  } else {
    node.width = opts.width;
    if (opts.height != null && opts.height > 0) node.height = opts.height;
  }
  if (opts.margin) node.margin = opts.margin;
  if (opts.alignment) node.alignment = opts.alignment;
  if (img.kind === 'raster') node.image = img.dataUrl;
  else node.svg = img.markup;
  return node as unknown as Content;
}

/** A labeled placeholder logo box for previews when no real logo exists. */
export function placeholderLogoSvg(label = 'LOGO'): { kind: 'svg'; markup: string } {
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="48" viewBox="0 0 130 48">` +
    `<rect x="1" y="1" width="128" height="46" rx="4" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>` +
    `<text x="65" y="29" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return { kind: 'svg', markup };
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  try {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const b64 = typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
    return `data:${blob.type || 'image/png'};base64,${b64}`;
  } catch {
    return null;
  }
}

export interface ResolveBrandingImageOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch `url` and classify it, returning a typed FAILURE REASON on any problem
 * (for surfacing a warning in the preview). Never throws. `fetchImpl` is
 * injectable so unit tests need no network.
 */
export async function resolveBrandingImage(
  url: string | null | undefined,
  opts: ResolveBrandingImageOptions = {},
): Promise<BrandingImage> {
  if (!url) return { kind: 'none', reason: 'empty' };
  const timeoutMs = opts.timeoutMs ?? 5000;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(url, { signal: controller.signal });
    if (!response.ok) return { kind: 'none', reason: 'http_error' };
    const blob = await response.blob();
    const mime = (blob.type || '').toLowerCase();
    if (mime.includes('svg')) {
      const markup = await blob.text();
      return markup ? { kind: 'svg', markup } : { kind: 'none', reason: 'decode_failed' };
    }
    if (/^image\/(png|jpe?g|gif|webp)/.test(mime)) {
      const dataUrl = await blobToDataUrl(blob);
      return dataUrl ? { kind: 'raster', dataUrl } : { kind: 'none', reason: 'decode_failed' };
    }
    return { kind: 'none', reason: 'unsupported' };
  } catch {
    return { kind: 'none', reason: controller.signal.aborted ? 'timeout' : 'http_error' };
  } finally {
    clearTimeout(timer);
  }
}
