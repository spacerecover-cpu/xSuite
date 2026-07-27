/**
 * Language-conditional fallback for a field the source record does not carry
 * (audit finding **TBL-10**).
 *
 * ## The defect
 *
 * Every adapter defaulted a missing party name / phone / email to the literal
 * `'N/A'`. Party VALUES — unlike party LABELS — never pass through the
 * bilingual join (`LabelText` → `secondaryText`), so that Latin abbreviation
 * printed verbatim inside an otherwise Arabic (or French, Korean, Thai…) field
 * block. `'N/A'` is an English abbreviation of "not available", not a universal
 * symbol; the em dash is.
 *
 * ## Why not `ctx.t`
 *
 * The audit suggested routing the fallback through the engine's translation
 * context. That does **not** work here, and the reason is worth recording so it
 * is not re-attempted: `ctx.t(key, en)` returns
 * `formatBilingualText(en, translated)` — i.e. the CONCATENATION `"N/A | …"`,
 * not a replacement. That shape is right for a label ("Total | الإجمالي") and
 * wrong for a value cell, where it would leave the Latin `N/A` on the page
 * anyway — the exact symptom TBL-10 describes. On top of that,
 * `DOCUMENT_TRANSLATIONS` has no `notAvailable` key, so `ctx.t` is a literal
 * no-op today. The em dash — the alternative the finding itself offers — is
 * therefore the correct fix for every adapter, whether or not it holds a `ctx`.
 *
 * ## Parity
 *
 * The switch is **direction-conditional**, never unconditional: a config that
 * renders English-only (`mode: 'en'`, or no `language` block at all) keeps the
 * historical `'N/A'` byte-for-byte, so unconfigured/English documents are
 * unchanged. Only a document that already carries a secondary language — which
 * is precisely the document the finding is about — switches to the neutral
 * glyph.
 *
 * The predicate mirrors `ctxFromLanguageConfig`'s own definition of bilingual
 * (`mode !== 'en' && resolveSecondary(...) !== null`) rather than inventing a
 * second one, so the fallback can never disagree with the rest of the engine
 * about whether a document is bilingual.
 */

import { resolveSecondary, type LanguageConfig } from '../../templateConfig';

/** The historical English fallback. Retained for English-only documents. */
export const LEGACY_MISSING_VALUE = 'N/A';

/** U+2014 EM DASH — carries "no value" in every script the engine ships fonts for. */
export const NEUTRAL_MISSING_VALUE = '—';

/**
 * Pick the "value not available" placeholder for a document's language.
 *
 * @param language The resolved `config.language`. `undefined`/`null` is treated
 *   as English-only — adapters are called with partial config literals in tests
 *   and from legacy call sites, and those must not silently change output.
 */
export function missingValue(language: LanguageConfig | null | undefined): string {
  if (!language) return LEGACY_MISSING_VALUE;
  if (language.mode === 'en') return LEGACY_MISSING_VALUE;
  return resolveSecondary(language) === null ? LEGACY_MISSING_VALUE : NEUTRAL_MISSING_VALUE;
}
