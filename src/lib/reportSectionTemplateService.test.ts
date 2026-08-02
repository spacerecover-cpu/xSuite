import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, getUser } = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, auth: { getUser } } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('./pdf/engine/adapters/reportAdapter', () => ({
  reportSubtypeSections: () => [
    { key: 'executive_summary', title: 'Executive Summary', guidance: 'g' },
  ],
}));

import {
  normalizeSections,
  slugifySectionKey,
  resolveEffectiveTemplate,
  setDefaultReportSectionTemplate,
  createReportSectionTemplate,
} from './reportSectionTemplateService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('slugifySectionKey', () => {
  it('lowercases and snake_cases arbitrary titles', () => {
    expect(slugifySectionKey('  My Custom Notes ')).toBe('my_custom_notes');
    expect(slugifySectionKey('Q&A / Sign-off!')).toBe('q_a_sign_off');
    expect(slugifySectionKey('findings')).toBe('findings');
  });
  it('falls back when nothing usable remains', () => {
    expect(slugifySectionKey('***')).toBe('custom_section');
  });
});

describe('normalizeSections', () => {
  it('trims titles, slugifies missing keys, drops empty titles, dedupes keys', () => {
    const out = normalizeSections([
      { key: '', title: '  My Custom Notes ' },
      { key: 'findings', title: 'Findings' },
      { key: 'findings', title: 'Findings again' },
      { key: 'x', title: '   ' },
    ]);
    expect(out).toEqual([
      { key: 'my_custom_notes', title: 'My Custom Notes' },
      { key: 'findings', title: 'Findings' },
    ]);
  });
  it('keeps guidance and required, ignores non-object entries', () => {
    const out = normalizeSections([
      null,
      'junk',
      { key: 'destruction_certificate', title: 'Certificate', guidance: ' sign below ', required: true },
    ]);
    expect(out).toEqual([
      { key: 'destruction_certificate', title: 'Certificate', guidance: 'sign below', required: true },
    ]);
  });
  it('returns [] for non-array input', () => {
    expect(normalizeSections(undefined)).toEqual([]);
    expect(normalizeSections({})).toEqual([]);
  });
});

describe('resolveEffectiveTemplate', () => {
  it('prefers the tenant default over the preset default', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'report_section_templates') {
        return chain({ data: { id: 't-1', name: 'My Eval', sections: [{ key: 'findings', title: 'Findings' }] }, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    const r = await resolveEffectiveTemplate('evaluation');
    expect(r).toMatchObject({ source: 'tenant', id: 't-1', name: 'My Eval' });
    expect(r.sections).toEqual([{ key: 'findings', title: 'Findings' }]);
  });

  it('falls back to the default preset when there is no tenant default', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'report_section_templates') return chain({ data: null, error: null });
      if (table === 'master_report_section_presets') {
        return chain({ data: { id: 'p-1', name: 'Standard Evaluation', sections: [{ key: 'executive_summary', title: 'Executive Summary' }] }, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    const r = await resolveEffectiveTemplate('evaluation');
    expect(r).toMatchObject({ source: 'system', id: 'p-1', name: 'Standard Evaluation' });
  });

  it('degrades to the built-in sections when every query fails', async () => {
    from.mockImplementation(() => chain({ data: null, error: new Error('db down') }));
    const r = await resolveEffectiveTemplate('evaluation');
    expect(r.source).toBe('builtin');
    expect(r.sections[0]).toMatchObject({ key: 'executive_summary', title: 'Executive Summary' });
  });

  it('skips a tenant default whose sections are empty', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'report_section_templates') return chain({ data: { id: 't-1', name: 'Broken', sections: [] }, error: null });
      if (table === 'master_report_section_presets') return chain({ data: { id: 'p-1', name: 'Standard', sections: [{ key: 'findings', title: 'Findings' }] }, error: null });
      throw new Error(`unexpected table ${table}`);
    });
    const r = await resolveEffectiveTemplate('service');
    expect(r.source).toBe('system');
  });
});

describe('setDefaultReportSectionTemplate', () => {
  it('clears other defaults of the type before setting the new one', async () => {
    const updates: Array<{ payload: Record<string, unknown>; eqs: Array<[string, unknown]> }> = [];
    from.mockImplementation(() => {
      const rec = { payload: {} as Record<string, unknown>, eqs: [] as Array<[string, unknown]> };
      updates.push(rec);
      const c = chain({ data: null, error: null });
      c.update = vi.fn((p: Record<string, unknown>) => { rec.payload = p; return c; });
      c.eq = vi.fn((col: string, val: unknown) => { rec.eqs.push([col, val]); return c; });
      return c;
    });
    await setDefaultReportSectionTemplate('tpl-9', 'service');
    expect(updates).toHaveLength(2);
    expect(updates[0].payload).toEqual({ is_default: false });
    expect(updates[0].eqs).toContainEqual(['report_type', 'service']);
    expect(updates[1].payload).toEqual({ is_default: true });
    expect(updates[1].eqs).toContainEqual(['id', 'tpl-9']);
  });
});

describe('createReportSectionTemplate', () => {
  it('normalizes sections and inserts with the resolved tenant id', async () => {
    let inserted: unknown = null;
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return chain({ data: { tenant_id: 't1' }, error: null });
      if (table === 'report_section_templates') {
        const c = chain({ data: { id: 'new-1' }, error: null });
        c.insert = vi.fn((p: Record<string, unknown>) => { inserted = p; return c; });
        return c;
      }
      throw new Error(`unexpected table ${table}`);
    });
    const row = await createReportSectionTemplate({
      reportType: 'evaluation',
      name: '  Lab Standard  ',
      sections: [{ key: '', title: 'Intake Photos' }],
      sourcePresetId: 'p-1',
    });
    expect(row).toMatchObject({ id: 'new-1' });
    expect(inserted).toMatchObject({
      tenant_id: 't1',
      report_type: 'evaluation',
      name: 'Lab Standard',
      is_default: false,
      source_preset_id: 'p-1',
    });
    expect((inserted as Record<string, unknown>).sections).toEqual([{ key: 'intake_photos', title: 'Intake Photos' }]);
  });

  it('rejects a template with no usable sections', async () => {
    await expect(
      createReportSectionTemplate({ reportType: 'evaluation', name: 'Empty', sections: [] }),
    ).rejects.toThrow(/at least one section/i);
  });
});
