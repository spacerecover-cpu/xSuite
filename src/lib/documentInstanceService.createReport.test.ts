import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, from, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { rpc, from, auth: { getUser }, storage: { from: vi.fn() } },
}));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
const { resolveEffectiveTemplate } = vi.hoisted(() => ({ resolveEffectiveTemplate: vi.fn() }));
vi.mock('./reportSectionTemplateService', () => ({ resolveEffectiveTemplate }));

import { createReportInstance } from './documentInstanceService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['insert', 'select', 'eq', 'is', 'order']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  resolveEffectiveTemplate.mockResolvedValue({
    source: 'builtin',
    name: 'Built-in sections',
    sections: [
      { key: 'executive_summary', title: 'Summary' },
      { key: 'findings', title: 'Findings' },
    ],
  });
});

function mockTables(sectionInserts: unknown[]) {
  from.mockImplementation((table: string) => {
    if (table === 'profiles') return chain({ data: { tenant_id: 't1' }, error: null });
    if (table === 'document_instances') return chain({ data: { id: 'di-1', case_id: 'c1', report_subtype: 'evaluation' }, error: null });
    if (table === 'document_instance_sections') {
      const c = chain({ data: [], error: null });
      c.insert = vi.fn((payload: unknown) => { sectionInserts.push(payload); return c; });
      return c;
    }
    return chain({ data: null, error: null });
  });
}

describe('createReportInstance', () => {
  it('mints a report number, creates a draft, and seeds the effective-template sections', async () => {
    rpc.mockResolvedValue({ data: 'REP-EVAL-0007', error: null });
    const sectionInserts: unknown[] = [];
    mockTables(sectionInserts);

    const inst = await createReportInstance({ caseId: 'c1', reportSubtype: 'evaluation', title: 'Evaluation Report' });

    expect(inst.id).toBe('di-1');
    expect(rpc).toHaveBeenCalledWith('get_next_number', expect.objectContaining({ p_scope: expect.stringContaining('report') }));
    expect(resolveEffectiveTemplate).toHaveBeenCalledWith('evaluation');
    // two seeded sections, ordered, carrying tenant + instance id
    expect(Array.isArray(sectionInserts[0])).toBe(true);
    const rows = sectionInserts[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ document_instance_id: 'di-1', section_key: 'executive_summary', title: 'Summary', sort_order: 0, tenant_id: 't1' });
    expect(rows[1]).toMatchObject({ section_key: 'findings', sort_order: 1 });
  });

  it('seeds explicitly-passed sections verbatim and skips template resolution', async () => {
    rpc.mockResolvedValue({ data: 'REP-EVAL-0008', error: null });
    const sectionInserts: unknown[] = [];
    mockTables(sectionInserts);

    await createReportInstance({
      caseId: 'c1',
      reportSubtype: 'evaluation',
      title: 'Evaluation Report',
      sections: [
        { key: 'my_custom_notes', title: 'Warranty Notes' },
        { key: 'findings', title: 'Lab Findings' },
      ],
    });

    expect(resolveEffectiveTemplate).not.toHaveBeenCalled();
    const rows = sectionInserts[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ section_key: 'my_custom_notes', title: 'Warranty Notes', sort_order: 0 });
    expect(rows[1]).toMatchObject({ section_key: 'findings', title: 'Lab Findings', sort_order: 1 });
  });

  it('ignores an empty explicit sections array and resolves the template instead', async () => {
    rpc.mockResolvedValue({ data: 'REP-EVAL-0009', error: null });
    const sectionInserts: unknown[] = [];
    mockTables(sectionInserts);

    await createReportInstance({ caseId: 'c1', reportSubtype: 'evaluation', title: 'Report', sections: [] });

    expect(resolveEffectiveTemplate).toHaveBeenCalledWith('evaluation');
    expect((sectionInserts[0] as unknown[]).length).toBe(2);
  });
});
