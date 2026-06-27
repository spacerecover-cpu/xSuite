import { describe, it, expect } from 'vitest';
import { fontTableForVFS, PDF_FONTS } from './fonts';

// The preview-crash fix: a font family the engine references (e.g. a chosen
// secondary's NotoSansKR / NotoSansThai) but whose TTFs never made it into the
// VFS — Korean/Thai are CDN-only and the app CSP blocks fonts.gstatic.com — must
// be remapped to the always-present Roboto faces so pdfmake never throws "file
// not found" async during rasterization ("Could not render the preview").

const ROBOTO_VFS: Record<string, string> = {
  'Roboto-Regular.ttf': 'x',
  'Roboto-Bold.ttf': 'x',
  'Roboto-Italic.ttf': 'x',
  'Roboto-BoldItalic.ttf': 'x',
};

describe('fontTableForVFS', () => {
  it('remaps a family whose faces are absent from the VFS to Roboto faces', () => {
    const table = fontTableForVFS(ROBOTO_VFS);
    // NotoSansKR / NotoSansThai TTFs are NOT in the VFS → point at Roboto faces.
    expect(table.NotoSansKR).toEqual(PDF_FONTS.Roboto);
    expect(table.NotoSansThai).toEqual(PDF_FONTS.Roboto);
    // Roboto itself is intact (its faces are present).
    expect(table.Roboto).toEqual(PDF_FONTS.Roboto);
  });

  it('keeps a family whose faces ARE present in the VFS', () => {
    const vfs = {
      ...ROBOTO_VFS,
      'Tajawal-Regular.ttf': 'x',
      'Tajawal-Bold.ttf': 'x',
    };
    const table = fontTableForVFS(vfs);
    // Tajawal's regular+bold map to those files (italics/bolditalics reuse them),
    // all present → left untouched.
    expect(table.Tajawal).toEqual(PDF_FONTS.Tajawal);
    // KR still absent → remapped.
    expect(table.NotoSansKR).toEqual(PDF_FONTS.Roboto);
  });

  it('covers every declared family (never drops one)', () => {
    const table = fontTableForVFS(ROBOTO_VFS);
    expect(Object.keys(table).sort()).toEqual(Object.keys(PDF_FONTS).sort());
  });
});
