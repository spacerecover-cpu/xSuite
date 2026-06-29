import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { quotesService } from '@/lib/quotesService';
import { invoiceService } from '@/lib/invoiceService';
import { getCaseFinancialSummary } from '@/lib/caseFinanceService';
import { logger } from '../../../lib/logger';
import { listDocumentInstances } from '../../../lib/documentInstanceService';
import { documentInstanceKeys } from '../../../lib/queryKeys';

/** Extracted so the query fn is unit-testable without a React render. */
export async function fetchCaseDocuments(caseId: string | undefined) {
  if (!caseId) return [];
  return listDocumentInstances(caseId);
}

export function useCaseQueries(id: string | undefined) {
  const { data: caseData, isLoading, error: caseError } = useQuery({
    queryKey: ['case', id],
    queryFn: async () => {
      if (!id) throw new Error('Case id is required');
      const { data: caseRecord, error } = await supabase
        .from('cases')
        .select(`
          id,
          case_no,
          case_number,
          title,
          subject,
          priority,
          status,
          status_id,
          client_reference,
          created_at,
          updated_at,
          customer_id,
          contact_id,
          service_type_id,
          created_by,
          updated_by,
          assigned_engineer_id,
          assigned_to,
          company_id
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching case:', error);
        throw error;
      }
      if (!caseRecord) {
        throw new Error(`Case ${id} not found`);
      }

      const [customerData, contactData, serviceTypeData, createdByData, assignedEngineerData, companyData, updatedByData] = await Promise.all([
        caseRecord.customer_id
          ? supabase
              .from('customers_enhanced')
              .select('id, customer_number, customer_name, email, mobile_number, phone, address, country_id, city_id, geo_countries(name), geo_cities(name)')
              .eq('id', caseRecord.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        caseRecord.contact_id
          ? supabase
              .from('customers_enhanced')
              .select('id, customer_name, email, mobile_number, phone')
              .eq('id', caseRecord.contact_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        caseRecord.service_type_id
          ? supabase
              .from('catalog_service_types')
              .select('id, name')
              .eq('id', caseRecord.service_type_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        caseRecord.created_by
          ? supabase
              .from('profiles')
              .select('id, full_name')
              .eq('id', caseRecord.created_by)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        caseRecord.assigned_engineer_id
          ? supabase
              .from('profiles')
              .select('id, full_name')
              .eq('id', caseRecord.assigned_engineer_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        (async () => {
          if (caseRecord.company_id) {
            return supabase
              .from('companies')
              .select('id, company_number, name, company_name, email, phone, tax_number, geo_countries(name), geo_cities(name)')
              .eq('id', caseRecord.company_id)
              .maybeSingle();
          } else if (caseRecord.customer_id) {
            const { data: relationship, error: relError } = await supabase
              .from('customer_company_relationships')
              .select(`
                company_id,
                companies (
                  id, company_number, name, company_name, email, phone, tax_number, geo_countries(name), geo_cities(name)
                )
              `)
              .eq('customer_id', caseRecord.customer_id)
              .is('deleted_at', null)
              .order('is_primary', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (relError) {
              return { data: null, error: relError };
            }
            return { data: relationship?.companies || null, error: null };
          }
          return Promise.resolve({ data: null });
        })(),
        caseRecord.updated_by
          ? supabase
              .from('profiles')
              .select('id, full_name')
              .eq('id', caseRecord.updated_by)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const result = {
        ...caseRecord,
        customer: customerData.data,
        contact: contactData.data,
        service_type: serviceTypeData.data,
        created_by_profile: createdByData.data,
        assigned_engineer: assignedEngineerData.data,
        company: companyData.data,
        updated_by_profile: updatedByData.data,
      };

      return result;
    },
    enabled: !!id,
  });

  const { data: caseStatuses = [] } = useQuery({
    queryKey: ['case_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_statuses')
        .select('id, name, type, color, is_active')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      return data || [];
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['case_devices', id],
    queryFn: async () => {
      if (!id) return [];
      // Removed profiles!created_by FK join (no FK constraint exists).
      // Catalog joins are kept because their FKs are present in the DB.
      const { data, error } = await supabase
        .from('case_devices')
        .select(`
          id,
          model,
          serial_number,
          symptoms,
          notes,
          password,
          device_type_id,
          capacity_id,
          accessories,
          device_role_id,
          is_primary,
          role_notes,
          created_at,
          checked_out_at,
          created_by,
          device_type:catalog_device_types(id, name),
          brand:catalog_device_brands(name),
          capacity:catalog_device_capacities(id, name),
          condition:catalog_device_conditions(name),
          encryption_type:catalog_device_encryption(name),
          device_role:catalog_device_roles(id, name)
        `)
        .eq('case_id', id)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
        .order('created_at');

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: cloneDrives = [] } = useQuery({
    queryKey: ['clone_drives', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('clone_drives')
        .select(`
          id,
          case_id,
          device_id,
          drive_label,
          serial_number,
          capacity,
          status,
          assigned_to,
          notes,
          created_at,
          updated_at,
          storage_path,
          storage_server,
          storage_type,
          image_format,
          image_size_gb,
          expected_size_gb,
          clone_date,
          cloned_by,
          cloned_by_name,
          delivered_date,
          delivered_by,
          delivered_by_name,
          delivery_notes,
          extracted_date,
          extracted_by,
          archived_date,
          archived_by,
          retention_days,
          retention_deadline,
          preserve_reason,
          preserved_by,
          preserved_date,
          resource_clone_drive_id,
          physical_location_id
        `)
        .eq('case_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['case_attachments', id],
    queryFn: async () => {
      if (!id) return [];
      // FK profiles!uploaded_by join removed (no FK constraint).
      const { data, error } = await supabase
        .from('case_attachments')
        .select(`
          id,
          file_name,
          file_url,
          file_size,
          file_type,
          category,
          description,
          uploaded_by,
          created_at
        `)
        .eq('case_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes', 'case', id],
    queryFn: async () => {
      if (!id) return [];
      return await quotesService.getQuotesByCaseId(id);
    },
    enabled: !!id,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', 'case', id],
    queryFn: async () => {
      if (!id) return [];
      return await invoiceService.getInvoicesByCaseId(id);
    },
    enabled: !!id,
  });

  const { data: caseFinancialSummary } = useQuery({
    queryKey: ['case_financial_summary', id],
    queryFn: async () => {
      if (!id) return null;
      return await getCaseFinancialSummary(id);
    },
    enabled: !!id,
  });

  const { data: documentInstances = [] } = useQuery({
    queryKey: documentInstanceKeys.byCase(id ?? ''),
    queryFn: () => fetchCaseDocuments(id),
    enabled: !!id,
  });

  const { data: caseEngineers = [] } = useQuery({
    queryKey: ['case_engineers', id],
    queryFn: async () => {
      if (!id) return [];
      // FK profiles!user_id join removed (no FK constraint).
      const { data, error } = await supabase
        .from('case_engineers')
        .select(`
          id,
          user_id,
          role_text,
          created_at
        `)
        .eq('case_id', id)
        .order('created_at');

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: portalSettings } = useQuery({
    queryKey: ['case_portal_visibility', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('case_portal_visibility')
        .select('*')
        .eq('case_id', id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['case_notes', id],
    queryFn: async () => {
      if (!id) return [];
      // FK profiles!created_by join removed (no FK constraint).
      const { data, error } = await supabase
        .from('case_internal_notes')
        .select(`
          id,
          content,
          created_by,
          created_at,
          updated_at,
          updated_by
        `)
        .eq('case_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['case_history', id],
    queryFn: async () => {
      if (!id) return [];
      // FK profiles!performed_by join removed (no FK constraint).
      const { data, error } = await supabase
        .from('case_job_history')
        .select(`
          id,
          action,
          details,
          performed_by,
          created_at
        `)
        .eq('case_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  return {
    caseData,
    isLoading,
    caseError,
    caseStatuses,
    devices,
    cloneDrives,
    attachments,
    quotes,
    invoices,
    caseFinancialSummary,
    documentInstances,
    caseEngineers,
    portalSettings,
    notes,
    history,
  };
}
