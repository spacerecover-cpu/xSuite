/**
 * PDF-03 — gallery previews must be rendered with the tenant's own identity and
 * branding, not the neutral English/LTR sample company. A bilingual or RTL
 * tenant cannot judge a design that is drawn in someone else's language.
 *
 * Mounts the real modal and asserts what reaches `previewTemplate`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TemplateGalleryModal } from './TemplateGalleryModal';
import { TEMPLATE_PRESETS } from '../../../pages/settings/presetTemplates';

const previewTemplate = vi.fn(async () => ({ url: 'blob:preview', warnings: [] }));
const fetchCompanySettings = vi.fn();

const TENANT_SETTINGS = {
  basic_info: { company_name: 'Falcon Data Labs' },
  localization: {
    document_language_settings: { mode: 'bilingual' as const, secondary_language: 'ar', language_name: 'Arabic' },
  },
};

vi.mock('../../../lib/pdf/engine/previewTemplate', () => ({
  previewTemplate: (...args: unknown[]) => previewTemplate(...(args as [])),
}));
vi.mock('../../../lib/pdf/fonts', () => ({ preloadAllFonts: vi.fn(async () => undefined) }));
vi.mock('../../../lib/pdf/dataFetcher', () => ({
  fetchCompanySettings: () => fetchCompanySettings(),
}));
vi.mock('../../../lib/fileStorageService', () => ({
  getCompanyLogo: vi.fn(async () => 'https://cdn.example/logo.png'),
  getCompanyStamp: vi.fn(async () => null),
  getCompanySignature: vi.fn(async () => null),
}));
vi.mock('../../../lib/pdf/brandingImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/pdf/brandingImage')>();
  return {
    ...actual,
    resolveBrandingImage: vi.fn(async (url?: string | null) =>
      url ? { kind: 'raster', dataUrl: 'data:image/png;base64,AAAA' } : { kind: 'none', reason: 'empty' },
    ),
  };
});

/** Argument positions of `previewTemplate(docType, config, ctx, logo, stamp, signature, companySettings, languageExplicit)`. */
const ARG = { docType: 0, config: 1, ctx: 2, logo: 3, stamp: 4, signature: 5, companySettings: 6, languageExplicit: 7 };

const renderModal = () =>
  render(
    <TemplateGalleryModal
      isOpen
      docType="invoice"
      onClose={() => {}}
      onUse={() => {}}
      onBlank={() => {}}
    />,
  );

/** Select the first preset card, then hit Preview. */
async function previewFirstPreset() {
  const user = userEvent.setup();
  const first = TEMPLATE_PRESETS.invoice[0];
  await user.click(screen.getByRole('heading', { name: first.name }));
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  await waitFor(() => expect(previewTemplate).toHaveBeenCalled());
  return previewTemplate.mock.calls[0] as unknown as unknown[];
}

describe('TemplateGalleryModal preview branding (PDF-03)', () => {
  beforeEach(() => {
    previewTemplate.mockClear();
    fetchCompanySettings.mockReset();
    fetchCompanySettings.mockResolvedValue(TENANT_SETTINGS);
  });

  it('passes the tenant company settings so language and identity follow the tenant', async () => {
    renderModal();
    const args = await previewFirstPreset();
    expect(args[ARG.companySettings]).toEqual(TENANT_SETTINGS);
  });

  it('passes the resolved tenant logo instead of leaving it undefined', async () => {
    renderModal();
    const args = await previewFirstPreset();
    expect(args[ARG.logo]).toEqual({ kind: 'raster', dataUrl: 'data:image/png;base64,AAAA' });
  });

  it('marks the language as tenant-derived when the preset does not set one', async () => {
    renderModal();
    const args = await previewFirstPreset();
    // The invoice presets carry no `language`, so the tenant default must win —
    // the same rule the Studio applies.
    expect(TEMPLATE_PRESETS.invoice[0].config.language).toBeUndefined();
    expect(args[ARG.languageExplicit]).toBe(false);
  });

  it('PARITY: still renders through previewTemplate with the resolved preset config', async () => {
    renderModal();
    const args = await previewFirstPreset();
    expect(args[ARG.docType]).toBe('invoice');
    // ctx stays undefined — previewTemplate derives it from the resolved config,
    // exactly as before this change.
    expect(args[ARG.ctx]).toBeUndefined();
    expect(args[ARG.config]).toMatchObject({ language: expect.any(Object), paper: expect.any(Object) });
  });

  it('PARITY: a failed settings fetch degrades to the previous sample-company preview', async () => {
    fetchCompanySettings.mockRejectedValue(new Error('offline'));
    renderModal();
    const args = await previewFirstPreset();
    expect(args[ARG.companySettings]).toBeUndefined();
  });
});
