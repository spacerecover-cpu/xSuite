import { getFontFamily } from './fonts';
import type { TranslationContext } from './types';
import {
  getTranslation,
  isRTLLanguage,
  formatBilingualText,
  type LanguageCode,
  type TranslationKey,
} from '../documentTranslations';
import { resolveSecondary, type LanguageConfig } from './templateConfig';

// Shared by the two PDF orchestrators (pdfService and reportPDFService), which
// previously each carried a byte-identical private copy of both helpers.

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${errorMessage} (timeout after ${timeoutMs}ms)`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export function createTranslationContext(
  mode: 'english_only' | 'bilingual',
  languageCode: LanguageCode | null
): TranslationContext {
  const isRTL = languageCode ? isRTLLanguage(languageCode) : false;
  const isBilingual = mode === 'bilingual' && languageCode !== null;
  const fontFamily = getFontFamily(languageCode);

  const t = (key: string, englishText: string): string => {
    if (!isBilingual || !languageCode) return englishText;
    const translated = getTranslation(key as TranslationKey, languageCode);
    return formatBilingualText(englishText, translated, isRTL);
  };

  return {
    t,
    isRTL,
    isBilingual,
    languageCode,
    fontFamily,
  };
}

/**
 * Build the {@link TranslationContext} from a RESOLVED per-template
 * {@link LanguageConfig}, so the per-template language drives BOTH layout (via
 * `config.language`) AND translation (via `ctx`). This is the generalized
 * counterpart to {@link createTranslationContext}, which is built from the
 * tenant-only `document_language_settings` and only ever knew Arabic.
 *
 * Semantics mirror `createTranslationContext` exactly:
 *  - `isBilingual` = the config is not English-only (`mode !== 'en'`);
 *  - `languageCode` = the resolved secondary (Arabic for legacy configs that set
 *    no `secondary`, any of the 13 otherwise);
 *  - `isRTL` / `fontFamily` derive from that secondary;
 *  - `t(key, en)` returns English when not bilingual, else "EN | <secondary>".
 *
 * The `build*ViaEngine` orchestrators call this AFTER `applyTenantLanguage`, so
 * the resolved config is the single source of truth for both halves.
 */
export function ctxFromLanguageConfig(language: LanguageConfig): TranslationContext {
  const languageCode = resolveSecondary(language);
  const isBilingual = language.mode !== 'en' && languageCode !== null;
  const isRTL = languageCode ? isRTLLanguage(languageCode) : false;
  const fontFamily = getFontFamily(languageCode);

  const t = (key: string, englishText: string): string => {
    if (!isBilingual || !languageCode) return englishText;
    const translated = getTranslation(key as TranslationKey, languageCode);
    return formatBilingualText(englishText, translated, isRTL);
  };

  return {
    t,
    isRTL,
    isBilingual,
    languageCode,
    fontFamily,
  };
}
