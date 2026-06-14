import { describe, it, expect } from 'vitest';
import {
  classifyLogo,
  resolveBrandingImage,
  buildLogoNode,
  placeholderLogoSvg,
} from './brandingImage';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC';
const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(SVG_MARKUP, 'utf-8').toString('base64')}`;

const res = (body: BodyInit | null, type: string, ok = true): typeof fetch =>
  (async () => ({ ok, blob: async () => new Blob(body ? [body] : [], { type }) })) as unknown as typeof fetch;

describe('classifyLogo', () => {
  it('routes an svg data URL to svg with decoded markup', () => {
    const r = classifyLogo(SVG_DATA_URL);
    expect(r.kind).toBe('svg');
    expect(r.kind === 'svg' && r.markup).toContain('<svg');
  });
  it('routes a png data URL to raster', () => {
    expect(classifyLogo(PNG_DATA_URL)).toEqual({ kind: 'raster', dataUrl: PNG_DATA_URL });
  });
  it('treats a non-data string as raster (back-compat with test fixtures)', () => {
    expect(classifyLogo('LOGO')).toEqual({ kind: 'raster', dataUrl: 'LOGO' });
  });
  it('treats null/empty as none/empty and passes a BrandingImage through', () => {
    expect(classifyLogo(null)).toEqual({ kind: 'none', reason: 'empty' });
    expect(classifyLogo('')).toEqual({ kind: 'none', reason: 'empty' });
    expect(classifyLogo({ kind: 'svg', markup: SVG_MARKUP })).toEqual({ kind: 'svg', markup: SVG_MARKUP });
  });
});

describe('buildLogoNode', () => {
  it('emits a raster image node with width + margin (legacy parity shape)', () => {
    expect(buildLogoNode(PNG_DATA_URL, { width: 130, margin: [0, 0, 0, 5] })).toEqual({
      image: PNG_DATA_URL,
      width: 130,
      margin: [0, 0, 0, 5],
    });
  });
  it('emits an svg node for an svg data URL', () => {
    const node = buildLogoNode(SVG_DATA_URL, { width: 60 }) as { svg: string; width: number };
    expect(node.svg).toContain('<svg');
    expect(node.width).toBe(60);
  });
  it('uses fit:[w,h] when maxHeight is set (aspect-preserving cap)', () => {
    expect(buildLogoNode(PNG_DATA_URL, { width: 130, maxHeight: 48 })).toEqual({
      image: PNG_DATA_URL,
      fit: [130, 48],
    });
  });
  it('returns null for a missing logo', () => {
    expect(buildLogoNode(null, { width: 130 })).toBeNull();
  });
});

describe('resolveBrandingImage', () => {
  it('returns none/empty for a blank url', async () => {
    expect(await resolveBrandingImage(null)).toEqual({ kind: 'none', reason: 'empty' });
  });
  it('classifies a png response as raster', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res('PNGBYTES', 'image/png') });
    expect(r.kind).toBe('raster');
    expect(r.kind === 'raster' && r.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('classifies an svg response as svg', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res(SVG_MARKUP, 'image/svg+xml') });
    expect(r.kind).toBe('svg');
  });
  it('reports http_error on !ok', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res(null, 'image/png', false) });
    expect(r).toEqual({ kind: 'none', reason: 'http_error' });
  });
  it('reports unsupported for a non-image mime', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res('hi', 'text/plain') });
    expect(r).toEqual({ kind: 'none', reason: 'unsupported' });
  });
});

describe('placeholderLogoSvg', () => {
  it('is an svg BrandingImage containing the label', () => {
    const p = placeholderLogoSvg('LOGO');
    expect(p.kind).toBe('svg');
    expect(p.markup).toContain('LOGO');
  });
});
