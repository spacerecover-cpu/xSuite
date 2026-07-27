/**
 * Pure helpers for the document Template Studio preview pane.
 *
 * These live outside `TemplateStudio.tsx` on purpose: they carry no React
 * dependency, and a component module that also exports plain functions breaks
 * Fast Refresh (`react-refresh/only-export-components`). Keeping them here also
 * lets the unit tests exercise them without mounting the whole Studio.
 */

/** What the preview pane shows when a render fails: headline copy + the raw cause. */
export interface PreviewFailure {
  message: string;
  /** The underlying error text, revealed behind a "details" affordance. */
  detail: string | null;
}

/**
 * Map a preview render failure onto copy that names the LIKELY cause. The pane
 * used to show one generic sentence for every failure, which made the four
 * realistic causes — a page box the paper settings cannot produce, margins that
 * leave no content column, an image pdfmake cannot decode, and a dataset too
 * large to rasterize inside the 15s cap — indistinguishable. The raw message is
 * always returned as `detail` so nothing is hidden, only ranked.
 */
export function describePreviewFailure(err: unknown): PreviewFailure {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const detail = raw.trim() ? raw.trim() : null;
  const text = raw.toLowerCase();

  if (text.includes('timed out') || text.includes('timeout')) {
    return {
      message:
        'The preview took too long to render and was stopped. This usually means the document has a very large table — try a smaller record, or reduce the rows this template shows.',
      detail,
    };
  }
  if (text.includes('png') || text.includes('jpeg') || text.includes('jpg') || text.includes('image')) {
    return {
      message:
        'An image in this document could not be decoded — most often the company logo, stamp, signature or QR code. Re-upload it as a PNG or JPEG in Settings → Company.',
      detail,
    };
  }
  if (text.includes('pagesize') || text.includes('page size') || text.includes('width') || text.includes('height')) {
    return {
      message:
        'The page size could not be used. Check the paper size and any custom width/height on the General tab.',
      detail,
    };
  }
  if (text.includes('margin')) {
    return {
      message:
        'The page margins leave no room for content. Reduce the margins on the General tab.',
      detail,
    };
  }
  if (text.includes('not supported for')) {
    return {
      message: 'This document type cannot be previewed against a real record yet. Switch back to Sample data.',
      detail,
    };
  }
  if (text.includes('not found')) {
    return {
      message: 'That record could not be loaded — it may have been deleted. Pick another record, or switch to Sample data.',
      detail,
    };
  }
  return { message: 'Could not render the preview. Try adjusting a setting.', detail };
}

/** Characters no filesystem accepts in a name (path separators + Windows reserved). */
const RESERVED_FILENAME_CHARS = /[\\/:*?"<>|]+/g;
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Build the download filename for the rendered preview.
 *
 * The previous sanitizer was `/[^\w.\-]+/g` — `\w` is ASCII-only, so an Arabic,
 * CJK or Cyrillic heading was erased entirely and every download collapsed to
 * `-.pdf`. This strips only what a filesystem actually rejects (path separators,
 * Windows-reserved characters, control characters) and folds whitespace to a
 * dash, so non-Latin names survive intact. If nothing printable is left, it
 * falls back to an ASCII name rather than producing a dot-file.
 */
export function previewDownloadFilename(heading: string, recordLabel?: string | null): string {
  const base = recordLabel ? `${heading}-${recordLabel}` : heading;
  const cleaned = base
    .replace(CONTROL_CHARS, '')
    .replace(RESERVED_FILENAME_CHARS, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return `${cleaned || 'document'}.pdf`;
}
