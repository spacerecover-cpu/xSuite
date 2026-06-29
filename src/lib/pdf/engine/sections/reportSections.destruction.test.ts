import { describe, it, expect } from 'vitest';
import { renderReportSections } from './reportSections';
import type { EngineContext, EngineDocData } from '../types';

const engine = { config: { language: { mode: 'en', primary: 'en' } } } as unknown as EngineContext;

function flatten(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) flatten(c, out); return; }
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  if (typeof o.image === 'string') out.push(`IMG:${o.image.slice(0, 10)}`);
  for (const v of Object.values(o)) flatten(v, out);
}

const data = {
  reportSections: { sections: [{ title: { en: 'Certificate of Destruction', ar: 'شهادة الإتلاف' }, content: 'Destroyed.', kind: 'destruction_certificate' }] },
  signatureBlocks: [
    { slot: 'engineer', name: 'Op One', role: 'Operator', method: 'drawn', imageDataUrl: 'data:image/png;base64,ZZZ' },
  ],
} as unknown as EngineDocData;

describe('destruction certificate signatures', () => {
  it('embeds the operator (engineer slot) captured image, witness stays wet-ink', () => {
    const def = renderReportSections(engine, data);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts.some((t) => t.startsWith('IMG:data:image'))).toBe(true); // operator image embedded
    expect(texts.join(' ')).toMatch(/Witness/); // witness label still present (wet-ink fallback)
  });

  it('with no signatureBlocks renders both wet-ink lines (unchanged)', () => {
    const plain = { reportSections: { sections: [{ title: { en: 'Certificate of Destruction', ar: null }, content: 'x', kind: 'destruction_certificate' }] } } as unknown as EngineDocData;
    const def = renderReportSections(engine, plain);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts.join(' ')).toMatch(/Operator/);
    expect(texts.join(' ')).toMatch(/Witness/);
  });
});
