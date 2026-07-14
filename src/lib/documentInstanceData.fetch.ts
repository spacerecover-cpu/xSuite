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
  const preparedByName = await fetchPreparedByName(instance.created_by ?? null);

  return mapInstanceToReportData(
    instance,
    sections.map((s) => ({
      section_key: s.section_key,
      title: s.title,
      content: s.content,
      sort_order: s.sort_order,
      is_visible: s.is_visible,
    })),
    { ...caseCtx, companySettings, signatureBlocks, ...(preparedByName ? { preparedByName } : {}) },
  );
}

/** The report author's display name (Technician row / provable footer context). */
async function fetchPreparedByName(createdBy: string | null): Promise<string | null> {
  if (!createdBy) return null;
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', createdBy)
    .maybeSingle<{ full_name: string | null }>();
  return data?.full_name ?? null;
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

/** Case/customer/device/custody/recoverability lookup for the report context. */
async function fetchCaseContext(caseId: string): Promise<Partial<ReportData>> {
  type CustomerEmbed = { customer_name: string | null; email: string | null; mobile_number: string | null } | null;
  type CompanyEmbed = { company_name: string | null } | null;
  type NameEmbed = { name: string | null } | null;
  type CaseWithEmbeds = {
    case_no: string | null;
    case_number: string | null;
    created_at: string;
    priority: string | null;
    client_reference: string | null;
    estimated_completion: string | null;
    customers_enhanced: CustomerEmbed;
    companies: CompanyEmbed;
    catalog_service_types: NameEmbed;
  };

  const { data: c } = await supabase
    .from('cases')
    .select('case_no, case_number, created_at, priority, client_reference, estimated_completion, customers_enhanced!customer_id(customer_name, email, mobile_number), companies!company_id(company_name), catalog_service_types!service_type_id(name)')
    .eq('id', caseId)
    .maybeSingle<CaseWithEmbeds>();

  const cust = c?.customers_enhanced ?? null;
  const company = c?.companies ?? null;

  type DeviceWithEmbeds = {
    catalog_device_types: NameEmbed;
    catalog_device_brands: NameEmbed;
    catalog_device_capacities: NameEmbed;
    catalog_device_interfaces: NameEmbed;
    catalog_device_conditions: NameEmbed;
    is_primary: boolean | null;
    model: string | null;
    serial_number: string | null;
    recovery_result: string | null;
  };

  // Primary (patient) device first, then earliest — the Device Information block
  // shows one device, and it must be the primary member, not whichever row was
  // created first. Recoverability, however, is aggregated across the whole array.
  const { data: devices } = await supabase
    .from('case_devices')
    .select('catalog_device_types!device_type_id(name), catalog_device_brands!brand_id(name), catalog_device_capacities!capacity_id(name), catalog_device_interfaces!interface_id(name), catalog_device_conditions!condition_id(name), is_primary, model, serial_number, recovery_result')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .overrideTypes<DeviceWithEmbeds[]>();

  const dev = devices?.[0];

  // Custody ledger → report timeline (forensic subtype renders it; the others
  // simply carry no custodyLog block). Append-only table, ordered by creation.
  type CustodyRow = {
    action: string;
    description: string | null;
    actor_name: string;
    created_at: string;
  };
  const { data: custody } = await supabase
    .from('chain_of_custody')
    .select('action, description, actor_name, created_at')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    // (created_at ASC, id ASC): a deterministic tiebreaker so tied-timestamp rows
    // (e.g. an intake DEVICE_RECEIVED trigger event + a case-level event written
    // in the same statement) get stable entry numbers that match the canonical
    // Chain-of-Custody PDF (fetchChainOfCustodyEntries, dataFetcher.ts).
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .overrideTypes<CustodyRow[]>();

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
          service_type: c.catalog_service_types?.name ?? undefined,
          estimated_completion: c.estimated_completion ?? undefined,
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
          capacity: dev.catalog_device_capacities?.name ?? undefined,
          interface: dev.catalog_device_interfaces?.name ?? undefined,
          condition: dev.catalog_device_conditions?.name ?? undefined,
        }
      : undefined,
    chainOfCustodyEvents:
      custody && custody.length > 0
        ? custody.map((e) => ({
            event_type: e.action,
            event_date: e.created_at,
            event_timestamp: e.created_at,
            event_description: e.description ?? undefined,
            actor: { full_name: e.actor_name },
          }))
        : undefined,
    recoverability: aggregateRecoverability((devices ?? []).map((d) => d.recovery_result)),
  };
}

type RecoverabilityCategory = 'recoverable' | 'partial' | 'unrecoverable' | 'pending' | 'other';

/** Normalize a device's free-form `recovery_result` into a coarse category. */
function classifyRecoverability(raw: string | null | undefined): RecoverabilityCategory | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('partial')) return 'partial';
  if (v.includes('unrecover') || v === 'none') return 'unrecoverable';
  if (v.includes('recover') || v === 'full') return 'recoverable';
  if (v.includes('pending') || v.includes('donor')) return 'pending';
  return 'other';
}

/**
 * Case-level recoverability aggregated across EVERY device — a multi-device job
 * (a RAID array or multi-drive case) must never inherit one member's outcome. A
 * mix of recovered + lost members, or any explicitly-partial member, reports as
 * partial. Returns a canonical label that {@link recoverabilityLabel} renders,
 * the raw value when the vocabulary is unrecognised, or null when nothing is
 * assessed (donors/pre-diagnosis devices carry no `recovery_result`).
 */
export function aggregateRecoverability(results: Array<string | null | undefined>): string | null {
  const entries = results
    .map((raw) => ({ raw: raw ?? null, cat: classifyRecoverability(raw) }))
    .filter((e): e is { raw: string | null; cat: RecoverabilityCategory } => e.cat !== null);
  if (entries.length === 0) return null;

  const cats = new Set(entries.map((e) => e.cat));
  const hasRecoverable = cats.has('recoverable');
  const hasUnrecoverable = cats.has('unrecoverable');

  // Some data saved AND some lost, or an explicitly-partial member → partial.
  if (cats.has('partial') || (hasRecoverable && hasUnrecoverable)) return 'Partially Recoverable';

  if (cats.size === 1) {
    switch (entries[0].cat) {
      case 'recoverable': return 'Recoverable';
      case 'unrecoverable': return 'Unrecoverable';
      case 'pending': return 'Pending';
      case 'other': return entries[0].raw; // unknown vocabulary — preserve as-is
    }
  }

  // A single determined outcome alongside pending/unknown members reports that
  // outcome; anything still outstanding is Pending.
  if (hasRecoverable) return 'Recoverable';
  if (hasUnrecoverable) return 'Unrecoverable';
  return 'Pending';
}
