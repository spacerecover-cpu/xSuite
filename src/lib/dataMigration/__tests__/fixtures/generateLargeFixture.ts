// src/lib/dataMigration/__tests__/fixtures/generateLargeFixture.ts
//
// Pure deterministic fixture generator — no DB, no supabase, no env vars.
// Uses a fast LCG seeded PRNG so the same seed always produces the same data.
// All ratios mirror the real scale targets from the P6 spec.

import type { ParsedWorkbook, RawRow } from '../../workbookContract';

// ---------------------------------------------------------------------------
// Lightweight seeded PRNG (Park-Miller LCG)
// ---------------------------------------------------------------------------
function makePrng(seed: number) {
  let s = seed >>> 0 || 1;
  return {
    next(): number {
      s = Math.imul(s, 48271) >>> 0;
      return s / 0x100000000;
    },
    int(max: number): number {
      return Math.floor(this.next() * max);
    },
    pick<T>(arr: T[]): T {
      return arr[this.int(arr.length)];
    },
    uuid(): string {
      // Produce a deterministic UUID-like string (v4 shape but seeded)
      const h = () => (this.next() * 0x100000000 >>> 0).toString(16).padStart(8, '0');
      return `${h().slice(0,8)}-${h().slice(0,4)}-4${h().slice(1,4)}-${['8','9','a','b'][this.int(4)]}${h().slice(1,3)}-${h()}${h().slice(0,4)}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Proportion constants (used both here and exported as FIXTURE_COUNTS)
// ---------------------------------------------------------------------------
const COMPANIES_PER = 5;        // 1 company per 5 customers
const CASES_PER_CUSTOMER = 1.5;
const DEVICES_PER_CASE = 1.5;
const QUOTES_PER_CASE = 1;
const QUOTE_ITEMS_PER_QUOTE = 2;
const INVOICES_PER_CASE = 1;
const INVOICE_LINE_ITEMS_PER_INVOICE = 2;
const NOTES_PER_CASE = 2;
const STATUS_HISTORY_PER_CASE = 3;

export interface LargeFixtureCounts {
  companies: number;
  customers: number;
  relationships: number;
  cases: number;
  devices: number;
  quotes: number;
  quoteItems: number;
  invoices: number;
  invoiceLineItems: number;
  notes: number;
  statusHistory: number;
}

export function FIXTURE_COUNTS(customerCount: number): LargeFixtureCounts {
  const companies = Math.floor(customerCount / COMPANIES_PER);
  const cases = Math.floor(customerCount * CASES_PER_CUSTOMER);
  const devices = Math.floor(cases * DEVICES_PER_CASE);
  const quotes = Math.floor(cases * QUOTES_PER_CASE);
  const quoteItems = quotes * QUOTE_ITEMS_PER_QUOTE;
  const invoices = Math.floor(cases * INVOICES_PER_CASE);
  const invoiceLineItems = invoices * INVOICE_LINE_ITEMS_PER_INVOICE;
  const notes = cases * NOTES_PER_CASE;
  const statusHistory = cases * STATUS_HISTORY_PER_CASE;
  return {
    companies,
    customers: customerCount,
    relationships: customerCount,          // 1 primary relationship per customer
    cases,
    devices,
    quotes,
    quoteItems,
    invoices,
    invoiceLineItems,
    notes,
    statusHistory,
  };
}

// ---------------------------------------------------------------------------
// Catalogue stubs (catalog names the RPC catalog resolver understands)
// ---------------------------------------------------------------------------
const DEVICE_TYPES = ['HDD', 'SSD', 'NVMe', 'RAID', 'USB Drive', 'SD Card'];
const BRANDS = ['Seagate', 'Western Digital', 'Samsung', 'Toshiba', 'Kingston'];
const CAPACITIES = ['500GB', '1TB', '2TB', '4TB', '8TB'];
const INTERFACES = ['SATA', 'USB', 'PCIe', 'IDE', 'SAS'];
const CONDITIONS = ['Good', 'Fair', 'Poor', 'Damaged'];
const STATUSES = ['pending', 'in_progress', 'completed', 'on_hold'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected'];
// Must match the live invoices_status_check CHECK constraint
// (draft/sent/paid/partial/overdue/cancelled/void/converted).
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'partial', 'overdue'];

// ---------------------------------------------------------------------------
// Helper: ISO timestamp offset by `offsetMs` from base
// ---------------------------------------------------------------------------
function isoOffset(base: Date, offsetMs: number): string {
  return new Date(base.getTime() + offsetMs).toISOString();
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export interface FixtureOptions {
  customerCount?: number;
  seed?: number;
}

export function generateLargeFixture(opts: FixtureOptions = {}): ParsedWorkbook {
  const customerCount = opts.customerCount ?? 10_000;
  const rng = makePrng(opts.seed ?? 1337);

  // Epoch reference: data spans the year 2024
  const epochBase = new Date('2024-01-01T08:00:00.000Z');
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  // ---- companies ----------------------------------------------------------
  const companyCount = Math.floor(customerCount / COMPANIES_PER);
  const companies: RawRow[] = [];
  const companyIds: string[] = [];

  for (let i = 0; i < companyCount; i++) {
    const id = rng.uuid();
    companyIds.push(id);
    const createdAt = isoOffset(epochBase, rng.int(YEAR_MS));
    companies.push({
      legacy_id: id,
      name: `Company ${i + 1}`,
      email: `info${i + 1}@company${i + 1}.example.com`,
      phone: `+1555${String(i).padStart(7, '0')}`,
      address: `${i + 1} Industrial Ave, Springfield`,
      contact_person: `Contact ${i + 1}`,
      contact_email: `contact${i + 1}@company${i + 1}.example.com`,
      contact_phone: `+1999${String(i).padStart(7, '0')}`,
      // Alternate so BOTH the explicit-false and the true paths round-trip — proves the
      // import COALESCE((is_active)::boolean, true) does not clobber an explicit false.
      is_active: i % 2 === 0,
      // Half supply a company_number (must be preserved), half leave it blank (must be
      // auto-filled by finalize). Customers below leave customer_number blank entirely.
      ...(i % 2 === 0 ? { company_number: `CMP-SUP-${i}` } : {}),
      created_at: createdAt,
    });
  }

  // ---- customers ----------------------------------------------------------
  const customers: RawRow[] = [];
  const customerIds: string[] = [];

  for (let i = 0; i < customerCount; i++) {
    const id = rng.uuid();
    customerIds.push(id);
    const createdAt = isoOffset(epochBase, rng.int(YEAR_MS));
    customers.push({
      legacy_id: id,
      customer_name: `First${i + 1} Last${i + 1}`,
      email: `customer${i + 1}@example.com`,
      phone: `+447${String(i).padStart(9, '0')}`,
      address: `${i + 1} Recovery Lane, Data City`,
      created_at: createdAt,
    });
  }

  // ---- relationships (1 primary per customer, round-robin company) --------
  const relationships: RawRow[] = [];
  for (let i = 0; i < customerCount; i++) {
    relationships.push({
      legacy_id: rng.uuid(),
      customer_legacy_id: customerIds[i],
      company_legacy_id: companyIds[i % companyCount],
      is_primary: true,
      role: 'client',
      created_at: customers[i]['created_at'],
    });
  }

  // ---- cases (1.5 per customer) -------------------------------------------
  const caseCount = Math.floor(customerCount * CASES_PER_CUSTOMER);
  const cases: RawRow[] = [];
  const caseIds: string[] = [];

  for (let i = 0; i < caseCount; i++) {
    const id = rng.uuid();
    caseIds.push(id);
    const custIdx = i % customerCount;
    const companyIdx = custIdx % companyCount;
    const baseTs = epochBase.getTime() + rng.int(YEAR_MS);
    cases.push({
      legacy_id: id,
      case_number: `CASE-${String(i + 1).padStart(5, '0')}`,
      customer_legacy_id: customerIds[custIdx],
      company_legacy_id: companyIds[companyIdx],
      status: rng.pick(STATUSES),
      priority: rng.pick(PRIORITIES),
      title: `Recovery job ${i + 1}`,
      description: `Fixture-generated case ${i + 1} for scale testing`,
      created_at: new Date(baseTs).toISOString(),
    });
  }

  // ---- devices (1.5 per case) ---------------------------------------------
  const deviceCount = Math.floor(caseCount * DEVICES_PER_CASE);
  const devices: RawRow[] = [];

  for (let i = 0; i < deviceCount; i++) {
    const caseIdx = i % caseCount;
    devices.push({
      legacy_id: rng.uuid(),
      case_legacy_id: caseIds[caseIdx],
      device_type: rng.pick(DEVICE_TYPES),
      brand: rng.pick(BRANDS),
      model: `Model-${rng.int(9000) + 1000}`,
      serial_number: `SN${rng.int(900000000) + 100000000}`,
      capacity: rng.pick(CAPACITIES),
      interface: rng.pick(INTERFACES),
      condition: rng.pick(CONDITIONS),
      // Forensic fields — donor-matching fingerprints + fault/outcome + physical tracking.
      part_number: `PN-${rng.int(9000) + 1000}`,
      firmware_version: rng.pick(['CC26', 'CC27', 'SC61', '0002', 'AN01']),
      pcb_number: `PCB-${rng.int(9000) + 1000}`,
      dcm: `DCM${rng.int(9000) + 1000}`,
      dom: isoOffset(epochBase, rng.int(YEAR_MS)).slice(0, 10), // YYYY-MM-DD (date column)
      physical_damage: rng.pick(['none', 'water ingress', 'clicking', 'burnt PCB', 'dropped']),
      diagnosis: rng.pick(['head crash', 'firmware corruption', 'bad sectors', 'PCB failure', 'stiction']),
      recovery_result: rng.pick(['full', 'partial', 'none', 'pending']),
      data_recovered_size: `${rng.int(2000)}GB`,
      storage_location: `Shelf ${rng.pick(['A', 'B', 'C'])}${rng.int(20) + 1}`,
      // First device of each case is the primary ("patient") device.
      is_primary: i < caseCount,
      created_at: cases[caseIdx]['created_at'],
    });
  }

  // ---- quotes (1 per case) ------------------------------------------------
  const quoteIds: string[] = [];
  const quotes: RawRow[] = [];

  for (let i = 0; i < caseCount; i++) {
    const id = rng.uuid();
    quoteIds.push(id);
    const subtotal = (rng.int(4500) + 500) / 10; // 50.0 – 500.0
    quotes.push({
      legacy_id: id,
      quote_number: `QUOTE-${String(i + 1).padStart(5, '0')}`,
      case_legacy_id: caseIds[i],
      status: rng.pick(QUOTE_STATUSES),
      subtotal,
      tax_amount: +(subtotal * 0.05).toFixed(2),
      total_amount: +(subtotal * 1.05).toFixed(2),
      created_at: cases[i]['created_at'],
    });
  }

  // ---- quoteItems (2 per quote) -------------------------------------------
  const quoteItems: RawRow[] = [];
  for (let i = 0; i < quoteIds.length; i++) {
    for (let j = 0; j < QUOTE_ITEMS_PER_QUOTE; j++) {
      const unitPrice = (rng.int(200) + 50) / 2;
      quoteItems.push({
        legacy_id: rng.uuid(),
        quote_legacy_id: quoteIds[i],
        description: `Service item ${j + 1} for quote ${i + 1}`,
        quantity: 1,
        unit_price: unitPrice,
        total: unitPrice,
        sort_order: j + 1,
        created_at: quotes[i]['created_at'],
      });
    }
  }

  // ---- invoices (1 per case) ----------------------------------------------
  const invoiceIds: string[] = [];
  const invoices: RawRow[] = [];

  for (let i = 0; i < caseCount; i++) {
    const id = rng.uuid();
    invoiceIds.push(id);
    const subtotal = (rng.int(4500) + 500) / 10;
    invoices.push({
      legacy_id: id,
      invoice_number: `INV-${String(i + 1).padStart(5, '0')}`,
      case_legacy_id: caseIds[i],
      status: rng.pick(INVOICE_STATUSES),
      subtotal,
      tax_amount: +(subtotal * 0.05).toFixed(2),
      total_amount: +(subtotal * 1.05).toFixed(2),
      due_date: isoOffset(new Date(cases[i]['created_at'] as string), 30 * 24 * 60 * 60 * 1000),
      created_at: cases[i]['created_at'],
    });
  }

  // ---- invoiceLineItems (2 per invoice) -----------------------------------
  const invoiceLineItems: RawRow[] = [];
  for (let i = 0; i < invoiceIds.length; i++) {
    for (let j = 0; j < INVOICE_LINE_ITEMS_PER_INVOICE; j++) {
      const unitPrice = (rng.int(200) + 50) / 2;
      invoiceLineItems.push({
        legacy_id: rng.uuid(),
        invoice_legacy_id: invoiceIds[i],
        description: `Line item ${j + 1} for invoice ${i + 1}`,
        quantity: 1,
        unit_price: unitPrice,
        tax_amount: +(unitPrice * 0.05).toFixed(2),
        total: +(unitPrice * 1.05).toFixed(2),
        created_at: invoices[i]['created_at'],
      });
    }
  }

  // ---- notes (2 per case) -------------------------------------------------
  const notes: RawRow[] = [];
  for (let i = 0; i < caseCount; i++) {
    for (let j = 0; j < NOTES_PER_CASE; j++) {
      notes.push({
        legacy_id: rng.uuid(),
        case_legacy_id: caseIds[i],
        content: `Fixture note ${j + 1} for case ${i + 1}. Contains recovery details for scale testing.`,
        created_at: isoOffset(
          new Date(cases[i]['created_at'] as string),
          (j + 1) * 3600_000,
        ),
      });
    }
  }

  // ---- statusHistory (3 per case, ascending timestamps) -------------------
  const statusHistory: RawRow[] = [];
  const STATUS_TRANSITIONS = [
    ['', 'pending'],
    ['pending', 'in_progress'],
    ['in_progress', 'completed'],
  ];

  for (let i = 0; i < caseCount; i++) {
    const caseCreatedAt = new Date(cases[i]['created_at'] as string).getTime();
    for (let j = 0; j < STATUS_HISTORY_PER_CASE; j++) {
      statusHistory.push({
        legacy_id: rng.uuid(),
        case_legacy_id: caseIds[i],
        action: 'status_change',
        old_value: STATUS_TRANSITIONS[j][0],
        new_value: STATUS_TRANSITIONS[j][1],
        performed_at: new Date(caseCreatedAt + (j + 1) * 3600_000).toISOString(),
        created_at: new Date(caseCreatedAt + (j + 1) * 3600_000).toISOString(),
      });
    }
  }

  // ---- bankAccounts (2 fixed accounts) ------------------------------------
  const bankAccountIds: string[] = [];
  const bankAccounts: RawRow[] = [];
  for (let i = 0; i < 2; i++) {
    const id = rng.uuid();
    bankAccountIds.push(id);
    bankAccounts.push({
      legacy_id: id,
      name: i === 0 ? 'Main Operating Account' : 'Cash Drawer',
      account_number: `ACC-${1000 + i}`,
      bank_name: i === 0 ? 'Bank of Recovery' : 'Cash',
      currency: 'USD',
      opening_balance: 10000 + i * 5000,
      current_balance: 12000 + i * 5000,
      is_default: i === 0,
      is_active: true,
      created_at: isoOffset(epochBase, 0),
    });
  }

  // ---- payments (1 per invoice, alternating bank account) -----------------
  const payments: RawRow[] = [];
  for (let i = 0; i < invoiceIds.length; i++) {
    payments.push({
      legacy_id: rng.uuid(),
      invoice_legacy_id: invoiceIds[i],
      customer_legacy_id: customerIds[i % customerCount],
      bank_account_legacy_id: bankAccountIds[i % bankAccountIds.length],
      payment_number: `PAY-${String(i + 1).padStart(5, '0')}`,
      amount: invoices[i]['total_amount'] as number,
      currency: 'USD',
      payment_method: 'Cash',
      payment_date: invoices[i]['created_at'],
      status: 'completed',
      created_at: invoices[i]['created_at'],
    });
  }

  // ---- receipts (1 per 10 customers) --------------------------------------
  const receipts: RawRow[] = [];
  for (let i = 0; i < Math.floor(customerCount / 10); i++) {
    receipts.push({
      legacy_id: rng.uuid(),
      customer_legacy_id: customerIds[i],
      receipt_number: `RCP-${String(i + 1).padStart(5, '0')}`,
      amount: rng.int(1000) + 100,
      currency_code: 'USD',
      payment_method: 'Cash',
      receipt_date: customers[i]['created_at'],
      status: 'issued',
      created_at: customers[i]['created_at'],
    });
  }

  // ---- expenses (1 per 10 cases, alternating bank account) ----------------
  const expenses: RawRow[] = [];
  for (let i = 0; i < Math.floor(caseCount / 10); i++) {
    expenses.push({
      legacy_id: rng.uuid(),
      case_legacy_id: caseIds[i],
      bank_account_legacy_id: bankAccountIds[i % bankAccountIds.length],
      expense_number: `EXP-${String(i + 1).padStart(5, '0')}`,
      category: 'Parts',
      vendor: `Vendor ${i + 1}`,
      description: `Donor part for case ${i + 1}`,
      amount: rng.int(500) + 50,
      currency: 'USD',
      tax_amount: 0,
      expense_date: cases[i]['created_at'],
      status: 'paid',
      is_billable: i % 2 === 0,
      created_at: cases[i]['created_at'],
    });
  }

  // Inventory is imported/exported as a SEPARATE domain workbook (not mixed with case records),
  // so this records-domain fixture leaves the inventory entities empty. Inventory round-trip is
  // covered end-to-end by the rolled-back live smoke test.
  const inventoryLocations: RawRow[] = [];
  const inventoryItems: RawRow[] = [];
  const inventoryDonorParts: RawRow[] = [];

  // Newer records-domain entities + the procurement/stock/hr domains are exercised by the
  // rolled-back live smoke tests, not this scale fixture — present but empty.
  const empty: RawRow[] = [];

  return {
    companies,
    customerGroups: empty,
    customers,
    relationships,
    cases,
    devices,
    quotes,
    quoteItems,
    invoices,
    invoiceLineItems,
    bankAccounts,
    payments,
    receipts,
    expenses,
    accountTransfers: empty,
    paymentDisbursements: empty,
    creditNotes: empty,
    creditNoteItems: empty,
    creditNoteAllocations: empty,
    customerCommunications: empty,
    caseCommunications: empty,
    caseRecoveryAttempts: empty,
    deviceDiagnostics: empty,
    cloneDrives: empty,
    notes,
    statusHistory,
    inventoryLocations,
    inventoryItems,
    inventoryDonorParts,
    suppliers: empty,
    supplierContacts: empty,
    purchaseOrders: empty,
    purchaseOrderItems: empty,
    stockCategories: empty,
    stockLocations: empty,
    stockItems: empty,
    stockSerialNumbers: empty,
    stockSales: empty,
    stockSaleItems: empty,
    departments: empty,
    positions: empty,
    employees: empty,
    leaveBalances: empty,
    employeeLoans: empty,
  };
}
