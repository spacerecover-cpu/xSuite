import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };
const STAMP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC';

const render = (signatureImages?: object, stampImage?: string, signatureImage?: string) => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.office_receipt;
  const sections = base.sections.map((s) => (s.key === 'signature' ? { ...s, visible: true } : s));
  const config = { ...base, sections, signatureImages };
  return JSON.stringify(renderTemplate(config, buildPreviewEngineData('office_receipt', config), ctx, null, null, stampImage, signatureImage));
};

describe('signature section — stamp/signature images', () => {
  it('renders the stamp image when stamp.show + image present', () => {
    expect(render({ stamp: { show: true, width: 90 } }, STAMP)).toContain(STAMP);
  });
  it('renders the signature image when signature.show + image present', () => {
    expect(render({ signature: { show: true } }, undefined, STAMP)).toContain(STAMP);
  });
  it('renders neither when not configured (parity)', () => {
    expect(render(undefined, STAMP, STAMP)).not.toContain(STAMP);
  });
});
