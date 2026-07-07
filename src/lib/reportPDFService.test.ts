import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TranslationContext } from './pdf/types';

// ---------------------------------------------------------------------------
// Template resolution order for report generation: the deployed
// `report:<subtype>` template wins, the legacy shared `report` template is the
// fallback, and a resolution failure still renders the built-in default.
// Storage + fonts + QR are mocked; the engine render itself runs for real.
// ---------------------------------------------------------------------------

const { getDeployedSpy } = vi.hoisted(() => ({ getDeployedSpy: vi.fn() }));

vi.mock('./documentTemplateService', () => ({
  getDeployedVersionByType: getDeployedSpy,
  readConfig: (config: unknown) => config ?? {},
}));
vi.mock('./pdf/fonts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pdf/fonts')>();
  return { ...actual, initializePDFFonts: vi.fn(async () => true) };
});
vi.mock('./pdf/qrImage', () => ({
  resolveQrImage: vi.fn(async () => null),
}));
vi.mock('./documentInstanceData.fetch', () => ({
  fetchInstanceReportData: vi.fn(),
}));

import { reportPDFService } from './reportPDFService';
import { sampleReportDataFor } from './pdf/engine/sampleData';

const ctx: TranslationContext = {
  t: (_key, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

beforeEach(() => {
  getDeployedSpy.mockReset();
});

describe('reportPDFService — per-subtype template resolution', () => {
  it('prefers the subtype-scoped template and skips the legacy lookup', async () => {
    getDeployedSpy.mockResolvedValueOnce({ config: {} });
    const def = await reportPDFService.buildReportDocViaEngine(
      sampleReportDataFor('malware'), ctx, null, null,
    );
    expect(getDeployedSpy.mock.calls.map((c) => c[0])).toEqual(['report:malware']);
    expect(def.content).toBeTruthy();
  });

  it('falls back to the legacy shared report template when the subtype has none', async () => {
    getDeployedSpy.mockResolvedValue(null);
    const def = await reportPDFService.buildReportDocViaEngine(
      sampleReportDataFor('service'), ctx, null, null,
    );
    expect(getDeployedSpy.mock.calls.map((c) => c[0])).toEqual(['report:service', 'report']);
    expect(def.content).toBeTruthy();
  });

  it('still renders the built-in default when template resolution throws', async () => {
    getDeployedSpy.mockRejectedValue(new Error('storage offline'));
    const def = await reportPDFService.buildReportDocViaEngine(
      sampleReportDataFor('evaluation'), ctx, null, null,
    );
    expect(def.content).toBeTruthy();
  });
});
