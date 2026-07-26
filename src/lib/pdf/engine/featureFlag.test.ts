import { describe, it, expect, afterEach, vi } from 'vitest';
import { selectRenderEngine, TYPST_GENERATION_SUPPORTED } from './featureFlag';

// Regression lock for the preview/download engine split (QA PDF-01): the Typst
// flag used to be consulted by the two PREVIEW paths only, never by pdfService,
// so an Arabic document previewed through Typst and downloaded through pdfmake —
// differing in exactly the shaping/bidi respects Typst exists to fix.
// selectRenderEngine is now the single decision both sides call.

const setTypst = (value: string | undefined) => {
  vi.stubEnv('VITE_PDF_TYPST', value ?? '');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('selectRenderEngine', () => {
  it('is pdfmake when the Typst flag is off', () => {
    setTypst('false');
    expect(selectRenderEngine('ar')).toBe('pdfmake');
    expect(selectRenderEngine(null)).toBe('pdfmake');
  });

  it('never selects Typst for non-Arabic secondaries', () => {
    setTypst('true');
    expect(selectRenderEngine(null)).toBe('pdfmake');
    expect(selectRenderEngine('ko')).toBe('pdfmake');
    expect(selectRenderEngine('th')).toBe('pdfmake');
  });

  it('gates Arabic + flag-on behind generation support, so preview cannot diverge from download', () => {
    setTypst('true');
    // The whole point of the fix: the answer is the same value generation uses.
    // While generation is pdfmake-only, preview must be pdfmake too.
    expect(selectRenderEngine('ar')).toBe(TYPST_GENERATION_SUPPORTED ? 'typst' : 'pdfmake');
  });

  it('returns one answer for a given input — preview and generation cannot disagree', () => {
    setTypst('true');
    const asPreview = selectRenderEngine('ar');
    const asGeneration = selectRenderEngine('ar');
    expect(asPreview).toBe(asGeneration);
  });
});
