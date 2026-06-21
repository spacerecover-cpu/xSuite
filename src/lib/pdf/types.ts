export interface CaseData {
  id: string;
  case_no: string;
  case_number?: string;
  created_at: string;
  status: string;
  priority: string;
  problem_description?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  customer_id?: string;
  company_id?: string;
  service_type_id?: string;
  assigned_technician_id?: string;
  checkout_date?: string;
  checkout_collector_name?: string;
  checkout_collector_mobile?: string;
  checkout_collector_id?: string;
  checkout_notes?: string;
  recovery_outcome?: string;
  client_reference?: string;
  customer?: {
    id: string;
    customer_name: string;
    email?: string;
    mobile_number?: string;
    phone_number?: string;
  };
  company?: {
    id: string;
    company_name: string;
  };
  service_type?: {
    id: string;
    name: string;
  };
  assigned_technician?: {
    id: string;
    full_name: string;
  };
  created_by?: string;
  created_by_profile?: {
    id: string;
    full_name: string | null;
    email?: string | null;
  };
}

export interface DeviceData {
  id: string;
  device_type?: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  capacity?: string;
  condition?: string;
  role?: string;
  notes?: string;
  device_problem?: string;
  /** Per-device checkout state (Stage 13). `checked_out_at` null = still in the lab. */
  checked_out_at?: string;
  checkout_batch_id?: string;
  checkout_collector_name?: string;
  checkout_collector_mobile?: string;
  checkout_collector_id?: string;
  checkout_collector_relationship?: string;
}

export interface CompanySettingsData {
  basic_info?: {
    company_name?: string;
    legal_name?: string;
    registration_number?: string;
    vat_number?: string;
    tax_id?: string;
  };
  location?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    building_name?: string;
    unit_number?: string;
  };
  contact_info?: {
    phone_primary?: string;
    phone_secondary?: string;
    email_general?: string;
    whatsapp_business?: string;
  };
  branding?: {
    logo_url?: string;
    stamp_url?: string;
    signature_url?: string;
    brand_tagline?: string;
    primary_color?: string;
    qr_code_invoice_url?: string;
    qr_code_invoice_caption?: string;
    qr_code_quote_url?: string;
    qr_code_quote_caption?: string;
    qr_code_label_url?: string;
    qr_code_label_caption?: string;
    qr_code_general_url?: string;
    qr_code_general_caption?: string;
  };
  online_presence?: {
    website?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
  };
  legal_compliance?: {
    terms_conditions_url?: string;
    privacy_policy_url?: string;
  };
  localization?: {
    document_language_settings?: {
      mode: 'english_only' | 'bilingual';
      secondary_language: string | null;
      language_name: string | null;
    };
  };
}

export interface ReceiptData {
  caseData: CaseData;
  devices: DeviceData[];
  companySettings: CompanySettingsData;
}

export interface DocumentOptions {
  pageSize?: 'A4' | 'LETTER' | [number, number];
  pageOrientation?: 'portrait' | 'landscape';
  pageMargins?: [number, number, number, number];
  watermark?: string;
}

export interface QuoteItemData {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

export interface QuoteData {
  id: string;
  quote_number: string;
  case_id?: string;
  customer_id?: string;
  company_id?: string;
  status: string;
  title: string;
  valid_until?: string;
  client_reference?: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  discount_type: 'amount' | 'percentage';
  total_amount: number;
  terms_and_conditions?: string;
  notes?: string;
  created_at: string;
  created_by?: string;
  customer?: {
    id: string;
    customer_name: string;
    email?: string;
    mobile_number?: string;
    phone_number?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
  };
  company?: {
    id: string;
    company_name: string;
    email?: string;
    phone_number?: string;
    address_line1?: string;
  };
  customer_associated_company?: {
    id: string;
    company_name: string;
  };
  cases?: {
    id: string;
    case_no: string;
    title?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
  };
  created_by_profile?: {
    id: string;
    full_name: string;
  };
  bank_accounts?: {
    id: string;
    account_name: string;
    bank_name: string;
    account_number: string;
    iban?: string;
    swift_code?: string;
    branch_code?: string;
  };
  quote_items?: QuoteItemData[];
  accounting_locales?: {
    currency_symbol: string;
    currency_position: 'before' | 'after';
    decimal_places: number;
  };
}

export interface InvoiceItemData {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent?: number;
  line_total: number;
}

export interface InvoiceData {
  id: string;
  invoice_number: string;
  case_id?: string;
  customer_id?: string;
  company_id?: string;
  invoice_type: 'proforma' | 'tax_invoice';
  invoice_date: string;
  due_date: string;
  status: string;
  client_reference?: string;
  subtotal: number;
  tax_rate?: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  payment_terms?: string;
  notes?: string;
  internal_notes?: string;
  created_at: string;
  created_by?: string;
  customer?: {
    id: string;
    customer_name: string;
    email?: string;
    mobile_number?: string;
    phone_number?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
  };
  company?: {
    id: string;
    company_name: string;
    email?: string;
    phone_number?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
  };
  customer_associated_company?: {
    id: string;
    company_name: string;
  };
  cases?: {
    id: string;
    case_no: string;
    title?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
  };
  created_by_profile?: {
    id: string;
    full_name: string;
  };
  bank_accounts?: {
    id: string;
    account_name: string;
    bank_name: string;
    account_number: string;
    iban?: string;
    swift_code?: string;
    branch_code?: string;
  };
  quote?: {
    id: string;
    quote_number: string;
    title?: string;
  };
  invoice_line_items?: InvoiceItemData[];
  accounting_locales?: {
    currency_symbol: string;
    currency_position: 'before' | 'after';
    decimal_places: number;
  };
}

export interface QuoteDocumentData {
  quoteData: QuoteData;
  companySettings: CompanySettingsData;
}

export interface InvoicePaymentLine {
  payment_date: string | null;
  amount: number;
  method: string | null;
  reference: string | null;
  transaction_id: string | null;
  status: string | null;
  recorded_by: string | null;
  notes: string | null;
  /** RCPT/PAYM document number this allocation came from. */
  doc_number?: string | null;
  source?: 'payment' | 'receipt';
  /** Invoice balance after this entry (statement-style, oldest-first). */
  running_balance?: number;
}

export interface InvoiceDocumentData {
  invoiceData: InvoiceData;
  companySettings: CompanySettingsData;
  paymentHistory?: InvoicePaymentLine[];
}

export interface PaymentReceiptData {
  id: string;
  receipt_number?: string;
  payment_date: string;
  amount: number;
  payment_method?: string;
  reference_number?: string;
  notes?: string;
  created_at: string;
  invoice?: {
    id: string;
    invoice_number: string;
    total_amount: number;
    invoice_type: string;
  };
  customer?: {
    id: string;
    customer_name: string;
    email?: string;
    mobile_number?: string;
    phone_number?: string;
  };
  company?: {
    id: string;
    company_name: string;
  };
  cases?: {
    id: string;
    case_no: string;
  };
  created_by_profile?: {
    id: string;
    full_name: string;
  };
  bank_accounts?: {
    id: string;
    account_name: string;
    bank_name: string;
    account_number: string;
    iban?: string;
    swift_code?: string;
  };
  accounting_locales?: {
    currency_symbol: string;
    currency_position: 'before' | 'after';
    decimal_places: number;
  };
}

export interface PaymentReceiptDocumentData {
  paymentData: PaymentReceiptData;
  companySettings: CompanySettingsData;
}

export interface PayslipData {
  id: string;
  employee: {
    first_name: string;
    last_name: string;
    employee_number: string;
  };
  payroll_period: {
    period_name: string;
    start_date: string;
    end_date: string;
  };
  payment_date?: string;
  working_days?: number;
  days_worked?: number;
  days_absent?: number;
  regular_hours?: number;
  overtime_hours?: number;
  gross_salary?: number;
  net_salary: number;
  items: Array<{
    component_code: string;
    component_name: string;
    component_type: string;
    amount: number;
    calculation_basis?: string;
  }>;
  accounting_locales?: {
    currency_symbol: string;
    currency_position: 'before' | 'after';
    decimal_places: number;
  };
}

export interface PayslipDocumentData {
  payslipData: PayslipData;
  companySettings: CompanySettingsData;
}

export interface ChainOfCustodyEntryData {
  entry_number: number;
  action_category: string;
  action_type: string;
  action_description: string;
  actor_name: string;
  actor_role?: string;
  occurred_at: string;
  evidence_reference?: string;
  hash_algorithm?: string;
  hash_value?: string;
  digital_signature?: string;
}

export interface ChainOfCustodyDocumentData {
  caseNumber: string;
  entries: ChainOfCustodyEntryData[];
  options?: {
    includeMetadata?: boolean;
    includeHashes?: boolean;
    includeSignatures?: boolean;
    watermark?: string;
  };
  companySettings: CompanySettingsData;
}

export interface CreditNoteLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CreditNoteData {
  credit_note_number: string | null;
  credit_note_date: string | null;
  credit_type: string | null;
  status: string | null;
  reason_code: string | null;
  reason_notes: string | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  applied_amount: number | null;
  invoice_number: string | null;
  customer_name: string | null;
  company_name: string | null;
  case_no: string | null;
  currency_symbol: string;
  currency_position: 'before' | 'after';
  decimal_places: number;
  items: CreditNoteLineItem[];
}

export interface CreditNoteDocumentData {
  creditNoteData: CreditNoteData;
  companySettings: CompanySettingsData;
}

export type DocumentType =
  | 'office_receipt'
  | 'customer_copy'
  | 'checkout_form'
  | 'case_label'
  | 'quote'
  | 'invoice'
  | 'credit_note'
  | 'payment_receipt'
  | 'payslip'
  | 'chain_of_custody';

export interface TranslationContext {
  t: (key: string, englishText: string) => string;
  isRTL: boolean;
  isBilingual: boolean;
  languageCode: string | null;
  fontFamily: string;
}
