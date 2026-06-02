import { supabase } from './supabaseClient';
import { initializePDFFonts, createPdfWithFonts } from './pdf/fonts';
import { buildReportDocument, type ReportData } from './pdf/documents/ReportDocument';
import { loadImageAsBase64 } from './pdf/utils';
import { logPDFGeneration } from './pdf/loggingService';
import { withTimeout, createTranslationContext } from './pdf/translationContext';
import { logger } from './logger';
import type { Database, Json } from '../types/database.types';
import { type LanguageCode } from './documentTranslations';

type CaseReportRow = Database['public']['Tables']['case_reports']['Row'];
type CaseReportSectionRow = Database['public']['Tables']['case_report_sections']['Row'];
type DeviceDiagnosticsRow = Database['public']['Tables']['device_diagnostics']['Row'];
type ChainOfCustodyRow = Database['public']['Tables']['chain_of_custody']['Row'];
type CompanySettingsRow = Database['public']['Tables']['company_settings']['Row'];

type JsonObject = { [k: string]: Json | undefined };

function isJsonObject(value: Json | null | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(obj: JsonObject | null, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === 'string' ? v : undefined;
}

function readNumber(obj: JsonObject | null, key: string): number | undefined {
  const v = obj?.[key];
  return typeof v === 'number' ? v : undefined;
}

function mapDiagnosticsRow(row: DeviceDiagnosticsRow): ReportData['diagnosticsData'] {
  const result: JsonObject | null = isJsonObject(row.result) ? row.result : null;
  return {
    device_type_category: readString(result, 'device_type_category'),
    heads_status: readString(result, 'heads_status'),
    pcb_status: readString(result, 'pcb_status'),
    motor_status: readString(result, 'motor_status'),
    surface_status: readString(result, 'surface_status'),
    controller_status: readString(result, 'controller_status'),
    memory_chips_status: readString(result, 'memory_chips_status'),
    controller_model: readString(result, 'controller_model'),
    nand_type: readString(result, 'nand_type'),
    physical_damage_notes: readString(result, 'physical_damage_notes') ?? row.notes ?? undefined,
  };
}

function readJsonObject(value: Json | null | undefined): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

function mapCompanySettingsRow(row: CompanySettingsRow): ReportData['companySettings'] {
  const basicInfo = readJsonObject(row.basic_info);
  const location = readJsonObject(row.location);
  const contactInfo = readJsonObject(row.contact_info);
  const branding = readJsonObject(row.branding);
  const onlinePresence = readJsonObject(row.online_presence);
  const legalCompliance = readJsonObject(row.legal_compliance);
  const localization = readJsonObject(row.localization);

  const langSettingsRaw = localization?.['document_language_settings'];
  const langSettings = isJsonObject(langSettingsRaw) ? langSettingsRaw : null;
  const modeValue = readString(langSettings, 'mode');
  const mode: 'english_only' | 'bilingual' =
    modeValue === 'bilingual' ? 'bilingual' : 'english_only';

  return {
    basic_info: basicInfo
      ? {
          company_name: readString(basicInfo, 'company_name'),
          legal_name: readString(basicInfo, 'legal_name'),
          registration_number: readString(basicInfo, 'registration_number'),
          vat_number: readString(basicInfo, 'vat_number'),
        }
      : undefined,
    location: location
      ? {
          address_line1: readString(location, 'address_line1'),
          address_line2: readString(location, 'address_line2'),
          city: readString(location, 'city'),
          state: readString(location, 'state'),
          postal_code: readString(location, 'postal_code'),
          country: readString(location, 'country'),
          building_name: readString(location, 'building_name'),
          unit_number: readString(location, 'unit_number'),
        }
      : undefined,
    contact_info: contactInfo
      ? {
          phone_primary: readString(contactInfo, 'phone_primary'),
          email_general: readString(contactInfo, 'email_general'),
        }
      : undefined,
    branding: branding
      ? {
          logo_url: readString(branding, 'logo_url'),
          brand_tagline: readString(branding, 'brand_tagline'),
          qr_code_general_url: readString(branding, 'qr_code_general_url'),
          qr_code_general_caption: readString(branding, 'qr_code_general_caption'),
        }
      : undefined,
    online_presence: onlinePresence
      ? {
          website: readString(onlinePresence, 'website'),
          facebook: readString(onlinePresence, 'facebook'),
          twitter: readString(onlinePresence, 'twitter'),
          linkedin: readString(onlinePresence, 'linkedin'),
          instagram: readString(onlinePresence, 'instagram'),
        }
      : undefined,
    legal_compliance: legalCompliance
      ? {
          terms_conditions_url: readString(legalCompliance, 'terms_conditions_url'),
        }
      : undefined,
    localization: langSettings
      ? {
          document_language_settings: {
            mode,
            secondary_language: readString(langSettings, 'secondary_language') ?? null,
            language_name: readString(langSettings, 'language_name') ?? null,
          },
        }
      : undefined,
  };
}

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
   * Generate report PDF using pdfmake for consistent styling with receipts
   */
  async generateReportPDF(reportId: string, download: boolean = true): Promise<PDFGenerationResult> {
    const startTime = Date.now();
    let languageCode: LanguageCode | null = null;
    let mode: 'english_only' | 'bilingual' = 'english_only';
    let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

    try {
      const data = await withTimeout(
        this.fetchReportData(reportId),
        10000,
        'Failed to fetch report data'
      );

      const languageSettings = data.companySettings.localization?.document_language_settings;
      languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
      mode = languageSettings?.mode || 'english_only';

      const fontsLoaded = await withTimeout(
        initializePDFFonts(languageCode),
        15000,
        'Font initialization timeout'
      );

      if (!fontsLoaded && languageCode) {
        logger.error(`[Report PDF Service] ${languageCode} fonts unavailable, falling back to English-only mode`);
        languageCode = null;
        mode = 'english_only';
        fontSource = 'fallback';
      }

      const ctx = createTranslationContext(mode, languageCode);

      const [logoBase64, qrCodeBase64] = await Promise.all([
        data.companySettings.branding?.logo_url
          ? withTimeout(
              loadImageAsBase64(data.companySettings.branding.logo_url),
              5000,
              'Logo loading timeout'
            )
          : Promise.resolve(null),
        data.companySettings.branding?.qr_code_general_url
          ? withTimeout(
              loadImageAsBase64(data.companySettings.branding.qr_code_general_url),
              5000,
              'QR code loading timeout'
            )
          : Promise.resolve(null),
      ]);

      const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

      const docDefinition = buildReportDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);

      const filename = `Report_${data.report.report_number || 'Draft'}_${new Date().toISOString().split('T')[0]}.pdf`;

      if (download) {
        createPdfWithFonts(docDefinition).download(filename);
      } else {
        createPdfWithFonts(docDefinition).open();
      }

      const duration = Date.now() - startTime;

      await logPDFGeneration({
        caseId: data.report.case_id,
        documentType: 'report',
        languageCode,
        mode,
        success: true,
        durationMs: duration,
        fontSource,
      });

      return { success: true };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate report';
      const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';

      logger.error('[Report PDF Service] Error generating report:', error);

      await logPDFGeneration({
        caseId: reportId,
        documentType: 'report',
        languageCode,
        mode,
        success: false,
        durationMs: duration,
        errorMessage,
        errorCode,
        fontSource,
      });

      return {
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  async generateReportAsBlob(reportId: string): Promise<PDFBlobResult> {
    const startTime = Date.now();
    let languageCode: LanguageCode | null = null;
    let mode: 'english_only' | 'bilingual' = 'english_only';
    let fontSource: 'local' | 'cdn' | 'fallback' = 'local';

    try {

      const data = await withTimeout(
        this.fetchReportData(reportId),
        10000,
        'Failed to fetch report data'
      );

      const languageSettings = data.companySettings.localization?.document_language_settings;
      languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
      mode = languageSettings?.mode || 'english_only';

      const fontsLoaded = await withTimeout(
        initializePDFFonts(languageCode),
        15000,
        'Font initialization timeout'
      );

      if (!fontsLoaded && languageCode) {
        logger.error(`[Report PDF Service] ${languageCode} fonts unavailable, falling back to English-only mode`);
        languageCode = null;
        mode = 'english_only';
        fontSource = 'fallback';
      }

      const ctx = createTranslationContext(mode, languageCode);

      const [logoBase64, qrCodeBase64] = await Promise.all([
        data.companySettings.branding?.logo_url
          ? withTimeout(
              loadImageAsBase64(data.companySettings.branding.logo_url),
              5000,
              'Logo loading timeout'
            )
          : Promise.resolve(null),
        data.companySettings.branding?.qr_code_general_url
          ? withTimeout(
              loadImageAsBase64(data.companySettings.branding.qr_code_general_url),
              5000,
              'QR code loading timeout'
            )
          : Promise.resolve(null),
      ]);

      const qrCodeCaption = data.companySettings.branding?.qr_code_general_caption || 'Scan for more information';

      const docDefinition = buildReportDocument(data, ctx, logoBase64, qrCodeBase64, qrCodeCaption);
      const filename = `Report_${data.report.report_number || 'Draft'}_${new Date().toISOString().split('T')[0]}.pdf`;

      const blobPromise = new Promise<{ blobUrl: string; blob: Blob }>((resolve, reject) => {
        try {
          const pdf = createPdfWithFonts(docDefinition);

          pdf.getBlob((blob: Blob) => {
            const blobUrl = URL.createObjectURL(blob);
            resolve({ blobUrl, blob });
          }, undefined, (err: any) => {
            logger.error('[Report PDF Service] Error in getBlob callback:', err);
            reject(err);
          });
        } catch (error) {
          logger.error('[Report PDF Service] Error creating PDF:', error);
          reject(error);
        }
      });

      const { blobUrl, blob } = await withTimeout(
        blobPromise,
        PDF_GENERATION_TIMEOUT,
        'PDF blob generation timeout'
      );

      const duration = Date.now() - startTime;

      await logPDFGeneration({
        caseId: data.report.case_id,
        documentType: 'report',
        languageCode,
        mode,
        success: true,
        durationMs: duration,
        fontSource,
      });

      return { success: true, blobUrl, blob, filename };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate report';
      const errorCode = error instanceof Error && error.message.includes('timeout') ? 'TIMEOUT' : 'GENERATION_FAILED';

      logger.error('[Report PDF Service] Error generating report blob:', error);

      await logPDFGeneration({
        caseId: reportId,
        documentType: 'report',
        languageCode,
        mode,
        success: false,
        durationMs: duration,
        errorMessage,
        errorCode,
        fontSource,
      });

      return {
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  private async fetchReportData(reportId: string): Promise<ReportData> {
    type ReportProfileEmbed = { full_name: string | null; email: string | null } | null;
    type CaseReportRowWithProfile = CaseReportRow & {
      created_by_profile?: ReportProfileEmbed;
    };

    const { data: reportRaw, error: reportError } = await supabase
      .from('case_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle<CaseReportRowWithProfile>();

    if (reportError || !reportRaw) {
      throw new Error('Failed to fetch report');
    }

    // case_reports.created_by FKs to auth.users (not profiles), so PostgREST cannot
    // embed it — fetch the creator profile separately.
    if (reportRaw.created_by) {
      const { data: createdByProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', reportRaw.created_by)
        .maybeSingle();
      reportRaw.created_by_profile = createdByProfile ?? null;
    }

    const reportContent: JsonObject | null = isJsonObject(reportRaw.content) ? reportRaw.content : null;
    const mappedReport: ReportData['report'] = {
      id: reportRaw.id,
      case_id: reportRaw.case_id,
      report_number: reportRaw.report_number ?? '',
      report_type: readString(reportContent, 'report_type') ?? 'evaluation',
      title: reportRaw.title,
      status: reportRaw.status ?? 'draft',
      version_number: readNumber(reportContent, 'version_number') ?? 1,
      created_at: reportRaw.created_at,
      created_by: reportRaw.created_by ?? undefined,
      approved_by: readString(reportContent, 'approved_by'),
      approved_at: readString(reportContent, 'approved_at'),
      version_notes: readString(reportContent, 'version_notes'),
    };
    const forensicChainOfCustodyId = readString(reportContent, 'forensic_chain_of_custody_id');

    const { data: sections } = await supabase
      .from('case_report_sections')
      .select('*')
      .eq('report_id', reportId)
      .order('sort_order');

    const mappedSections: ReportData['sections'] = (sections ?? []).map((row: CaseReportSectionRow) => ({
      id: row.id,
      section_key: row.section_type ?? '',
      section_title: row.title ?? '',
      section_content: row.content ?? '',
      section_order: row.sort_order ?? 0,
    }));

    type CatalogNameEmbed = { name: string | null } | null;
    type ProfileNameEmbed = { full_name: string | null } | null;
    type CustomerEmbed = {
      customer_name: string | null;
      email: string | null;
      mobile_number: string | null;
    } | null;
    type CompanyEmbed = { company_name: string | null } | null;
    type CaseRowWithEmbeds = {
      case_no: string | null;
      title: string | null;
      catalog_service_types: CatalogNameEmbed;
      priority: string | null;
      status: string | null;
      created_at: string;
      client_reference: string | null;
      customers_enhanced: CustomerEmbed;
      companies: CompanyEmbed;
      profiles: ProfileNameEmbed;
    };

    const { data: caseDataRaw, error: caseError } = await supabase
      .from('cases')
      .select(`
        case_no,
        title,
        catalog_service_types!service_type_id(name),
        priority,
        status,
        created_at,
        client_reference,
        customers_enhanced!customer_id(customer_name, email, mobile_number),
        companies!company_id(company_name),
        profiles!assigned_engineer_id(full_name)
      `)
      .eq('id', reportRaw.case_id)
      .maybeSingle<CaseRowWithEmbeds>();

    if (caseError) {
      logger.error('[Report PDF Service] Error fetching case data:', caseError);
    }

    // Get Patient device role ID
    const { data: patientRole } = await supabase
      .from('catalog_device_roles')
      .select('id')
      .eq('name', 'Patient')
      .maybeSingle();

    type CaseDeviceWithEmbeds = {
      id: string;
      catalog_device_types: CatalogNameEmbed;
      catalog_device_brands: CatalogNameEmbed;
      model: string | null;
      catalog_device_capacities: CatalogNameEmbed;
      serial_number: string | null;
      catalog_device_conditions: CatalogNameEmbed;
      device_role_id: number | null;
      is_primary: boolean | null;
    };

    // Get device data - filter by Patient role
    let deviceQuery = supabase
      .from('case_devices')
      .select(`
        id,
        catalog_device_types!device_type_id(name),
        catalog_device_brands!brand_id(name),
        model,
        catalog_device_capacities!capacity_id(name),
        serial_number,
        catalog_device_conditions!condition_id(name),
        device_role_id,
        is_primary
      `)
      .eq('case_id', reportRaw.case_id);

    if (patientRole?.id) {
      deviceQuery = deviceQuery.eq('device_role_id', patientRole.id);
    }

    const { data: devicesRaw, error: deviceError } = await deviceQuery
      .order('is_primary', { ascending: false })
      .limit(1)
      .overrideTypes<CaseDeviceWithEmbeds[]>();

    if (deviceError) {
      logger.error('[Report PDF Service] Error fetching device data:', deviceError);
    }

    let deviceData: ReportData['deviceData'] = undefined;
    let diagnosticsData: ReportData['diagnosticsData'] = undefined;

    if (devicesRaw && devicesRaw.length > 0) {
      const device = devicesRaw[0];
      deviceData = {
        device_type: device.catalog_device_types?.name ?? undefined,
        brand: device.catalog_device_brands?.name ?? undefined,
        model: device.model ?? undefined,
        capacity: device.catalog_device_capacities?.name ?? undefined,
        serial_number: device.serial_number ?? undefined,
        condition: device.catalog_device_conditions?.name ?? undefined,
      };

      // Load diagnostics — device_diagnostics.device_id references case_devices.id
      const { data: diagnostics } = await supabase
        .from('device_diagnostics')
        .select('*')
        .eq('device_id', device.id)
        .maybeSingle();

      if (diagnostics) {
        diagnosticsData = mapDiagnosticsRow(diagnostics);
      }
    }

    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('*')
      .maybeSingle();

    let chainOfCustodyEvents: ReportData['chainOfCustodyEvents'] = [];
    if (mappedReport.report_type === 'forensic' && forensicChainOfCustodyId) {
      type ChainOfCustodyRowWithActor = ChainOfCustodyRow & {
        actor?: ProfileNameEmbed;
      };

      const { data: cocEventsRaw } = await supabase
        .from('chain_of_custody')
        .select('*')
        .eq('case_id', reportRaw.case_id)
        .order('created_at', { ascending: true })
        .overrideTypes<ChainOfCustodyRow[]>();

      // chain_of_custody.actor_id FKs to auth.users (not profiles), so PostgREST
      // cannot embed it — resolve actor profiles via a separate lookup.
      const actorIds = [
        ...new Set((cocEventsRaw ?? []).map((row) => row.actor_id).filter((id): id is string => !!id)),
      ];
      const actorMap = new Map<string, ProfileNameEmbed>();
      if (actorIds.length > 0) {
        const { data: actorProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', actorIds);
        for (const profile of actorProfiles ?? []) {
          actorMap.set(profile.id, { full_name: profile.full_name });
        }
      }

      const cocEvents: ChainOfCustodyRowWithActor[] = (cocEventsRaw ?? []).map((row) => ({
        ...row,
        actor: row.actor_id ? actorMap.get(row.actor_id) ?? null : null,
      }));

      chainOfCustodyEvents = cocEvents.map((row): NonNullable<ReportData['chainOfCustodyEvents']>[number] => {
        const metadata: JsonObject | null = isJsonObject(row.metadata) ? row.metadata : null;
        return {
          event_type: row.action,
          event_date: row.created_at,
          event_timestamp: row.created_at,
          event_description: row.description ?? undefined,
          from_party: readString(metadata, 'from_party'),
          to_party: readString(metadata, 'to_party'),
          location: row.location ?? undefined,
          notes: readString(metadata, 'notes'),
          actor: row.actor ? { full_name: row.actor.full_name ?? undefined } : undefined,
        };
      });
    }

    const customer = caseDataRaw?.customers_enhanced ?? null;
    const company = caseDataRaw?.companies ?? null;
    const preparedByName =
      reportRaw.created_by_profile?.full_name ||
      reportRaw.created_by_profile?.email ||
      'N/A';

    const mappedCaseData: ReportData['caseData'] = caseDataRaw
      ? {
          case_number: caseDataRaw.case_no ?? '',
          case_no: caseDataRaw.case_no ?? undefined,
          customer_name: customer?.customer_name ?? 'Unknown',
          customer_email: customer?.email ?? undefined,
          customer_phone: customer?.mobile_number ?? undefined,
          customer_company: company?.company_name ?? undefined,
          company_name: company?.company_name ?? undefined,
          client_reference: caseDataRaw.client_reference ?? undefined,
          service_type: caseDataRaw.catalog_service_types?.name ?? undefined,
          assigned_engineer: caseDataRaw.profiles?.full_name ?? undefined,
          created_at: caseDataRaw.created_at,
        }
      : undefined;

    const mappedCustomerData: ReportData['customerData'] = customer
      ? {
          customer_name: customer.customer_name ?? 'Unknown',
          email: customer.email ?? undefined,
          mobile_number: customer.mobile_number ?? undefined,
          company_name: company?.company_name ?? undefined,
        }
      : undefined;

    const mappedCompanySettings: ReportData['companySettings'] = companySettings
      ? mapCompanySettingsRow(companySettings)
      : {
          basic_info: { company_name: 'Company Name' },
          location: {},
          contact_info: {},
          branding: {},
          online_presence: {},
          legal_compliance: {},
          localization: {
            document_language_settings: {
              mode: 'english_only',
              secondary_language: null,
              language_name: null,
            },
          },
        };

    return {
      report: mappedReport,
      sections: mappedSections,
      caseData: mappedCaseData,
      customerData: mappedCustomerData,
      deviceData,
      diagnosticsData,
      chainOfCustodyEvents,
      companySettings: mappedCompanySettings,
      preparedByName,
    };
  }

  async downloadReportPDF(reportId: string) {
    try {
      await this.generateReportPDF(reportId, true);
    } catch (error) {
      logger.error('Error downloading report PDF:', error);
      throw error;
    }
  }
}

export const reportPDFService = new ReportPDFService();
