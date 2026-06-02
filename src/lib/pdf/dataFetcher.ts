import { supabase } from '../supabaseClient';
import { getOrCreateCompanySettings } from '../companySettingsService';
import type {
  CaseData,
  DeviceData,
  CompanySettingsData,
  ReceiptData,
  QuoteData,
  QuoteDocumentData,
  InvoiceData,
  InvoiceDocumentData,
  PaymentReceiptData,
  PaymentReceiptDocumentData,
  PayslipData,
  PayslipDocumentData,
  ChainOfCustodyDocumentData,
  ChainOfCustodyEntryData,
} from './types';

export async function fetchReceiptData(caseId: string): Promise<ReceiptData> {
  const [caseResult, devicesResult, settingsResult] = await Promise.all([
    fetchCaseData(caseId),
    fetchCaseDevices(caseId),
    fetchCompanySettings(),
  ]);

  return {
    caseData: caseResult,
    devices: devicesResult,
    companySettings: settingsResult,
  };
}

async function fetchCaseData(caseId: string): Promise<CaseData> {
  const { data: caseData, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle();

  if (caseError) {
    console.error('Error fetching case data:', caseError);
    throw new Error('Failed to load case data');
  }

  if (!caseData) {
    throw new Error('Case not found');
  }

  const [customerData, companyData, serviceTypeData, technicianData, createdByData] = await Promise.all([
    caseData.customer_id
      ? supabase
          .from('customers_enhanced')
          .select('id, customer_name, email, mobile_number, phone')
          .eq('id', caseData.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.company_id
      ? supabase
          .from('companies')
          .select('id, name, company_name')
          .eq('id', caseData.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.service_type_id
      ? supabase
          .from('catalog_service_types')
          .select('id, name')
          .eq('id', caseData.service_type_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.assigned_engineer_id
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', caseData.assigned_engineer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseData.created_by
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', caseData.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    ...caseData,
    customer: customerData.data,
    company: companyData.data,
    service_type: serviceTypeData.data,
    assigned_technician: technicianData.data,
    created_by_profile: createdByData.data,
  } as CaseData;
}

async function fetchCaseDevices(caseId: string): Promise<DeviceData[]> {
  const { data, error } = await supabase
    .from('case_devices')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching case devices:', error);
    return [];
  }

  if (!data) return [];

  const isNonNullString = (v: string | null): v is string => v != null;
  const isNonNullNumber = (v: number | null): v is number => v != null;

  const deviceTypeIds = data.map(d => d.device_type_id).filter(isNonNullString);
  const brandIds = data.map(d => d.brand_id).filter(isNonNullString);
  const capacityIds = data.map(d => d.capacity_id).filter(isNonNullString);
  const deviceRoleIds = data.map(d => d.device_role_id).filter(isNonNullNumber);

  const [deviceTypes, brands, capacities, deviceRoles] = await Promise.all([
    deviceTypeIds.length > 0
      ? supabase.from('catalog_device_types').select('id, name').in('id', deviceTypeIds)
      : { data: [], error: null },
    brandIds.length > 0
      ? supabase.from('catalog_device_brands').select('id, name').in('id', brandIds)
      : { data: [], error: null },
    capacityIds.length > 0
      ? supabase.from('catalog_device_capacities').select('id, name').in('id', capacityIds)
      : { data: [], error: null },
    deviceRoleIds.length > 0
      ? supabase.from('catalog_device_roles').select('id, name').in('id', deviceRoleIds)
      : { data: [], error: null },
  ]);

  const deviceTypeMap = new Map((deviceTypes.data || []).map(dt => [dt.id, dt.name]));
  const brandMap = new Map((brands.data || []).map(b => [b.id, b.name]));
  const capacityMap = new Map((capacities.data || []).map(c => [c.id, c.name]));
  const roleMap = new Map((deviceRoles.data || []).map(role => [role.id, role.name]));

  return data.map(device => ({
    id: device.id,
    device_type: device.device_type_id ? deviceTypeMap.get(device.device_type_id) ?? undefined : undefined,
    brand: device.brand_id ? brandMap.get(device.brand_id) ?? undefined : undefined,
    model: device.model ?? undefined,
    serial_number: device.serial_number ?? undefined,
    capacity: device.capacity_id ? capacityMap.get(device.capacity_id) ?? undefined : undefined,
    condition: undefined,
    role: device.device_role_id ? roleMap.get(device.device_role_id) ?? undefined : undefined,
    notes: device.symptoms ?? (device.accessories ? device.accessories.join(', ') : undefined),
    device_problem: device.symptoms ?? undefined,
  }));
}

async function fetchCompanySettings(): Promise<CompanySettingsData> {
  try {
    const settings = await getOrCreateCompanySettings();
    return {
      basic_info: settings.basic_info,
      location: settings.location,
      contact_info: settings.contact_info,
      branding: settings.branding,
      online_presence: settings.online_presence,
      legal_compliance: settings.legal_compliance,
      localization: settings.localization,
    } as CompanySettingsData;
  } catch (error) {
    console.error('Error fetching company settings:', error);
    return {
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
  }
}

export async function fetchQuoteData(quoteId: string): Promise<QuoteDocumentData> {
  const [quoteResult, settingsResult] = await Promise.all([
    fetchQuoteDetails(quoteId),
    fetchCompanySettings(),
  ]);

  return {
    quoteData: quoteResult,
    companySettings: settingsResult,
  };
}

async function fetchQuoteDetails(quoteId: string): Promise<QuoteData> {
  const { data: quoteData, error: quoteError } = await supabase
    .from('quotes')
    .select(`
      *,
      cases:case_id (
        id,
        case_no,
        title
      ),
      customers:customers_enhanced (
        id,
        customer_name,
        email,
        mobile_number,
        phone,
        address,
        country_id,
        city_id,
        geo_countries(name),
        geo_cities(name)
      ),
      companies (
        id,
        name,
        company_name,
        email,
        phone,
        address
      ),
      created_by_profile:profiles!quotes_created_by_fkey (
        id,
        full_name
      )
    `)
    .eq('id', quoteId)
    .maybeSingle();

  if (quoteError) {
    console.error('Error fetching quote data:', quoteError);
    throw new Error('Failed to load quote data');
  }

  if (!quoteData) {
    throw new Error('Quote not found');
  }

  let customerAssociatedCompany = null;
  if (quoteData.customer_id) {
    const { data: relationshipData } = await supabase
      .from('customer_company_relationships')
      .select(`companies (id, name, company_name)`)
      .eq('customer_id', quoteData.customer_id)
      .eq('is_primary', true)
      .maybeSingle();

    if (relationshipData && relationshipData.companies) {
      customerAssociatedCompany = relationshipData.companies;
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching quote items:', itemsError);
  }

  const { data: defaultLocale } = await supabase
    .from('accounting_locales')
    .select('currency_symbol, currency_position, decimal_places')
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  return {
    ...quoteData,
    terms_and_conditions: quoteData.terms ?? undefined,
    title: undefined,
    quote_items: items || [],
    customer_associated_company: customerAssociatedCompany,
    accounting_locales: defaultLocale || {
      currency_symbol: 'USD',
      currency_position: 'before',
      decimal_places: 2,
    },
  } as unknown as QuoteData;
}

export async function fetchInvoiceData(invoiceId: string): Promise<InvoiceDocumentData> {
  const [invoiceResult, settingsResult] = await Promise.all([
    fetchInvoiceDetails(invoiceId),
    fetchCompanySettings(),
  ]);

  return {
    invoiceData: invoiceResult,
    companySettings: settingsResult,
  };
}

async function fetchInvoiceDetails(invoiceId: string): Promise<InvoiceData> {
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      *,
      cases (
        id,
        case_no,
        title
      ),
      customers:customers_enhanced (
        id,
        customer_name,
        email,
        mobile_number,
        phone,
        address,
        country_id,
        city_id,
        geo_countries(name),
        geo_cities(name)
      ),
      companies (
        id,
        name,
        company_name,
        email,
        phone,
        address,
        country_id,
        city_id,
        geo_countries(name),
        geo_cities(name)
      ),
      bank_accounts (
        id,
        account_name:name,
        bank_name,
        account_number,
        iban,
        swift_code,
        branch_code
      )
    `)
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error('Error fetching invoice data:', invoiceError);
    throw new Error('Failed to load invoice data');
  }

  if (!invoiceData) {
    throw new Error('Invoice not found');
  }

  let customerAssociatedCompany = null;
  if (invoiceData.customer_id) {
    const { data: relationshipData } = await supabase
      .from('customer_company_relationships')
      .select(`companies (id, name, company_name)`)
      .eq('customer_id', invoiceData.customer_id)
      .eq('is_primary', true)
      .maybeSingle();

    if (relationshipData && relationshipData.companies) {
      customerAssociatedCompany = relationshipData.companies;
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching invoice items:', itemsError);
  }

  const { data: defaultLocale } = await supabase
    .from('accounting_locales')
    .select('currency_symbol, currency_position, decimal_places')
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  return {
    ...invoiceData,
    invoice_line_items: items || [],
    customer_associated_company: customerAssociatedCompany,
    accounting_locales: defaultLocale || {
      currency_symbol: 'USD',
      currency_position: 'before',
      decimal_places: 2,
    },
  } as unknown as InvoiceData;
}

export async function fetchPaymentReceiptData(paymentId: string): Promise<PaymentReceiptDocumentData> {
  const [paymentResult, settingsResult] = await Promise.all([
    fetchPaymentDetails(paymentId),
    fetchCompanySettings(),
  ]);

  return {
    paymentData: paymentResult,
    companySettings: settingsResult,
  };
}

async function fetchPaymentDetails(paymentId: string): Promise<PaymentReceiptData> {
  const { data: paymentData, error: paymentError } = await supabase
    .from('payments')
    .select(`
      *,
      invoices (
        id,
        invoice_number,
        total_amount,
        invoice_type
      ),
      customers:customers_enhanced (
        id,
        customer_name,
        email,
        mobile_number,
        phone
      ),
      bank_accounts (
        id,
        account_name:name,
        bank_name,
        account_number,
        iban,
        swift_code
      )
    `)
    .eq('id', paymentId)
    .maybeSingle();

  if (paymentError) {
    console.error('Error fetching payment data:', paymentError);
    throw new Error('Failed to load payment data');
  }

  if (!paymentData) {
    throw new Error('Payment not found');
  }

  let caseInfo = null;
  if (paymentData.invoices?.id) {
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('case_id, cases(id, case_no)')
      .eq('id', paymentData.invoices.id)
      .maybeSingle();
    if (invoiceData?.cases) {
      caseInfo = invoiceData.cases;
    }
  }

  const { data: defaultLocale } = await supabase
    .from('accounting_locales')
    .select('currency_symbol, currency_position, decimal_places')
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  return {
    ...paymentData,
    invoice: paymentData.invoices,
    customer: paymentData.customers,
    cases: caseInfo,
    accounting_locales: defaultLocale || {
      currency_symbol: 'USD',
      currency_position: 'before',
      decimal_places: 2,
    },
  } as unknown as PaymentReceiptData;
}

export async function fetchPayslipData(recordId: string): Promise<PayslipDocumentData> {
  const [payslipResult, settingsResult] = await Promise.all([
    fetchPayslipDetails(recordId),
    fetchCompanySettings(),
  ]);

  return {
    payslipData: payslipResult,
    companySettings: settingsResult,
  };
}

async function fetchPayslipDetails(recordId: string): Promise<PayslipData> {
  const { data: recordData, error: recordError } = await supabase
    .from('payroll_records')
    .select(`
      *,
      employee:employees!payroll_records_employee_id_fkey (
        first_name,
        last_name,
        employee_number
      ),
      payroll_period:payroll_records_period_id_fkey (
        period_name,
        start_date,
        end_date
      )
    `)
    .eq('id', recordId)
    .maybeSingle();

  if (recordError) {
    console.error('Error fetching payroll record:', recordError);
    throw new Error('Failed to load payroll record');
  }

  if (!recordData) {
    throw new Error('Payroll record not found');
  }

  const { data: items } = await supabase
    .from('payroll_record_items')
    .select('component_id, component_name, component_type, amount')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: true });

  const { data: defaultLocale } = await supabase
    .from('accounting_locales')
    .select('currency_symbol, currency_position, decimal_places')
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();

  const mappedItems = (items || []).map(item => ({
    component_code: item.component_id ?? '',
    component_name: item.component_name,
    component_type: item.component_type,
    amount: item.amount,
  }));

  return {
    ...recordData,
    items: mappedItems,
    accounting_locales: defaultLocale || {
      currency_symbol: 'USD',
      currency_position: 'before',
      decimal_places: 2,
    },
  } as unknown as PayslipData;
}

export async function fetchChainOfCustodyData(
  caseId: string,
  caseNumber: string,
  options?: ChainOfCustodyDocumentData['options']
): Promise<ChainOfCustodyDocumentData> {
  const [entriesResult, settingsResult] = await Promise.all([
    fetchChainOfCustodyEntries(caseId),
    fetchCompanySettings(),
  ]);

  return {
    caseNumber,
    entries: entriesResult,
    options,
    companySettings: settingsResult,
  };
}

async function fetchChainOfCustodyEntries(caseId: string): Promise<ChainOfCustodyEntryData[]> {
  const { data, error } = await supabase
    .from('chain_of_custody')
    .select('id, action, action_category, actor_name, actor_role, created_at, description, evidence_hash, metadata')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chain of custody entries:', error);
    return [];
  }

  return (data || []).map((row, index): ChainOfCustodyEntryData => {
    const metadata = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
      ? (row.metadata as Record<string, unknown>)
      : {};
    const pickString = (key: string): string | undefined => {
      const value = metadata[key];
      return typeof value === 'string' ? value : undefined;
    };
    const pickNumber = (key: string): number | undefined => {
      const value = metadata[key];
      return typeof value === 'number' ? value : undefined;
    };

    return {
      entry_number: pickNumber('entry_number') ?? index + 1,
      action_category: row.action_category,
      action_type: row.action,
      action_description: row.description ?? '',
      actor_name: row.actor_name,
      actor_role: row.actor_role ?? undefined,
      occurred_at: pickString('occurred_at') ?? row.created_at,
      evidence_reference: pickString('evidence_reference'),
      hash_algorithm: pickString('hash_algorithm'),
      hash_value: pickString('hash_value') ?? row.evidence_hash ?? undefined,
      digital_signature: pickString('digital_signature'),
    };
  });
}
