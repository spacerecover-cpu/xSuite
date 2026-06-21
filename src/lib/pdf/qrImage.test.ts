import { describe, it, expect } from 'vitest';
import { generateQrPngDataUrl, resolveQrImage } from './qrImage';

describe('generateQrPngDataUrl', () => {
  it('returns a PNG data URL for a non-empty payload', async () => {
    const url = await generateQrPngDataUrl('QUOTE:QUOT-0045 TOTAL:1050');
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect((url as string).length).toBeGreaterThan(200);
  });

  it('returns null for empty/nullish payloads', async () => {
    expect(await generateQrPngDataUrl('')).toBeNull();
    expect(await generateQrPngDataUrl(null)).toBeNull();
    expect(await generateQrPngDataUrl(undefined)).toBeNull();
  });
});

describe('resolveQrImage', () => {
  it('prefers the tenant-uploaded image when present', async () => {
    const tenant = 'data:image/png;base64,TENANT';
    expect(await resolveQrImage(tenant, 'QUOTE:1')).toBe(tenant);
  });

  it('auto-generates from the payload when there is no tenant image', async () => {
    const url = await resolveQrImage(null, 'QUOTE:1');
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it('returns null when there is neither a tenant image nor a payload', async () => {
    expect(await resolveQrImage(null, null)).toBeNull();
  });
});
