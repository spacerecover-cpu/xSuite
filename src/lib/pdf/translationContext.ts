import { getFontFamily } from './fonts';
import type { TranslationContext } from './types';
import {
  getTranslation,
  isRTLLanguage,
  formatBilingualText,
  type LanguageCode,
  type TranslationKey,
} from '../documentTranslations';

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
