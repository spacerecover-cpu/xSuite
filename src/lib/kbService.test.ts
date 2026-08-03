import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));

import { updateKBArticle, getKBStats } from './kbService';

/** Chainable, thenable builder that records every method call made against it. */
function recordingBuilder(result: { data: unknown; error: unknown; count?: number }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const b: Record<string, unknown> = { calls };
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'insert', 'update', 'upsert']) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (onFulfilled: (r: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return b as Record<string, unknown> & { calls: typeof calls };
}

describe('updateKBArticle tag re-attach', () => {
  beforeEach(() => fromMock.mockReset());

  it('resurrects a previously-removed tag via upsert instead of a colliding plain insert (data-loss #55)', async () => {
    // Article currently has NO active tag links; the user re-adds 'tag-1',
    // whose (article_id, tag_id) pair already exists as a soft-deleted row.
    const tagBuilder = recordingBuilder({ data: [], error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'kb_articles') {
        return recordingBuilder({
          data: { version: 1, title: 't', content: 'c', published_at: null },
          error: null,
        });
      }
      if (table === 'kb_article_versions') {
        return recordingBuilder({ data: null, error: null });
      }
      // kb_article_tags
      return tagBuilder;
    });

    await updateKBArticle('art-1', { author_id: 'u1', tag_ids: ['tag-1'] });

    // A plain .insert of the pair would raise 23505 against the full
    // UNIQUE(article_id, tag_id) constraint (soft-deleted row still occupies it).
    // The fix must upsert (un-soft-delete) rather than blind-insert.
    const upsertCalls = tagBuilder.calls.filter((c) => c.method === 'upsert');
    const insertCalls = tagBuilder.calls.filter((c) => c.method === 'insert');
    expect(insertCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(1);

    const [rows, opts] = upsertCalls[0].args as [any[], any];
    expect(opts.onConflict).toBe('article_id,tag_id');
    expect(rows).toEqual([{ article_id: 'art-1', tag_id: 'tag-1', deleted_at: null }]);
  });
});

describe('updateKBArticle optimistic concurrency', () => {
  beforeEach(() => fromMock.mockReset());

  /** Queues one builder per `supabase.from('kb_articles')` call, in order. */
  function mockArticleWrites(updateResult: { data: unknown; error: unknown }) {
    const read = recordingBuilder({
      data: { version: 3, title: 't', content: 'c', published_at: null },
      error: null,
    });
    const write = recordingBuilder(updateResult);
    const queue = [read, write];

    fromMock.mockImplementation((table: string) => {
      if (table === 'kb_articles') return queue.shift() ?? write;
      return recordingBuilder({ data: [], error: null });
    });

    return { read, write };
  }

  it('guards the write with the version it read, so a concurrent save cannot be clobbered', async () => {
    const { write } = mockArticleWrites({ data: { id: 'art-1', title: 't', content: 'c' }, error: null });

    await updateKBArticle('art-1', { author_id: 'u1', content: 'mine' });

    // Without `.eq('version', 3)` both concurrent savers write v4: the later one
    // silently discards the earlier edit and both version rows claim version_number 4.
    const eqArgs = write.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toContainEqual(['version', 3]);
  });

  it('reports a conflict instead of a generic failure when the guarded update matches no row', async () => {
    mockArticleWrites({ data: null, error: null });

    await expect(updateKBArticle('art-1', { author_id: 'u1', content: 'mine' })).rejects.toThrow(
      /changed by someone else/i
    );
  });
});

describe('getKBStats', () => {
  beforeEach(() => fromMock.mockReset());

  it('counts server-side so the KPIs are not capped by the PostgREST max-rows limit', async () => {
    const builders: { table: string; b: ReturnType<typeof recordingBuilder> }[] = [];
    // Every count query resolves to 4200 — impossible to reach by tallying a capped
    // 1000-row payload client-side.
    fromMock.mockImplementation((table: string) => {
      const b = recordingBuilder({ data: null, error: null, count: 4200 });
      builders.push({ table, b });
      return b;
    });

    const stats = await getKBStats();

    expect(stats.total).toBe(4200);
    expect(stats.published).toBe(4200);
    expect(stats.drafts).toBe(4200);
    expect(stats.featured).toBe(4200);
    expect(stats.categories).toBe(4200);

    for (const { b } of builders) {
      const selectArgs = b.calls.find((c) => c.method === 'select')?.args as [string, any];
      expect(selectArgs[1]).toEqual({ count: 'exact', head: true });
    }
  });
});
