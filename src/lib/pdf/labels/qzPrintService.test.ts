// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getQzPrefs, setQzPrefs, LABEL_DOTS_PER_MM } from './qzPrintService';

describe('qz prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to auto mode when nothing is stored', () => {
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('round-trips mode and printer through localStorage', () => {
    setQzPrefs({ mode: 'off', printer: 'OSCAR MetaPrint(ZPL)' });
    expect(getQzPrefs()).toEqual({ mode: 'off', printer: 'OSCAR MetaPrint(ZPL)' });
  });

  it('coerces an unknown mode and blank printer back to safe defaults', () => {
    localStorage.setItem('xsuite.labelPrint.qz', JSON.stringify({ mode: 'weird', printer: '' }));
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('returns auto on corrupt JSON', () => {
    localStorage.setItem('xsuite.labelPrint.qz', '{not json');
    expect(getQzPrefs()).toEqual({ mode: 'auto', printer: undefined });
  });

  it('exposes 8 dots/mm (203 dpi)', () => {
    expect(LABEL_DOTS_PER_MM).toBe(8);
  });
});

import { vi } from 'vitest';
import type { LabelSizePreset } from './labelSizes';

const qzMock = {
  websocket: {
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isActive: vi.fn().mockReturnValue(false),
  },
  printers: {
    getDefault: vi.fn<() => Promise<string>>().mockResolvedValue('OSCAR MetaPrint(ZPL)'),
    find: vi.fn().mockResolvedValue(['OSCAR MetaPrint(ZPL)', 'Save as PDF']),
  },
  configs: { create: vi.fn((printer: string, options: unknown) => ({ printer, options })) },
  print: vi.fn().mockResolvedValue(undefined),
  api: { setPromiseType: vi.fn(), setSha256Type: vi.fn(), setWebSocketType: vi.fn() },
  security: { setCertificatePromise: vi.fn(), setSignatureAlgorithm: vi.fn(), setSignaturePromise: vi.fn() },
};
vi.mock('qz-tray', () => ({ default: qzMock }));

const SIZE = { id: 'nb_15x26', name: '26 × 15 mm', printers: 'Niimbot', widthMm: 26, heightMm: 15 } as LabelSizePreset;
const fakePdf = { getBase64: (cb: (d: string) => void) => cb('QkFTRTY0') };

describe('tryQzPrint', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    qzMock.websocket.isActive.mockReturnValue(false);
    qzMock.websocket.connect.mockResolvedValue(undefined);
    qzMock.printers.getDefault.mockResolvedValue('OSCAR MetaPrint(ZPL)');
    // Reset the module-level cached connection between tests.
    vi.resetModules();
  });

  it('returns false without touching QZ when mode is off', async () => {
    setQzPrefs({ mode: 'off' });
    const { tryQzPrint } = await import('./qzPrintService');
    expect(await tryQzPrint(fakePdf, SIZE)).toBe(false);
    expect(qzMock.websocket.connect).not.toHaveBeenCalled();
  });

  it('prints a pixel-PDF at exact mm size + 8 dots/mm and returns true', async () => {
    const { tryQzPrint } = await import('./qzPrintService');
    expect(await tryQzPrint(fakePdf, SIZE)).toBe(true);
    expect(qzMock.configs.create).toHaveBeenCalledWith(
      'OSCAR MetaPrint(ZPL)',
      expect.objectContaining({
        size: { width: 26, height: 15 },
        units: 'mm',
        density: 8,
        colorType: 'blackwhite',
        scaleContent: false,
      }),
    );
    expect(qzMock.print).toHaveBeenCalledWith(
      expect.anything(),
      [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: 'QkFTRTY0' }],
    );
  });

  it('targets the saved printer override when set', async () => {
    setQzPrefs({ mode: 'auto', printer: 'Zebra ZD421' });
    const { tryQzPrint } = await import('./qzPrintService');
    await tryQzPrint(fakePdf, SIZE);
    expect(qzMock.printers.getDefault).not.toHaveBeenCalled();
    expect(qzMock.configs.create).toHaveBeenCalledWith('Zebra ZD421', expect.anything());
  });

  it('returns false (fallback) when the agent is unreachable', async () => {
    qzMock.websocket.connect.mockRejectedValueOnce(new Error('no agent'));
    const { tryQzPrint } = await import('./qzPrintService');
    expect(await tryQzPrint(fakePdf, SIZE)).toBe(false);
    expect(qzMock.print).not.toHaveBeenCalled();
  });
});

describe('probeQz', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    qzMock.websocket.isActive.mockReturnValue(false);
    qzMock.websocket.connect.mockResolvedValue(undefined);
    vi.resetModules();
  });

  it('reports connected with the default printer and list', async () => {
    const { probeQz } = await import('./qzPrintService');
    expect(await probeQz()).toEqual({
      connected: true,
      defaultPrinter: 'OSCAR MetaPrint(ZPL)',
      printers: ['OSCAR MetaPrint(ZPL)', 'Save as PDF'],
    });
  });

  it('reports disconnected when connect fails', async () => {
    qzMock.websocket.connect.mockRejectedValueOnce(new Error('no agent'));
    const { probeQz } = await import('./qzPrintService');
    expect(await probeQz()).toEqual({ connected: false });
  });
});
