import { describe, it, expect } from 'vitest';
import { devicesForReceipt } from './receiptAdapter';
import type { DeviceData } from '../../types';

const dev = (id: string, batch?: string, receivedAt?: string): DeviceData => ({
  id,
  intake_batch_id: batch,
  received_at: receivedAt,
});

describe('devicesForReceipt', () => {
  it('returns only the latest intake batch', () => {
    const devices = [
      dev('a', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('b', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('c', 'batch-2', '2026-08-04T09:00:00Z'),
    ];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['c']);
  });

  it('falls back to every device when no batch has been recorded', () => {
    const devices = [dev('a'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('ignores unbatched devices when a batch exists', () => {
    const devices = [dev('a', 'batch-1', '2026-08-01T10:00:00Z'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a']);
  });
});
