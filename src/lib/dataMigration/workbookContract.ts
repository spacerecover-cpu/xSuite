export type EntityType =
  | 'companies'
  | 'customers'
  | 'relationships'
  | 'cases'
  | 'devices'
  | 'quotes'
  | 'quoteItems'
  | 'invoices'
  | 'invoiceLineItems'
  | 'bankAccounts'
  | 'payments'
  | 'receipts'
  | 'expenses'
  | 'notes'
  | 'statusHistory'
  | 'inventoryLocations'
  | 'inventoryItems'
  | 'inventoryDonorParts';

export const WORKBOOK_SCHEMA_VERSION = 1 as const;

export const SHEET_NAMES: Record<EntityType, string> = {
  companies: 'Companies',
  customers: 'Customers',
  relationships: 'Relationships',
  cases: 'Cases',
  devices: 'Devices',
  quotes: 'Quotes',
  quoteItems: 'QuoteItems',
  invoices: 'Invoices',
  invoiceLineItems: 'InvoiceLineItems',
  bankAccounts: 'BankAccounts',
  payments: 'Payments',
  receipts: 'Receipts',
  expenses: 'Expenses',
  notes: 'Notes',
  statusHistory: 'StatusHistory',
  inventoryLocations: 'InventoryLocations',
  inventoryItems: 'InventoryItems',
  inventoryDonorParts: 'InventoryDonorParts',
};

// Dependency-ordered: parent before child throughout.
// companies → customers → relationships → cases → devices
//                                               → quotes → quoteItems
//                                               → invoices → invoiceLineItems
//                                               → notes
//                                               → statusHistory
// A workbook belongs to exactly ONE domain — the case-records graph OR inventory. The two are
// never mixed in a single file: each has its own template, import/export flow, and a `domain`
// marker in `_meta` so a file from one domain cannot be imported into the other.
export type WorkbookDomain = 'records' | 'inventory';

export const WORKBOOK_DOMAINS: WorkbookDomain[] = ['records', 'inventory'];

export const DOMAIN_LABELS: Record<WorkbookDomain, string> = {
  records: 'Case Records',
  inventory: 'Inventory',
};

// Per-domain entity lists, in dependency order (parent before child).
export const DOMAIN_ENTITIES: Record<WorkbookDomain, EntityType[]> = {
  records: [
    'companies',
    'customers',
    'relationships',
    'cases',
    'devices',
    'quotes',
    'quoteItems',
    'invoices',
    'invoiceLineItems',
    'bankAccounts',
    'payments',
    'receipts',
    'expenses',
    'notes',
    'statusHistory',
  ],
  // Inventory forms its own independent sub-graph: locations (self-parent) → items → donor parts.
  inventory: [
    'inventoryLocations',
    'inventoryItems',
    'inventoryDonorParts',
  ],
};

/** Full dependency-ordered entity list across both domains (records first, then inventory). */
export const IMPORT_ORDER: EntityType[] = [...DOMAIN_ENTITIES.records, ...DOMAIN_ENTITIES.inventory];

/** Which domain an entity belongs to. */
export function domainForEntity(entity: EntityType): WorkbookDomain {
  return DOMAIN_ENTITIES.inventory.includes(entity) ? 'inventory' : 'records';
}

export type ColType = 'string' | 'number' | 'boolean' | 'date' | 'uuid';

export interface ColumnDef {
  key: string;
  header: string;
  type: ColType;
  required?: boolean;
  /** When set, this column carries a legacy_id of another entity that must be
   *  resolved through data_migration_entity_map before insert. */
  ref?: EntityType;
}

export type RawRow = Record<string, unknown>;
export type ParsedWorkbook = Record<EntityType, RawRow[]>;

// ---------------------------------------------------------------------------
// ENTITY_COLUMNS
// Column lists are ground-truthed against information_schema.columns on the
// live Supabase project (queried 2026-06-30). Rules:
//   • Every entity starts with legacy_id (required:true) — the source system's
//     original id. On export this is the row's real UUID. On import it is an
//     opaque string that the RPC maps to a fresh UUID via data_migration_entity_map.
//   • Parent FK UUID columns become *_legacy_id string refs pointing to the
//     parent EntityType (resolved by the RPC through the entity map, never
//     by the browser).
//   • Catalog FK UUIDs (device_type_id, brand_id, capacity_id, interface_id,
//     condition_id) become human-readable string columns resolved by name at
//     import time in the RPC's catalog resolver. They carry no ref — they are
//     not entity-map relationships.
//   • System/internal columns omitted: tenant_id, created_by, updated_by,
//     deleted_at, updated_at (the RPC fills these authoritatively).
//   • created_at is included so original timestamps are preserved.
//   • metadata jsonb is not exposed in the workbook — the RPC injects
//     metadata.legacy_id and metadata.data_migration_run_id itself.
// ---------------------------------------------------------------------------

export const ENTITY_COLUMNS: Record<EntityType, ColumnDef[]> = {
  // ── companies (→ companies table) ────────────────────────────────────────
  companies: [
    { key: 'legacy_id',           header: 'Record Ref',            type: 'string',  required: true },
    { key: 'name',                header: 'Company Name',         type: 'string',  required: true },
    { key: 'company_number',      header: 'Company Number',       type: 'string' },
    { key: 'email',               header: 'Email',                type: 'string' },
    { key: 'phone',               header: 'Phone',                type: 'string' },
    { key: 'website',             header: 'Website',              type: 'string' },
    { key: 'address',             header: 'Address',              type: 'string' },
    { key: 'tax_number',          header: 'Tax Number',           type: 'string' },
    { key: 'registration_number', header: 'Registration Number',  type: 'string' },
    { key: 'contact_person',      header: 'Contact Person',       type: 'string' },
    { key: 'contact_email',       header: 'Contact Email',        type: 'string' },
    { key: 'contact_phone',       header: 'Contact Phone',        type: 'string' },
    { key: 'notes',               header: 'Notes',                type: 'string' },
    { key: 'is_active',           header: 'Is Active',            type: 'boolean' },
    { key: 'created_at',          header: 'Created At',           type: 'date' },
  ],

  // ── customers (→ customers_enhanced table) ────────────────────────────────
  customers: [
    { key: 'legacy_id',       header: 'Record Ref',       type: 'string',  required: true },
    { key: 'customer_name',   header: 'Customer Name',   type: 'string',  required: true },
    { key: 'customer_number', header: 'Customer Number', type: 'string' },
    { key: 'email',           header: 'Email',           type: 'string' },
    { key: 'mobile_number',   header: 'Mobile Number',   type: 'string' },
    { key: 'phone',           header: 'Phone',           type: 'string' },
    { key: 'whatsapp_number', header: 'WhatsApp Number', type: 'string' },
    { key: 'address',         header: 'Address',         type: 'string' },
    { key: 'company_name',    header: 'Company Name',    type: 'string' },
    { key: 'id_type',         header: 'ID Type',         type: 'string' },
    { key: 'id_number',       header: 'ID Number',       type: 'string' },
    { key: 'tax_number',      header: 'Tax Number',      type: 'string' },
    { key: 'source',          header: 'Source',          type: 'string' },
    { key: 'notes',           header: 'Notes',           type: 'string' },
    { key: 'is_active',       header: 'Is Active',       type: 'boolean' },
    { key: 'created_at',      header: 'Created At',      type: 'date' },
  ],

  // ── relationships (→ customer_company_relationships table) ────────────────
  relationships: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'customer_legacy_id', header: 'Customer Record Ref', type: 'string',  required: true, ref: 'customers' },
    { key: 'company_legacy_id',  header: 'Company Record Ref',  type: 'string',  required: true, ref: 'companies' },
    { key: 'role',               header: 'Role',               type: 'string' },
    { key: 'is_primary',         header: 'Is Primary',         type: 'boolean' },
    { key: 'created_at',         header: 'Created At',         type: 'date' },
  ],

  // ── cases (→ cases table) ─────────────────────────────────────────────────
  cases: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'case_number',        header: 'Case Number',        type: 'string' },
    { key: 'customer_legacy_id', header: 'Customer Record Ref', type: 'string',  required: true, ref: 'customers' },
    { key: 'company_legacy_id',  header: 'Company Record Ref',  type: 'string',  ref: 'companies' },
    { key: 'title',              header: 'Title',              type: 'string' },
    { key: 'subject',            header: 'Subject',            type: 'string' },
    { key: 'description',        header: 'Description',        type: 'string' },
    { key: 'status',             header: 'Status',             type: 'string' },
    { key: 'priority',           header: 'Priority',           type: 'string' },
    { key: 'diagnosis',          header: 'Diagnosis',          type: 'string' },
    { key: 'resolution',         header: 'Resolution',         type: 'string' },
    { key: 'recovery_outcome',   header: 'Recovery Outcome',   type: 'string' },
    { key: 'referred_by',        header: 'Referred By',        type: 'string' },
    { key: 'client_reference',   header: 'Client Reference',   type: 'string' },
    { key: 'is_urgent',          header: 'Is Urgent',          type: 'boolean' },
    { key: 'is_warranty',        header: 'Is Warranty',        type: 'boolean' },
    { key: 'estimated_completion', header: 'Estimated Completion', type: 'date' },
    { key: 'actual_completion',  header: 'Actual Completion',  type: 'date' },
    { key: 'created_at',         header: 'Created At',         type: 'date' },
  ],

  // ── devices (→ case_devices table) ───────────────────────────────────────
  // Catalog FKs (device_type_id, brand_id, capacity_id, interface_id,
  // condition_id) are represented as human-readable strings; the import RPC
  // (data_migration_import_batch) resolves them by name server-side at import time.
  devices: [
    { key: 'legacy_id',       header: 'Record Ref',       type: 'string',  required: true },
    { key: 'case_legacy_id',  header: 'Case Record Ref',  type: 'string',  required: true, ref: 'cases' },
    { key: 'device_type',     header: 'Device Type',     type: 'string' },
    { key: 'brand',           header: 'Brand',           type: 'string' },
    { key: 'model',           header: 'Model',           type: 'string' },
    { key: 'serial_number',   header: 'Serial Number',   type: 'string' },
    { key: 'capacity',        header: 'Capacity',        type: 'string' },
    { key: 'interface',       header: 'Interface',       type: 'string' },
    { key: 'condition',       header: 'Condition',       type: 'string' },
    { key: 'part_number',     header: 'Part Number',     type: 'string' },
    { key: 'firmware_version', header: 'Firmware Version', type: 'string' },
    { key: 'pcb_number',      header: 'PCB Number',      type: 'string' },
    { key: 'dcm',             header: 'DCM',             type: 'string' },
    { key: 'dom',             header: 'Date of Manufacture', type: 'date' },
    { key: 'physical_damage', header: 'Physical Damage', type: 'string' },
    { key: 'symptoms',        header: 'Symptoms',        type: 'string' },
    { key: 'diagnosis',       header: 'Diagnosis',       type: 'string' },
    { key: 'recovery_result', header: 'Recovery Result', type: 'string' },
    { key: 'data_recovered_size', header: 'Data Recovered Size', type: 'string' },
    { key: 'notes',           header: 'Notes',           type: 'string' },
    { key: 'storage_location', header: 'Storage Location', type: 'string' },
    { key: 'is_primary',      header: 'Is Primary',      type: 'boolean' },
    { key: 'created_at',      header: 'Created At',      type: 'date' },
  ],

  // ── quotes (→ quotes table) ───────────────────────────────────────────────
  quotes: [
    { key: 'legacy_id',       header: 'Record Ref',       type: 'string',  required: true },
    { key: 'case_legacy_id',  header: 'Case Record Ref',  type: 'string',  required: true, ref: 'cases' },
    { key: 'quote_number',    header: 'Quote Number',    type: 'string' },
    { key: 'title',           header: 'Title',           type: 'string' },
    { key: 'status',          header: 'Status',          type: 'string' },
    { key: 'quote_type',      header: 'Quote Type',      type: 'string' },
    { key: 'currency',        header: 'Currency',        type: 'string' },
    { key: 'exchange_rate',   header: 'Exchange Rate',   type: 'number' },
    { key: 'subtotal',        header: 'Subtotal',        type: 'number' },
    { key: 'discount_amount', header: 'Discount Amount', type: 'number' },
    { key: 'discount_type',   header: 'Discount Type',   type: 'string' },
    { key: 'tax_rate',        header: 'Tax Rate',        type: 'number' },
    { key: 'tax_amount',      header: 'Tax Amount',      type: 'number' },
    { key: 'total_amount',    header: 'Total Amount',    type: 'number' },
    { key: 'notes',           header: 'Notes',           type: 'string' },
    { key: 'terms',           header: 'Terms',           type: 'string' },
    { key: 'client_reference', header: 'Client Reference', type: 'string' },
    { key: 'quote_date',      header: 'Quote Date',      type: 'date' },
    { key: 'valid_until',     header: 'Valid Until',     type: 'date' },
    { key: 'approved_at',     header: 'Approved At',     type: 'date' },
    { key: 'created_at',      header: 'Created At',      type: 'date' },
  ],

  // ── quoteItems (→ quote_items table) ─────────────────────────────────────
  quoteItems: [
    { key: 'legacy_id',        header: 'Record Ref',        type: 'string',  required: true },
    { key: 'quote_legacy_id',  header: 'Quote Record Ref',  type: 'string',  required: true, ref: 'quotes' },
    { key: 'description',      header: 'Description',      type: 'string',  required: true },
    { key: 'quantity',         header: 'Quantity',         type: 'number' },
    { key: 'unit_price',       header: 'Unit Price',       type: 'number',  required: true },
    { key: 'discount',         header: 'Discount',         type: 'number' },
    { key: 'tax_rate',         header: 'Tax Rate',         type: 'number' },
    { key: 'tax_amount',       header: 'Tax Amount',       type: 'number' },
    { key: 'total',            header: 'Total',            type: 'number',  required: true },
    { key: 'sort_order',       header: 'Sort Order',       type: 'number' },
    { key: 'created_at',       header: 'Created At',       type: 'date' },
  ],

  // ── invoices (→ invoices table) ───────────────────────────────────────────
  invoices: [
    { key: 'legacy_id',       header: 'Record Ref',       type: 'string',  required: true },
    { key: 'case_legacy_id',  header: 'Case Record Ref',  type: 'string',  required: true, ref: 'cases' },
    { key: 'invoice_number',  header: 'Invoice Number',  type: 'string' },
    { key: 'title',           header: 'Title',           type: 'string' },
    { key: 'status',          header: 'Status',          type: 'string' },
    { key: 'invoice_type',    header: 'Invoice Type',    type: 'string' },
    { key: 'currency',        header: 'Currency',        type: 'string' },
    { key: 'exchange_rate',   header: 'Exchange Rate',   type: 'number' },
    { key: 'subtotal',        header: 'Subtotal',        type: 'number' },
    { key: 'discount_amount', header: 'Discount Amount', type: 'number' },
    { key: 'discount_type',   header: 'Discount Type',   type: 'string' },
    { key: 'tax_rate',        header: 'Tax Rate',        type: 'number' },
    { key: 'tax_amount',      header: 'Tax Amount',      type: 'number' },
    { key: 'total_amount',    header: 'Total Amount',    type: 'number' },
    { key: 'amount_paid',     header: 'Amount Paid',     type: 'number' },
    { key: 'balance_due',     header: 'Balance Due',     type: 'number' },
    { key: 'notes',           header: 'Notes',           type: 'string' },
    { key: 'terms',           header: 'Terms',           type: 'string' },
    { key: 'client_reference', header: 'Client Reference', type: 'string' },
    { key: 'invoice_date',    header: 'Invoice Date',    type: 'date' },
    { key: 'due_date',        header: 'Due Date',        type: 'date' },
    { key: 'sent_at',         header: 'Sent At',         type: 'date' },
    { key: 'paid_at',         header: 'Paid At',         type: 'date' },
    { key: 'created_at',      header: 'Created At',      type: 'date' },
  ],

  // ── invoiceLineItems (→ invoice_line_items table) ─────────────────────────
  invoiceLineItems: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'invoice_legacy_id',  header: 'Invoice Record Ref',  type: 'string',  required: true, ref: 'invoices' },
    { key: 'description',        header: 'Description',        type: 'string',  required: true },
    { key: 'quantity',           header: 'Quantity',           type: 'number' },
    { key: 'unit_price',         header: 'Unit Price',         type: 'number',  required: true },
    { key: 'discount',           header: 'Discount',           type: 'number' },
    { key: 'tax_rate',           header: 'Tax Rate',           type: 'number' },
    { key: 'tax_amount',         header: 'Tax Amount',         type: 'number' },
    { key: 'total',              header: 'Total',              type: 'number',  required: true },
    { key: 'sort_order',         header: 'Sort Order',         type: 'number' },
    { key: 'created_at',         header: 'Created At',         type: 'date' },
  ],

  // ── bankAccounts (→ bank_accounts table) ─────────────────────────────────
  // Balances are STORED fields (no trigger computes them) — set opening/current directly to
  // the cutover values. Payments and expenses reference an account via bank_account_legacy_id.
  bankAccounts: [
    { key: 'legacy_id',       header: 'Record Ref',       type: 'string',  required: true },
    { key: 'name',            header: 'Account Name',     type: 'string',  required: true },
    { key: 'account_number',  header: 'Account Number',   type: 'string' },
    { key: 'bank_name',       header: 'Bank Name',        type: 'string' },
    { key: 'account_type',    header: 'Account Type',     type: 'string' },
    { key: 'iban',            header: 'IBAN',             type: 'string' },
    { key: 'swift_code',      header: 'SWIFT Code',       type: 'string' },
    { key: 'branch_code',     header: 'Branch Code',      type: 'string' },
    { key: 'currency',        header: 'Currency',         type: 'string' },
    { key: 'opening_balance', header: 'Opening Balance',  type: 'number' },
    { key: 'current_balance', header: 'Current Balance',  type: 'number' },
    { key: 'is_default',      header: 'Is Default',       type: 'boolean' },
    { key: 'is_active',       header: 'Is Active',        type: 'boolean' },
    { key: 'notes',           header: 'Notes',            type: 'string' },
    { key: 'created_at',      header: 'Created At',       type: 'date' },
  ],

  // ── payments (→ payments table) ──────────────────────────────────────────
  // Invoice payments. bank_account_legacy_id + invoice_legacy_id resolve through the entity
  // map; payment_method resolves by name against the GLOBAL master_payment_methods. On import
  // the RPC also posts a financial_transactions (GL) row for the money-in.
  payments: [
    { key: 'legacy_id',              header: 'Record Ref',           type: 'string',  required: true },
    { key: 'invoice_legacy_id',      header: 'Invoice Record Ref',   type: 'string',  ref: 'invoices' },
    { key: 'customer_legacy_id',     header: 'Customer Record Ref',  type: 'string',  ref: 'customers' },
    { key: 'case_legacy_id',         header: 'Case Record Ref',      type: 'string',  ref: 'cases' },
    { key: 'bank_account_legacy_id', header: 'Bank Account Ref',     type: 'string',  ref: 'bankAccounts' },
    { key: 'payment_number',         header: 'Payment Number',       type: 'string' },
    { key: 'amount',                 header: 'Amount',               type: 'number',  required: true },
    { key: 'currency',               header: 'Currency',             type: 'string' },
    { key: 'exchange_rate',          header: 'Exchange Rate',        type: 'number' },
    { key: 'payment_method',         header: 'Payment Method',       type: 'string' },
    { key: 'payment_date',           header: 'Payment Date',         type: 'date' },
    { key: 'reference',              header: 'Reference',            type: 'string' },
    { key: 'status',                 header: 'Status',               type: 'string' },
    { key: 'notes',                  header: 'Notes',                type: 'string' },
    { key: 'created_at',             header: 'Created At',           type: 'date' },
  ],

  // ── receipts (→ receipts table) ──────────────────────────────────────────
  // Standalone customer money-in (not tied to a bank account column on the receipts table).
  receipts: [
    { key: 'legacy_id',          header: 'Record Ref',           type: 'string',  required: true },
    { key: 'customer_legacy_id', header: 'Customer Record Ref',  type: 'string',  ref: 'customers' },
    { key: 'receipt_number',     header: 'Receipt Number',       type: 'string' },
    { key: 'amount',             header: 'Amount',               type: 'number',  required: true },
    { key: 'currency_code',      header: 'Currency',             type: 'string' },
    { key: 'exchange_rate',      header: 'Exchange Rate',        type: 'number' },
    { key: 'payment_method',     header: 'Payment Method',       type: 'string' },
    { key: 'receipt_date',       header: 'Receipt Date',         type: 'date' },
    { key: 'reference',          header: 'Reference',            type: 'string' },
    { key: 'status',             header: 'Status',               type: 'string' },
    { key: 'notes',              header: 'Notes',                type: 'string' },
    { key: 'created_at',         header: 'Created At',           type: 'date' },
  ],

  // ── expenses (→ expenses table) ──────────────────────────────────────────
  // category resolves by name against the GLOBAL master_expense_categories; bank account + case
  // through the entity map. status ∈ draft/pending/approved/rejected/paid/voided. On import the
  // RPC posts a financial_transactions (GL) row for the money-out.
  expenses: [
    { key: 'legacy_id',              header: 'Record Ref',           type: 'string',  required: true },
    { key: 'case_legacy_id',         header: 'Case Record Ref',      type: 'string',  ref: 'cases' },
    { key: 'bank_account_legacy_id', header: 'Bank Account Ref',     type: 'string',  ref: 'bankAccounts' },
    { key: 'expense_number',         header: 'Expense Number',       type: 'string' },
    { key: 'category',               header: 'Category',             type: 'string' },
    { key: 'vendor',                 header: 'Vendor',               type: 'string' },
    { key: 'description',            header: 'Description',          type: 'string' },
    { key: 'amount',                 header: 'Amount',               type: 'number',  required: true },
    { key: 'currency',               header: 'Currency',             type: 'string' },
    { key: 'exchange_rate',          header: 'Exchange Rate',        type: 'number' },
    { key: 'tax_amount',             header: 'Tax Amount',           type: 'number' },
    { key: 'expense_date',           header: 'Expense Date',         type: 'date' },
    { key: 'paid_at',                header: 'Paid At',              type: 'date' },
    { key: 'status',                 header: 'Status',               type: 'string' },
    { key: 'reference',              header: 'Reference',            type: 'string' },
    { key: 'is_billable',            header: 'Is Billable',          type: 'boolean' },
    { key: 'notes',                  header: 'Notes',                type: 'string' },
    { key: 'created_at',             header: 'Created At',           type: 'date' },
  ],

  // ── notes (→ case_internal_notes table) ──────────────────────────────────
  notes: [
    { key: 'legacy_id',      header: 'Record Ref',      type: 'string',  required: true },
    { key: 'case_legacy_id', header: 'Case Record Ref', type: 'string',  required: true, ref: 'cases' },
    { key: 'content',        header: 'Content',        type: 'string',  required: true },
    { key: 'created_at',     header: 'Created At',     type: 'date' },
  ],

  // ── statusHistory (→ case_job_history table) ──────────────────────────────
  // case_job_history is append-only (mutation guard in DB). The engine only
  // INSERTs here — never UPDATE/DELETE — preserving forensic integrity.
  statusHistory: [
    { key: 'legacy_id',      header: 'Record Ref',      type: 'string',  required: true },
    { key: 'case_legacy_id', header: 'Case Record Ref', type: 'string',  required: true, ref: 'cases' },
    { key: 'action',         header: 'Action',         type: 'string',  required: true },
    { key: 'old_value',      header: 'Old Value',      type: 'string' },
    { key: 'new_value',      header: 'New Value',      type: 'string' },
    { key: 'details',        header: 'Details',        type: 'string' },
    { key: 'created_at',     header: 'Performed At',   type: 'date' },
  ],

  // ── inventoryLocations (→ inventory_locations table) ──────────────────────
  // Hierarchical via parent_id (self-ref). parent_legacy_id is a SOFT ref: an
  // unresolved parent imports as NULL (report-only), so rows need not be topo-sorted.
  inventoryLocations: [
    { key: 'legacy_id',        header: 'Record Ref',          type: 'string',  required: true },
    { key: 'parent_legacy_id', header: 'Parent Location Ref', type: 'string',  ref: 'inventoryLocations' },
    { key: 'name',             header: 'Location Name',       type: 'string',  required: true },
    { key: 'location_code',    header: 'Location Code',       type: 'string' },
    { key: 'description',      header: 'Description',         type: 'string' },
    { key: 'is_active',        header: 'Is Active',           type: 'boolean' },
    { key: 'created_at',       header: 'Created At',          type: 'date' },
  ],

  // ── inventoryItems (→ inventory_items table) ──────────────────────────────
  // device_type/brand/capacity/interface resolve against the GLOBAL device catalogs
  // by name; condition/status/category resolve against the INVENTORY master tables
  // (master_inventory_condition_types/status_types/categories) — NOT the case-device
  // catalogs. item_number is preserved if supplied, else the DB trigger assigns a
  // per-device-type number. technical_details is a JSON-object string (family-keyed).
  inventoryItems: [
    { key: 'legacy_id',          header: 'Record Ref',              type: 'string',  required: true },
    { key: 'item_number',        header: 'Item Number',             type: 'string' },
    { key: 'device_type',        header: 'Device Type',             type: 'string' },
    { key: 'category',           header: 'Inventory Category',      type: 'string' },
    { key: 'brand',              header: 'Brand',                   type: 'string' },
    { key: 'model',              header: 'Model',                   type: 'string',  required: true },
    { key: 'serial_number',      header: 'Serial Number',           type: 'string' },
    { key: 'capacity',           header: 'Capacity',                type: 'string' },
    { key: 'interface',          header: 'Interface',               type: 'string' },
    { key: 'condition',          header: 'Condition',               type: 'string' },
    { key: 'status',             header: 'Status',                  type: 'string' },
    { key: 'location_legacy_id', header: 'Location Ref',            type: 'string',  ref: 'inventoryLocations' },
    { key: 'quantity',           header: 'Quantity',                type: 'number' },
    { key: 'min_quantity',       header: 'Min Quantity',            type: 'number' },
    { key: 'purchase_price',     header: 'Purchase Cost',           type: 'number' },
    { key: 'purchase_date',      header: 'Purchase Date',           type: 'date' },
    { key: 'is_donor',           header: 'Is Donor Drive',          type: 'boolean' },
    { key: 'description',        header: 'Description',             type: 'string' },
    { key: 'notes',              header: 'Notes',                   type: 'string' },
    { key: 'technical_details',  header: 'Technical Details (JSON)', type: 'string' },
    { key: 'created_at',         header: 'Created At',              type: 'date' },
  ],

  // ── inventoryDonorParts (→ inventory_donor_parts table) ───────────────────
  // Child of inventoryItems; only meaningful when the item is_donor. part_type is a
  // stable family-specific key (heads/pcb/controller/…). Unique (item_id, part_type).
  inventoryDonorParts: [
    { key: 'legacy_id',      header: 'Record Ref',      type: 'string',  required: true },
    { key: 'item_legacy_id', header: 'Item Record Ref', type: 'string',  required: true, ref: 'inventoryItems' },
    { key: 'part_type',      header: 'Part Type',       type: 'string',  required: true },
    { key: 'quantity',       header: 'Quantity',        type: 'number' },
    { key: 'condition',      header: 'Condition',       type: 'string' },
    { key: 'notes',          header: 'Notes',           type: 'string' },
    { key: 'created_at',     header: 'Created At',      type: 'date' },
  ],
};

// ── Template / JSON-spec generator ───────────────────────────────────────────
// Produces a plain-object snapshot of the workbook contract suitable for:
//   • JSON download (the spec file that ships with the feature)
//   • workbookBuilder's empty-template generation (P2)
//   • UI column-hint rendering (P4)
// The return value is intentionally free of any live module references so it
// can be serialised, cached, or diffed without side effects.

export interface ContractTemplateColumn {
  key: string;
  header: string;
  type: ColType;
  required?: boolean;
  ref?: EntityType;
}

export interface ContractTemplateSheet {
  sheetName: string;
  columns: ContractTemplateColumn[];
  requiredColumns: string[];
}

export interface ContractTemplate {
  schemaVersion: number;
  importOrder: EntityType[];
  sheets: Record<EntityType, ContractTemplateSheet>;
}

export function exportContractAsTemplate(): ContractTemplate {
  const sheets = {} as Record<EntityType, ContractTemplateSheet>;

  for (const entity of IMPORT_ORDER) {
    const cols = ENTITY_COLUMNS[entity];
    sheets[entity] = {
      sheetName: SHEET_NAMES[entity],
      columns: cols.map(c => ({
        key: c.key,
        header: c.header,
        type: c.type,
        ...(c.required !== undefined ? { required: c.required } : {}),
        ...(c.ref !== undefined ? { ref: c.ref } : {}),
      })),
      requiredColumns: cols.filter(c => c.required === true).map(c => c.key),
    };
  }

  return {
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    importOrder: [...IMPORT_ORDER],
    sheets,
  };
}
