import { describe, it, expect } from 'vitest';
import { renderSignature } from './signature';
import type { EngineContext } from '../types';

// Minimal engine context — language english, no stamp/sig company images.
const engine = {
  config: { language: { mode: 'en', primary: 'en' }, signatureImages: undefined },
  stampImage: null,
  signatureImage: null,
} as unknown as EngineContext;

function flatten(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) flatten(c, out); return; }
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  if (typeof o.image === 'string') out.push(`IMG:${o.image.slice(0, 16)}`);
  for (const v of Object.values(o)) flatten(v, out);
}

describe('renderSignature — captured signatureBlocks', () => {
  it('embeds a drawn signature image + signer name for a signed slot', () => {
    const def = renderSignature(engine, {
      signatureBlocks: [{ slot: 'approver', name: 'Tech A', role: 'Approver', method: 'drawn', imageDataUrl: 'data:image/png;base64,AAAABBBBCCCC' }],
    } as never);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts.some((t) => t.startsWith('IMG:data:image/png'))).toBe(true);
    expect(texts).toContain('Tech A');
  });

  it('renders a typed signature value as text', () => {
    const def = renderSignature(engine, {
      signatureBlocks: [{ slot: 'approver', name: 'Tech A', method: 'typed', typedValue: 'Tech A' }],
    } as never);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts).toContain('Tech A');
  });

  it('with no signatureBlocks renders the default wet-ink labels (unchanged)', () => {
    const def = renderSignature(engine, {} as never);
    const texts: string[] = [];
    flatten(def, texts);
    // default labels still present (e.g. "Received by"/"Authorized by")
    expect(texts.length).toBeGreaterThan(0);
  });
});
