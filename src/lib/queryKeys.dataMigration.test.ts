import { describe, it, expect } from 'vitest';
import { dataMigrationKeys } from './queryKeys';

describe('dataMigrationKeys', () => {
  it('all returns a stable base key', () => {
    expect(dataMigrationKeys.all).toEqual(['dataMigration']);
  });

  it('runs returns scoped key', () => {
    expect(dataMigrationKeys.runs()).toEqual(['dataMigration', 'runs']);
  });

  it('run returns keyed by id', () => {
    expect(dataMigrationKeys.run('abc-123')).toEqual(['dataMigration', 'run', 'abc-123']);
  });

  it('validateResult returns keyed by hash', () => {
    expect(dataMigrationKeys.validateResult('sha256:deadbeef')).toEqual([
      'dataMigration', 'validateResult', 'sha256:deadbeef',
    ]);
  });

  it('exportProgress returns scoped key', () => {
    expect(dataMigrationKeys.exportProgress()).toEqual(['dataMigration', 'exportProgress']);
  });
});
