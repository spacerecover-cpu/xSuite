import { describe, it, expect } from 'vitest';
import {
  resolveColors,
  resolveTypography,
  resolveWatermarkSettings,
  resolveHeader,
  resolveFooter,
  resolvePageNumbers,
  resolveOrganization,
  resolveTable,
  resolvePageFitting,
} from './branding';
import { PDF_COLORS, PDF_STYLES } from '../styles';

// ---------------------------------------------------------------------------
// Premium control resolvers (pure). Every resolver returns the NEUTRAL / LEGACY
// value when its config group is absent, so the engine consuming them produces
// identical output for an unconfigured template. A malformed value degrades to
// neutral rather than breaking a render (mirrors resolveAccentHex discipline).
// ---------------------------------------------------------------------------

const styleSize = (key: string): number =>
  (PDF_STYLES[key] as { fontSize?: number }).fontSize ?? 0;

describe('resolveColors', () => {
  it('falls back to the neutral PDF_COLORS when nothing is opted in', () => {
    const c = resolveColors({ branding: { accent: 'inherit' } });
    expect(c.accent).toBe(PDF_COLORS.primary);
    expect(c.text).toBe(PDF_COLORS.text);
    expect(c.label).toBe(PDF_COLORS.textLight);
    expect(c.headerBackground).toBe(PDF_COLORS.headerBg);
    expect(c.headerBackgroundEnabled).toBe(true);
  });

  it('uses an explicit colors group over the neutral defaults', () => {
    const c = resolveColors({
      colors: { accent: '#10B981', text: '#064E3B', label: '#6B7280', headerBackground: '#ECFDF5' },
      branding: { accent: 'inherit' },
    });
    expect(c.accent).toBe('#10b981');
    expect(c.text).toBe('#064e3b');
    expect(c.label).toBe('#6b7280');
    expect(c.headerBackground).toBe('#ecfdf5');
  });

  it('colors.accent supersedes the legacy branding.accent', () => {
    const c = resolveColors({ colors: { accent: '#10b981' }, branding: { accent: '#7c3aed' } });
    expect(c.accent).toBe('#10b981');
  });

  it('falls back to branding.accent when colors.accent is absent', () => {
    const c = resolveColors({ colors: { text: '#064e3b' }, branding: { accent: '#7c3aed' } });
    expect(c.accent).toBe('#7c3aed');
  });

  it('treats a malformed color as neutral', () => {
    const c = resolveColors({ colors: { accent: 'not-a-hex', text: '#xyz' }, branding: { accent: 'inherit' } });
    expect(c.accent).toBe(PDF_COLORS.primary);
    expect(c.text).toBe(PDF_COLORS.text);
  });

  it('honors headerBackgroundEnabled=false', () => {
    const c = resolveColors({ colors: { headerBackgroundEnabled: false }, branding: { accent: 'inherit' } });
    expect(c.headerBackgroundEnabled).toBe(false);
  });
});

describe('resolveTypography', () => {
  it('defaults to the fallback font and the built-in style sizes', () => {
    const t = resolveTypography({}, 'Roboto');
    expect(t.fontFamily).toBe('Roboto');
    expect(t.sizeFor('documentTitle')).toBe(styleSize('documentTitle'));
    expect(t.sizeFor('tableCell')).toBe(styleSize('tableCell'));
  });

  it('uses an explicit PDF font family', () => {
    const t = resolveTypography({ typography: { fontFamily: 'Tajawal' } }, 'Roboto');
    expect(t.fontFamily).toBe('Tajawal');
  });

  it('scales every size by baseScale', () => {
    const t = resolveTypography({ typography: { baseScale: 1.5 } }, 'Roboto');
    expect(t.sizeFor('documentTitle')).toBe(styleSize('documentTitle') * 1.5);
  });

  it('applies an absolute per-style size override', () => {
    const t = resolveTypography({ typography: { baseScale: 2, sizes: { documentTitle: 18 } } }, 'Roboto');
    expect(t.sizeFor('documentTitle')).toBe(18); // absolute wins over scale
    expect(t.sizeFor('tableCell')).toBe(styleSize('tableCell') * 2); // others still scale
  });

  it('clamps an out-of-range baseScale to a legible range', () => {
    const tiny = resolveTypography({ typography: { baseScale: 0.01 } }, 'Roboto');
    const huge = resolveTypography({ typography: { baseScale: 99 } }, 'Roboto');
    expect(tiny.sizeFor('tableCell')).toBeGreaterThan(0);
    expect(huge.sizeFor('tableCell')).toBeLessThan(styleSize('tableCell') * 99);
  });
});

describe('resolveWatermarkSettings', () => {
  it('returns null when there is no watermark', () => {
    expect(resolveWatermarkSettings({ branding: { watermark: null } })).toBeNull();
    expect(resolveWatermarkSettings({ branding: { watermark: '' } })).toBeNull();
  });

  it('reads the legacy branding.watermark text (back-compat)', () => {
    const w = resolveWatermarkSettings({ branding: { watermark: 'DRAFT' } });
    expect(w?.text).toBe('DRAFT');
    expect(w?.angle).toBe(-45);
    expect(w?.opacity).toBe(PDF_STYLES.watermark?.opacity);
    expect(w?.fontSize).toBe(PDF_STYLES.watermark?.fontSize);
    expect(w?.image).toBe(false);
  });

  it('prefers watermark.text and honors angle / opacity / fontSize overrides', () => {
    const w = resolveWatermarkSettings({
      watermark: { text: 'CONFIDENTIAL', angle: -30, opacity: 0.15, fontSize: 80 },
      branding: { watermark: 'IGNORED' },
    });
    expect(w?.text).toBe('CONFIDENTIAL');
    expect(w?.angle).toBe(-30);
    expect(w?.opacity).toBe(0.15);
    expect(w?.fontSize).toBe(80);
  });

  it('supports an image watermark with no text', () => {
    const w = resolveWatermarkSettings({ watermark: { image: true }, branding: { watermark: null } });
    expect(w?.image).toBe(true);
    expect(w?.text).toBeNull();
  });
});

describe('resolveHeader', () => {
  it('defaults to the classic legacy layout', () => {
    const h = resolveHeader({});
    expect(h.layout).toBe('classic');
    expect(h.logoPlacement).toBe('left');
    expect(h.logoWidth).toBe(130);
    expect(h.divider).toBe('thin');
    expect(h.dividerColor).toBeNull(); // unset → follows the accent
    expect(h.dividerNudge).toEqual({ start: 0, end: 0, vertical: 0 });
  });

  it('applies overrides and fills partial dividerNudge', () => {
    const h = resolveHeader({ header: { layout: 'split', logoWidth: 90, dividerNudge: { start: 10 } } });
    expect(h.layout).toBe('split');
    expect(h.logoWidth).toBe(90);
    expect(h.dividerNudge).toEqual({ start: 10, end: 0, vertical: 0 });
  });

  it('validates the opt-in divider colour (good hex kept, malformed → null)', () => {
    expect(resolveHeader({ header: { dividerColor: '#AB12CD' } }).dividerColor).toBe('#ab12cd');
    expect(resolveHeader({ header: { dividerColor: 'not-a-hex' } }).dividerColor).toBeNull();
  });

  it('clamps the divider nudge to safe bands (insets 0–240, vertical ±8)', () => {
    const big = resolveHeader({ header: { dividerNudge: { start: 9999, end: -50, vertical: 99 } } });
    expect(big.dividerNudge).toEqual({ start: 240, end: 0, vertical: 8 });
    const neg = resolveHeader({ header: { dividerNudge: { vertical: -99 } } });
    expect(neg.dividerNudge.vertical).toBe(-8);
  });
});

describe('resolveFooter', () => {
  it('defaults to the neutral footer settings', () => {
    const f = resolveFooter({});
    expect(f.customText).toBeNull();
    expect(f.fontColor).toBe(PDF_COLORS.textMuted);
    expect(f.fontSize).toBe(8);
    expect(f.alignment).toBe('center');
  });

  it('applies a custom footer', () => {
    const f = resolveFooter({ footer: { customText: 'Thank you', alignment: 'right', fontSize: 7 } });
    expect(f.customText).toBe('Thank you');
    expect(f.alignment).toBe('right');
    expect(f.fontSize).toBe(7);
  });
});

describe('resolvePageNumbers', () => {
  it('is disabled by default (legacy)', () => {
    const p = resolvePageNumbers({});
    expect(p.enabled).toBe(false);
    expect(p.position).toBe('right');
    expect(p.format).toBe('Page {page} of {pages}');
  });

  it('enables with a custom format and position', () => {
    const p = resolvePageNumbers({ pageNumbers: { enabled: true, position: 'center', format: '{page}/{pages}' } });
    expect(p.enabled).toBe(true);
    expect(p.position).toBe('center');
    expect(p.format).toBe('{page}/{pages}');
  });
});

describe('resolveOrganization', () => {
  it('defaults to showing all identity lines except the Arabic variants', () => {
    const o = resolveOrganization({});
    expect(o.source).toBe('company_info');
    expect(o.show).toEqual({
      logo: true, name: true, nameAr: false, legalName: true,
      legalNameAr: false, address: true, taxId: true,
    });
    expect(o.addressFontSize).toBe(8);
  });

  it('deep-merges show toggles and reads manual source', () => {
    const o = resolveOrganization({
      organization: { source: 'manual', show: { logo: false, nameAr: true }, manual: { name: 'FX Lab' } },
    });
    expect(o.source).toBe('manual');
    expect(o.show.logo).toBe(false); // overridden
    expect(o.show.nameAr).toBe(true); // overridden
    expect(o.show.address).toBe(true); // default preserved
    expect(o.manual.name).toBe('FX Lab');
  });
});

describe('resolveTable', () => {
  it('defaults to the neutral header fill and no extras', () => {
    const t = resolveTable({});
    expect(t.headerBackground).toBe(PDF_COLORS.headerBg);
    expect(t.rowNumbering).toBe(false);
    expect(t.zebra).toBe(false);
  });

  it('table.headerBackground wins, then colors.headerBackground', () => {
    expect(resolveTable({ table: { headerBackground: '#111111' }, colors: { headerBackground: '#222222' } }).headerBackground).toBe('#111111');
    expect(resolveTable({ colors: { headerBackground: '#222222' } }).headerBackground).toBe('#222222');
  });

  it('enables row numbering / zebra', () => {
    const t = resolveTable({ table: { rowNumbering: true, zebra: true } });
    expect(t.rowNumbering).toBe(true);
    expect(t.zebra).toBe(true);
  });
});

describe('resolvePageFitting', () => {
  it('defaults to comfortable density with auto-fit off', () => {
    const p = resolvePageFitting({});
    expect(p.autoFitOnePage).toBe(false);
    expect(p.density).toBe('comfortable');
    expect(p.minScale).toBe(0.8);
  });

  it('reads an auto-fit + compact density override', () => {
    const p = resolvePageFitting({ pageFitting: { autoFitOnePage: true, density: 'compact', minScale: 0.7 } });
    expect(p.autoFitOnePage).toBe(true);
    expect(p.density).toBe('compact');
    expect(p.minScale).toBe(0.7);
  });
});
