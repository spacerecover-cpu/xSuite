import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type Json = Database['public']['Tables']['import_export_jobs']['Row']['errors'];
type ImportExportJobRow = Database['public']['Tables']['import_export_jobs']['Row'];
type ImportExportJobInsert = Database['public']['Tables']['import_export_jobs']['Insert'];
type ImportExportJobUpdate = Database['public']['Tables']['import_export_jobs']['Update'];
type ImportExportLogRow = Database['public']['Tables']['import_export_logs']['Row'];
type ImportExportTemplateRow = Database['public']['Tables']['import_export_templates']['Row'];

export interface NameLookupResult {
  resolved: boolean;
  value: string | null;
  originalValue: string;
  suggestions?: string[];
}

export interface BulkLookupResults {
  brands: Map<string, NameLookupResult>;
  deviceTypes: Map<string, NameLookupResult>;
  capacities: Map<string, NameLookupResult>;
  interfaces: Map<string, NameLookupResult>;
  storageLocations: Map<string, NameLookupResult>;
  countries: Map<string, NameLookupResult>;
  statusTypes: Map<string, NameLookupResult>;
  conditionTypes: Map<string, NameLookupResult>;
}

export type EntityType =
  | 'cases'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'revenue'
  | 'transactions'
  | 'customers'
  | 'quotes'
  | 'companies'
  | 'suppliers'
  | 'purchases'
  | 'inventory'
  | 'stock'
  | 'assets'
  | 'clone_drives'
  | 'employees';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type LogType = 'error' | 'warning' | 'info' | 'success';

export interface ImportExportJob {
  id: string;
  tenant_id: string;
  template_id: string | null;
  job_type: 'import' | 'export';
  entity_type: EntityType;
  file_name: string;
  file_url: string | null;
  status: JobStatus;
  total_records: number;
  processed_records: number;
  success_count: number;
  error_count: number;
  errors: Json;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportExportLog {
  id: string;
  tenant_id: string;
  job_id: string;
  row_number: number | null;
  log_type: LogType;
  message: string | null;
  row_data: Json;
  created_at: string;
}

export interface FieldMapping {
  id: string;
  tenant_id: string;
  name: string;
  entity_type: EntityType;
  description: string | null;
  mappings: Record<string, string>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityInfo {
  type: EntityType;
  label: string;
  tableName: string;
  icon: string;
  color: string;
  requiredFields: string[];
  uniqueFields: string[];
  dateFields: string[];
  numberFields: string[];
  /** Free-text columns importable beyond the required/reference set (e.g. currency). */
  stringFields?: string[];
  booleanFields: string[];
  referenceFields: Record<string, { table: string; field: string }>;
}

// Entity configuration with required fields and validation rules
export const ENTITY_CONFIGS: Record<EntityType, EntityInfo> = {
  cases: {
    type: 'cases',
    label: 'Cases',
    tableName: 'cases',
    icon: 'Briefcase',
    color: '#3b82f6',
    requiredFields: ['case_number'],
    uniqueFields: ['case_number'],
    dateFields: ['created_at', 'check_in_date', 'expected_completion_date'],
    numberFields: [],
    booleanFields: ['is_urgent'],
    referenceFields: {
      customer_id: { table: 'customers_enhanced', field: 'id' },
      company_id: { table: 'companies', field: 'id' },
      assigned_to: { table: 'profiles', field: 'id' },
    },
  },
  invoices: {
    type: 'invoices',
    label: 'Invoices',
    tableName: 'invoices',
    icon: 'FileText',
    color: '#10b981',
    requiredFields: ['invoice_number', 'invoice_date', 'due_date'],
    uniqueFields: ['invoice_number'],
    dateFields: ['invoice_date', 'due_date', 'sent_at'],
    numberFields: ['subtotal', 'tax_amount', 'discount_amount', 'total_amount', 'amount_paid', 'balance_due'],
    booleanFields: [],
    referenceFields: {
      customer_id: { table: 'customers_enhanced', field: 'id' },
      company_id: { table: 'companies', field: 'id' },
      case_id: { table: 'cases', field: 'id' },
    },
  },
  payments: {
    type: 'payments',
    label: 'Payments',
    tableName: 'payments',
    icon: 'CreditCard',
    color: 'rgb(var(--color-accent))',
    requiredFields: ['payment_number', 'payment_date', 'amount'],
    uniqueFields: ['payment_number'],
    dateFields: ['payment_date'],
    numberFields: ['amount'],
    booleanFields: [],
    referenceFields: {
      customer_id: { table: 'customers_enhanced', field: 'id' },
      payment_method_id: { table: 'master_payment_methods', field: 'id' },
    },
  },
  expenses: {
    type: 'expenses',
    label: 'Expenses',
    tableName: 'expenses',
    icon: 'Receipt',
    color: '#ef4444',
    requiredFields: ['expense_number', 'expense_date', 'amount', 'description'],
    uniqueFields: ['expense_number'],
    dateFields: ['expense_date', 'approved_at', 'paid_at'],
    numberFields: ['amount', 'tax_amount', 'exchange_rate'],
    stringFields: ['currency', 'vendor', 'reference', 'notes'],
    booleanFields: ['is_billable'],
    referenceFields: {
      category_id: { table: 'master_expense_categories', field: 'id' },
      case_id: { table: 'cases', field: 'id' },
    },
  },
  revenue: {
    type: 'revenue',
    label: 'Revenue',
    tableName: 'financial_transactions',
    icon: 'TrendingUp',
    color: '#10b981',
    requiredFields: ['transaction_date', 'amount', 'type', 'description'],
    uniqueFields: [],
    dateFields: ['transaction_date'],
    numberFields: ['amount'],
    booleanFields: [],
    referenceFields: {},
  },
  transactions: {
    type: 'transactions',
    label: 'Transactions',
    tableName: 'financial_transactions',
    icon: 'ArrowRightLeft',
    color: '#f59e0b',
    requiredFields: ['transaction_date', 'amount', 'type', 'description'],
    uniqueFields: [],
    dateFields: ['transaction_date'],
    numberFields: ['amount'],
    booleanFields: [],
    referenceFields: {
      bank_account_id: { table: 'bank_accounts', field: 'id' },
    },
  },
  customers: {
    type: 'customers',
    label: 'Customers',
    tableName: 'customers_enhanced',
    icon: 'Users',
    color: '#06b6d4',
    requiredFields: ['customer_name'],
    uniqueFields: ['email', 'phone'],
    dateFields: [],
    numberFields: [],
    booleanFields: ['is_active'],
    referenceFields: {
      city_id: { table: 'geo_cities', field: 'id' },
      country_id: { table: 'geo_countries', field: 'id' },
    },
  },
  quotes: {
    type: 'quotes',
    label: 'Quotes',
    tableName: 'quotes',
    icon: 'FileSignature',
    color: '#ec4899',
    requiredFields: ['quote_number', 'title'],
    uniqueFields: ['quote_number'],
    dateFields: ['valid_until', 'created_at'],
    numberFields: ['subtotal', 'tax_rate', 'tax_amount', 'discount_amount', 'total_amount'],
    booleanFields: [],
    referenceFields: {
      customer_id: { table: 'customers_enhanced', field: 'id' },
      company_id: { table: 'companies', field: 'id' },
    },
  },
  companies: {
    type: 'companies',
    label: 'Companies',
    tableName: 'companies',
    icon: 'Building2',
    color: 'rgb(var(--color-accent))',
    requiredFields: ['name'],
    uniqueFields: ['name', 'email'],
    dateFields: [],
    numberFields: [],
    booleanFields: ['is_active'],
    referenceFields: {},
  },
  suppliers: {
    type: 'suppliers',
    label: 'Suppliers',
    tableName: 'suppliers',
    icon: 'Truck',
    color: '#14b8a6',
    requiredFields: ['name'],
    uniqueFields: ['name'],
    dateFields: [],
    numberFields: [],
    booleanFields: ['is_active'],
    referenceFields: {},
  },
  purchases: {
    type: 'purchases',
    label: 'Purchases',
    tableName: 'purchase_orders',
    icon: 'ShoppingCart',
    color: '#f97316',
    requiredFields: ['purchase_date', 'total_amount'],
    uniqueFields: [],
    dateFields: ['purchase_date'],
    numberFields: ['total_amount'],
    booleanFields: [],
    referenceFields: {},
  },
  inventory: {
    type: 'inventory',
    label: 'Inventory',
    tableName: 'inventory_items',
    icon: 'Package',
    color: '#84cc16',
    requiredFields: ['name'],
    uniqueFields: ['item_number', 'serial_number'],
    dateFields: ['purchase_date'],
    numberFields: ['quantity', 'min_quantity', 'purchase_price'],
    booleanFields: ['is_donor'],
    referenceFields: {
      category_id: { table: 'master_inventory_categories', field: 'id' },
      brand_id: { table: 'catalog_device_brands', field: 'id' },
      device_type_id: { table: 'catalog_device_types', field: 'id' },
      capacity_id: { table: 'catalog_device_capacities', field: 'id' },
      status_id: { table: 'master_inventory_status_types', field: 'id' },
      condition_id: { table: 'master_inventory_condition_types', field: 'id' },
      location_id: { table: 'inventory_locations', field: 'id' },
      interface_id: { table: 'catalog_interfaces', field: 'id' },
      supplier_id: { table: 'suppliers', field: 'id' },
      created_by: { table: 'profiles', field: 'id' },
    },
  },
  stock: {
    type: 'stock',
    label: 'Stock Items',
    tableName: 'stock_items',
    icon: 'Boxes',
    color: 'rgb(var(--color-accent))',
    requiredFields: ['sku', 'name'],
    uniqueFields: ['sku'],
    dateFields: [],
    numberFields: ['unit_price', 'quantity_on_hand', 'reorder_level'],
    booleanFields: ['is_active'],
    referenceFields: {
      category_id: { table: 'stock_categories', field: 'id' },
    },
  },
  assets: {
    type: 'assets',
    label: 'Assets',
    tableName: 'assets',
    icon: 'Laptop',
    color: '#0ea5e9',
    requiredFields: ['asset_number', 'name', 'purchase_date', 'purchase_price'],
    uniqueFields: ['asset_number', 'serial_number'],
    dateFields: ['purchase_date', 'warranty_expiry'],
    numberFields: ['purchase_price', 'current_value', 'salvage_value', 'useful_life_years'],
    booleanFields: [],
    referenceFields: {
      category_id: { table: 'asset_categories', field: 'id' },
    },
  },
  clone_drives: {
    type: 'clone_drives',
    label: 'Clone Drives',
    tableName: 'resource_clone_drives',
    icon: 'HardDrive',
    color: '#64748b',
    requiredFields: ['name', 'capacity_gb'],
    uniqueFields: ['serial_number'],
    dateFields: ['last_maintenance_date'],
    numberFields: ['capacity_gb', 'used_space_gb'],
    booleanFields: ['is_active'],
    referenceFields: {},
  },
  employees: {
    type: 'employees',
    label: 'Employees',
    tableName: 'employees',
    icon: 'UserCircle',
    color: '#f43f5e',
    requiredFields: ['employee_number', 'hire_date'],
    uniqueFields: ['employee_number', 'national_id'],
    dateFields: ['hire_date', 'termination_date', 'date_of_birth'],
    numberFields: [],
    booleanFields: [],
    referenceFields: {
      department_id: { table: 'departments', field: 'id' },
      position_id: { table: 'positions', field: 'id' },
    },
  },
};

// Map a live DB row to the public ImportExportJob shape.
function rowToJob(row: ImportExportJobRow): ImportExportJob {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    template_id: row.template_id,
    job_type: row.type === 'export' ? 'export' : 'import',
    entity_type: row.entity_type as EntityType,
    file_name: row.file_name ?? '',
    file_url: row.file_url,
    status: (row.status ?? 'pending') as JobStatus,
    total_records: row.total_records ?? 0,
    processed_records: row.processed_records ?? 0,
    success_count: row.success_records ?? 0,
    error_count: row.error_records ?? 0,
    errors: row.errors,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Map a public Partial<ImportExportJob> to a DB update payload.
function jobToUpdate(updates: Partial<ImportExportJob>): ImportExportJobUpdate {
  const payload: ImportExportJobUpdate = {};
  if (updates.template_id !== undefined) payload.template_id = updates.template_id;
  if (updates.job_type !== undefined) payload.type = updates.job_type;
  if (updates.entity_type !== undefined) payload.entity_type = updates.entity_type;
  if (updates.file_name !== undefined) payload.file_name = updates.file_name;
  if (updates.file_url !== undefined) payload.file_url = updates.file_url;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.total_records !== undefined) payload.total_records = updates.total_records;
  if (updates.processed_records !== undefined) payload.processed_records = updates.processed_records;
  if (updates.success_count !== undefined) payload.success_records = updates.success_count;
  if (updates.error_count !== undefined) payload.error_records = updates.error_count;
  if (updates.errors !== undefined) payload.errors = updates.errors;
  if (updates.started_at !== undefined) payload.started_at = updates.started_at;
  if (updates.completed_at !== undefined) payload.completed_at = updates.completed_at;
  return payload;
}

// Map a live DB row to the public ImportExportLog shape.
function rowToLog(row: ImportExportLogRow): ImportExportLog {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    job_id: row.job_id,
    row_number: row.row_number,
    log_type: ((row.status ?? 'info') as LogType),
    message: row.message,
    row_data: row.data,
    created_at: row.created_at,
  };
}

// Create a new import/export job. The legacy `configuration` arg is now stored
// inside the job's `errors` jsonb field (kept opaque) since the live schema
// no longer has a dedicated configuration column.
export async function createJob(
  jobType: 'import' | 'export',
  entityType: EntityType,
  fileName: string,
  _configuration: Record<string, unknown> = {}
): Promise<{ data: ImportExportJob | null; error: unknown }> {
  void _configuration;
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { data: null, error: new Error('No tenant context available') };
  }
  const insert: ImportExportJobInsert = {
    tenant_id: tenantId,
    type: jobType,
    entity_type: entityType,
    file_name: fileName,
    status: 'pending',
  };
  const { data, error } = await supabase
    .from('import_export_jobs')
    .insert(insert)
    .select()
    .maybeSingle();

  return { data: data ? rowToJob(data) : null, error };
}

// Update job status and progress
export async function updateJobProgress(
  jobId: string,
  updates: Partial<ImportExportJob>
): Promise<{ data: ImportExportJob | null; error: unknown }> {
  const { data, error } = await supabase
    .from('import_export_jobs')
    .update(jobToUpdate(updates))
    .eq('id', jobId)
    .select()
    .maybeSingle();

  return { data: data ? rowToJob(data) : null, error };
}

// Add log entry to a job. `fieldName` is preserved by being merged into the
// row_data jsonb payload because the live schema has no dedicated column.
export async function addJobLog(
  jobId: string,
  logType: LogType,
  message: string,
  rowNumber?: number,
  fieldName?: string,
  rowData?: Record<string, unknown>
): Promise<{ error: unknown }> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { error: new Error('No tenant context available') };
  }
  const mergedData: Record<string, unknown> | null = fieldName
    ? { ...(rowData ?? {}), __field_name: fieldName }
    : (rowData ?? null);
  const { error } = await supabase.from('import_export_logs').insert({
    tenant_id: tenantId,
    job_id: jobId,
    status: logType,
    message,
    row_number: rowNumber ?? null,
    data: mergedData as Json,
  });

  return { error };
}

// Get all jobs with optional filters
export async function getJobs(
  filters?: Partial<{
    jobType: 'import' | 'export';
    entityType: EntityType;
    status: JobStatus;
  }>
): Promise<{ data: ImportExportJob[] | null; error: unknown }> {
  let query = supabase
    .from('import_export_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.jobType) {
    query = query.eq('type', filters.jobType);
  }
  if (filters?.entityType) {
    query = query.eq('entity_type', filters.entityType);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  return { data: data ? data.map(rowToJob) : null, error };
}

// Get logs for a specific job
export async function getJobLogs(
  jobId: string,
  logType?: LogType
): Promise<{ data: ImportExportLog[] | null; error: unknown }> {
  let query = supabase
    .from('import_export_logs')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (logType) {
    query = query.eq('status', logType);
  }

  const { data, error } = await query;
  return { data: data ? data.map(rowToLog) : null, error };
}

// Get entity record count. The dispatch keeps each `.from()` call bound to a
// single literal table name, which avoids supabase-js's wide-union row-type
// inference (the source of TS2589 when called with a generic string).
export async function getEntityCount(entityType: EntityType): Promise<number> {
  const tableName = ENTITY_CONFIGS[entityType].tableName;
  const result = await countRowsForTable(tableName);
  return result ?? 0;
}

async function countRowsForTable(tableName: string): Promise<number | null> {
  switch (tableName) {
    case 'cases': {
      const { count } = await supabase.from('cases').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'invoices': {
      const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'payments': {
      const { count } = await supabase.from('payments').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'expenses': {
      const { count } = await supabase.from('expenses').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'financial_transactions': {
      const { count } = await supabase.from('financial_transactions').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'customers_enhanced': {
      const { count } = await supabase.from('customers_enhanced').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'quotes': {
      const { count } = await supabase.from('quotes').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'companies': {
      const { count } = await supabase.from('companies').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'suppliers': {
      const { count } = await supabase.from('suppliers').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'purchase_orders': {
      const { count } = await supabase.from('purchase_orders').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'inventory_items': {
      const { count } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'stock_items': {
      const { count } = await supabase.from('stock_items').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'assets': {
      const { count } = await supabase.from('assets').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'resource_clone_drives': {
      const { count } = await supabase.from('resource_clone_drives').select('*', { count: 'exact', head: true });
      return count;
    }
    case 'employees': {
      const { count } = await supabase.from('employees').select('*', { count: 'exact', head: true });
      return count;
    }
    default:
      return null;
  }
}

// Save field mapping. The live schema stores saved mappings in
// `import_export_templates` (one row per saved mapping, mapping jsonb).
export async function saveFieldMapping(
  name: string,
  entityType: EntityType,
  mappings: Record<string, string>,
  description?: string
): Promise<{ data: FieldMapping | null; error: unknown }> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return { data: null, error: new Error('No tenant context available') };
  }
  const { data, error } = await supabase
    .from('import_export_templates')
    .insert({
      tenant_id: tenantId,
      name,
      type: 'import',
      entity_type: entityType,
      mapping: mappings as unknown as Json,
      settings: description ? ({ description } as unknown as Json) : null,
    })
    .select()
    .maybeSingle();

  return { data: data ? templateRowToFieldMapping(data) : null, error };
}

// Get saved field mappings (sourced from import_export_templates).
export async function getFieldMappings(
  entityType?: EntityType
): Promise<{ data: FieldMapping[] | null; error: unknown }> {
  let query = supabase
    .from('import_export_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  const { data, error } = await query;
  return { data: data ? data.map(templateRowToFieldMapping) : null, error };
}

function templateRowToFieldMapping(row: ImportExportTemplateRow): FieldMapping {
  const mappingObj =
    row.mapping && typeof row.mapping === 'object' && !Array.isArray(row.mapping)
      ? (row.mapping as Record<string, string>)
      : {};
  let description: string | null = null;
  if (row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)) {
    const s = row.settings as Record<string, unknown>;
    if (typeof s.description === 'string') description = s.description;
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    entity_type: row.entity_type as EntityType,
    description,
    mappings: mappingObj,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getTenantId(): Promise<string | null> {
  const { data } = await supabase.rpc('get_current_tenant_id');
  return typeof data === 'string' ? data : null;
}

// Parse CSV content
export function parseCSV(content: string, delimiter: string = ','): string[][] {
  const lines = content.split(/\r?\n/);
  const result: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    result.push(values);
  }

  return result;
}

// Convert CSV rows to objects
export function csvToObjects(rows: string[][]): Record<string, any>[] {
  if (rows.length === 0) return [];

  const headers = rows[0];
  const data: Record<string, any>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj: Record<string, any> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = row[j] || '';
      obj[header] = value;
    }

    data.push(obj);
  }

  return data;
}

// Smart field name matching for automatic mapping
export function suggestFieldMapping(
  sourceFields: string[],
  entityType: EntityType
): Record<string, { target: string; confidence: number }> {
  const config = ENTITY_CONFIGS[entityType];
  const suggestions: Record<string, { target: string; confidence: number }> = {};

  // Common field name variations (non-inventory)
  const synonyms: Record<string, string[]> = {
    customer_name: ['client_name', 'customer', 'client', 'name'],
    email: ['email_address', 'e-mail', 'contact_email'],
    phone: ['phone_number', 'telephone', 'mobile', 'contact_number'],
    address: ['street_address', 'address_line1', 'location'],
    date: ['created_date', 'date_created', 'timestamp'],
    description: ['desc', 'details', 'notes', 'comments'],
    status: ['state', 'condition'],
  };

  // Add amount synonym only for non-inventory entities
  if (entityType !== 'inventory') {
    synonyms.amount = ['total', 'price', 'cost', 'value'];
  }

  // Inventory-specific field name variations
  if (entityType === 'inventory') {
    Object.assign(synonyms, {
      item_number: ['inv_code', 'item_code', 'inv_no', 'item_no', 'inventory_code'],
      sku_code: ['sku', 'part_code', 'product_code', 'item_sku'],
      serial_number: ['serial', 'sn', 'serial_no', 'serial_num', 'device_serial'],
      barcode: ['bar_code', 'upc', 'ean', 'barcode_number'],
      model: ['model_number', 'model_no', 'model_name', 'product_model'],
      brand_id: ['brand', 'manufacturer', 'make', 'brand_name'],
      device_type_id: ['device_type', 'type', 'device'],
      capacity_id: ['capacity', 'size', 'storage', 'storage_size'],
      quantity_available: ['qty_available', 'available', 'in_stock', 'stock', 'quantity', 'qty'],
      quantity_in_use: ['qty_in_use', 'in_use', 'allocated', 'assigned', 'qty_allocated'],
      quantity_purchased: ['qty_purchased', 'purchased_qty', 'initial_qty', 'bought_qty'],
      storage_location_id: ['location', 'storage', 'warehouse', 'bin', 'shelf'],
      firmware_version: ['firmware', 'fw_version', 'fw', 'firmware_ver'],
      pcb_number: ['pcb', 'pcb_no', 'board_number', 'circuit_board'],
      manufacture_date: ['mfg_date', 'manufactured', 'production_date', 'made_date', 'dom'],
      acquisition_cost: ['cost', 'purchase_cost', 'buy_price', 'acquisition_price'],
      purchase_date: ['bought_date', 'purchased', 'buy_date', 'order_date'],
      acquisition_date: ['acquired_date', 'date_acquired', 'received_date'],
      supplier_name: ['supplier', 'vendor_name', 'vendor', 'source'],
      supplier_contact: ['supplier_email', 'supplier_phone', 'vendor_contact'],
      condition_type_id: ['condition', 'condition_id', 'item_condition'],
      status_type_id: ['status', 'status_id', 'item_status'],
      category_id: ['category', 'item_category'],
      interface_id: ['interface', 'connection', 'port', 'connector'],
      spindle_speed: ['rpm', 'speed', 'rotation_speed', 'spindle_rpm'],
      part_number: ['part_no', 'partnumber', 'part', 'component_number'],
      usable_donor_parts: ['donor_parts', 'usable_parts', 'parts', 'harvestable_parts'],
      compatibility_notes: ['compatibility', 'compat_notes', 'notes_compatibility'],
      available_for_donor: ['for_donor', 'is_donor', 'donor', 'donor_available'],
      last_verified_date: ['verified_date', 'last_verified', 'verification_date', 'checked_date'],
      last_verified_by: ['verified_by', 'checker', 'verified_user'],
      created_by: ['creator', 'added_by', 'created_user'],
      dcm: ['date_code', 'manufacture_code', 'date_code_manufacture'],
      head_map: ['heads', 'head_mapping', 'head_config'],
      preamp: ['pre_amp', 'preamplifier'],
      platter_heads: ['platters_heads', 'platter_head_count', 'heads_platters'],
    });
  }

  for (const sourceField of sourceFields) {
    const normalized = sourceField.toLowerCase().trim().replace(/[_\s-]+/g, '_');

    // Exact match
    if (config.requiredFields.includes(normalized) || config.uniqueFields.includes(normalized)) {
      suggestions[sourceField] = { target: normalized, confidence: 100 };
      continue;
    }

    // Build list of all valid fields for this entity
    const allValidFields = [
      ...config.requiredFields,
      ...config.uniqueFields,
      ...Object.keys(config.referenceFields),
      ...config.dateFields,
      ...config.numberFields,
      ...config.booleanFields,
    ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

    // Synonym match - only suggest if target field is valid for this entity
    let found = false;
    for (const [targetField, variations] of Object.entries(synonyms)) {
      if (variations.some((v) => normalized.includes(v) || v.includes(normalized))) {
        // Only suggest if this field exists in the entity schema
        if (allValidFields.includes(targetField)) {
          suggestions[sourceField] = { target: targetField, confidence: 85 };
          found = true;
          break;
        }
      }
    }

    if (found) continue;

    // Partial match using Levenshtein-like similarity - search across all valid fields
    let bestMatch = '';
    let bestScore = 0;

    for (const targetField of allValidFields) {
      const similarity = calculateSimilarity(normalized, targetField);
      if (similarity > bestScore && similarity > 0.6) {
        bestScore = similarity;
        bestMatch = targetField;
      }
    }

    if (bestMatch) {
      suggestions[sourceField] = { target: bestMatch, confidence: Math.round(bestScore * 100) };
    }
  }

  return suggestions;
}

// Calculate string similarity (simplified Levenshtein)
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    costs[i] = i;
  }

  for (let i = 1; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 1; j <= shorter.length; j++) {
      const newValue =
        longer[i - 1] === shorter[j - 1] ? costs[j - 1] : Math.min(costs[j - 1], lastValue, costs[j]) + 1;
      costs[j - 1] = lastValue;
      lastValue = newValue;
    }
    costs[shorter.length] = lastValue;
  }

  return (longer.length - costs[shorter.length]) / longer.length;
}

// Validate field value based on entity configuration
export function validateField(
  entityType: EntityType,
  fieldName: string,
  value: any
): { valid: boolean; error?: string } {
  const config = ENTITY_CONFIGS[entityType];

  // Check required fields
  if (config.requiredFields.includes(fieldName) && !value) {
    return { valid: false, error: 'This field is required' };
  }

  // Validate date fields
  if (config.dateFields.includes(fieldName) && value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }
  }

  // Validate number fields
  if (config.numberFields.includes(fieldName) && value) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: 'Must be a valid number' };
    }
  }

  // Validate boolean fields
  if (config.booleanFields.includes(fieldName) && value !== undefined) {
    const validBooleans = ['true', 'false', '1', '0', 'yes', 'no', true, false, 1, 0];
    if (!validBooleans.includes(value?.toString()?.toLowerCase())) {
      return { valid: false, error: 'Must be true/false or yes/no or 1/0' };
    }
  }

  // Inventory-specific validation
  if (entityType === 'inventory') {
    // Validate condition_rating range (1-5)
    if (fieldName === 'condition_rating' && value) {
      const rating = parseInt(value);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return { valid: false, error: 'Condition rating must be between 1 and 5' };
      }
    }

    // Validate item_type enum
    if (fieldName === 'item_type' && value) {
      const validTypes = ['donor_part', 'clone_drive', 'spare_device', 'tool', 'supply', 'other'];
      if (!validTypes.includes(value.toLowerCase())) {
        return { valid: false, error: 'Item type must be one of: ' + validTypes.join(', ') };
      }
    }

    // Validate status enum
    if (fieldName === 'status' && value) {
      const validStatuses = ['available', 'in_use', 'depleted', 'defective', 'discontinued', 'ordered'];
      if (!validStatuses.includes(value.toLowerCase())) {
        return { valid: false, error: 'Status must be one of: ' + validStatuses.join(', ') };
      }
    }

    // Validate quantity fields are non-negative
    const quantityFields = [
      'quantity_available',
      'quantity_in_use',
      'quantity_depleted',
      'quantity_defective',
      'quantity_purchased',
      'reserved_quantity',
    ];
    if (quantityFields.includes(fieldName) && value) {
      const qty = parseInt(value);
      if (isNaN(qty) || qty < 0) {
        return { valid: false, error: 'Quantity must be a non-negative number' };
      }
    }

    // Validate spindle_speed if provided
    if (fieldName === 'spindle_speed' && value) {
      const speed = parseInt(value);
      const validSpeeds = [5400, 7200, 10000, 15000];
      if (!isNaN(speed) && !validSpeeds.includes(speed)) {
        return { valid: false, error: 'Common spindle speeds are: ' + validSpeeds.join(', ') + ' RPM' };
      }
    }

    // Validate usable_donor_parts JSONB field
    if (fieldName === 'usable_donor_parts' && value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        const validKeys = ['heads', 'pcb', 'motor', 'platters', 'firmware_chip', 'preamp', 'drive_enclosure'];

        if (typeof parsed !== 'object' || parsed === null) {
          return { valid: false, error: 'Must be a valid JSON object' };
        }

        // Check if all keys are valid
        const keys = Object.keys(parsed);
        const invalidKeys = keys.filter(k => !validKeys.includes(k));
        if (invalidKeys.length > 0) {
          return { valid: false, error: `Invalid keys: ${invalidKeys.join(', ')}. Valid keys are: ${validKeys.join(', ')}` };
        }

        // Check if all values are boolean
        for (const key of keys) {
          if (typeof parsed[key] !== 'boolean') {
            return { valid: false, error: `Value for "${key}" must be true or false` };
          }
        }
      } catch (error) {
        return { valid: false, error: 'Must be valid JSON format, e.g., {"heads":true,"pcb":false}' };
      }
    }
  }

  return { valid: true };
}

// Generate CSV template for an entity type
export function generateTemplate(entityType: EntityType): string {
  const config = ENTITY_CONFIGS[entityType];

  // For inventory, create a comprehensive template with all fields organized logically
  if (entityType === 'inventory') {
    const headers = [
      // Basic Information (Required)
      'name',
      'description',
      'item_type',
      'category_id',

      // Identification
      'item_number',
      'serial_number',

      // Device Specifications
      'device_type_id',
      'brand_id',
      'model',
      'capacity_id',

      // Status and Condition
      'status_type_id',
      'condition_type_id',

      // Technical Specifications
      'firmware_version',
      'pcb_number',
      'manufacture_date',
      'interface_id',
      'product_country_id',
      'dcm',
      'head_map',
      'preamp',
      'part_number',
      'platter_heads',
      'spindle_speed',

      // Stock Management
      'quantity_available',
      'quantity_in_use',
      'quantity_purchased',

      // Location and Storage
      'storage_location_id',
      'storage_notes',

      // Supplier and Sourcing
      'supplier_name',
      'supplier_contact',

      // Financial Information
      'acquisition_cost',
      'acquisition_date',
      'purchase_date',

      // Donor Parts Specific
      'available_for_donor',
      'usable_donor_parts',
      'compatibility_notes',

      // Additional Information
      'last_verified_date',
      'last_verified_by',
      'created_by',
      'notes',
      'tags',
      'is_active',
    ];

    // Add two sample rows with realistic data
    const sampleRow1 = [
      'Seagate Barracuda 1TB HDD',
      'Seagate 1TB 7200RPM SATA hard drive for donor parts',
      'donor_part',
      '',
      '',
      'ST1000DM003',
      '',
      'Z1D12345',
      '97ae49d2-93f8-4f19-96a0-9bd3451b5b19',
      '327a082f-c6bf-493f-a150-e7d32218c3f4',
      'ST1000DM003',
      'e1fdc2d8-3ebe-44c2-9aa5-1cbe92db7cdf',
      'available',
      'c4a69811-d9b8-4223-8a58-fa004beb087b',
      '4',
      '417fba52-9f07-4b68-834d-17b80f28aff9',
      'Minor wear on casing',
      'CC45',
      '100664987',
      '2023-03-15',
      '1',
      '8fe89c5c-6b68-486a-9fc6-79e1287847c5',
      'TK',
      'CC45-002',
      '0C90',
      '100664987-001',
      '2 platters, 4 heads',
      '7200',
      'ST1000DM003-1CH162',
      '10',
      '1',
      '0',
      '0',
      '10',
      '0',
      '2',
      '1',
      '20',
      'cc77b9ef-c1b6-4756-9301-626cf0c2c46a',
      'Shelf A3',
      'Global Tech Supplies',
      'support@globaltechsupplies.com',
      'Global Tech Supplies',
      'PO-2023-0456',
      '45.50',
      '45.50',
      '45.50',
      '0',
      '2023-04-01',
      '2023-04-01',
      '2026-04-01',
      'true',
      '{"heads":true,"pcb":true,"motor":true,"platters":true,"firmware_chip":false,"preamp":true,"drive_enclosure":false}',
      'Compatible with ST1000DM003 series and similar Seagate 7200RPM drives',
      '2024-11-01',
      '',
      '',
      'Tested and verified working donor drive',
      '',
      'true',
    ];

    const sampleRow2 = [
      'WD Blue 500GB SSD',
      'Western Digital Blue 500GB SATA SSD',
      'spare_device',
      '',
      '',
      'WDS500G2B0A',
      '',
      'WD-SN550-500GB-001',
      '3cc78800-5a3d-44c2-97e2-e7e303105205',
      '8e8e9b4e-b326-4bb5-9f9a-2f107f6aff53',
      'WDS500G2B0A',
      'bdf5f13e-00fd-4573-8570-cc51eb7fe047',
      'available',
      'c4a69811-d9b8-4223-8a58-fa004beb087b',
      '5',
      '8aad2c25-b70f-42ce-b546-8effbb557773',
      'Brand new in original packaging',
      '411070WD',
      '',
      '2024-06-10',
      '1',
      '8fe89c5c-6b68-486a-9fc6-79e1287847c5',
      '',
      '',
      '',
      '',
      '',
      '',
      '415070WD',
      '5',
      '0',
      '0',
      '0',
      '5',
      '0',
      '1',
      '1',
      '10',
      'cc77b9ef-c1b6-4756-9301-626cf0c2c46a',
      'Cabinet B1',
      'Tech Distributors Inc',
      'orders@techdist.com',
      'Tech Distributors Inc',
      'PO-2024-0789',
      '55.00',
      '55.00',
      '55.00',
      '0',
      '2024-07-15',
      '2024-07-15',
      '2029-07-15',
      'false',
      '{"heads":false,"pcb":false,"motor":false,"platters":false,"firmware_chip":false,"preamp":false,"drive_enclosure":false}',
      'Solid state drive, not used for donor parts',
      '',
      '',
      '',
      'New spare device for system replacements',
      '',
      'true',
    ];

    return headers.join(',') + '\n' + sampleRow1.join(',') + '\n' + sampleRow2.join(',') + '\n';
  }

  // For other entity types, use the default template with required and reference fields
  const headers = [
    ...config.requiredFields,
    ...config.uniqueFields.filter(f => !config.requiredFields.includes(f)),
    ...Object.keys(config.referenceFields),
    ...config.dateFields.filter(f => !config.requiredFields.includes(f)),
    ...config.numberFields.filter(f => !config.requiredFields.includes(f)),
    ...config.booleanFields.filter(f => !config.requiredFields.includes(f)),
  ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

  return headers.join(',') + '\n';
}

// Export data to CSV format
export function exportToCSV(data: Record<string, any>[], columns?: string[]): string {
  if (data.length === 0) return '';

  const headers = columns || Object.keys(data[0]);
  let csv = headers.join(',') + '\n';

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma or quote
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csv += values.join(',') + '\n';
  }

  return csv;
}

// Name-based lookup functions using database functions

export async function lookupBrand(brandName: string): Promise<NameLookupResult> {
  if (!brandName || brandName.trim() === '') {
    return { resolved: false, value: null, originalValue: brandName };
  }

  const { data, error } = await supabase.rpc('lookup_brand', { p_name: brandName });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: brandName };
  }

  return { resolved: true, value: data, originalValue: brandName };
}

export async function lookupDeviceType(typeName: string): Promise<NameLookupResult> {
  if (!typeName || typeName.trim() === '') {
    return { resolved: false, value: null, originalValue: typeName };
  }

  const { data, error } = await supabase.rpc('lookup_device_type', { p_name: typeName });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: typeName };
  }

  return { resolved: true, value: data, originalValue: typeName };
}

export async function lookupCapacity(capacityInput: string): Promise<NameLookupResult> {
  if (!capacityInput || capacityInput.trim() === '') {
    return { resolved: false, value: null, originalValue: capacityInput };
  }

  const { data, error } = await supabase.rpc('lookup_capacity', { p_name: capacityInput });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: capacityInput };
  }

  return { resolved: true, value: data, originalValue: capacityInput };
}

export async function lookupInterface(interfaceName: string): Promise<NameLookupResult> {
  if (!interfaceName || interfaceName.trim() === '') {
    return { resolved: false, value: null, originalValue: interfaceName };
  }

  const { data, error } = await supabase.rpc('lookup_interface', { p_name: interfaceName });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: interfaceName };
  }

  return { resolved: true, value: data, originalValue: interfaceName };
}

export async function lookupStorageLocation(locationName: string): Promise<NameLookupResult> {
  if (!locationName || locationName.trim() === '') {
    return { resolved: false, value: null, originalValue: locationName };
  }

  const { data, error } = await supabase.rpc('lookup_storage_location', { p_name: locationName });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: locationName };
  }

  return { resolved: true, value: data, originalValue: locationName };
}

export async function lookupCountry(countryInput: string): Promise<NameLookupResult> {
  if (!countryInput || countryInput.trim() === '') {
    return { resolved: false, value: null, originalValue: countryInput };
  }

  const { data, error } = await supabase.rpc('lookup_country', { p_name: countryInput });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: countryInput };
  }

  return { resolved: true, value: data, originalValue: countryInput };
}

export async function lookupStatusType(statusName: string): Promise<NameLookupResult> {
  if (!statusName || statusName.trim() === '') {
    return { resolved: false, value: null, originalValue: statusName };
  }

  const { data, error } = await supabase.rpc('lookup_status_type', { p_name: statusName });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: statusName };
  }

  return { resolved: true, value: data, originalValue: statusName };
}

export async function lookupConditionType(conditionName: string): Promise<NameLookupResult> {
  if (!conditionName || conditionName.trim() === '') {
    return { resolved: false, value: null, originalValue: conditionName };
  }

  const { data, error } = await supabase.rpc('lookup_condition_type', { p_name: conditionName });

  if (error || !data) {
    return { resolved: false, value: null, originalValue: conditionName };
  }

  return { resolved: true, value: data, originalValue: conditionName };
}

// Bulk lookup for better performance
export async function bulkLookupNames(data: Record<string, any>[]): Promise<BulkLookupResults> {
  const uniqueBrands = new Set<string>();
  const uniqueDeviceTypes = new Set<string>();
  const uniqueCapacities = new Set<string>();
  const uniqueInterfaces = new Set<string>();
  const uniqueLocations = new Set<string>();
  const uniqueCountries = new Set<string>();
  const uniqueStatusTypes = new Set<string>();
  const uniqueConditionTypes = new Set<string>();

  // Collect all unique values
  for (const row of data) {
    if (row.brand_name) uniqueBrands.add(row.brand_name);
    if (row.device_type_name) uniqueDeviceTypes.add(row.device_type_name);
    if (row.capacity_name) uniqueCapacities.add(row.capacity_name);
    if (row.interface_name) uniqueInterfaces.add(row.interface_name);
    if (row.storage_location_name) uniqueLocations.add(row.storage_location_name);
    if (row.country_name) uniqueCountries.add(row.country_name);
    if (row.status_type_name) uniqueStatusTypes.add(row.status_type_name);
    if (row.condition_type_name) uniqueConditionTypes.add(row.condition_type_name);
  }

  // Lookup all values in parallel
  const [brands, deviceTypes, capacities, interfaces, locations, countries, statusTypes, conditionTypes] = await Promise.all([
    Promise.all(Array.from(uniqueBrands).map(async (name) => ({ name, result: await lookupBrand(name) }))),
    Promise.all(Array.from(uniqueDeviceTypes).map(async (name) => ({ name, result: await lookupDeviceType(name) }))),
    Promise.all(Array.from(uniqueCapacities).map(async (name) => ({ name, result: await lookupCapacity(name) }))),
    Promise.all(Array.from(uniqueInterfaces).map(async (name) => ({ name, result: await lookupInterface(name) }))),
    Promise.all(Array.from(uniqueLocations).map(async (name) => ({ name, result: await lookupStorageLocation(name) }))),
    Promise.all(Array.from(uniqueCountries).map(async (name) => ({ name, result: await lookupCountry(name) }))),
    Promise.all(Array.from(uniqueStatusTypes).map(async (name) => ({ name, result: await lookupStatusType(name) }))),
    Promise.all(Array.from(uniqueConditionTypes).map(async (name) => ({ name, result: await lookupConditionType(name) }))),
  ]);

  return {
    brands: new Map(brands.map(({ name, result }) => [name, result])),
    deviceTypes: new Map(deviceTypes.map(({ name, result }) => [name, result])),
    capacities: new Map(capacities.map(({ name, result }) => [name, result])),
    interfaces: new Map(interfaces.map(({ name, result }) => [name, result])),
    storageLocations: new Map(locations.map(({ name, result }) => [name, result])),
    countries: new Map(countries.map(({ name, result }) => [name, result])),
    statusTypes: new Map(statusTypes.map(({ name, result }) => [name, result])),
    conditionTypes: new Map(conditionTypes.map(({ name, result }) => [name, result])),
  };
}

// Resolve name-based references to UUIDs in a row
export function resolveNamesToUUIDs(
  row: Record<string, any>,
  lookupResults: BulkLookupResults
): Record<string, any> {
  const resolved = { ...row };

  // Map name fields to UUID fields
  const nameToUUIDMapping: Record<string, { lookupMap: Map<string, NameLookupResult>; targetField: string }> = {
    brand_name: { lookupMap: lookupResults.brands, targetField: 'brand_id' },
    device_type_name: { lookupMap: lookupResults.deviceTypes, targetField: 'device_type_id' },
    capacity_name: { lookupMap: lookupResults.capacities, targetField: 'capacity_id' },
    interface_name: { lookupMap: lookupResults.interfaces, targetField: 'interface_id' },
    storage_location_name: { lookupMap: lookupResults.storageLocations, targetField: 'storage_location_id' },
    country_name: { lookupMap: lookupResults.countries, targetField: 'product_country_id' },
    status_type_name: { lookupMap: lookupResults.statusTypes, targetField: 'status_type_id' },
    condition_type_name: { lookupMap: lookupResults.conditionTypes, targetField: 'condition_type_id' },
  };

  for (const [nameField, { lookupMap, targetField }] of Object.entries(nameToUUIDMapping)) {
    if (row[nameField]) {
      const lookupResult = lookupMap.get(row[nameField]);
      if (lookupResult?.resolved && lookupResult.value) {
        resolved[targetField] = lookupResult.value;
      }
      // Remove the name field from the final row
      delete resolved[nameField];
    }
  }

  return resolved;
}

// Generate name-based template for inventory
export function generateNameBasedTemplate(): string {
  const headers = [
    // Basic Information (Required)
    'name',
    'description',
    'item_type',
    'category_name',

    // Identification
    'item_number',
    'serial_number',

    // Device Specifications (Name-Based)
    'device_type_name',
    'brand_name',
    'model',
    'capacity_name',

    // Status and Condition (Name-Based)
    'status_type_name',
    'condition_type_name',

    // Technical Specifications
    'firmware_version',
    'pcb_number',
    'manufacture_date',
    'interface_name',
    'country_name',
    'dcm',
    'head_map',
    'preamp',
    'part_number',
    'platter_heads',
    'spindle_speed',

    // Stock Management
    'quantity_available',
    'quantity_in_use',
    'quantity_purchased',

    // Location and Storage (Name-Based)
    'storage_location_name',
    'storage_notes',

    // Supplier and Sourcing
    'supplier_name',
    'supplier_contact',

    // Financial Information
    'acquisition_cost',
    'acquisition_date',
    'purchase_date',

    // Donor Parts Specific
    'available_for_donor',
    'usable_donor_parts',
    'compatibility_notes',

    // Additional Information
    'notes',
    'tags',
    'is_active',
  ];

  // Add sample rows with friendly names instead of UUIDs
  const sampleRow1 = [
    'Seagate Barracuda 1TB HDD',
    'Seagate 1TB 7200RPM SATA hard drive for donor parts',
    'donor_part',
    '',
    '',
    'ST1000DM003',
    '',
    'Z1D12345',
    'HDD',
    'Seagate',
    'ST1000DM003',
    '1TB',
    'Available',
    'Good',
    '4',
    'Minor wear on casing',
    'CC45',
    '100664987',
    '2023-03-15',
    'SATA',
    'Thailand',
    'CC45-002',
    '0C90',
    '100664987-001',
    '2 platters, 4 heads',
    '7200',
    'ST1000DM003-1CH162',
    '10',
    '1',
    '0',
    '0',
    '10',
    '0',
    '2',
    '1',
    '20',
    'Main Warehouse',
    'Shelf A3',
    'Global Tech Supplies',
    'support@globaltechsupplies.com',
    'Global Tech Supplies',
    'PO-2023-0456',
    '45.50',
    '45.50',
    '45.50',
    '0',
    '2023-04-01',
    '2023-04-01',
    '2026-04-01',
    'true',
    '{"heads":true,"pcb":true,"motor":true,"platters":true,"firmware_chip":false,"preamp":true,"drive_enclosure":false}',
    'Compatible with ST1000DM003 series and similar Seagate 7200RPM drives',
    'Tested and verified working donor drive',
    '',
    'true',
  ];

  const sampleRow2 = [
    'WD Blue 500GB SSD',
    'Western Digital Blue 500GB SATA SSD',
    'spare_device',
    '',
    '',
    'WDS500G2B0A',
    '',
    'WD-SN550-500GB-001',
    'SSD',
    'Western Digital',
    'WDS500G2B0A',
    '500GB',
    'Available',
    'New',
    '5',
    'Brand new in original packaging',
    '411070WD',
    '',
    '2024-06-10',
    'SATA',
    'Thailand',
    '',
    '',
    '',
    '',
    '',
    '415070WD',
    '5',
    '0',
    '0',
    '0',
    '5',
    '0',
    '1',
    '1',
    '10',
    'Main Warehouse',
    'Cabinet B1',
    'Tech Distributors Inc',
    'orders@techdist.com',
    'Tech Distributors Inc',
    'PO-2024-0789',
    '55.00',
    '55.00',
    '55.00',
    '0',
    '2024-07-15',
    '2024-07-15',
    '2029-07-15',
    'false',
    '{"heads":false,"pcb":false,"motor":false,"platters":false,"firmware_chip":false,"preamp":false,"drive_enclosure":false}',
    'Solid state drive, not used for donor parts',
    'New spare device for system replacements',
    '',
    'true',
  ];

  return headers.join(',') + '\n' + sampleRow1.join(',') + '\n' + sampleRow2.join(',') + '\n';
}
