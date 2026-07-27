/**
 * PDF-04 — the Studio's sample preview and its record preview must be handed
 * ONE branding resolution. Before this change the `'sample'` branch passed the
 * tenant logo/stamp/signature/company settings and the record branch passed
 * none, so flipping the data-source picker could change the letterhead for
 * reasons unrelated to the data.
 *
 * STU-07 is covered here too: the picker no longer hides for doc types outside
 * invoice / quote / payment_receipt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TemplateStudio } from './TemplateStudio';

const previewTemplate = vi.fn(async () => ({ url: 'blob:sample', warnings: [] }));
const previewDocumentForRecord = vi.fn(async () => ({ url: 'blob:record', warnings: [] }));
const listPreviewRecords = vi.fn(async () => [{ id: 'rec-1', label: 'INV-2026-0001' }]);

const TENANT_LOGO = { kind: 'raster', dataUrl: 'data:image/png;base64,LOGO' };
const TENANT_STAMP = { kind: 'raster', dataUrl: 'data:image/png;base64,STAMP' };
const TENANT_SIGNATURE = { kind: 'raster', dataUrl: 'data:image/png;base64,SIGN' };
const TENANT_SETTINGS = { basic_info: { company_name: 'Falcon Data Labs' } };

vi.mock('../../../lib/pdf/engine/previewTemplate', () => ({
  previewTemplate: (...args: unknown[]) => previewTemplate(...(args as [])),
}));
vi.mock('../../../lib/pdf/previewRecord', () => ({
  previewDocumentForRecord: (...args: unknown[]) => previewDocumentForRecord(...(args as [])),
  listPreviewRecords: (...args: unknown[]) => listPreviewRecords(...(args as [])),
}));
vi.mock('../../../lib/pdf/fonts', () => ({ preloadAllFonts: vi.fn(async () => undefined) }));
vi.mock('../../../lib/pdf/dataFetcher', () => ({
  fetchCompanySettings: vi.fn(async () => TENANT_SETTINGS),
}));
vi.mock('../../../lib/fileStorageService', () => ({
  getCompanyLogo: vi.fn(async () => 'https://cdn.example/logo.png'),
  getCompanyStamp: vi.fn(async () => 'https://cdn.example/stamp.png'),
  getCompanySignature: vi.fn(async () => 'https://cdn.example/sign.png'),
}));
vi.mock('../../../lib/pdf/brandingImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/pdf/brandingImage')>();
  return {
    ...actual,
    resolveBrandingImage: vi.fn(async (url?: string | null) => {
      if (url?.includes('logo')) return TENANT_LOGO;
      if (url?.includes('stamp')) return TENANT_STAMP;
      if (url?.includes('sign')) return TENANT_SIGNATURE;
      return { kind: 'none', reason: 'empty' };
    }),
  };
});
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));
vi.mock('../../../hooks/useConfirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

// The six tab panels are irrelevant here and pull in ~1,100 lines of controls.
vi.mock('./tabs/GeneralTab', () => ({ GeneralTab: () => null }));
vi.mock('./tabs/HeaderFooterTab', () => ({ HeaderFooterTab: () => null }));
vi.mock('./tabs/TransactionTab', () => ({ TransactionTab: () => null }));
vi.mock('./tabs/TableTab', () => ({ TableTab: () => null }));
vi.mock('./tabs/TotalTab', () => ({ TotalTab: () => null }));
vi.mock('./tabs/OtherDetailsTab', () => ({ OtherDetailsTab: () => null }));

beforeEach(() => {
  previewTemplate.mockClear();
  previewDocumentForRecord.mockClear();
  listPreviewRecords.mockClear();
  // jsdom has no object-URL implementation.
  Object.assign(URL, { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} });
});

const renderStudio = (docType: Parameters<typeof TemplateStudio>[0]['docType'] = 'invoice') =>
  render(
    <TemplateStudio
      docType={docType}
      initialOverride={{}}
      isSaving={false}
      onBack={() => {}}
      onSave={() => {}}
    />,
  );

/** `previewTemplate(docType, config, ctx, logo, stamp, signature, companySettings, languageExplicit, opts)` */
const SAMPLE_ARG = { logo: 3, stamp: 4, signature: 5, companySettings: 6, opts: 8 };
/** `previewDocumentForRecord(docType, recordId, config, languageExplicit, branding)` */
const RECORD_ARG = { recordId: 1, branding: 4 };

/** `Array.prototype.at` is ES2022; this project targets ES2020. */
const lastCall = (calls: unknown[]): unknown[] => calls[calls.length - 1] as unknown[];

async function switchToRecord() {
  const user = userEvent.setup();
  const picker = await screen.findByLabelText('Preview data source');
  await user.selectOptions(picker, 'rec-1');
  await waitFor(() => expect(previewDocumentForRecord).toHaveBeenCalled());
  return lastCall(previewDocumentForRecord.mock.calls);
}

describe('TemplateStudio shared branding resolution (PDF-04)', () => {
  it('hands the record preview the same logo/stamp/signature as the sample preview', async () => {
    renderStudio();
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled());
    const sample = lastCall(previewTemplate.mock.calls);
    expect(sample[SAMPLE_ARG.logo]).toEqual(TENANT_LOGO);

    const record = await switchToRecord();
    const branding = record[RECORD_ARG.branding] as Record<string, unknown>;
    expect(branding.logo).toEqual(sample[SAMPLE_ARG.logo]);
    expect(branding.stamp).toEqual(sample[SAMPLE_ARG.stamp]);
    expect(branding.signature).toEqual(sample[SAMPLE_ARG.signature]);
  });

  it('shares the stand-in-logo treatment across both paths', async () => {
    renderStudio();
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled());
    const sample = lastCall(previewTemplate.mock.calls);
    const opts = sample[SAMPLE_ARG.opts] as { logoPlaceholder?: boolean };

    const record = await switchToRecord();
    const branding = record[RECORD_ARG.branding] as { logoPlaceholder?: boolean };
    expect(branding.logoPlaceholder).toBe(opts.logoPlaceholder);
  });

  it('PARITY: the default sample preview still asks for the placeholder logo box', async () => {
    renderStudio();
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled());
    const sample = lastCall(previewTemplate.mock.calls);
    expect((sample[SAMPLE_ARG.opts] as { logoPlaceholder?: boolean }).logoPlaceholder).toBe(true);
    // …and still passes the tenant identity it always did.
    expect(sample[SAMPLE_ARG.companySettings]).toEqual(TENANT_SETTINGS);
  });

  it('PARITY: no Print view toggle is offered when the tenant has a real logo', async () => {
    renderStudio();
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /print view/i })).toBeNull();
  });

  it('passes the selected record id through unchanged', async () => {
    renderStudio();
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled());
    const record = await switchToRecord();
    expect(record[RECORD_ARG.recordId]).toBe('rec-1');
  });
});

describe('TemplateStudio record picker coverage (STU-07)', () => {
  it('offers the record picker for a report template, not just the financial three', async () => {
    renderStudio('report');
    // The picker is driven purely by what listPreviewRecords returns, so any
    // doc type the module supports gets one.
    expect(await screen.findByLabelText('Preview data source')).toBeTruthy();
    expect(listPreviewRecords).toHaveBeenCalledWith('report');
  });

  it('offers it for a chain-of-custody template', async () => {
    renderStudio('chain_of_custody');
    expect(await screen.findByLabelText('Preview data source')).toBeTruthy();
    expect(listPreviewRecords).toHaveBeenCalledWith('chain_of_custody');
  });

  it('hides the picker when the doc type has no records', async () => {
    listPreviewRecords.mockResolvedValueOnce([]);
    renderStudio('stock_label');
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled());
    expect(screen.queryByLabelText('Preview data source')).toBeNull();
  });
});

describe('TemplateStudio Print view affordance (PDF-02)', () => {
  it('offers Print view only when a stand-in logo box is actually being drawn', async () => {
    const { getCompanyLogo } = await import('../../../lib/fileStorageService');
    vi.mocked(getCompanyLogo).mockResolvedValueOnce(null);
    renderStudio();
    const toggle = await screen.findByRole('button', { name: /print view/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('turning Print view on suppresses the placeholder in the sample preview', async () => {
    const { getCompanyLogo } = await import('../../../lib/fileStorageService');
    vi.mocked(getCompanyLogo).mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderStudio();
    const toggle = await screen.findByRole('button', { name: /print view/i });
    await waitFor(() => expect(previewTemplate).toHaveBeenCalled());

    await user.click(toggle);
    await waitFor(() => {
      const last = lastCall(previewTemplate.mock.calls);
      expect((last[SAMPLE_ARG.opts] as { logoPlaceholder?: boolean }).logoPlaceholder).toBe(false);
    });
  });

  it('and carries the same choice into the record preview', async () => {
    const { getCompanyLogo } = await import('../../../lib/fileStorageService');
    vi.mocked(getCompanyLogo).mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderStudio();
    const toggle = await screen.findByRole('button', { name: /print view/i });
    await user.click(toggle);
    const record = await switchToRecord();
    expect((record[RECORD_ARG.branding] as { logoPlaceholder?: boolean }).logoPlaceholder).toBe(false);
  });
});
