/** Supabase-bound fetch that assembles ReportData for a document_instance. */
import { supabase } from './supabaseClient';
import type { ReportData } from './pdf/documents/ReportDocument';
import { mapInstanceToReportData } from './documentInstanceData';
import { getDocumentInstance, getDocumentInstanceSections } from './documentInstanceService';
import { getOrCreateCompanySettings, type CompanySettings } from './companySettingsService';
import { resolveSignatureBlocks } from './documentSignatureService';

export async function fetchInstanceReportData(instanceId: string): Promise<ReportData> {
  const instance = await getDocumentInstance(instanceId);
  if (!instance) throw new Error('Document instance not found');
  const sections = await getDocumentInstanceSections(instanceId);

  const caseCtx = instance.case_id ? await fetchCaseContext(instance.case_id) : {};
  const companySettingsRaw = await getOrCreateCompanySettings();
  const companySettings = mapCompanySettingsToReportData(companySettingsRaw);
  const signatureBlocks = await resolveSignatureBlocks(instanceId);

  return mapInstanceToReportData(
    instance,
    sections.map((s) => ({
      section_key: s.section_key,
      title: s.title,
      content: s.content,
      sort_order: s.sort_order,
      is_visible: s.is_visible,
    })),
    { ...caseCtx, companySettings, signatureBlocks },
  );
}

/** Map the service-layer CompanySettings to the PDF engine's ReportData['companySettings']. */
function mapCompanySettingsToReportData(cs: CompanySettings): ReportData['companySettings'] {
  return {
    basic_info: cs.basic_info
      ? {
          company_name: cs.basic_info.company_name,
          legal_name: cs.basic_info.legal_name,
          registration_number: cs.basic_info.registration_number,
          vat_number: cs.basic_info.vat_number,
        }
      : undefined,
    location: cs.location
      ? {
          address_line1: cs.location.address_line1,
          address_line2: cs.location.address_line2,
          city: cs.location.city,
          state: cs.location.state,
          postal_code: cs.location.postal_code,
          country: cs.location.country,
          building_name: cs.location.building_name,
          unit_number: cs.location.unit_number,
        }
      : undefined,
    contact_info: cs.contact_info
      ? {
          phone_primary: cs.contact_info.phone_primary,
          email_general: cs.contact_info.email_general,
        }
      : undefined,
    branding: cs.branding
      ? {
          logo_url: cs.branding.logo_url,
          brand_tagline: cs.branding.brand_tagline,
          qr_code_general_url: cs.branding.qr_code_general_url,
          qr_code_general_caption: cs.branding.qr_code_general_caption,
        }
      : undefined,
    online_presence: cs.online_presence
      ? {
          website: cs.online_presence.website,
          facebook: cs.online_presence.facebook,
          twitter: cs.online_presence.twitter,
          linkedin: cs.online_presence.linkedin,
          instagram: cs.online_presence.instagram,
        }
      : undefined,
    legal_compliance: cs.legal_compliance
      ? {
          terms_conditions_url: cs.legal_compliance.terms_conditions_url,
        }
      : undefined,
    localization: cs.localization?.document_language_settings
      ? {
          document_language_settings: {
            mode: cs.localization.document_language_settings.mode,
            secondary_language: cs.localization.document_language_settings.secondary_language,
            language_name: cs.localization.document_language_settings.language_name,
          },
        }
      : undefined,
  };
}

/** Minimal case/customer/device/recoverability lookup for the report context. */
async function fetchCaseContext(caseId: string): Promise<Partial<ReportData>> {
  type CustomerEmbed = { customer_name: string | null; email: string | null; mobile_number: string | null } | null;
  type CompanyEmbed = { company_name: string | null } | null;
  type CaseWithEmbeds = {
    case_no: string | null;
    case_number: string | null;
    created_at: string;
    priority: string | null;
    client_reference: string | null;
    customers_enhanced: CustomerEmbed;
    companies: CompanyEmbed;
  };

  const { data: c } = await supabase
    .from('cases')
    .select('case_no, case_number, created_at, priority, client_reference, customers_enhanced!customer_id(customer_name, email, mobile_number), companies!company_id(company_name)')
    .eq('id', caseId)
    .maybeSingle<CaseWithEmbeds>();

  const cust = c?.customers_enhanced ?? null;
  const company = c?.companies ?? null;

  type DeviceWithEmbeds = {
    catalog_device_types: { name: string | null } | null;
    catalog_device_brands: { name: string | null } | null;
    model: string | null;
    serial_number: string | null;
    recovery_result: string | null;
  };

  const { data: devices } = await supabase
    .from('case_devices')
    .select('catalog_device_types!device_type_id(name), catalog_device_brands!brand_id(name), model, serial_number, recovery_result')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .overrideTypes<DeviceWithEmbeds[]>();

  const dev = devices?.[0];

  return {
    caseData: c
      ? {
          case_number: c.case_no ?? c.case_number ?? '',
          case_no: c.case_no ?? undefined,
          customer_name: cust?.customer_name ?? '',
          customer_email: cust?.email ?? undefined,
          created_at: c.created_at,
          priority: c.priority ?? undefined,
          client_reference: c.client_reference ?? undefined,
          company_name: company?.company_name ?? undefined,
        }
      : undefined,
    customerData: cust
      ? {
          customer_name: cust.customer_name ?? '',
          email: cust.email ?? undefined,
          mobile_number: cust.mobile_number ?? undefined,
          company_name: company?.company_name ?? undefined,
        }
      : undefined,
    deviceData: dev
      ? {
          device_type: dev.catalog_device_types?.name ?? undefined,
          brand: dev.catalog_device_brands?.name ?? undefined,
          model: dev.model ?? undefined,
          serial_number: dev.serial_number ?? undefined,
        }
      : undefined,
    recoverability: dev?.recovery_result ?? null,
  };
}
