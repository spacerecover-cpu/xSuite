import { describe, it, expect, vi, beforeEach } from 'vitest';

const isFn = vi.fn();
const builder = { select: () => builder, eq: () => builder, is: isFn };
vi.mock('./supabaseClient', () => ({ supabase: { from: () => builder } }));

import { loadNamespace } from './i18nBackendService';

describe('loadNamespace (A2 — lazy i18n_translations loader with en fallback)', () => {
  beforeEach(() => isFn.mockReset());

  it('maps rows to a key→value object', async () => {
    isFn.mockResolvedValueOnce({ data: [{ key: 'login.heading', value: 'بوابة العملاء' }], error: null });
    expect(await loadNamespace('ar', 'portal')).toEqual({ 'login.heading': 'بوابة العملاء' });
  });

  it('falls back to en when the requested (lang,ns) is empty', async () => {
    isFn
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ key: 'x', value: 'X' }], error: null });
    expect(await loadNamespace('ar', 'portal')).toEqual({ x: 'X' });
  });

  it('returns {} when en itself is empty (terminal fallback)', async () => {
    isFn.mockResolvedValue({ data: [], error: null });
    expect(await loadNamespace('en', 'portal')).toEqual({});
  });

  it('never throws on a query error (en path returns {})', async () => {
    isFn.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await loadNamespace('en', 'portal')).toEqual({});
  });
});
