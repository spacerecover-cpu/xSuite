import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import {
  getTranslation,
  isRTLLanguage,
  formatBilingualText,
  type LanguageCode,
  type TranslationKey,
  type DocumentLanguageMode,
} from '../lib/documentTranslations';

interface DocumentLanguageSettings {
  mode: DocumentLanguageMode;
  secondary_language: LanguageCode | null;
  language_name: string | null;
}

interface UseDocumentTranslationsReturn {
  t: (key: TranslationKey, englishText: string) => string;
  isRTL: boolean;
  isBilingual: boolean;
  languageCode: LanguageCode | null;
  isLoading: boolean;
  isReady: boolean;
  hasError: boolean;
  errorMessage: string | null;
}

const TRANSLATION_TIMEOUT = 10000;

export function useDocumentTranslations(): UseDocumentTranslationsReturn {
  const [settings, setSettings] = useState<DocumentLanguageSettings>({
    mode: 'english_only',
    secondary_language: null,
    language_name: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const fetchLanguageSettings = async () => {
      try {
        setIsLoading(true);
        setHasError(false);
        setErrorMessage(null);
        setIsReady(false);

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Translation loading timeout after 10 seconds'));
          }, TRANSLATION_TIMEOUT);
        });

        const fetchPromise = supabase
          .from('company_settings')
          .select('localization')
          .limit(1)
          .maybeSingle();

        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

        clearTimeout(timeoutId);

        if (error) {
          logger.error('Error fetching language settings:', error);
          setHasError(true);
          setErrorMessage('Failed to load translation settings from database');
          setIsReady(false);
        } else {
          const localization = data?.localization as { document_language_settings?: DocumentLanguageSettings } | null | undefined;
          if (localization?.document_language_settings) {
            setSettings(localization.document_language_settings);
            setIsReady(true);
            setHasError(false);
          } else {
            setIsReady(true);
            setHasError(false);
          }
        }
      } catch (error) {
        logger.error('Error fetching language settings:', error);
        setHasError(true);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load translations');
        setIsReady(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLanguageSettings();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const t = (key: TranslationKey, englishText: string): string => {
    if (settings.mode === 'english_only' || !settings.secondary_language) {
      return englishText;
    }

    const translatedText = getTranslation(key, settings.secondary_language);
    const isRTL = isRTLLanguage(settings.secondary_language);
    return formatBilingualText(englishText, translatedText, isRTL);
  };

  return {
    t,
    isRTL: isRTLLanguage(settings.secondary_language),
    isBilingual: settings.mode === 'bilingual',
    languageCode: settings.secondary_language,
    isLoading,
    isReady,
    hasError,
    errorMessage,
  };
}
