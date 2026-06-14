import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC';
// A distinctive `<rect width="10" height="10">` marker — section info-box icons
// (deviceIconMapper) also emit `<svg>`, so the logo's own markup is what we assert
// on. The output is JSON.stringify'd, so the inner quotes are escaped (`\"`).
const LOGO_SVG_MARKER = JSON.stringify('<rect width="10" height="10"').slice(1, -1);
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', 'utf-8').toString('base64');

const render = (logo: string | null) => {
  const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  return JSON.stringify(renderTemplate(config, buildPreviewEngineData('invoice', config), ctx, logo, null));
};

describe('engine header logo routing', () => {
  it('emits an image node for a raster logo', () => {
    expect(render(PNG)).toContain('"image"');
  });
  it('emits an svg node for an svg logo', () => {
    const out = render(SVG);
    expect(out).toContain('"svg"');
    expect(out).toContain(LOGO_SVG_MARKER);
  });
  it('emits no image/svg logo node when there is no logo', () => {
    const out = render(null);
    expect(out).not.toContain(PNG);
    expect(out).not.toContain(LOGO_SVG_MARKER);
  });
});
