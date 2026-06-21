import { describe, it, expect } from 'vitest';
import { resolvePreviewLogo } from './previewTemplate';
import { placeholderLogoSvg } from '../brandingImage';

describe('resolvePreviewLogo', () => {
  it('returns the real logo + no warning when one is resolved', () => {
    const real = { kind: 'raster' as const, dataUrl: 'data:image/png;base64,AAAA' };
    const r = resolvePreviewLogo(real);
    expect(r.logo).toEqual(real);
    expect(r.warnings).toEqual([]);
  });
  it('returns the labeled placeholder + an info warning when no logo', () => {
    const r = resolvePreviewLogo({ kind: 'none', reason: 'empty' });
    expect(r.logo).toEqual(placeholderLogoSvg('LOGO'));
    expect(r.warnings[0]).toContain('No logo uploaded');
  });
  it('returns the placeholder + a failure warning when the logo errored', () => {
    const r = resolvePreviewLogo({ kind: 'none', reason: 'http_error' });
    expect(r.logo).toEqual(placeholderLogoSvg('LOGO'));
    expect(r.warnings[0]).toContain("couldn't load");
  });
});
