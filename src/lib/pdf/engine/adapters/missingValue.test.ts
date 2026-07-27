import { describe, it, expect } from 'vitest';
import { missingValue, LEGACY_MISSING_VALUE, NEUTRAL_MISSING_VALUE } from './missingValue';
import { ctxFromLanguageConfig } from '../../translationContext';
import type { LanguageConfig } from '../../templateConfig';

const lang = (l: Partial<LanguageConfig>): LanguageConfig =>
  ({ mode: 'en', primary: 'en', ...l } as LanguageConfig);

describe('missingValue — TBL-10 fallback selection', () => {
  // ── PARITY ────────────────────────────────────────────────────────────────
  // The whole point of routing every adapter through one helper is that the
  // DEFAULT (English-only) document is byte-identical to what shipped before.
  describe('parity: English-only documents keep the historical literal', () => {
    it('returns "N/A" for the default English-only config', () => {
      expect(missingValue(lang({ mode: 'en', primary: 'en' }))).toBe('N/A');
      expect(LEGACY_MISSING_VALUE).toBe('N/A');
    });

    it('returns "N/A" when the language config is absent entirely', () => {
      // Several call sites (and every existing adapter test) build a config
      // literal with no `language` key at all. That must degrade to English,
      // never to the neutral glyph, or those documents silently change.
      expect(missingValue(undefined)).toBe('N/A');
      expect(missingValue(null)).toBe('N/A');
    });

    it('returns "N/A" for mode "en" even when a secondary is declared but unused', () => {
      // `resolveSecondary` honours an explicit `secondary` regardless of mode,
      // so the predicate must ALSO require `mode !== 'en'` — otherwise a config
      // that renders English-only would flip its fallback.
      expect(missingValue(lang({ mode: 'en', primary: 'en', secondary: 'fr' }))).toBe('N/A');
    });
  });

  // ── THE FIX ───────────────────────────────────────────────────────────────
  describe('bilingual / secondary-language documents get the script-neutral glyph', () => {
    it('returns the em dash for legacy Arabic-only mode', () => {
      expect(missingValue(lang({ mode: 'ar', primary: 'ar' }))).toBe('—');
      expect(NEUTRAL_MISSING_VALUE).toBe('—');
    });

    it('returns the em dash for both bilingual modes', () => {
      expect(missingValue(lang({ mode: 'bilingual_stacked', primary: 'en' }))).toBe('—');
      expect(missingValue(lang({ mode: 'bilingual_sidebyside', primary: 'ar' }))).toBe('—');
    });

    it('returns the em dash for a non-Arabic secondary too', () => {
      // "N/A" is an English abbreviation, not a universal symbol — a French or
      // Korean reader has no more claim on it than an Arabic one.
      expect(missingValue(lang({ mode: 'bilingual_stacked', primary: 'en', secondary: 'fr' }))).toBe('—');
      expect(missingValue(lang({ mode: 'bilingual_stacked', primary: 'en', secondary: 'ko' }))).toBe('—');
    });

    it('is a single script-neutral character, not a Latin word', () => {
      const out = missingValue(lang({ mode: 'ar', primary: 'ar' }));
      expect(out).toHaveLength(1);
      expect(/[A-Za-z]/.test(out)).toBe(false);
    });
  });

  // ── Why this is NOT routed through ctx.t ──────────────────────────────────
  // The audit suggested localizing the fallback via the engine's translation
  // context. These two cases pin the reason that does not work, so the "fix"
  // is not re-attempted later: `ctx.t` is a bilingual JOIN, not a lookup.
  describe('rationale: ctx.t cannot express a value-cell fallback', () => {
    const arCtx = ctxFromLanguageConfig(lang({ mode: 'bilingual_stacked', primary: 'ar' }));

    it('ctx.t is a no-op for an unknown key — there is no "notAvailable" term', () => {
      expect(arCtx.t('notAvailable', 'N/A')).toBe('N/A');
    });

    it('ctx.t CONCATENATES rather than replaces, so the Latin half survives', () => {
      // A known key demonstrates the shape: "<english> | <translated>". Right for
      // a label; wrong for a value cell, where it would still print the Latin
      // abbreviation — the exact symptom TBL-10 reports.
      const joined = arCtx.t('total', 'Total');
      expect(joined).toContain('Total');
      expect(joined).toContain('|');
    });
  });
});
