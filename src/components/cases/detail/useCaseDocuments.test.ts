import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listDocumentInstances } = vi.hoisted(() => ({ listDocumentInstances: vi.fn() }));
vi.mock('../../../lib/documentInstanceService', () => ({ listDocumentInstances }));

import { fetchCaseDocuments } from './useCaseQueries';

beforeEach(() => vi.clearAllMocks());

describe('fetchCaseDocuments', () => {
  it('returns [] for a missing case id without hitting the service', async () => {
    expect(await fetchCaseDocuments(undefined)).toEqual([]);
    expect(listDocumentInstances).not.toHaveBeenCalled();
  });

  it('delegates to listDocumentInstances for a real case id', async () => {
    listDocumentInstances.mockResolvedValue([{ id: 'd1' }]);
    const rows = await fetchCaseDocuments('c1');
    expect(listDocumentInstances).toHaveBeenCalledWith('c1');
    expect(rows).toEqual([{ id: 'd1' }]);
  });
});
