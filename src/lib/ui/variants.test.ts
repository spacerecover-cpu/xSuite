import { describe, it, expect } from 'vitest';
import { STATUS_TONE, STATUS_TONE_MUTED, statusToBadgeVariant } from './variants';

describe('status tone maps', () => {
  it('maps each tone to semantic foreground token pairs', () => {
    expect(STATUS_TONE.success).toBe('bg-success text-success-foreground');
    expect(STATUS_TONE.danger).toBe('bg-danger text-danger-foreground');
    expect(STATUS_TONE.info).toBe('bg-info text-info-foreground');
  });

  it('exposes muted variants for status tones', () => {
    expect(STATUS_TONE_MUTED.warning).toBe('bg-warning-muted text-warning');
  });

  it('contains no banned raw palette colors or hex', () => {
    const all = [...Object.values(STATUS_TONE), ...Object.values(STATUS_TONE_MUTED)].join(' ');
    expect(all).not.toMatch(/purple|indigo|violet|cyan|#[0-9a-fA-F]{3,6}/);
  });
});

describe('statusToBadgeVariant', () => {
  it('maps positive/terminal-good statuses to success', () => {
    expect(statusToBadgeVariant('paid')).toBe('success');
    expect(statusToBadgeVariant('completed')).toBe('success');
    expect(statusToBadgeVariant('active')).toBe('success');
    expect(statusToBadgeVariant('approved')).toBe('success');
  });

  it('maps in-progress/needs-attention statuses to warning', () => {
    expect(statusToBadgeVariant('pending')).toBe('warning');
    expect(statusToBadgeVariant('partial')).toBe('warning');
    expect(statusToBadgeVariant('on_hold')).toBe('warning');
  });

  it('maps informational/early-lifecycle statuses to info', () => {
    expect(statusToBadgeVariant('draft')).toBe('info');
    expect(statusToBadgeVariant('sent')).toBe('info');
    expect(statusToBadgeVariant('open')).toBe('info');
    expect(statusToBadgeVariant('new')).toBe('info');
  });

  it('maps negative/failed/terminated statuses to danger', () => {
    expect(statusToBadgeVariant('overdue')).toBe('danger');
    expect(statusToBadgeVariant('failed')).toBe('danger');
    expect(statusToBadgeVariant('rejected')).toBe('danger');
    expect(statusToBadgeVariant('void')).toBe('danger');
    expect(statusToBadgeVariant('cancelled')).toBe('danger');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(statusToBadgeVariant('  PAID ')).toBe('success');
    expect(statusToBadgeVariant('Overdue')).toBe('danger');
  });

  it('falls back to the neutral secondary variant for unknown statuses', () => {
    expect(statusToBadgeVariant('frobnicated')).toBe('secondary');
    expect(statusToBadgeVariant('')).toBe('secondary');
  });
});
