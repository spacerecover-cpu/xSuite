import { describe, it, expect } from 'vitest';
import type { DynamicContent } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import { qrContentNode } from './sections/qr';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

function makeData(): EngineDocData {
  return {
    documentTitle: { en: 'TAX INVOICE' },
    identity: {
      basic_info: { company_name: 'FX', legal_name: 'FX LLC', vat_number: 'OM1' },
      location: { city: 'Muscat' },
      contact_info: {},
      branding: { brand_tagline: 'Recovered.' },
      online_presence: { website: 'https://fx.test' },
    },
    parties: {},
    meta: [],
    lineItems: { columns: [{ key: 'description', visible: true, label: { en: 'Description' }, align: 'left' }], rows: [{ description: 'X' }] },
    qrCaption: 'ZATCA e-invoice QR',
  };
}

const pageSize = { width: 595, height: 842 } as never;

function findQr(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => findQr(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.qr === 'string') out.push(o.qr);
  Object.values(o).forEach((v) => findQr(v, out));
}
function findImages(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => findImages(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.image === 'string') out.push(o.image);
  Object.values(o).forEach((v) => findImages(v, out));
}

describe('qrContentNode', () => {
  it('renders a native qr from the ZATCA payload when present', () => {
    const node = qrContentNode('ZATCA_PAYLOAD', 'IMG', 60);
    const qrs: string[] = [];
    const imgs: string[] = [];
    findQr(node, qrs);
    findImages(node, imgs);
    expect(qrs).toContain('ZATCA_PAYLOAD');
    expect(imgs).toHaveLength(0);
  });

  it('falls back to the image QR when there is no ZATCA payload', () => {
    const node = qrContentNode(null, 'IMG', 60);
    const qrs: string[] = [];
    const imgs: string[] = [];
    findQr(node, qrs);
    findImages(node, imgs);
    expect(imgs).toContain('IMG');
    expect(qrs).toHaveLength(0);
  });

  it('returns null when neither is available', () => {
    expect(qrContentNode(null, null, 60)).toBeNull();
  });
});

describe('renderTemplate — ZATCA QR in the invoice footer', () => {
  it('renders the native ZATCA qr (not the image) when zatcaPayload is set', () => {
    const data = makeData();
    data.zatcaPayload = 'ZATCA_B64_PAYLOAD';
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, data, ctx, 'LOGO', 'QRIMG');
    const out = (def.footer as DynamicContent)(1, 1, pageSize);
    const qrs: string[] = [];
    findQr(out, qrs);
    expect(qrs).toContain('ZATCA_B64_PAYLOAD');
  });

  it('uses the image QR (no native qr) when there is no zatcaPayload (parity)', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), ctx, 'LOGO', 'QRIMG');
    const out = (def.footer as DynamicContent)(1, 1, pageSize);
    const qrs: string[] = [];
    const imgs: string[] = [];
    findQr(out, qrs);
    findImages(out, imgs);
    expect(qrs).toHaveLength(0);
    expect(imgs).toContain('QRIMG');
  });
});
