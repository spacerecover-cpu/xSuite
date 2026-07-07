import { initializePDFFonts, createPdfWithFonts } from './pdf/fonts';
import { loadImageAsBase64 } from './pdf/utils';
import { withTimeout, createTranslationContext, ctxFromLanguageConfig } from './pdf/translationContext';
import { logger } from './logger';
import { type LanguageCode } from './documentTranslations';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { TranslationContext } from './pdf/types';
import { renderTemplate } from './pdf/engine/renderTemplate';
import { resolveQrImage } from './pdf/qrImage';
import { applyTenantLanguage } from './pdf/engine/applyTenantLanguage';
import {
  toEngineData as toReportEngineData,
  reportConfigForSubtype,
} from './pdf/engine/adapters/reportAdapter';
import {
  resolveTemplateConfig,
  resolveSecondary,
  reportTemplateKey,
  type DocumentTemplateConfig,
  type TemplateConfigOverride,
} from './pdf/templateConfig';
import { getDeployedVersionByType, readConfig } from './documentTemplateService';
import { fetchInstanceReportData } from './documentInstanceData.fetch';
import type { ReportData } from './pdf/documents/ReportDocument';

const PDF_GENERATION_TIMEOUT = 45000; // 45 seconds

export interface PDFGenerationResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

export interface PDFBlobResult {
  success: boolean;
  blobUrl?: string;
  blob?: Blob;
  filename?: string;
  error?: string;
  errorCode?: string;
}

class ReportPDFService {
  /**
   * Build the report pdfmake doc-definition via the NEW config-driven engine.
   *
   * Resolves the tenant's deployed template for this report's TYPE (the
   * `report:<subtype>` storage key), falling back to the legacy shared `report`
   * template, as the doc-type cascade layer over the built-in per-subtype
   * default. With neither deployed it falls back to the built-in config.
   * Mirrors `buildInvoiceDocumentViaEngine` in `pdf/pdfService.ts`.
   */
  async buildReportDocViaEngine(
    data: ReportData,
    _ctx: TranslationContext,
    logoBase64: string | null,
    qrCodeBase64: string | null,
  ): Promise<TDocumentDefinitions> {
    let docTypeOverride: TemplateConfigOverride | undefined;
    try {
      const deployed =
        (await getDeployedVersionByType(reportTemplateKey(data.report.report_type))) ??
        (await getDeployedVersionByType('report'));
      if (deployed) {
        docTypeOverride = readConfig(deployed.config);
      }
    } catch (err) {
      logger.error('[Report PDF Service] Report engine: template resolution failed, using built-in default:', err);
    }

    const subtypeBase = reportConfigForSubtype(data.report.report_type);
    const resolvedConfig: DocumentTemplateConfig = resolveTemplateConfig(
      subtypeBase,
      /* theme */ undefined,
      /* docType */ docTypeOverride,
      /* instance */ undefined,
    );

    const languageAwareConfig = applyTenantLanguage(resolvedConfig, data.companySettings, docTypeOverride?.language !== undefined);

    const engineCtx = ctxFromLanguageConfig(languageAwareConfig.language);
    await initializePDFFonts(resolveSecondary(languageAwareConfig.language));

    const engineData = toReportEngineData(data, languageAwareConfig, engineCtx);
    const qr = await resolveQrImage(qrCodeBase64, engineData.zatcaPayload ?? engineData.qrPayload);
    return renderTemplate(languageAwareConfig, engineData, engineCtx, logoBase64, qr);
  }

  /**
   * Document Studio: render a document_instance to a PDF Blob, reusing the SAME
   * engine path as reports (buildReportDocViaEngine). Only the data source differs.
   */
  async generateDocumentInstanceAsBlob(instanceId: string): Promise<PDFBlobResult> {
    try {
      const data = await withTimeout(fetchInstanceReportData(instanceId), 10000, 'Failed to fetch document data');

      const languageSettings = data.companySettings.localization?.document_language_settings;
      let languageCode: LanguageCode | null = (languageSettings?.secondary_language as LanguageCode) || null;
      let mode: 'english_only' | 'bilingual' = languageSettings?.mode || 'english_only';

      const fontsLoaded = await withTimeout(initializePDFFonts(languageCode), 15000, 'Font initialization timeout');

      if (!fontsLoaded && languageCode) {
        logger.error(`[Report PDF Service] ${languageCode} fonts unavailable, falling back to English-only mode`);
        languageCode = null;
        mode = 'english_only';
      }

      const ctx = createTranslationContext(mode, languageCode);

      const [logoBase64, qrCodeBase64] = await Promise.all([
        data.companySettings.branding?.logo_url
          ? withTimeout(loadImageAsBase64(data.companySettings.branding.logo_url), 5000, 'Logo timeout')
          : Promise.resolve(null),
        data.companySettings.branding?.qr_code_general_url
          ? withTimeout(loadImageAsBase64(data.companySettings.branding.qr_code_general_url), 5000, 'QR timeout')
          : Promise.resolve(null),
      ]);

      const docDefinition = await this.buildReportDocViaEngine(data, ctx, logoBase64, qrCodeBase64);
      const filename = `Document_${data.report.report_number || 'Draft'}_${new Date().toISOString().split('T')[0]}.pdf`;

      const blob = await withTimeout(
        new Promise<Blob>((resolve, reject) => {
          createPdfWithFonts(docDefinition).getBlob((b: Blob) => resolve(b), undefined, (err: unknown) => reject(err));
        }),
        PDF_GENERATION_TIMEOUT,
        'PDF blob generation timeout',
      );
      return { success: true, blob, blobUrl: URL.createObjectURL(blob), filename };
    } catch (error) {
      logger.error('[Report PDF Service] generateDocumentInstanceAsBlob failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const reportPDFService = new ReportPDFService();
