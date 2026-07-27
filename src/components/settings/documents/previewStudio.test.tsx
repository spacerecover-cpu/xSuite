/**
 * Batch E (studio + preview) regression tests — PDF-02, PDF-04, STU-05, STU-06,
 * STU-07 from `docs/qa/2026-07-26-pdf-template-module-audit.md`.
 *
 * Every behaviour added here is opt-in or direction-conditional, so each block
 * carries an explicit PARITY case proving the untouched default path still
 * produces exactly what it produced before.
 */

import { describe, it, expect, vi } from 'vitest';

import { describePreviewFailure, previewDownloadFilename } from './previewStudioHelpers';
import { resolvePreviewLogo, PLACEHOLDER_LOGO_LAYOUT_WARNING } from '../../../lib/pdf/engine/previewTemplate';
import { placeholderLogoSvg, type BrandingImage } from '../../../lib/pdf/brandingImage';
import { DOC_TYPE_LABELS } from '../../../pages/settings/documentTypeMeta';
import { REPORT_TYPES } from '../../../lib/reportTypes';

// previewRecord reaches Supabase at module scope; the record-type assertions
// below are pure set membership, so a stub client is enough to import it.
vi.mock('../../../lib/supabaseClient', () => ({ supabase: {} }));

// ---------------------------------------------------------------------------
// STU-06 — Unicode-aware download filename
// ---------------------------------------------------------------------------

/**
 * The sanitizer this change replaced, kept verbatim as the parity oracle —
 * including its redundant `\-` escape, hence the disable.
 */
const legacyFilename = (heading: string, recordLabel?: string | null): string =>
  `${heading}${recordLabel !== null && recordLabel !== undefined ? `-${recordLabel}` : ''}.pdf`.replace(
    // eslint-disable-next-line no-useless-escape
    /[^\w.\-]+/g,
    '-',
  );

describe('previewDownloadFilename (STU-06)', () => {
  it('PARITY: every real document + report heading produces the legacy filename', () => {
    const headings = [...Object.values(DOC_TYPE_LABELS), ...Object.values(REPORT_TYPES).map((r) => r.name)];
    for (const heading of headings) {
      expect(previewDownloadFilename(heading)).toBe(legacyFilename(heading));
    }
  });

  it('PARITY: an ASCII record label still appends the same way', () => {
    expect(previewDownloadFilename('Invoice', 'INV-2026-0001')).toBe(legacyFilename('Invoice', 'INV-2026-0001'));
    expect(previewDownloadFilename('Invoice', 'INV-2026-0001')).toBe('Invoice-INV-2026-0001.pdf');
  });

  it('keeps Arabic characters instead of erasing them', () => {
    // The legacy \w-based filter collapsed this to a bare "-.pdf".
    expect(legacyFilename('فاتورة ضريبية')).toBe('-.pdf');
    expect(previewDownloadFilename('فاتورة ضريبية')).toBe('فاتورة-ضريبية.pdf');
  });

  it('keeps CJK and Cyrillic characters', () => {
    expect(previewDownloadFilename('請求書')).toBe('請求書.pdf');
    expect(previewDownloadFilename('Счёт-фактура')).toBe('Счёт-фактура.pdf');
  });

  it('strips path separators and Windows-reserved characters', () => {
    expect(previewDownloadFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.pdf');
  });

  it('drops control characters rather than turning them into dashes', () => {
    expect(previewDownloadFilename('Inv\u0007oice')).toBe('Invoice.pdf');
  });

  it('falls back to an ASCII name when nothing printable survives', () => {
    expect(previewDownloadFilename('///')).toBe('document.pdf');
    expect(previewDownloadFilename('   ')).toBe('document.pdf');
  });

  it('does not leave a trailing dash when the record label is blank', () => {
    expect(previewDownloadFilename('Invoice', '')).toBe('Invoice.pdf');
  });
});

// ---------------------------------------------------------------------------
// STU-05 — specific preview-failure copy + a details affordance
// ---------------------------------------------------------------------------

describe('describePreviewFailure (STU-05)', () => {
  it('PARITY: an unrecognised failure keeps the original generic copy', () => {
    expect(describePreviewFailure(new Error('something odd')).message).toBe(
      'Could not render the preview. Try adjusting a setting.',
    );
  });

  it('always exposes the underlying message as detail', () => {
    expect(describePreviewFailure(new Error('boom')).detail).toBe('boom');
    expect(describePreviewFailure('raw string failure').detail).toBe('raw string failure');
  });

  it('reports no detail when the error carries no message', () => {
    expect(describePreviewFailure(new Error('')).detail).toBeNull();
    expect(describePreviewFailure(undefined).detail).toBeNull();
  });

  it('names the large-dataset timeout (TBL-08) distinctly', () => {
    const r = describePreviewFailure(new Error('Preview render timed out'));
    expect(r.message).toMatch(/too long/i);
    expect(r.message).toMatch(/large table/i);
    expect(r.message).not.toBe('Could not render the preview. Try adjusting a setting.');
  });

  it('names a corrupt image distinctly', () => {
    const r = describePreviewFailure(new Error('Incomplete or corrupt PNG file'));
    expect(r.message).toMatch(/image/i);
    expect(r.message).toMatch(/logo|stamp|signature|QR/i);
  });

  it('names an invalid page box distinctly (RND-07)', () => {
    expect(describePreviewFailure(new Error('Invalid pageSize width')).message).toMatch(/page size/i);
  });

  it('names out-of-range margins distinctly (STU-01)', () => {
    expect(describePreviewFailure(new Error('page margin is too large')).message).toMatch(/margins/i);
  });

  it('explains an unsupported record preview', () => {
    const r = describePreviewFailure(new Error('Record preview is not supported for "stock_label"'));
    expect(r.message).toMatch(/Sample data/);
  });

  it('explains a deleted record', () => {
    expect(describePreviewFailure(new Error('Invoice not found')).message).toMatch(/deleted/i);
  });

  it('produces four distinct messages for the four likeliest causes', () => {
    const messages = new Set(
      [
        'Preview render timed out',
        'Incomplete or corrupt PNG file',
        'Invalid pageSize width',
        'page margin is too large',
      ].map((m) => describePreviewFailure(new Error(m)).message),
    );
    expect(messages.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// PDF-02 — the placeholder logo is disclosed, and can be turned off
// ---------------------------------------------------------------------------

describe('resolvePreviewLogo print view (PDF-02)', () => {
  const missing: BrandingImage = { kind: 'none', reason: 'empty' };
  const real: BrandingImage = { kind: 'raster', dataUrl: 'data:image/png;base64,AAAA' };

  it('PARITY: the default call still returns the labeled placeholder box', () => {
    expect(resolvePreviewLogo(missing).logo).toEqual(placeholderLogoSvg('LOGO'));
    expect(resolvePreviewLogo(missing, {}).logo).toEqual(placeholderLogoSvg('LOGO'));
    expect(resolvePreviewLogo(missing, { placeholder: true }).logo).toEqual(placeholderLogoSvg('LOGO'));
  });

  it('PARITY: the existing cause warning is still first in the list', () => {
    expect(resolvePreviewLogo(missing).warnings[0]).toContain('No logo uploaded');
    expect(resolvePreviewLogo({ kind: 'none', reason: 'http_error' }).warnings[0]).toContain("couldn't load");
  });

  it('PARITY: a real logo is passed through untouched with no warnings', () => {
    for (const opts of [undefined, {}, { placeholder: true }, { placeholder: false }]) {
      const r = resolvePreviewLogo(real, opts);
      expect(r.logo).toEqual(real);
      expect(r.warnings).toEqual([]);
    }
  });

  it('discloses that the placeholder box will not print', () => {
    const r = resolvePreviewLogo(missing);
    expect(r.warnings).toContain(PLACEHOLDER_LOGO_LAYOUT_WARNING);
    expect(PLACEHOLDER_LOGO_LAYOUT_WARNING).toMatch(/reflow/i);
  });

  it('print view draws no logo at all, exactly as generation does', () => {
    const r = resolvePreviewLogo(missing, { placeholder: false });
    expect(r.logo).toEqual(missing);
    // No stand-in ⇒ nothing to disclose about it.
    expect(r.warnings).not.toContain(PLACEHOLDER_LOGO_LAYOUT_WARNING);
    // The cause is still reported.
    expect(r.warnings[0]).toContain('No logo uploaded');
  });

  it('print view keeps the failure reason for an unresolvable logo', () => {
    const r = resolvePreviewLogo({ kind: 'none', reason: 'timeout' }, { placeholder: false });
    expect(r.logo).toEqual({ kind: 'none', reason: 'timeout' });
    expect(r.warnings[0]).toContain("couldn't load");
  });

  it('treats a null/undefined logo as an empty one', () => {
    expect(resolvePreviewLogo(null, { placeholder: false }).logo).toEqual(missing);
    expect(resolvePreviewLogo(undefined, { placeholder: false }).logo).toEqual(missing);
  });
});

// ---------------------------------------------------------------------------
// STU-07 — record preview beyond the three financial types
// ---------------------------------------------------------------------------

describe('record preview coverage (STU-07)', () => {
  it('PARITY: the three original types are still supported', async () => {
    const { supportsRecordPreview } = await import('../../../lib/pdf/previewRecord');
    for (const t of ['invoice', 'quote', 'payment_receipt'] as const) {
      expect(supportsRecordPreview(t)).toBe(true);
    }
  });

  it('adds report and checkout — the types the audit prioritised', async () => {
    const { supportsRecordPreview } = await import('../../../lib/pdf/previewRecord');
    expect(supportsRecordPreview('report')).toBe(true);
    expect(supportsRecordPreview('checkout_form')).toBe(true);
  });

  it('adds custody, payslip, credit note, case label and both check-in receipts', async () => {
    const { supportsRecordPreview } = await import('../../../lib/pdf/previewRecord');
    for (const t of [
      'chain_of_custody',
      'payslip',
      'credit_note',
      'case_label',
      'office_receipt',
      'customer_copy',
    ] as const) {
      expect(supportsRecordPreview(t)).toBe(true);
    }
  });

  it('leaves stock_label unsupported — its content comes from the print dialog, not a record', async () => {
    const { supportsRecordPreview, listPreviewRecords } = await import('../../../lib/pdf/previewRecord');
    expect(supportsRecordPreview('stock_label')).toBe(false);
    // And it never queries: an unsupported type short-circuits to an empty list.
    await expect(listPreviewRecords('stock_label')).resolves.toEqual([]);
  });

  it('covers every document type the Studio can edit except stock_label', async () => {
    const { supportsRecordPreview } = await import('../../../lib/pdf/previewRecord');
    const unsupported = (Object.keys(DOC_TYPE_LABELS) as (keyof typeof DOC_TYPE_LABELS)[]).filter(
      (t) => !supportsRecordPreview(t),
    );
    expect(unsupported).toEqual(['stock_label']);
  });
});
