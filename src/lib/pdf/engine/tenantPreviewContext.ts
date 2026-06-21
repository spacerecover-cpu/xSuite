/**
 * buildTenantPreviewContext — derive the engine {@link TranslationContext} from a
 * tenant's document-language settings, EXACTLY the way the document generators do.
 *
 * `pdfService.generate*` reads `companySettings.localization.document_language_settings`
 * and builds `createTranslationContext(mode, secondary_language)`. The Studio
 * preview, by contrast, rendered with a hard-coded English context
 * (`PREVIEW_CTX_EN`) and never applied the tenant language — so the preview's
 * language could not match the generated PDF (an English-only tenant could see a
 * bilingual preview, or vice-versa).
 *
 * Pair this with {@link applyTenantLanguage}` (which sets the config's `language`):
 * together they reproduce the generator's language path so the preview predicts
 * real output. Pure — no I/O.
 */
import { createTranslationContext } from '../translationContext';
import type { CompanySettingsData, TranslationContext } from '../types';
import type { LanguageCode } from '../../documentTranslations';

export function buildTenantPreviewContext(
  companySettings: CompanySettingsData,
): TranslationContext {
  const settings = companySettings.localization?.document_language_settings;
  const languageCode = (settings?.secondary_language as LanguageCode) || null;
  const mode = (settings?.mode || 'english_only') as 'english_only' | 'bilingual';
  return createTranslationContext(mode, languageCode);
}
