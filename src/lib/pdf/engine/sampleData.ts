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
  CompanySettingsData,
  CreditNoteDocumentData,
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
import { toCreditNoteEngineData as creditNoteToEngine } from './adapters/creditNoteAdapter';
import { toEngineData as paymentReceiptToEngine } from './adapters/paymentReceiptAdapter';
import { toEngineData as receiptToEngine } from './adapters/receiptAdapter';
import { toEngineData as checkoutToEngine } from './adapters/checkoutAdapter';
import { toEngineData as caseLabelToEngine } from './adapters/caseLabelAdapter';
import { toEngineData as chainOfCustodyToEngine } from './adapters/chainOfCustodyAdapter';
import { toEngineData as payslipToEngine } from './adapters/payslipAdapter';
import { toEngineData as reportToEngine } from './adapters/reportAdapter';
import { toEngineData as stockLabelToEngine } from './adapters/stockLabelAdapter';
import { ctxFromLanguageConfig } from '../translationContext';
import type { TranslationContext } from '../types';

/**
 * Derive a {@link TranslationContext} from the engine `config.language` for sample
 * adapters that resolve labels through `ctx.t` (the report adapter). Routes through
 * the canonical {@link ctxFromLanguageConfig}, which reads the per-template
 * secondary via `resolveSecondary` — so the Studio preview honours ANY of the 13
 * secondary languages (Italian/French/…), not just Arabic. (It previously mapped
 * every non-Arabic secondary to English — the cause of "English-only" report
 * previews for e.g. English + Italian.)
 */
function previewCtxFromConfig(config: DocumentTemplateConfig): TranslationContext {
  return ctxFromLanguageConfig(config.language);
}

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
  online_presence: {
    website: 'https://acme.example',
    facebook: 'https://facebook.com/acmedatarecovery',
    twitter: 'https://x.com/acmedatarecovery',
    linkedin: 'https://linkedin.com/company/acmedatarecovery',
    instagram: 'https://instagram.com/acmedatarecovery',
  },
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

export function sampleCreditNoteData(): CreditNoteDocumentData {
  return {
    creditNoteData: {
      credit_note_number: 'CN-2026-0007',
      credit_note_date: '2026-06-18',
      credit_type: 'refund',
      status: 'issued',
      reason_code: 'unsuccessful_recovery',
      reason_notes: 'RAID rebuild could not recover the customer data; fee refunded in full.',
      subtotal: 400,
      tax_rate: 5,
      tax_amount: 20,
      total_amount: 420,
      applied_amount: 0,
      invoice_number: 'INV-0042',
      customer_name: 'Jane Client',
      company_name: 'Client Holdings LLC',
      case_no: 'CASE-0007',
      currency_symbol: 'AED',
      currency_position: 'after',
      decimal_places: 2,
      items: [{ description: 'RAID-5 recovery attempt (refunded)', quantity: 1, unit_price: 400, line_total: 400 }],
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
    recoverability: 'partially_recoverable',
  };
}

/**
 * Per-report-type sample data for the Studio's report-type preview picker.
 * Each fixture carries realistic authored content shaped by the industry
 * research for that report (see reportAdapter CANONICAL_SECTIONS notes), so the
 * tenant previews every one of the 8 report types the way a finished, filled-in
 * document renders. Section keys MUST be canonical SUBTYPE_SECTIONS keys (or
 * aliases) or they will not render. Unknown subtypes fall back to 'evaluation'.
 */
export function sampleReportDataFor(subtype: string): ReportData {
  const base = sampleReportData();
  const sec = (key: string, title: string, content: string, order: number) => ({
    id: `sec-${subtype}-${order}`,
    section_key: key,
    section_title: title,
    section_content: content,
    section_order: order,
  });

  switch (subtype) {
    case 'evaluation':
      return {
        ...base,
        report: { ...base.report, report_number: 'REP-EV-0101', report_type: 'evaluation', title: 'Media Evaluation' },
        recoverability: 'partially_recoverable',
        sections: [
          sec('executive_summary', 'Executive Summary', 'The 2.5" hard drive was received making an abnormal clicking noise and is not detected by the host system. Inspection shows damaged read/write heads with platter surface damage in the outer zone. Recovery is assessed as partially recoverable via cleanroom head replacement followed by 1:1 imaging.', 0),
          sec('initial_assessment', 'Initial Assessment', 'Device received sealed, no evidence of prior opening. Customer reports the drive was dropped while powered. Reported critical data: family photo library and QuickBooks company file.', 1),
          sec('findings', 'Diagnostic Findings', 'Strange noise from the drive; read/write heads are damaged.\nDamage found on the platter surface due to bad r/w heads.\nCleanroom environment required for safe recovery.', 2),
          sec('recommendations', 'Proposed Solution', 'Cleanroom-level head replacement followed by 1:1 imaging and a logical scan to extract the data.\nPCB conversion, firmware repair and decryption are also required.\nSome files may be corrupted in the result due to the damaged surfaces.', 3),
          sec('estimated_timeline', 'Estimated Recovery Time', '[Standard] Minimum 3–5 business days after approval.\n[Priority] 1–2 business days (surcharge applies). Donor head-stack availability may extend the standard timeline.', 4),
          sec('risks_disclaimers', 'Risks & Required Consents', 'The media is already damaged and further recovery attempts may cause additional, irreversible damage. Opening the device voids any manufacturer warranty. Hardware-encrypted data without keys may be unrecoverable. Destructive (last-resort) techniques will only be attempted with your explicit written consent.', 5),
        ],
      };
    case 'service':
      return {
        ...base,
        report: { ...base.report, report_number: 'REP-SV-0102', report_type: 'service', title: 'Service Report' },
        recoverability: 'fully_recoverable',
        sections: [
          sec('executive_summary', 'Executive Summary', 'Recovery completed successfully. The failed 2 TB drive was imaged in the cleanroom after a donor head-stack transplant; 99.0% of user files were recovered, verified, and delivered on an encrypted external drive.', 0),
          sec('findings', 'Diagnostic Findings', 'Head crash on platter 0 confirmed under microscope inspection. SMART history shows 1,847 reallocated sectors prior to failure. Failure is consistent with the reported symptoms (clicking, then no detection).', 1),
          sec('work_performed', 'Work Performed', 'Day 1: ISO Class 5 cleanroom entry; donor head-stack assembly transplanted.\nDay 2–3: sector-by-sector imaging on PC-3000, 3 passes, 99.4% binary read.\nDay 4: logical reconstruction of the NTFS volume; file extraction and repair.\nDay 5: verification, QA checklist, delivery preparation.', 2),
          sec('parts_used', 'Parts & Materials Used', 'Donor head-stack assembly — WD20SPZX-22UA7T0, donor S/N WXK2A9…D341, matched by model/firmware family, qty 1 (billed).\nThe patient drive is not returned in working order; donor parts are consumed for recovery only.', 3),
          sec('recovery_results', 'Recovery Results', 'Files recovered: 214,320 of 216,504 identified (99.0% by count; 98.6% by volume).\nData recovered: 1.82 TB of 1.85 TB used capacity.\n2,184 files affected by unreadable sectors are delivered separately in a "Data with errors" folder.', 4),
          sec('verification_qa', 'Verification & Quality Assurance', 'Full file listing generated and spot-checked; the customer\'s named critical folders opened and verified. Image hash (SHA-256) recorded and re-verified after copy to the delivery drive. QA checklist signed off by a second engineer.', 5),
          sec('recommendations', 'Proposed Solution', 'Copy the recovered data to a second location immediately and adopt a 3-2-1 backup (3 copies, 2 media types, 1 offsite). Do not reuse the failed drive. We recommend replacing same-age drives from the same batch.', 6),
        ],
      };
    case 'server':
      return {
        ...base,
        report: { ...base.report, report_number: 'REP-SR-0103', report_type: 'server', title: 'Server Recovery' },
        deviceData: { device_type: 'NAS Server (8-bay)', brand: 'Synology', model: 'RS1221+', capacity: '8 × 4 TB', serial_number: 'SYN-2190-RSX', condition: 'Two members failed' },
        recoverability: 'fully_recoverable',
        sections: [
          sec('executive_summary', 'Executive Summary', 'The 8-drive RAID 5 array failed after a second member dropped during a rebuild. All 8 members were imaged; the array was virtually reconstructed from the clones. 3.82 TB / 1,412,908 files recovered (99.6%), including the customer-named SQL databases and file shares.', 0),
          sec('array_configuration', 'Array Configuration', 'As determined: RAID 5, 8 members, no hot spare; stripe 64 KB, left-symmetric parity; disk order 3-1-2-4-5-6-7-8 (differs from the reported slot order — determined by entropy analysis); ext4 over LVM, single volume group.\nController: Synology DSM software RAID (mdadm).', 1),
          sec('member_drives', 'Member Drive Assessment', 'Slot 1 — WD40EFRX, S/N WCC4…8871: healthy, imaged 100%.\nSlot 2 — WD40EFRX, S/N WCC4…9012: STALE (dropped 6 months earlier) — excluded from reconstruction.\nSlot 3 — WD40EFRX, S/N WCC4…1204: head failure; cleanroom head swap, imaged 99.98%.\nSlots 4–8: healthy, imaged 100%. All images hash-verified (SHA-256); originals never written to.', 2),
          sec('work_performed', 'Work Performed', 'Every member imaged through write-blocked hardware imagers before any reconstruction. Stripe size, parity rotation and disk order reverse-engineered from metadata and entropy testing; the array was assembled virtually from the clones with the stale member excluded, and the ext4 volume repaired.', 3),
          sec('recovery_results', 'Recovery Results', 'Recovered 3.82 TB of 3.84 TB used (99.6%); 1,412,908 files across 214 shares.\nCritical datasets: SQL databases — recovered and mount-tested; VM datastore — recovered, all 6 VMs boot; file shares — recovered with original structure.\n312 files in the damaged region of slot 3 are partially corrupt and listed separately.', 4),
          sec('verification_qa', 'Verification & Quality Assurance', 'Parity-consistency check across the reconstructed stripe set passed. Sample files opened per share; databases mounted; VMs booted. Delivered-set hash (SHA-256) recorded. QA checklist signed off by a second engineer.', 5),
          sec('recommendations', 'Proposed Solution', 'Never force a rebuild on a degraded array before imaging the members. Replace remaining same-batch drives; prefer RAID 6 at this capacity; enable array monitoring/alerts; maintain a tested 3-2-1 backup with one copy offsite.', 6),
        ],
      };
    case 'malware':
      return {
        ...base,
        report: { ...base.report, report_number: 'REP-MW-0104', report_type: 'malware', title: 'Malware Analysis' },
        deviceData: { device_type: 'File Server', brand: 'Dell', model: 'PowerEdge T440', capacity: '12 TB', serial_number: 'DL-T440-8817', condition: 'Ransomware encrypted' },
        recoverability: 'partially_recoverable',
        sections: [
          sec('executive_summary', 'Executive Summary', 'On 02 Jun 2026 the file server was encrypted by Akira ransomware after RDP was exposed to the internet. No reliable evidence of data exfiltration was found in the available logs. 87% of the data was recovered from shadow copies, backup fragments and file carving without paying the ransom.', 0),
          sec('infection_vector', 'Infection Vector & Root Cause', 'Initial access: brute-forced credentials on internet-exposed RDP (confirmed from authentication logs; ~9,400 failed logons over 3 days, then success from a foreign IP). MITRE ATT&CK T1110 / T1133. MFA was not enabled on the account.', 1),
          sec('security_analysis', 'Security Analysis', 'Family: Akira (identification basis: ".akira" extension, "akira_readme.txt" ransom note, encryptor hash match).\nKey IOCs (defanged): encryptor SHA-256 8f1e…c2a4; staging via hxxp://45.66.??.??/w.zip; created account "backupsvc".\nShadow copies were deleted (vssadmin) — typical of the family.', 2),
          sec('affected_systems', 'Affected Systems & Data Scope', 'FILE-SRV-01 (this device): 11.2 TB of 12 TB encrypted.\nNAS-BACKUP-01: backup share partially encrypted (mapped drive).\nWorkstations (6): not encrypted; swept clean with EDR.\nAffected data: finance shares, CAD library, user home folders.', 3),
          sec('work_performed', 'Work Performed', 'All affected media imaged before any recovery work. Public-decryptor check (No More Ransom): none available for this Akira build. Recovery executed from surviving shadow-copy fragments, the partially-encrypted NAS backup, and carving of intact regions. Recovered set malware-scanned before delivery.', 4),
          sec('recovery_results', 'Recovery Results', 'Recovered 9.7 TB of 11.2 TB encrypted (87% by volume; 91% by file count).\nFinance shares and CAD library fully recovered; 62 GB of user home folders remain encrypted with no recovery path short of the attacker\'s key.', 5),
          sec('recommendations', 'Proposed Solution', 'Immediate (0–30 days): disable public RDP, enforce MFA on all remote access, reset all credentials, deploy EDR, block the listed IOCs.\nStrategic: 3-2-1 backups with one immutable/offline copy, network segmentation, least privilege, log retention ≥ 90 days, phishing training.', 6),
        ],
      };
    case 'data_destruction':
      return {
        ...base,
        report: { ...base.report, report_number: 'CERT-DD-0106', report_type: 'data_destruction', title: 'Data Destruction Certificate' },
        recoverability: undefined,
        chainOfCustodyEvents: [
          ...(base.chainOfCustodyEvents ?? []),
          { event_type: 'media_destroyed', event_date: '2026-06-14T10:00:00Z', event_timestamp: '2026-06-14T10:00:00Z', event_description: 'Media sanitized and released to certified recycler.', actor: { full_name: 'Omar Manager' } },
        ],
        sections: [
          sec('executive_summary', 'Executive Summary', 'This certificate documents the sanitization of the storage media itemized in the Device Information section, performed at the customer\'s request following completion of the recovery engagement.', 0),
          sec('sanitization_details', 'Sanitization Details', 'Sanitization category (NIST SP 800-88): Purge.\nMethod used: firmware cryptographic erase followed by full overwrite (1 pass, verified).\nTool: certified erasure suite v7.4 (log ref ER-2026-0142).\nDate performed: 14 Jun 2026 — at the lab facility, Dubai.', 1),
          sec('verification_details', 'Verification & Validation', 'Verification method: full read-back verification.\nResult: PASSED — no recoverable data detected.\nSecondary QA sample verified by the Data Protection Representative.', 2),
          sec('media_disposition', 'Media Destination & Disposition', 'Final disposition: released to certified e-waste recycler (downstream vendor on file). Custody chain closed with the transfer record below; supporting logs retained for 6 years.', 3),
          sec('destruction_certificate', 'Certificate of Destruction', 'This certifies that the data storage media itemized above were sanitized on 14 Jun 2026 in accordance with NIST SP 800-88, Guidelines for Media Sanitization, using the methods described herein, and that the data contained thereon has been rendered unrecoverable. I attest that the information provided on this certificate is accurate to the best of my knowledge.', 4),
        ],
      };
    case 'prevention':
      return {
        ...base,
        report: { ...base.report, report_number: 'REP-PR-0107', report_type: 'prevention', title: 'Prevention & Strategy' },
        recoverability: undefined,
        sections: [
          sec('executive_summary', 'Executive Summary', 'Your data loss was caused by a mechanical drive failure with no second copy in existence. The recovered data currently lives on a single external drive — your largest remaining exposure. This report prescribes a prioritized protection plan; the top three actions are listed in the action plan below.', 0),
          sec('root_cause', 'Root Cause of Data Loss', 'Failure class: mechanical (degraded read/write heads).\nContributing factors: drive age (4.5 years, ~31,000 power-on hours), elevated operating temperature, and no backup of any kind.\nPreventability: a monitored backup would have made this loss a non-event.', 1),
          sec('risk_assessment', 'Risk Assessment', 'R1 — Recovered data exists in one copy only: likelihood 4 × impact 5 = 20 (CRITICAL).\nR2 — Remaining drives are the same age/batch as the failed unit: 3 × 4 = 12 (HIGH).\nR3 — No failure monitoring in place: 3 × 3 = 9 (MODERATE).\nUntil the action plan is implemented, the conditions that caused this loss still exist.', 2),
          sec('backup_strategy', 'Backup Strategy Recommendation', 'Adopt the 3-2-1 rule: 3 copies of your data, on 2 different media types, with 1 copy offsite.\nProposed architecture: primary storage → automated local backup (NAS) → encrypted cloud copy.\nAutomate the jobs, alert on failures, and test a restore quarterly — a backup that fails silently goes unnoticed until it is too late.', 3),
          sec('monitoring_plan', 'Monitoring & Early-Warning Plan', 'Watch the five validated SMART failure predictors: 5 (Reallocated Sectors), 187 (Reported Uncorrectable), 188 (Command Timeout), 197 (Pending Sectors), 198 (Offline Uncorrectable).\nRule: any raw value above zero — start watching and verify backups; a rising trend — back up now and replace the drive.\nCheck monthly with a SMART tool, and enable backup-job success alerts.', 4),
          sec('action_plan', 'Prioritized Action Plan', '1. [CRITICAL — today] Copy the recovered data to a second location.\n2. [HIGH — 0–30 days] Implement the 3-2-1 backup architecture above.\n3. [HIGH — 0–30 days] Replace the two same-batch drives still in service.\n4. [MEDIUM — 30–90 days] Deploy SMART monitoring and a quarterly restore test.', 5),
          sec('emergency_response', 'Warning Signs & Emergency Response', 'If you hear clicking or grinding, see repeated disconnects, or files disappearing: power the device down IMMEDIATELY and stop using it. Never run recovery software on a physically failing drive, never open it, and never retry power cycles — the first recovery attempt is the best recovery attempt. Contact the lab for emergency intake.', 6),
        ],
      };
    case 'recovered_files':
      return {
        ...base,
        report: { ...base.report, report_number: 'REP-RF-0108', report_type: 'recovered_files', title: 'Recovered Files Report' },
        recoverability: 'fully_recoverable',
        sections: [
          sec('executive_summary', 'Executive Summary', 'Recovery outcome: FULL RECOVERY. 214,320 of 216,504 files were recovered from the failed drive, including all customer-declared critical folders. Review the file listing and verify your critical files before the acceptance deadline below.', 0),
          sec('recovery_statistics', 'Recovery Statistics', 'Total files identified: 216,504 · Folders: 18,207.\nRecovered — Good: 212,136 · Recovered — Suspect/Partial: 2,184 · Not recovered: 2,184.\nRecovery rate: 99.0% by file count · 98.6% by data volume.\nData recovered: 1.82 TB of 1.85 TB used capacity.', 1),
          sec('file_categories', 'File Category Breakdown', 'Photos/Images: 148,212 good · 310 suspect · 96 not recovered (612 GB).\nDocuments: 38,504 good · 88 suspect · 41 not recovered (85 GB).\nVideo: 9,318 good · 1,730 suspect · 2,012 not recovered (890 GB).\nEmail/PST: 42 good · 2 suspect (18 GB). Databases: 6 good, mount-tested (34 GB).', 2),
          sec('critical_files', 'Critical Files Verification', '/Family Photos (2009–2026) — RECOVERED, sample-opened and verified.\n/QuickBooks/company.qbw — RECOVERED, opens and passes integrity check.\n/Projects/CAD — RECOVERED with original folder structure.', 3),
          sec('recovered_files_summary', 'Recovered Files Summary', 'The complete searchable file listing (original folder structure, per-file size, modified date and condition rating) is available in your secure portal. Files rated Suspect/Partial are grouped in a separate "Data with errors" folder for review.', 4),
          sec('limitations', 'Limitations & Disclaimers', 'Suspect/Partial means a file is present but may not open correctly due to content gaps from unreadable sectors. 2,184 video files in the damaged platter zone were not recoverable (physically unreadable). No destructive techniques were declined or skipped — the source was fully imaged.', 5),
          sec('delivery_details', 'Delivery & Data Retention', 'Delivery: new encrypted external drive (AES-256); the password is sent via a separate channel.\nOur working copy is retained for 14 days after delivery and securely deleted on 28 Jun 2026 (NIST SP 800-88 aligned). Verify your data before that date — after deletion we cannot re-supply it.', 6),
        ],
      };
    case 'forensic':
      return {
        ...base,
        report: { ...base.report, report_number: 'REP-FR-0105', report_type: 'forensic', title: 'Forensic Analysis' },
        sections: [
          sec('executive_summary', 'Executive Summary', 'The lab was instructed to acquire and examine one 2 TB hard drive in connection with the client\'s internal investigation. The evidence was imaged under write protection with verified hashes; the findings below are stated to a reasonable degree of professional certainty.', 0),
          sec('examiner_qualifications', 'Examiner Qualifications', 'Lead examiner: Lina Engineer, Senior Recovery Engineer — 9 years of digital forensics and data recovery experience; certified forensic examiner; cleanroom-qualified. Full CV available as an exhibit on request.', 1),
          sec('acquisition_details', 'Acquisition Methodology', 'Source imaged through a hardware write blocker (Tableau TX1, fw 23.2) using ddrescue for the degraded regions; E01 evidence container.\nAcquisition hash (SHA-256) matched the verification hash: MATCH.\n1,204 unreadable sectors logged and disclosed — expected for damaged media and documented in the error log.', 2),
          sec('findings', 'Diagnostic Findings', 'The drive shows a degraded head assembly consistent with gradual mechanical wear, not impact damage.\nThe user volume contains an intact NTFS file system; deleted-file artifacts recovered from unallocated space are listed in the artifacts exhibit.', 3),
          sec('conclusions', 'Conclusions & Expert Opinion', 'In my professional opinion, the data loss is consistent with progressive mechanical failure. The recovered artifacts are authentic to the source medium: every derivative work is hash-verified against the acquisition image.', 4),
          sec('limitations', 'Limitations & Disclaimers', '1,204 physically unreadable sectors could not be examined; their content is unknown. One encrypted container was identified for which no key was provided — its contents were not examined. Opinions reflect the evidence available at the examination date.', 5),
        ],
      };
    default:
      // Unknown subtype → the evaluation sample (mirrors DEFAULT_SUBTYPE).
      return sampleReportDataFor('evaluation');
  }
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
 * Swap the illustrative {@link SAMPLE_COMPANY} for the tenant's REAL company
 * settings when provided, so the Studio preview shows the tenant's own
 * header/branding/banking (the customer + line items stay sample). Returns the
 * data untouched when no override is given (legacy callers / tests).
 */
function withCompany<T extends { companySettings: CompanySettingsData }>(
  data: T,
  companySettings: CompanySettingsData | undefined,
): T {
  return companySettings ? { ...data, companySettings } : data;
}

/**
 * Resolve a document type to render-ready {@link EngineDocData} from sample data,
 * routing through the matching adapter. The fallback is the invoice sample.
 *
 * When `companySettings` is supplied, the tenant's real company settings replace
 * the sample company so the preview reflects the tenant's own branding/language;
 * omit it (tests, callers without a tenant) to keep the neutral sample company.
 */
export function buildPreviewEngineData(
  docType: TemplateDocumentType,
  config: DocumentTemplateConfig,
  companySettings?: CompanySettingsData,
  opts?: { reportSubtype?: string },
): EngineDocData {
  switch (docType) {
    case 'invoice':
      return invoiceToEngine(withCompany(sampleInvoiceData(), companySettings), config);
    case 'quote':
      return quoteToEngine(withCompany(sampleQuoteData(), companySettings), config);
    case 'credit_note':
      return creditNoteToEngine(withCompany(sampleCreditNoteData(), companySettings), config);
    case 'payment_receipt':
      return paymentReceiptToEngine(withCompany(samplePaymentReceiptData(), companySettings), config);
    case 'office_receipt':
      return receiptToEngine(withCompany(sampleReceiptData(), companySettings), config, 'office');
    case 'customer_copy':
      return receiptToEngine(withCompany(sampleReceiptData(), companySettings), config, 'customer');
    case 'checkout_form':
      return checkoutToEngine(withCompany(sampleCheckoutData(), companySettings), config);
    case 'case_label':
      return caseLabelToEngine(withCompany(sampleReceiptData(), companySettings), config);
    case 'chain_of_custody':
      return chainOfCustodyToEngine(withCompany(sampleChainOfCustodyData(), companySettings), config);
    case 'payslip':
      return payslipToEngine(withCompany(samplePayslipData(), companySettings), config);
    case 'report':
      return reportToEngine(
        withCompany(
          opts?.reportSubtype ? sampleReportDataFor(opts.reportSubtype) : sampleReportData(),
          companySettings,
        ),
        config,
        previewCtxFromConfig(config),
      );
    case 'stock_label':
      return stockLabelToEngine(sampleStockLabelData(), config);
    default:
      return invoiceToEngine(withCompany(sampleInvoiceData(), companySettings), config);
  }
}
