import { describe, it, expect } from 'vitest';
import {
  describeGateError,
  evaluateReleaseReadiness,
  RECOVERY_RESULTS,
  QA_RESULTS,
} from './caseReleaseGate';

describe('describeGateError', () => {
  it('maps the qa_passed gate violation to a guiding message', () => {
    const msg = describeGateError({ code: '23514', hint: 'qa_passed', message: 'Cannot enter "Completed - Success": QA has not passed.' });
    expect(msg).toMatch(/QA/i);
    expect(msg).toMatch(/Recovery & QA/i);
  });

  it('maps the recovery_recorded gate violation to a guiding message', () => {
    const msg = describeGateError({ code: '23514', hint: 'recovery_recorded', message: 'Cannot enter ...' });
    expect(msg).toMatch(/recovery/i);
    expect(msg).toMatch(/Recovery & QA/i);
  });

  it('returns null for a non-gate error (different code)', () => {
    expect(describeGateError({ code: '42501', hint: 'qa_passed', message: 'permission denied' })).toBeNull();
  });

  it('returns null for a 23514 without a recognised gate hint', () => {
    expect(describeGateError({ code: '23514', hint: 'something_else', message: 'x' })).toBeNull();
  });

  it('returns null for null/undefined/malformed input', () => {
    expect(describeGateError(null)).toBeNull();
    expect(describeGateError(undefined)).toBeNull();
    expect(describeGateError({})).toBeNull();
  });
});

describe('evaluateReleaseReadiness', () => {
  it('reports both satisfied when a recovery outcome and a passed QA exist', () => {
    const r = evaluateReleaseReadiness({
      recoveryAttempts: [{ result: 'success' }],
      qaChecklists: [{ status: 'passed' }],
    });
    expect(r).toEqual({ hasRecordedRecovery: true, hasPassedQa: true });
  });

  it('ignores deleted rows', () => {
    const r = evaluateReleaseReadiness({
      recoveryAttempts: [{ result: 'success', deleted_at: '2026-01-01' }],
      qaChecklists: [{ status: 'passed', deleted_at: '2026-01-01' }],
    });
    expect(r).toEqual({ hasRecordedRecovery: false, hasPassedQa: false });
  });

  it('does not count a recovery attempt with no result, or a non-passing QA', () => {
    const r = evaluateReleaseReadiness({
      recoveryAttempts: [{ result: null }],
      qaChecklists: [{ status: 'failed' }],
    });
    expect(r).toEqual({ hasRecordedRecovery: false, hasPassedQa: false });
  });

  it('is empty-safe', () => {
    expect(evaluateReleaseReadiness({ recoveryAttempts: [], qaChecklists: [] }))
      .toEqual({ hasRecordedRecovery: false, hasPassedQa: false });
  });
});

describe('vocabularies match the DB CHECK constraints', () => {
  it('recovery results', () => {
    expect(RECOVERY_RESULTS).toEqual(['success', 'partial', 'failed', 'no_data']);
  });
  it('qa results are the passing/failing subset captured by the UI', () => {
    expect(QA_RESULTS).toEqual(['passed', 'failed']);
  });
});
