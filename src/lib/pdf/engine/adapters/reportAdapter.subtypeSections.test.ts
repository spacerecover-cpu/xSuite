import { describe, it, expect } from 'vitest';
import { reportSubtypeSections } from './reportAdapter';

describe('reportSubtypeSections', () => {
  it('returns ordered sections for evaluation with stable keys + titles', () => {
    const s = reportSubtypeSections('evaluation');
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => typeof x.key === 'string' && typeof x.title === 'string')).toBe(true);
    // executive summary leads the evaluation report
    expect(s[0].key).toContain('summary');
  });

  it('data_destruction includes the destruction certificate section', () => {
    const keys = reportSubtypeSections('data_destruction').map((x) => x.key);
    expect(keys.some((k) => k.includes('destruction'))).toBe(true);
  });

  it('falls back to the evaluation set for an unknown subtype', () => {
    expect(reportSubtypeSections('nope')).toEqual(reportSubtypeSections('evaluation'));
  });

  it('does NOT include device_information (auto-rendered two-column card, not a prose section)', () => {
    const keys = reportSubtypeSections('evaluation').map((x) => x.key);
    expect(keys).not.toContain('device_information');
  });
});
