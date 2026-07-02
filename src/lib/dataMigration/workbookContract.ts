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
  | 'customerGroups'
  | 'accountTransfers'
  | 'paymentDisbursements'
  | 'creditNotes'
  | 'creditNoteItems'
  | 'creditNoteAllocations'
  | 'customerCommunications'
  | 'caseCommunications'
  | 'caseRecoveryAttempts'
  | 'deviceDiagnostics'
  | 'cloneDrives'
  | 'notes'
  | 'statusHistory'
  | 'inventoryLocations'
  | 'inventoryItems'
  | 'inventoryDonorParts'
  | 'suppliers'
  | 'supplierContacts'
  | 'purchaseOrders'
  | 'purchaseOrderItems'
  | 'stockCategories'
  | 'stockLocations'
  | 'stockItems'
  | 'stockSerialNumbers'
  | 'stockSales'
  | 'stockSaleItems'
  | 'departments'
  | 'positions'
  | 'employees'
  | 'leaveBalances'
  | 'employeeLoans';

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
  customerGroups: 'CustomerGroups',
  accountTransfers: 'AccountTransfers',
  paymentDisbursements: 'Disbursements',
  creditNotes: 'CreditNotes',
  creditNoteItems: 'CreditNoteItems',
  creditNoteAllocations: 'CreditNoteAllocations',
  customerCommunications: 'CustomerCommunications',
  caseCommunications: 'CaseCommunications',
  caseRecoveryAttempts: 'RecoveryAttempts',
  deviceDiagnostics: 'DeviceDiagnostics',
  cloneDrives: 'CloneDrives',
  notes: 'Notes',
  statusHistory: 'StatusHistory',
  inventoryLocations: 'InventoryLocations',
  inventoryItems: 'InventoryItems',
  inventoryDonorParts: 'InventoryDonorParts',
  suppliers: 'Suppliers',
  supplierContacts: 'SupplierContacts',
  purchaseOrders: 'PurchaseOrders',
  purchaseOrderItems: 'PurchaseOrderItems',
  stockCategories: 'StockCategories',
  stockLocations: 'StockLocations',
  stockItems: 'StockItems',
  stockSerialNumbers: 'StockSerialNumbers',
  stockSales: 'StockSales',
  stockSaleItems: 'StockSaleItems',
  departments: 'Departments',
  positions: 'Positions',
  employees: 'Employees',
  leaveBalances: 'LeaveBalances',
  employeeLoans: 'EmployeeLoans',
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
export type WorkbookDomain = 'records' | 'inventory' | 'procurement' | 'stock' | 'hr';

export const WORKBOOK_DOMAINS: WorkbookDomain[] = ['records', 'inventory', 'procurement', 'stock', 'hr'];

export const DOMAIN_LABELS: Record<WorkbookDomain, string> = {
  records: 'Case Records',
  inventory: 'Inventory',
  procurement: 'Suppliers & Purchasing',
  stock: 'Stock & Products',
  hr: 'HR & Employees',
};

// Per-domain entity lists, in dependency order (parent before child).
// Cross-domain references (e.g. a stock sale's customer, a PO item's stock item) are NOT
// entity-map refs — they resolve server-side against live rows by business key (email,
// case_number, sku, supplier_number, …), so each domain imports independently.
export const DOMAIN_ENTITIES: Record<WorkbookDomain, EntityType[]> = {
  records: [
    'companies',
    'customerGroups',
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
    'accountTransfers',
    'paymentDisbursements',
    'creditNotes',
    'creditNoteItems',
    'creditNoteAllocations',
    'customerCommunications',
    'caseCommunications',
    'caseRecoveryAttempts',
    'deviceDiagnostics',
    'cloneDrives',
    'notes',
    'statusHistory',
  ],
  // Inventory forms its own independent sub-graph: locations (self-parent) → items → donor parts.
  inventory: [
    'inventoryLocations',
    'inventoryItems',
    'inventoryDonorParts',
  ],
  procurement: [
    'suppliers',
    'supplierContacts',
    'purchaseOrders',
    'purchaseOrderItems',
  ],
  stock: [
    'stockCategories',
    'stockLocations',
    'stockItems',
    'stockSerialNumbers',
    'stockSales',
    'stockSaleItems',
  ],
  hr: [
    'departments',
    'positions',
    'employees',
    'leaveBalances',
    'employeeLoans',
  ],
};

/** Full dependency-ordered entity list across all domains. */
export const IMPORT_ORDER: EntityType[] = WORKBOOK_DOMAINS.flatMap((d) => DOMAIN_ENTITIES[d]);

/** Which domain an entity belongs to. */
export function domainForEntity(entity: EntityType): WorkbookDomain {
  return WORKBOOK_DOMAINS.find((d) => DOMAIN_ENTITIES[d].includes(entity)) ?? 'records';
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
    { key: 'customer_group',  header: 'Customer Group',  type: 'string' },
    { key: 'notes',           header: 'Notes',           type: 'string' },
    { key: 'is_active',       header: 'Is Active',       type: 'boolean' },
    { key: 'created_at',      header: 'Created At',      type: 'date' },
  ],

  // ── customerGroups (→ customer_groups table) ──────────────────────────────
  // Imported BEFORE customers so group membership (customers.customer_group by name) resolves.
  customerGroups: [
    { key: 'legacy_id',           header: 'Record Ref',           type: 'string',  required: true },
    { key: 'name',                header: 'Group Name',           type: 'string',  required: true },
    { key: 'description',         header: 'Description',          type: 'string' },
    { key: 'discount_percentage', header: 'Discount %',           type: 'number' },
    { key: 'is_active',           header: 'Is Active',            type: 'boolean' },
    { key: 'created_at',          header: 'Created At',           type: 'date' },
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

  // ── accountTransfers (→ account_transfers table) ──────────────────────────
  // Historical inter-account moves. The RPC inserts rows only — it does NOT re-run the app's
  // balance side-effect; balances come from the BankAccounts sheet's cutover values.
  accountTransfers: [
    { key: 'legacy_id',            header: 'Record Ref',        type: 'string',  required: true },
    { key: 'from_bank_legacy_id',  header: 'From Account Ref',  type: 'string',  required: true, ref: 'bankAccounts' },
    { key: 'to_bank_legacy_id',    header: 'To Account Ref',    type: 'string',  required: true, ref: 'bankAccounts' },
    { key: 'amount',               header: 'Amount',            type: 'number',  required: true },
    { key: 'transfer_date',        header: 'Transfer Date',     type: 'date' },
    { key: 'reference',            header: 'Reference',         type: 'string' },
    { key: 'status',               header: 'Status',            type: 'string' },
    { key: 'notes',                header: 'Notes',             type: 'string' },
    { key: 'created_at',           header: 'Created At',        type: 'date' },
  ],

  // ── paymentDisbursements (→ payment_disbursements table) ──────────────────
  paymentDisbursements: [
    { key: 'legacy_id',              header: 'Record Ref',          type: 'string',  required: true },
    { key: 'disbursement_number',    header: 'Disbursement Number', type: 'string' },
    { key: 'bank_account_legacy_id', header: 'Bank Account Ref',    type: 'string',  ref: 'bankAccounts' },
    { key: 'expense_legacy_id',      header: 'Expense Record Ref',  type: 'string',  ref: 'expenses' },
    { key: 'payee_name',             header: 'Payee Name',          type: 'string' },
    { key: 'payee_type',             header: 'Payee Type',          type: 'string' },
    { key: 'amount',                 header: 'Amount',              type: 'number',  required: true },
    { key: 'disbursement_date',      header: 'Disbursement Date',   type: 'date' },
    { key: 'reference',              header: 'Reference',           type: 'string' },
    { key: 'status',                 header: 'Status',              type: 'string' },
    { key: 'notes',                  header: 'Notes',               type: 'string' },
    { key: 'created_at',             header: 'Created At',          type: 'date' },
  ],

  // ── creditNotes (→ credit_notes table) ────────────────────────────────────
  // credit_note_number is NOT NULL + unique per tenant; status/credit_type are DB CHECKs.
  creditNotes: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'credit_note_number', header: 'Credit Note Number',  type: 'string',  required: true },
    { key: 'invoice_legacy_id',  header: 'Invoice Record Ref',  type: 'string',  ref: 'invoices' },
    { key: 'case_legacy_id',     header: 'Case Record Ref',     type: 'string',  ref: 'cases' },
    { key: 'customer_legacy_id', header: 'Customer Record Ref', type: 'string',  ref: 'customers' },
    { key: 'credit_type',        header: 'Credit Type',         type: 'string' },
    { key: 'status',             header: 'Status',              type: 'string' },
    { key: 'currency',           header: 'Currency',            type: 'string' },
    { key: 'exchange_rate',      header: 'Exchange Rate',       type: 'number' },
    { key: 'subtotal',           header: 'Subtotal',            type: 'number' },
    { key: 'tax_rate',           header: 'Tax Rate',            type: 'number' },
    { key: 'tax_amount',         header: 'Tax Amount',          type: 'number' },
    { key: 'total_amount',       header: 'Total Amount',        type: 'number' },
    { key: 'applied_amount',     header: 'Applied Amount',      type: 'number' },
    { key: 'refunded_amount',    header: 'Refunded Amount',     type: 'number' },
    { key: 'reason_code',        header: 'Reason Code',         type: 'string' },
    { key: 'reason_notes',       header: 'Reason Notes',        type: 'string' },
    { key: 'credit_note_date',   header: 'Credit Note Date',    type: 'date' },
    { key: 'created_at',         header: 'Created At',          type: 'date' },
  ],

  // ── creditNoteItems (→ credit_note_items table) ───────────────────────────
  creditNoteItems: [
    { key: 'legacy_id',             header: 'Record Ref',             type: 'string',  required: true },
    { key: 'credit_note_legacy_id', header: 'Credit Note Record Ref', type: 'string',  required: true, ref: 'creditNotes' },
    { key: 'description',           header: 'Description',            type: 'string' },
    { key: 'quantity',              header: 'Quantity',               type: 'number' },
    { key: 'unit_price',            header: 'Unit Price',             type: 'number' },
    { key: 'discount',              header: 'Discount',               type: 'number' },
    { key: 'tax_rate',              header: 'Tax Rate',               type: 'number' },
    { key: 'tax_amount',            header: 'Tax Amount',             type: 'number' },
    { key: 'total',                 header: 'Total',                  type: 'number' },
    { key: 'sort_order',            header: 'Sort Order',             type: 'number' },
    { key: 'created_at',            header: 'Created At',             type: 'date' },
  ],

  // ── creditNoteAllocations (→ credit_note_allocations table) ───────────────
  creditNoteAllocations: [
    { key: 'legacy_id',             header: 'Record Ref',             type: 'string',  required: true },
    { key: 'credit_note_legacy_id', header: 'Credit Note Record Ref', type: 'string',  required: true, ref: 'creditNotes' },
    { key: 'invoice_legacy_id',     header: 'Invoice Record Ref',     type: 'string',  required: true, ref: 'invoices' },
    { key: 'amount',                header: 'Amount',                 type: 'number',  required: true },
    { key: 'created_at',            header: 'Created At',             type: 'date' },
  ],

  // ── customerCommunications (→ customer_communications table) ──────────────
  customerCommunications: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'customer_legacy_id', header: 'Customer Record Ref', type: 'string',  required: true, ref: 'customers' },
    { key: 'type',               header: 'Type',                type: 'string',  required: true },
    { key: 'direction',          header: 'Direction',           type: 'string' },
    { key: 'subject',            header: 'Subject',             type: 'string' },
    { key: 'content',            header: 'Content',             type: 'string' },
    { key: 'status',             header: 'Status',              type: 'string' },
    { key: 'sent_at',            header: 'Sent At',             type: 'date' },
    { key: 'created_at',         header: 'Created At',          type: 'date' },
  ],

  // ── caseCommunications (→ case_communications table) ──────────────────────
  caseCommunications: [
    { key: 'legacy_id',      header: 'Record Ref',      type: 'string',  required: true },
    { key: 'case_legacy_id', header: 'Case Record Ref', type: 'string',  required: true, ref: 'cases' },
    { key: 'type',           header: 'Type',            type: 'string' },
    { key: 'direction',      header: 'Direction',       type: 'string' },
    { key: 'subject',        header: 'Subject',         type: 'string' },
    { key: 'content',        header: 'Content',         type: 'string' },
    { key: 'sent_to',        header: 'Sent To',         type: 'string' },
    { key: 'created_at',     header: 'Created At',      type: 'date' },
  ],

  // ── caseRecoveryAttempts (→ case_recovery_attempts table) ─────────────────
  caseRecoveryAttempts: [
    { key: 'legacy_id',        header: 'Record Ref',        type: 'string',  required: true },
    { key: 'case_legacy_id',   header: 'Case Record Ref',   type: 'string',  required: true, ref: 'cases' },
    { key: 'device_legacy_id', header: 'Device Record Ref', type: 'string',  ref: 'devices' },
    { key: 'attempt_number',   header: 'Attempt Number',    type: 'number' },
    { key: 'method',           header: 'Method',            type: 'string' },
    { key: 'tool_used',        header: 'Tool Used',         type: 'string' },
    { key: 'result',           header: 'Result',            type: 'string' },
    { key: 'data_recovered',   header: 'Data Recovered',    type: 'string' },
    { key: 'started_at',       header: 'Started At',        type: 'date' },
    { key: 'completed_at',     header: 'Completed At',      type: 'date' },
    { key: 'notes',            header: 'Notes',             type: 'string' },
    { key: 'created_at',       header: 'Created At',        type: 'date' },
  ],

  // ── deviceDiagnostics (→ device_diagnostics table; unique per device) ─────
  deviceDiagnostics: [
    { key: 'legacy_id',        header: 'Record Ref',        type: 'string',  required: true },
    { key: 'device_legacy_id', header: 'Device Record Ref', type: 'string',  required: true, ref: 'devices' },
    { key: 'diagnostic_type',  header: 'Diagnostic Type',   type: 'string' },
    { key: 'tool_used',        header: 'Tool Used',         type: 'string' },
    { key: 'result',           header: 'Result (JSON)',     type: 'string' },
    { key: 'notes',            header: 'Notes',             type: 'string' },
    { key: 'created_at',       header: 'Created At',        type: 'date' },
  ],

  // ── cloneDrives (→ resource_clone_drives table) ───────────────────────────
  // The physical imaging-drive registry. brand/capacity/interface resolve by name against
  // the global device catalogs; assignment to a case is an optional in-file ref.
  cloneDrives: [
    { key: 'legacy_id',      header: 'Record Ref',        type: 'string',  required: true },
    { key: 'label',          header: 'Label',             type: 'string',  required: true },
    { key: 'serial_number',  header: 'Serial Number',     type: 'string' },
    { key: 'brand',          header: 'Brand',             type: 'string' },
    { key: 'capacity',       header: 'Capacity',          type: 'string' },
    { key: 'interface',      header: 'Interface',         type: 'string' },
    { key: 'condition',      header: 'Condition',         type: 'string' },
    { key: 'status',         header: 'Status',            type: 'string' },
    { key: 'location',       header: 'Location',          type: 'string' },
    { key: 'case_legacy_id', header: 'Case Record Ref',   type: 'string',  ref: 'cases' },
    { key: 'notes',          header: 'Notes',             type: 'string' },
    { key: 'created_at',     header: 'Created At',        type: 'date' },
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

  // ═══ PROCUREMENT domain ════════════════════════════════════════════════════

  // ── suppliers (→ suppliers table) ─────────────────────────────────────────
  // category / payment_terms resolve by name against master_supplier_categories /
  // master_supplier_payment_terms.
  suppliers: [
    { key: 'legacy_id',           header: 'Record Ref',           type: 'string',  required: true },
    { key: 'supplier_number',     header: 'Supplier Number',      type: 'string' },
    { key: 'name',                header: 'Supplier Name',        type: 'string',  required: true },
    { key: 'email',               header: 'Email',                type: 'string' },
    { key: 'phone',               header: 'Phone',                type: 'string' },
    { key: 'website',             header: 'Website',              type: 'string' },
    { key: 'address',             header: 'Address',              type: 'string' },
    { key: 'tax_number',          header: 'Tax Number',           type: 'string' },
    { key: 'registration_number', header: 'Registration Number',  type: 'string' },
    { key: 'category',            header: 'Category',             type: 'string' },
    { key: 'payment_terms',       header: 'Payment Terms',        type: 'string' },
    { key: 'contact_person',      header: 'Contact Person',       type: 'string' },
    { key: 'contact_email',       header: 'Contact Email',        type: 'string' },
    { key: 'contact_phone',       header: 'Contact Phone',        type: 'string' },
    { key: 'bank_name',           header: 'Bank Name',            type: 'string' },
    { key: 'bank_branch',         header: 'Bank Branch',          type: 'string' },
    { key: 'bank_account',        header: 'Bank Account',         type: 'string' },
    { key: 'credit_limit',        header: 'Credit Limit',         type: 'number' },
    { key: 'rating',              header: 'Rating',               type: 'number' },
    { key: 'is_active',           header: 'Is Active',            type: 'boolean' },
    { key: 'notes',               header: 'Notes',                type: 'string' },
    { key: 'created_at',          header: 'Created At',           type: 'date' },
  ],

  // ── supplierContacts (→ supplier_contacts table) ──────────────────────────
  supplierContacts: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'supplier_legacy_id', header: 'Supplier Record Ref', type: 'string',  required: true, ref: 'suppliers' },
    { key: 'name',               header: 'Contact Name',        type: 'string',  required: true },
    { key: 'title',              header: 'Title',               type: 'string' },
    { key: 'email',              header: 'Email',               type: 'string' },
    { key: 'phone',              header: 'Phone',               type: 'string' },
    { key: 'mobile',             header: 'Mobile',              type: 'string' },
    { key: 'is_primary',         header: 'Is Primary',          type: 'boolean' },
    { key: 'notes',              header: 'Notes',               type: 'string' },
    { key: 'created_at',         header: 'Created At',          type: 'date' },
  ],

  // ── purchaseOrders (→ purchase_orders table) ──────────────────────────────
  // status resolves by name into status_id (master_purchase_order_statuses); the RPC
  // computes the *_base multi-currency shadow columns as value × exchange_rate.
  purchaseOrders: [
    { key: 'legacy_id',              header: 'Record Ref',             type: 'string',  required: true },
    { key: 'po_number',              header: 'PO Number',              type: 'string' },
    { key: 'supplier_legacy_id',     header: 'Supplier Record Ref',    type: 'string',  required: true, ref: 'suppliers' },
    { key: 'status',                 header: 'Status',                 type: 'string' },
    { key: 'order_date',             header: 'Order Date',             type: 'date' },
    { key: 'expected_delivery_date', header: 'Expected Delivery',      type: 'date' },
    { key: 'received_at',            header: 'Received At',            type: 'date' },
    { key: 'currency',               header: 'Currency',               type: 'string' },
    { key: 'exchange_rate',          header: 'Exchange Rate',          type: 'number' },
    { key: 'subtotal',               header: 'Subtotal',               type: 'number' },
    { key: 'discount_amount',        header: 'Discount Amount',        type: 'number' },
    { key: 'tax_amount',             header: 'Tax Amount',             type: 'number' },
    { key: 'shipping_cost',          header: 'Shipping Cost',          type: 'number' },
    { key: 'total_amount',           header: 'Total Amount',           type: 'number' },
    { key: 'shipping_address',       header: 'Shipping Address',       type: 'string' },
    { key: 'terms',                  header: 'Terms',                  type: 'string' },
    { key: 'notes',                  header: 'Notes',                  type: 'string' },
    { key: 'created_at',             header: 'Created At',             type: 'date' },
  ],

  // ── purchaseOrderItems (→ purchase_order_items table) ─────────────────────
  // stock_item_sku is a cross-domain live lookup (by sku, then name) — optional.
  purchaseOrderItems: [
    { key: 'legacy_id',                header: 'Record Ref',       type: 'string',  required: true },
    { key: 'purchase_order_legacy_id', header: 'PO Record Ref',    type: 'string',  required: true, ref: 'purchaseOrders' },
    { key: 'description',              header: 'Description',      type: 'string',  required: true },
    { key: 'stock_item_sku',           header: 'Stock Item SKU',   type: 'string' },
    { key: 'quantity',                 header: 'Quantity',         type: 'number' },
    { key: 'unit_price',               header: 'Unit Price',       type: 'number',  required: true },
    { key: 'discount',                 header: 'Discount',         type: 'number' },
    { key: 'tax_rate',                 header: 'Tax Rate',         type: 'number' },
    { key: 'tax_amount',               header: 'Tax Amount',       type: 'number' },
    { key: 'total',                    header: 'Total',            type: 'number',  required: true },
    { key: 'received_quantity',        header: 'Received Qty',     type: 'number' },
    { key: 'sort_order',               header: 'Sort Order',       type: 'number' },
    { key: 'created_at',               header: 'Created At',       type: 'date' },
  ],

  // ═══ STOCK domain ═══════════════════════════════════════════════════════════

  // ── stockCategories (→ stock_categories table) ────────────────────────────
  stockCategories: [
    { key: 'legacy_id',   header: 'Record Ref',   type: 'string',  required: true },
    { key: 'name',        header: 'Category Name', type: 'string', required: true },
    { key: 'description', header: 'Description',  type: 'string' },
    { key: 'sort_order',  header: 'Sort Order',   type: 'number' },
    { key: 'is_active',   header: 'Is Active',    type: 'boolean' },
    { key: 'created_at',  header: 'Created At',   type: 'date' },
  ],

  // ── stockLocations (→ stock_locations table) ──────────────────────────────
  stockLocations: [
    { key: 'legacy_id',   header: 'Record Ref',    type: 'string',  required: true },
    { key: 'name',        header: 'Location Name', type: 'string',  required: true },
    { key: 'code',        header: 'Code',          type: 'string' },
    { key: 'address',     header: 'Address',       type: 'string' },
    { key: 'description', header: 'Description',   type: 'string' },
    { key: 'is_default',  header: 'Is Default',    type: 'boolean' },
    { key: 'is_active',   header: 'Is Active',     type: 'boolean' },
    { key: 'created_at',  header: 'Created At',    type: 'date' },
  ],

  // ── stockItems (→ stock_items table) ──────────────────────────────────────
  // current/minimum/available quantities are GENERATED columns — the import writes the
  // underlying quantity_on_hand / reorder_level. A nonzero opening quantity also posts an
  // opening-balance stock_transactions row so the ledger reconciles. category/location by
  // name (same-file sheets import first); supplier is a cross-domain live lookup.
  stockItems: [
    { key: 'legacy_id',         header: 'Record Ref',        type: 'string',  required: true },
    { key: 'sku',               header: 'SKU',               type: 'string' },
    { key: 'name',              header: 'Item Name',         type: 'string',  required: true },
    { key: 'description',       header: 'Description',       type: 'string' },
    { key: 'brand',             header: 'Brand',             type: 'string' },
    { key: 'model',             header: 'Model',             type: 'string' },
    { key: 'capacity',          header: 'Capacity',          type: 'string' },
    { key: 'category',          header: 'Category',          type: 'string' },
    { key: 'location',          header: 'Location',          type: 'string' },
    { key: 'supplier',          header: 'Supplier',          type: 'string' },
    { key: 'item_type',         header: 'Item Type',         type: 'string' },
    { key: 'unit',              header: 'Unit',              type: 'string' },
    { key: 'cost_price',        header: 'Cost Price',        type: 'number' },
    { key: 'selling_price',     header: 'Selling Price',     type: 'number' },
    { key: 'tax_rate',          header: 'Tax Rate',          type: 'number' },
    { key: 'tax_inclusive',     header: 'Tax Inclusive',     type: 'boolean' },
    { key: 'quantity_on_hand',  header: 'Quantity On Hand',  type: 'number' },
    { key: 'quantity_reserved', header: 'Quantity Reserved', type: 'number' },
    { key: 'reorder_level',     header: 'Reorder Level',     type: 'number' },
    { key: 'reorder_quantity',  header: 'Reorder Quantity',  type: 'number' },
    { key: 'warranty_months',   header: 'Warranty Months',   type: 'number' },
    { key: 'is_saleable',       header: 'Is Saleable',       type: 'boolean' },
    { key: 'is_active',         header: 'Is Active',         type: 'boolean' },
    { key: 'notes',             header: 'Notes',             type: 'string' },
    { key: 'created_at',        header: 'Created At',        type: 'date' },
  ],

  // ── stockSerialNumbers (→ stock_serial_numbers table) ─────────────────────
  stockSerialNumbers: [
    { key: 'legacy_id',      header: 'Record Ref',      type: 'string',  required: true },
    { key: 'item_legacy_id', header: 'Item Record Ref', type: 'string',  required: true, ref: 'stockItems' },
    { key: 'serial_number',  header: 'Serial Number',   type: 'string',  required: true },
    { key: 'status',         header: 'Status',          type: 'string' },
    { key: 'location',       header: 'Location',        type: 'string' },
    { key: 'notes',          header: 'Notes',           type: 'string' },
    { key: 'created_at',     header: 'Created At',      type: 'date' },
  ],

  // ── stockSales (→ stock_sales table) ──────────────────────────────────────
  // customer_ref / case_number are cross-domain live lookups (customer by email, number or
  // exact name; case by case_number) — the records workbook imports separately.
  stockSales: [
    { key: 'legacy_id',       header: 'Record Ref',      type: 'string',  required: true },
    { key: 'sale_number',     header: 'Sale Number',     type: 'string' },
    { key: 'sale_date',       header: 'Sale Date',       type: 'date' },
    { key: 'customer_ref',    header: 'Customer (email/number/name)', type: 'string' },
    { key: 'case_number',     header: 'Case Number',     type: 'string' },
    { key: 'status',          header: 'Status',          type: 'string' },
    { key: 'payment_status',  header: 'Payment Status',  type: 'string' },
    { key: 'payment_method',  header: 'Payment Method',  type: 'string' },
    { key: 'currency',        header: 'Currency',        type: 'string' },
    { key: 'exchange_rate',   header: 'Exchange Rate',   type: 'number' },
    { key: 'subtotal',        header: 'Subtotal',        type: 'number' },
    { key: 'discount_amount', header: 'Discount Amount', type: 'number' },
    { key: 'tax_amount',      header: 'Tax Amount',      type: 'number' },
    { key: 'total_amount',    header: 'Total Amount',    type: 'number' },
    { key: 'notes',           header: 'Notes',           type: 'string' },
    { key: 'created_at',      header: 'Created At',      type: 'date' },
  ],

  // ── stockSaleItems (→ stock_sale_items table) ─────────────────────────────
  stockSaleItems: [
    { key: 'legacy_id',      header: 'Record Ref',      type: 'string',  required: true },
    { key: 'sale_legacy_id', header: 'Sale Record Ref', type: 'string',  required: true, ref: 'stockSales' },
    { key: 'item_legacy_id', header: 'Item Record Ref', type: 'string',  required: true, ref: 'stockItems' },
    { key: 'quantity',       header: 'Quantity',        type: 'number',  required: true },
    { key: 'unit_price',     header: 'Unit Price',      type: 'number',  required: true },
    { key: 'discount',       header: 'Discount',        type: 'number' },
    { key: 'tax_amount',     header: 'Tax Amount',      type: 'number' },
    { key: 'total',          header: 'Total',           type: 'number',  required: true },
    { key: 'created_at',     header: 'Created At',      type: 'date' },
  ],

  // ═══ HR domain ══════════════════════════════════════════════════════════════

  // ── departments (→ departments table) ─────────────────────────────────────
  departments: [
    { key: 'legacy_id',   header: 'Record Ref',      type: 'string',  required: true },
    { key: 'name',        header: 'Department Name', type: 'string',  required: true },
    { key: 'description', header: 'Description',     type: 'string' },
    { key: 'is_active',   header: 'Is Active',       type: 'boolean' },
    { key: 'created_at',  header: 'Created At',      type: 'date' },
  ],

  // ── positions (→ positions table) ─────────────────────────────────────────
  positions: [
    { key: 'legacy_id',            header: 'Record Ref',            type: 'string',  required: true },
    { key: 'title',                header: 'Position Title',        type: 'string',  required: true },
    { key: 'department_legacy_id', header: 'Department Record Ref', type: 'string',  ref: 'departments' },
    { key: 'description',          header: 'Description',           type: 'string' },
    { key: 'is_active',            header: 'Is Active',             type: 'boolean' },
    { key: 'created_at',           header: 'Created At',            type: 'date' },
  ],

  // ── employees (→ employees table; standalone roster, NO auth link) ─────────
  // manager_legacy_id is a SOFT self-ref (unresolved → NULL, so rows need no topo-sort).
  employees: [
    { key: 'legacy_id',            header: 'Record Ref',            type: 'string',  required: true },
    { key: 'employee_number',      header: 'Employee Number',       type: 'string' },
    { key: 'first_name',           header: 'First Name',            type: 'string',  required: true },
    { key: 'last_name',            header: 'Last Name',             type: 'string',  required: true },
    { key: 'email',                header: 'Email',                 type: 'string' },
    { key: 'phone',                header: 'Phone',                 type: 'string' },
    { key: 'mobile',               header: 'Mobile',                type: 'string' },
    { key: 'gender',               header: 'Gender',                type: 'string' },
    { key: 'date_of_birth',        header: 'Date of Birth',         type: 'date' },
    { key: 'nationality',          header: 'Nationality',           type: 'string' },
    { key: 'id_number',            header: 'ID Number',             type: 'string' },
    { key: 'passport_number',      header: 'Passport Number',       type: 'string' },
    { key: 'address',              header: 'Address',               type: 'string' },
    { key: 'city',                 header: 'City',                  type: 'string' },
    { key: 'country',              header: 'Country',               type: 'string' },
    { key: 'department_legacy_id', header: 'Department Record Ref', type: 'string',  ref: 'departments' },
    { key: 'position_legacy_id',   header: 'Position Record Ref',   type: 'string',  ref: 'positions' },
    { key: 'manager_legacy_id',    header: 'Manager Record Ref',    type: 'string' },
    { key: 'hire_date',            header: 'Hire Date',             type: 'date' },
    { key: 'employment_type',      header: 'Employment Type',       type: 'string' },
    { key: 'employment_status',    header: 'Employment Status',     type: 'string' },
    { key: 'probation_end_date',   header: 'Probation End',         type: 'date' },
    { key: 'termination_date',     header: 'Termination Date',      type: 'date' },
    { key: 'basic_salary',         header: 'Basic Salary',          type: 'number' },
    { key: 'salary_currency',      header: 'Salary Currency',       type: 'string' },
    { key: 'bank_name',            header: 'Bank Name',             type: 'string' },
    { key: 'bank_branch',          header: 'Bank Branch',           type: 'string' },
    { key: 'bank_account_number',  header: 'Bank Account Number',   type: 'string' },
    { key: 'emergency_contact_name',         header: 'Emergency Contact',       type: 'string' },
    { key: 'emergency_contact_phone',        header: 'Emergency Phone',         type: 'string' },
    { key: 'emergency_contact_relationship', header: 'Emergency Relationship',  type: 'string' },
    { key: 'notes',                header: 'Notes',                 type: 'string' },
    { key: 'created_at',           header: 'Created At',            type: 'date' },
  ],

  // ── leaveBalances (→ leave_balances table) ────────────────────────────────
  // leave_type resolves by name against master_leave_types; unique per employee+type+year.
  leaveBalances: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'employee_legacy_id', header: 'Employee Record Ref', type: 'string',  required: true, ref: 'employees' },
    { key: 'leave_type',         header: 'Leave Type',          type: 'string',  required: true },
    { key: 'year',               header: 'Year',                type: 'number',  required: true },
    { key: 'total_days',         header: 'Total Days',          type: 'number',  required: true },
    { key: 'used_days',          header: 'Used Days',           type: 'number' },
    { key: 'carried_over',       header: 'Carried Over',        type: 'number' },
    { key: 'remaining_days',     header: 'Remaining Days',      type: 'number' },
    { key: 'created_at',         header: 'Created At',          type: 'date' },
  ],

  // ── employeeLoans (→ employee_loans table) ────────────────────────────────
  employeeLoans: [
    { key: 'legacy_id',          header: 'Record Ref',          type: 'string',  required: true },
    { key: 'employee_legacy_id', header: 'Employee Record Ref', type: 'string',  required: true, ref: 'employees' },
    { key: 'loan_number',        header: 'Loan Number',         type: 'string' },
    { key: 'loan_type',          header: 'Loan Type',           type: 'string' },
    { key: 'amount',             header: 'Amount',              type: 'number',  required: true },
    { key: 'total_amount',       header: 'Total Amount',        type: 'number' },
    { key: 'interest_rate',      header: 'Interest Rate',       type: 'number' },
    { key: 'installments',       header: 'Installments',        type: 'number' },
    { key: 'installment_amount', header: 'Installment Amount',  type: 'number' },
    { key: 'paid_installments',  header: 'Paid Installments',   type: 'number' },
    { key: 'remaining_amount',   header: 'Remaining Amount',    type: 'number' },
    { key: 'start_date',         header: 'Start Date',          type: 'date',    required: true },
    { key: 'end_date',           header: 'End Date',            type: 'date' },
    { key: 'status',             header: 'Status',              type: 'string' },
    { key: 'notes',              header: 'Notes',               type: 'string' },
    { key: 'created_at',         header: 'Created At',          type: 'date' },
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
