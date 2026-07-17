import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));

import { updateKBArticle } from './kbService';

/** Chainable, thenable builder that records every method call made against it. */
function recordingBuilder(result: { data: unknown; error: unknown }) {
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
