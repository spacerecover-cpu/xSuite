import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ createReportInstance: vi.fn(), listDocumentInstances: vi.fn() }));
vi.mock('../documentInstanceService', () => svc);
vi.mock('../logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../featureFlags', () => ({ isDocStudioEnabled: () => true }));

import { onCaseTransitioned } from './documentAutomation';

beforeEach(() => {
  vi.clearAllMocks();
  svc.listDocumentInstances.mockResolvedValue([]);
  svc.createReportInstance.mockResolvedValue({ id: 'di-new' });
});

describe('onCaseTransitioned', () => {
  it('P2: diagnosis -> quoting drafts an evaluation report', async () => {
    await onCaseTransitioned('c1', 'diagnosis', 'quoting');
    expect(svc.createReportInstance).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'c1', reportSubtype: 'evaluation' }));
  });

  it('P3: recovery -> qa drafts a service report', async () => {
    await onCaseTransitioned('c1', 'recovery', 'qa');
    expect(svc.createReportInstance).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'c1', reportSubtype: 'service' }));
  });

  it('does NOT draft a destruction certificate on delivered (P1 deferred)', async () => {
    await onCaseTransitioned('c1', 'ready', 'delivered');
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('is idempotent: skips when an evaluation draft already exists', async () => {
    svc.listDocumentInstances.mockResolvedValue([{ id: 'x', report_subtype: 'evaluation', deleted_at: null }]);
    await onCaseTransitioned('c1', 'diagnosis', 'quoting');
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('skips no_op transitions', async () => {
    await onCaseTransitioned('c1', 'quoting', 'quoting', { no_op: true });
    expect(svc.listDocumentInstances).not.toHaveBeenCalled();
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('does nothing for an unmatched transition', async () => {
    await onCaseTransitioned('c1', 'intake', 'diagnosis');
    expect(svc.createReportInstance).not.toHaveBeenCalled();
  });

  it('is failure-isolated: a createReportInstance rejection does not throw', async () => {
    svc.createReportInstance.mockRejectedValue(new Error('boom'));
    await expect(onCaseTransitioned('c1', 'diagnosis', 'quoting')).resolves.toBeUndefined();
  });
});
