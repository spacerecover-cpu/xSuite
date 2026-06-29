import { describe, it, expect } from 'vitest';
import { renderReportApproval } from './reportApproval';
import type { EngineContext } from '../types';

const engine = {
  config: { language: { mode: 'en', primary: 'en' }, signatureImages: undefined },
  stampImage: null,
  signatureImage: null,
} as unknown as EngineContext;

function flatten(node: unknown, out: { texts: string[]; images: string[] }): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) flatten(c, out); return; }
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.texts.push(o.text);
  if (typeof o.image === 'string') out.images.push(o.image);
  for (const v of Object.values(o)) flatten(v, out);
}

describe('renderReportApproval', () => {
  it('returns null when signatureBlocks is undefined', () => {
    const result = renderReportApproval(engine, {} as never);
    expect(result).toBeNull();
  });

  it('returns null when signatureBlocks is an empty array', () => {
    const result = renderReportApproval(engine, { signatureBlocks: [] } as never);
    expect(result).toBeNull();
  });

  it('returns null when signatureBlocks has no approver slot', () => {
    const result = renderReportApproval(engine, {
      signatureBlocks: [{ slot: 'customer', name: 'John', method: 'drawn', imageDataUrl: 'data:image/png;base64,AAA' }],
    } as never);
    expect(result).toBeNull();
  });

  it('embeds approver image and name for a drawn signature', () => {
    const result = renderReportApproval(engine, {
      signatureBlocks: [{ slot: 'approver', name: 'Tech A', method: 'drawn', imageDataUrl: 'data:image/png;base64,AAAABBBBCCCC' }],
    } as never);
    expect(result).not.toBeNull();
    const out = { texts: [], images: [] } as { texts: string[]; images: string[] };
    flatten(result, out);
    expect(out.images.some((img) => img.startsWith('data:image/png'))).toBe(true);
    expect(out.texts.some((t) => t.includes('Tech A'))).toBe(true);
    expect(out.texts.some((t) => t.includes('Approved'))).toBe(true);
  });

  it('renders typed approver value as text', () => {
    const result = renderReportApproval(engine, {
      signatureBlocks: [{ slot: 'approver', name: 'Tech A', method: 'typed', typedValue: 'Tech A Typed' }],
    } as never);
    expect(result).not.toBeNull();
    const out = { texts: [], images: [] } as { texts: string[]; images: string[] };
    flatten(result, out);
    expect(out.texts).toContain('Tech A Typed');
    expect(out.texts.some((t) => t.includes('Approved'))).toBe(true);
  });

  it('renders click_to_accept approver with Accepted text', () => {
    const result = renderReportApproval(engine, {
      signatureBlocks: [{ slot: 'approver', name: 'Tech B', method: 'click_to_accept' }],
    } as never);
    expect(result).not.toBeNull();
    const out = { texts: [], images: [] } as { texts: string[]; images: string[] };
    flatten(result, out);
    expect(out.texts).toContain('Accepted');
  });

  it('ignores non-approver slots and finds the approver among multiple blocks', () => {
    const result = renderReportApproval(engine, {
      signatureBlocks: [
        { slot: 'engineer', name: 'Eng 1', method: 'typed', typedValue: 'Eng 1' },
        { slot: 'approver', name: 'Mgr A', method: 'typed', typedValue: 'Mgr A Typed' },
      ],
    } as never);
    expect(result).not.toBeNull();
    const out = { texts: [], images: [] } as { texts: string[]; images: string[] };
    flatten(result, out);
    expect(out.texts).toContain('Mgr A Typed');
  });
});
