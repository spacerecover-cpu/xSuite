/**
 * sampleData — representative, branded SAMPLE data per document type for the
 * Settings → Documents live preview.
 *
 * The preview must render every document type, not just invoices. Each builder
 * returns realistic domain data (the same shapes the per-doc-type parity tests
 * exercise), and {@link buildPreviewEngineData} routes a `docType` through its
 * matching adapter to the normalized {@link EngineDocData} the engine renders.
 *
 * Pure client-side fixture data — no DB, no I/O. Defined here (not imported from
 * `*.test.ts`) so production code never depends on test files.
 */

import type {
  ChainOfCustodyDocumentData,
  InvoiceDocumentData,
  PayslipDocumentData,
  PaymentReceiptDocumentData,
  QuoteDocumentData,
  ReceiptData,
} from '../types';
import type { ReportData } from '../documents/ReportDocument';
import type { StockLabelData } from '../documents/StockLabelDocument';
import type { StockItemWithCategory } from '../../stockService';
import type { DocumentTemplateConfig, TemplateDocumentType } from '../templateConfig';
import type { EngineDocData } from './types';

import { toEngineData as invoiceToEngine } from './adapters/invoiceAdapter';
import { toEngineData as quoteToEngine } from './adapters/quoteAdapter';
import { toEngineData as paymentReceiptToEngine } from './adapters/paymentReceiptAdapter';
import { toEngineData as receiptToEngine } from './adapters/receiptAdapter';
import { toEngineData as checkoutToEngine } from './adapters/checkoutAdapter';
import { toEngineData as caseLabelToEngine } from './adapters/caseLabelAdapter';
import { toEngineData as chainOfCustodyToEngine } from './adapters/chainOfCustodyAdapter';
import { toEngineData as payslipToEngine } from './adapters/payslipAdapter';
import { toEngineData as reportToEngine } from './adapters/reportAdapter';
import { toEngineData as stockLabelToEngine } from './adapters/stockLabelAdapter';

/** Shared sample company identity used across every sample document. */
const SAMPLE_COMPANY = {
  basic_info: {
    company_name: 'Acme Data Recovery',
    legal_name: 'Acme Data Recovery LLC',
    vat_number: 'TRN-100123456700003',
  },
  location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
  contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.example' },
  branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
  online_presence: { website: 'https://acme.example' },
};

const SAMPLE_LOCALE = { currency_symbol: 'AED', currency_position: 'after' as const, decimal_places: 2 };

// ── Financial ────────────────────────────────────────────────────────────────

export function sampleInvoiceData(): InvoiceDocumentData {
  return {
    invoiceData: {
      id: 'preview-invoice',
      invoice_number: 'INV-0042',
      invoice_type: 'tax_invoice',
      invoice_date: '2026-06-13',
      due_date: '2026-06-27',
      status: 'issued',
      client_reference: 'PO-9001',
      subtotal: 1500,
      tax_rate: 5,
      tax_amount: 70,
      discount_amount: 100,
      total_amount: 1470,
      amount_paid: 0,
      balance_due: 1470,
      payment_terms: 'Net 14 days from the invoice date. Late payments may incur a service charge.',
      notes: 'Thank you for trusting our lab with your data recovery.',
      created_at: '2026-06-13T00:00:00Z',
      customer: { id: 'preview-customer', customer_name: 'Jane Client', email: 'jane@client.example', mobile_number: '+971 50 123 4567' },
      cases: { id: 'preview-case', case_no: 'CASE-0007', contact_name: 'Jane Client', contact_email: 'jane@client.example', contact_phone: '+971 50 123 4567' },
      bank_accounts: { id: 'preview-bank', account_name: 'Acme Data Recovery LLC', bank_name: 'First National Bank', account_number: '0123456789', iban: 'AE12 0000 0000 0123 4567 89', swift_code: 'FNBKAEXX' },
      invoice_line_items: [
        { description: 'RAID-5 logical recovery (4 × 4TB)', quantity: 1, unit_price: 850, tax_rate: 5, line_total: 850 },
        { description: 'Clean-room head-stack transplant', quantity: 1, unit_price: 400, tax_rate: 5, line_total: 400 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 125, tax_rate: 5, line_total: 250 },
      ],
      accounting_locales: SAMPLE_LOCALE,
    },
    companySettings: SAMPLE_COMPANY,
    paymentHistory: [],
  };
}

export function sampleQuoteData(): QuoteDocumentData {
  return {
    quoteData: {
      id: 'preview-quote',
      quote_number: 'QUO-2026-0042',
      status: 'sent',
      title: 'RAID recovery quotation',
      valid_until: '2026-07-13',
      client_reference: 'PO-9001',
      subtotal: 1500,
      tax_rate: 5,
      tax_amount: 70,
      discount_amount: 100,
      discount_type: 'amount',
      total_amount: 1470,
      terms_and_conditions: 'Quote valid for 30 days. 50% advance required to begin.',
      notes: 'Diagnostics are non-destructive.',
      created_at: '2026-06-13T00:00:00Z',
      customer: { id: 'cust-1', customer_name: 'Jane Client', email: 'jane@client.test', mobile_number: '+971 50 123 4567' },
      cases: { id: 'case-1', case_no: 'CASE-0007', contact_name: 'Jane Client', contact_email: 'jane@client.test', contact_phone: '+971 50 123 4567' },
      bank_accounts: { id: 'bank-1', account_name: 'Acme Data Recovery LLC', bank_name: 'First National Bank', account_number: '0123456789', iban: 'AE12 0000 0000 0123 4567 89', swift_code: 'FNBKAEXX' },
      quote_items: [
        { description: 'RAID-5 logical recovery', quantity: 1, unit_price: 1000 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 250 },
      ],
      accounting_locales: SAMPLE_LOCALE,
    },
    companySettings: SAMPLE_COMPANY,
  };
}

export function samplePaymentReceiptData(): PaymentReceiptDocumentData {
  return {
    paymentData: {
      id: 'preview-pay',
      receipt_number: 'RCPT-2026-0042',
      payment_date: '2026-06-14',
      amount: 470,
      payment_method: 'Bank Transfer',
      reference_number: 'TRX-1001',
      notes: 'Partial payment received with thanks.',
      created_at: '2026-06-14T00:00:00Z',
      invoice: { id: 'inv-1', invoice_number: 'INV-2026-0042', total_amount: 1470, invoice_type: 'tax_invoice' },
      customer: { id: 'cust-1', customer_name: 'Jane Client', email: 'jane@client.test', mobile_number: '+971 50 123 4567' },
      cases: { id: 'case-1', case_no: 'CASE-0007' },
      created_by_profile: { id: 'prof-1', full_name: 'Alex Accounts' },
      bank_accounts: { id: 'bank-1', account_name: 'Acme Data Recovery LLC', bank_name: 'First National Bank', account_number: '0123456789', iban: 'AE12 0000 0000 0123 4567 89', swift_code: 'FNBKAEXX' },
      accounting_locales: SAMPLE_LOCALE,
    },
    companySettings: SAMPLE_COMPANY,
  };
}

// ── Intake / checkout (ReceiptData) ───────────────────────────────────────────

const SAMPLE_RECEIPT_COMPANY = {
  ...SAMPLE_COMPANY,
  legal_compliance: { terms_conditions_url: 'https://acme.example/terms' },
};

export function sampleReceiptData(): ReceiptData {
  return {
    caseData: {
      id: 'preview-case',
      case_no: 'CASE-0007',
      case_number: 'CASE-0007',
      created_at: '2026-06-13T09:30:00Z',
      status: 'received',
      priority: 'High',
      problem_description: 'Drive not detected by BIOS.',
      contact_name: 'Jane Client',
      contact_phone: '+971 50 123 4567',
      contact_email: 'jane@client.test',
      client_reference: 'PO-9001',
      customer: { id: 'cust-1', customer_name: 'Jane Client', email: 'jane@client.test', mobile_number: '+971 50 123 4567' },
      company: { id: 'co-1', company_name: 'Client Holdings LLC' },
      service_type: { id: 'svc-1', name: 'Logical Recovery' },
      created_by_profile: { id: 'prof-1', full_name: 'Sam Reception', email: 'sam@acme.test' },
    },
    devices: [
      { id: 'dev-1', device_type: 'HDD', brand: 'Seagate', model: 'Barracuda', serial_number: 'SN-AAA-111', capacity: '2000', role: 'patient', device_problem: 'Clicking noise on spin-up.' },
      { id: 'dev-2', device_type: 'SSD', brand: 'Samsung', model: '870 EVO', serial_number: 'SN-BBB-222', capacity: '500', role: 'donor' },
    ],
    companySettings: SAMPLE_RECEIPT_COMPANY,
  };
}

export function sampleCheckoutData(): ReceiptData {
  return {
    caseData: {
      id: 'preview-case',
      case_no: 'CASE-0007',
      case_number: 'CASE-0007',
      created_at: '2026-06-13T09:30:00Z',
      status: 'completed',
      priority: 'High',
      contact_name: 'Jane Client',
      contact_phone: '+971 50 123 4567',
      contact_email: 'jane@client.test',
      recovery_outcome: 'full',
      checkout_date: '2026-06-20T14:00:00Z',
      checkout_collector_name: 'Bob Courier',
      checkout_collector_mobile: '+971 55 987 6543',
      checkout_collector_id: 'ID-784-1990-1234567-1',
      checkout_notes: 'Collected on behalf of the customer.',
      customer: { id: 'cust-1', customer_name: 'Jane Client', email: 'jane@client.test', mobile_number: '+971 50 123 4567' },
      company: { id: 'co-1', company_name: 'Client Holdings LLC' },
      service_type: { id: 'svc-1', name: 'Logical Recovery' },
      created_by_profile: { id: 'prof-1', full_name: 'Sam Reception', email: 'sam@acme.test' },
    },
    devices: [
      { id: 'dev-1', device_type: 'HDD', brand: 'Seagate', model: 'Barracuda', serial_number: 'SN-AAA-111', capacity: '2000', role: 'patient' },
    ],
    companySettings: SAMPLE_RECEIPT_COMPANY,
  };
}

// ── Chain of custody ───────────────────────────────────────────────────────────

export function sampleChainOfCustodyData(): ChainOfCustodyDocumentData {
  return {
    caseNumber: 'CASE-0042',
    entries: [
      { entry_number: 1, action_category: 'creation', action_type: 'device_received', action_description: 'Drive received at intake counter.', actor_name: 'Sam Reception', actor_role: 'receptionist', occurred_at: '2026-06-13T09:30:00Z', hash_algorithm: 'SHA-256', hash_value: 'a1b2c3d4e5f6', digital_signature: 'sig-0001' },
      { entry_number: 2, action_category: 'evidence_handling', action_type: 'imaging_started', action_description: 'Forensic image acquisition started.', actor_name: 'Lina Engineer', actor_role: 'technician', occurred_at: '2026-06-13T11:00:00Z', hash_algorithm: 'SHA-256', hash_value: 'f6e5d4c3b2a1', digital_signature: 'sig-0002' },
      { entry_number: 3, action_category: 'critical_event', action_type: 'destructive_attempt_authorized', action_description: 'Customer authorized destructive recovery attempt.', actor_name: 'Omar Manager', actor_role: 'manager', occurred_at: '2026-06-13T15:45:00Z' },
    ],
    options: { includeMetadata: true, includeHashes: true, includeSignatures: true },
    companySettings: { ...SAMPLE_COMPANY, branding: { ...SAMPLE_COMPANY.branding, qr_code_general_caption: 'Scan to verify' } },
  };
}

// ── Payslip ────────────────────────────────────────────────────────────────────

export function samplePayslipData(): PayslipDocumentData {
  return {
    payslipData: {
      id: 'preview-payslip',
      employee: { first_name: 'Jane', last_name: 'Engineer', employee_number: 'EMP-0007' },
      payroll_period: { period_name: 'June 2026', start_date: '2026-06-01', end_date: '2026-06-30' },
      payment_date: '2026-07-01',
      working_days: 22,
      days_worked: 21,
      days_absent: 1,
      regular_hours: 168,
      overtime_hours: 6,
      gross_salary: 10000,
      net_salary: 8250,
      items: [
        { component_code: 'BASIC', component_name: 'Basic Salary', component_type: 'earning', amount: 7000, calculation_basis: 'Monthly' },
        { component_code: 'HOUSE', component_name: 'Housing Allowance', component_type: 'earning', amount: 3000, calculation_basis: '30% of basic' },
        { component_code: 'PENSION', component_name: 'Pension', component_type: 'deduction', amount: 750, calculation_basis: '7.5% of basic' },
        { component_code: 'LOAN', component_name: 'Loan Repayment', component_type: 'deduction', amount: 1000 },
      ],
      accounting_locales: SAMPLE_LOCALE,
    },
    companySettings: SAMPLE_COMPANY,
  };
}

// ── Case report ──────────────────────────────────────────────────────────────

export function sampleReportData(): ReportData {
  return {
    report: { id: 'rpt-1', case_id: 'case-1', report_number: 'REP-0007', report_type: 'forensic', title: 'Forensic Analysis', status: 'approved', version_number: 2, created_at: '2026-06-13T09:30:00Z', created_by: 'user-1' },
    sections: [
      { id: 'sec-1', section_key: 'diagnostic_findings', section_title: 'Diagnostic Findings', section_content: '<p>Drive shows clicking; heads are degraded.</p><p>Surface scan reveals bad sectors.</p>', section_order: 1 },
      { id: 'sec-2', section_key: 'recommendations', section_title: 'Recommendations', section_content: 'Replace head stack in cleanroom and re-image.', section_order: 2 },
    ],
    caseData: { case_number: 'CASE-0042', case_no: 'CASE-0042', customer_name: 'Ahmed Customer', customer_email: 'ahmed@example.test', customer_phone: '+971 50 111 2222', company_name: 'ABC Trading LLC', client_reference: 'PO-9981', service_type: 'Data Recovery', assigned_engineer: 'Lina Engineer', created_at: '2026-06-12T08:00:00Z' },
    customerData: { customer_name: 'Ahmed Customer', email: 'ahmed@example.test', mobile_number: '+971 50 111 2222', company_name: 'ABC Trading LLC' },
    deviceData: { device_type: '3.5" HDD', brand: 'Seagate', model: 'ST2000DM008', capacity: '2TB', serial_number: 'SN-ABC-12345', condition: 'Physical damage' },
    diagnosticsData: { device_type_category: 'hdd', heads_status: 'Degraded', pcb_status: 'OK', motor_status: 'OK', surface_status: 'Bad sectors', physical_damage_notes: 'Visible scoring on platter 0.' },
    chainOfCustodyEvents: [
      { event_type: 'device_received', event_date: '2026-06-12T08:05:00Z', event_timestamp: '2026-06-12T08:05:00Z', event_description: 'Drive received at intake counter.', actor: { full_name: 'Sam Reception' } },
      { event_type: 'imaging_started', event_date: '2026-06-12T11:00:00Z', event_timestamp: '2026-06-12T11:00:00Z', event_description: 'Forensic image acquisition started.', actor: { full_name: 'Lina Engineer' } },
    ],
    companySettings: { ...SAMPLE_COMPANY, branding: { ...SAMPLE_COMPANY.branding, qr_code_general_caption: 'Scan for more information' } },
    preparedByName: 'Lina Engineer',
  };
}

// ── Stock label ────────────────────────────────────────────────────────────────

function sampleStockItem(): StockItemWithCategory {
  return {
    barcode: '8801643000000', brand: 'Samsung', capacity: '500', category_id: 'cat-ssd', cost_price: 800,
    created_at: '2026-06-01T00:00:00Z', created_by: null, current_quantity: 5, deleted_at: null, description: null,
    dimensions: null, id: 'stock-1', image_url: null, is_active: true, is_featured: false, is_saleable: true,
    item_type: 'part', location: null, location_id: null, minimum_quantity: 1, model: '870 EVO',
    name: 'Samsung 870 EVO 500GB', notes: null, photos: null, quantity_available: 5, quantity_on_hand: 5,
    quantity_reserved: 0, reorder_level: 2, reorder_quantity: 5, selling_price: 1234.5, sku: 'STK-0042',
    specifications: null, supplier_id: null, tax_inclusive: false, tax_rate: 5, tenant_id: 'tenant-1',
    unit: 'pc', unit_of_measure: 'pc', updated_at: '2026-06-01T00:00:00Z', updated_by: null, warranty_months: 12,
    weight: null,
    stock_categories: {
      id: 'cat-ssd', name: 'Internal SSD', created_at: '2026-06-01T00:00:00Z', deleted_at: null,
      description: null, tenant_id: 'tenant-1', updated_at: '2026-06-01T00:00:00Z',
    } as StockItemWithCategory['stock_categories'],
  };
}

export function sampleStockLabelData(): StockLabelData {
  return {
    item: sampleStockItem(),
    locationName: 'Shelf A-3',
    companyName: 'Acme Data Recovery',
    showPrice: true,
    showBarcode: true,
    copies: 1,
  };
}

/**
 * Resolve a document type to render-ready {@link EngineDocData} from sample data,
 * routing through the matching adapter. The fallback is the invoice sample.
 */
export function buildPreviewEngineData(
  docType: TemplateDocumentType,
  config: DocumentTemplateConfig,
): EngineDocData {
  switch (docType) {
    case 'invoice':
      return invoiceToEngine(sampleInvoiceData(), config);
    case 'quote':
      return quoteToEngine(sampleQuoteData(), config);
    case 'payment_receipt':
      return paymentReceiptToEngine(samplePaymentReceiptData(), config);
    case 'office_receipt':
      return receiptToEngine(sampleReceiptData(), config, 'office');
    case 'customer_copy':
      return receiptToEngine(sampleReceiptData(), config, 'customer');
    case 'checkout_form':
      return checkoutToEngine(sampleCheckoutData(), config);
    case 'case_label':
      return caseLabelToEngine(sampleReceiptData(), config);
    case 'chain_of_custody':
      return chainOfCustodyToEngine(sampleChainOfCustodyData(), config);
    case 'payslip':
      return payslipToEngine(samplePayslipData(), config);
    case 'report':
      return reportToEngine(sampleReportData(), config);
    case 'stock_label':
      return stockLabelToEngine(sampleStockLabelData(), config);
    default:
      return invoiceToEngine(sampleInvoiceData(), config);
  }
}
