import { describe, it, expect } from 'vitest';
import {
  resolveStatusTypes,
  bucketizeStatusCounts,
  statusNamesForBucket,
  formatCaseAge,
  ageSeverity,
  AGE_WARN_DAYS,
  AGE_CRIT_DAYS,
} from './caseLifecycle';

const MASTER = [
  { name: 'Received', type: 'intake' },
  { name: 'Diagnosis in Progress', type: 'diagnosis' },
  { name: 'Delivered', type: 'delivered' },
  { name: 'Ready for Pickup', type: 'ready' },
  { name: 'No Type Row', type: null },
];

describe('resolveStatusTypes', () => {
  it('maps master rows by name and skips null types', () => {
    const map = resolveStatusTypes(MASTER, undefined);
    expect(map.get('Received')).toBe('intake');
    expect(map.get('Delivered')).toBe('delivered');
    expect(map.has('No Type Row')).toBe(false);
  });

  it('layers tenant overrides on top (override wins, new names added)', () => {
    const map = resolveStatusTypes(MASTER, {
      Received: 'diagnosis',
      Returned: 'delivered',
    });
    expect(map.get('Received')).toBe('diagnosis');
    expect(map.get('Returned')).toBe('delivered');
  });

  it('drops overrides whose value is not a valid status type', () => {
    const map = resolveStatusTypes(MASTER, { Garbage: 'not-a-type' });
    expect(map.has('Garbage')).toBe(false);
  });
});

describe('bucketizeStatusCounts', () => {
  const typeMap = resolveStatusTypes(MASTER, {
    'Returned': 'delivered',
    'Waiting for Approval': 'awaiting_approval',
    'Approved': 'approved',
    'Completed Successfully': 'completed',
    'Cancelled': 'cancelled',
  });
  const counts = [
    { status: 'Received', total: 25 },
    { status: 'Diagnosis in Progress', total: 10 },
    { status: 'Waiting for Approval', total: 188 },
    { status: 'Approved', total: 25 },
    { status: 'Ready for Pickup', total: 5 },
    { status: 'Returned', total: 1092 },
    { status: 'Delivered', total: 469 },
    { status: 'Completed Successfully', total: 16 },
    { status: 'Cancelled', total: 95 },
    { status: 'Some Unknown', total: 7 },
    { status: null, total: 3 },
  ];

  it('sums disjoint pipeline buckets by lifecycle type', () => {
    const r = bucketizeStatusCounts(counts, typeMap);
    expect(r.buckets.new).toBe(25);
    expect(r.buckets.diagnosis).toBe(10);
    expect(r.buckets.approval).toBe(188);
    expect(r.buckets.recovery).toBe(25);
    expect(r.buckets.ready).toBe(5);
    expect(r.buckets.delivered).toBe(1092 + 469 + 16);
    expect(r.cancelled).toBe(95);
  });

  it('counts unmapped + null statuses as unmapped and keeps them active', () => {
    const r = bucketizeStatusCounts(counts, typeMap);
    expect(r.unmapped).toBe(10);
    expect(r.total).toBe(1935);
    expect(r.active).toBe(1935 - (1092 + 469 + 16) - 95);
  });
});

describe('statusNamesForBucket', () => {
  const typeMap = resolveStatusTypes(MASTER, { Returned: 'delivered' });
  const counts = [
    { status: 'Received', total: 1 },
    { status: 'Returned', total: 2 },
    { status: 'Delivered', total: 3 },
    { status: 'Unknown', total: 4 },
  ];

  it('returns only data-present names whose type belongs to the bucket', () => {
    expect(statusNamesForBucket('delivered', counts, typeMap).sort()).toEqual(['Delivered', 'Returned']);
    expect(statusNamesForBucket('new', counts, typeMap)).toEqual(['Received']);
    expect(statusNamesForBucket('diagnosis', counts, typeMap)).toEqual([]);
  });
});

describe('formatCaseAge', () => {
  const now = new Date('2026-07-02T12:00:00Z');
  it('renders sub-hour, hours and days', () => {
    expect(formatCaseAge('2026-07-02T11:40:00Z', now)).toBe('<1h');
    expect(formatCaseAge('2026-07-02T07:00:00Z', now)).toBe('5h');
    expect(formatCaseAge('2026-07-01T06:00:00Z', now)).toBe('1d');
    expect(formatCaseAge('2026-06-20T12:00:00Z', now)).toBe('12d');
  });
});

describe('ageSeverity', () => {
  const now = new Date('2026-07-02T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

  it('escalates open cases at the warn/crit thresholds', () => {
    expect(ageSeverity(daysAgo(AGE_WARN_DAYS - 1), now, 'intake')).toBe('ok');
    expect(ageSeverity(daysAgo(AGE_WARN_DAYS), now, 'recovery')).toBe('warn');
    expect(ageSeverity(daysAgo(AGE_CRIT_DAYS), now, 'diagnosis')).toBe('crit');
  });

  it('never flags terminal cases, and treats unknown type as open', () => {
    expect(ageSeverity(daysAgo(30), now, 'delivered')).toBe('ok');
    expect(ageSeverity(daysAgo(30), now, 'completed')).toBe('ok');
    expect(ageSeverity(daysAgo(30), now, 'cancelled')).toBe('ok');
    expect(ageSeverity(daysAgo(30), now, null)).toBe('crit');
  });
});
