import { supabase, getTenantId } from './supabaseClient';
import type { Database } from '../types/database.types';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { baseAmount } from './financialMath';
import type { TaxComputation } from './regimes/types';

function requireTenantId(): string {
  const tid = getTenantId();
  if (!tid) throw new Error('No tenant context — cannot perform stock mutation');
  return tid;
}

type StockItem = Database['public']['Tables']['stock_items']['Row'];
type StockItemInsert = Database['public']['Tables']['stock_items']['Insert'];
type StockItemUpdate = Database['public']['Tables']['stock_items']['Update'];
type StockCategory = Database['public']['Tables']['stock_categories']['Row'];
type StockCategoryInsert = Database['public']['Tables']['stock_categories']['Insert'];
type StockTransaction = Database['public']['Tables']['stock_transactions']['Row'];
type StockSale = Database['public']['Tables']['stock_sales']['Row'];
type StockSaleInsert = Database['public']['Tables']['stock_sales']['Insert'];
type StockSaleItem = Database['public']['Tables']['stock_sale_items']['Row'];
type StockSerialNumber = Database['public']['Tables']['stock_serial_numbers']['Row'];
type StockAdjustmentSession = Database['public']['Tables']['stock_adjustment_sessions']['Row'];
type StockAdjustmentSessionInsert = Database['public']['Tables']['stock_adjustment_sessions']['Insert'];
type StockAdjustmentSessionItem = Database['public']['Tables']['stock_adjustment_session_items']['Row'];

export type {
  StockItem,
  StockItemInsert,
  StockItemUpdate,
  StockCategory,
  StockTransaction,
  StockSale,
  StockSaleItem,
  StockSerialNumber,
  StockAdjustmentSession,
  StockAdjustmentSessionItem,
};

export interface StockItemWithCategory extends StockItem {
  stock_categories?: StockCategory | null;
}

export interface StockSaleWithDetails extends StockSale {
  customers_enhanced?: { id: string; customer_name: string | null; email: string | null; phone: string | null } | null;
  cases?: { id: string; case_no: string | null; title: string | null } | null;
  stock_sale_items?: Array<StockSaleItem & { stock_items?: Pick<StockItem, 'id' | 'name' | 'brand' | 'sku'> | null }>;
}

export interface StockStats {
  totalItems: number;
  totalSaleableItems: number;
  totalInternalItems: number;
  stockValue: number;
  saleableValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  salesToday: number;
  revenueToday: number;
}

export interface StockSaleCreateData {
  customer_id: string;
  case_id?: string | null;
  company_id?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  tax_inclusive?: boolean;
  /** Kernel output computed client-side (Task 26: computeStockSaleTax) — threaded into
   *  p_tax_lines so document_tax_lines + vat_records get written, parity with invoices. */
  taxComputation?: TaxComputation | null;
  /** Tenant base currency stamped on every p_tax_lines[].currency (POS is base-currency-only). */
  currency: string;
  items: Array<{
    stock_item_id: string;
    quantity: number;
    unit_price: number;
    cost_price?: number | null;
    serial_number?: string | null;
    warranty_start_date?: string | null;
    warranty_end_date?: string | null;
    unit_code?: string | null;
    unit_label?: string | null;
    item_code?: string | null;
    tax_treatment?: string | null;
    treatment_reason_code?: string | null;
  }>;
}

export interface StockFilters {
  type?: 'internal' | 'saleable' | 'both';
  category_id?: string;
  lowStock?: boolean;
  search?: string;
  is_active?: boolean;
}

export interface StockTransactionFilters {
  itemId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

export interface SalesFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
  customer_id?: string;
  case_id?: string;
}

// ============================================================
// Stock Categories
// ============================================================

export async function getStockCategories(_type?: 'internal' | 'saleable'): Promise<StockCategory[]> {
  // NOTE: stock_categories.category_type was removed from live schema in v1.0.0.
  // The `type` parameter is retained for API compatibility but is currently a no-op.
  // TODO(B8): drop the parameter from consumers in StockCategoriesPage and remove here.
  const { data, error } = await supabase
    .from('stock_categories')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createStockCategory(data: StockCategoryInsert): Promise<StockCategory> {
  const { data: result, error } = await supabase
    .from('stock_categories')
    .insert(data)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!result) throw new Error('Failed to create stock category');
  return result;
}

export async function updateStockCategory(id: string, data: Partial<StockCategoryInsert>): Promise<StockCategory> {
  const { data: result, error } = await supabase
    .from('stock_categories')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!result) throw new Error('Stock category not found');
  return result;
}

export async function deleteStockCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('stock_categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Stock Items
// ============================================================

export async function getStockItems(filters?: StockFilters): Promise<StockItemWithCategory[]> {
  let query = supabase
    .from('stock_items')
    .select('*, stock_categories(*)')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (filters?.type && filters.type !== 'both') {
    const t = sanitizeFilterValue(filters.type);
    query = query.or(`item_type.eq.${t},item_type.eq.both`);
  }
  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id);
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }
  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    // NOTE: stock_items.model was removed from live schema in v1.0.0; search on name/brand/sku only.
    query = query.or(
      `name.ilike.%${s}%,brand.ilike.%${s}%,sku.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  let items = (data ?? []) as StockItemWithCategory[];

  if (filters?.lowStock) {
    items = items.filter(
      (item) => (item.current_quantity ?? 0) <= (item.minimum_quantity ?? 0)
    );
  }

  return items;
}

export async function getStockItemsPage(
  filters?: StockFilters,
  page = 0,
  pageSize = 50,
): Promise<{ rows: StockItemWithCategory[]; total: number }> {
  // low_stock compares two columns (current_quantity <= minimum_quantity), which
  // PostgREST can't express in a filter; fetch the matching set and paginate it
  // in memory (low-stock is a bounded worklist, not the full catalog).
  if (filters?.lowStock) {
    const all = await getStockItems(filters);
    return {
      rows: all.slice(page * pageSize, (page + 1) * pageSize),
      total: all.length,
    };
  }

  let query = supabase
    .from('stock_items')
    .select('*, stock_categories(*)', { count: 'exact' })
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (filters?.type && filters.type !== 'both') {
    const t = sanitizeFilterValue(filters.type);
    query = query.or(`item_type.eq.${t},item_type.eq.both`);
  }
  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id);
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }
  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    query = query.or(`name.ilike.%${s}%,brand.ilike.%${s}%,sku.ilike.%${s}%`);
  }

  const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as StockItemWithCategory[], total: count ?? 0 };
}

export async function getStockItem(id: string): Promise<StockItemWithCategory | null> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('*, stock_categories(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as StockItemWithCategory | null;
}

export async function getSaleableItems(): Promise<StockItemWithCategory[]> {
  // is_featured column dropped from stock_items schema; order by name only.
  const { data, error } = await supabase
    .from('stock_items')
    .select('*, stock_categories(*)')
    .or('item_type.eq.saleable,item_type.eq.both')
    .is('deleted_at', null)
    .eq('is_active', true)
    .gt('current_quantity', 0)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StockItemWithCategory[];
}

export async function getLowStockItems(): Promise<StockItemWithCategory[]> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('*, stock_categories(*)')
    .is('deleted_at', null)
    .eq('is_active', true);
  if (error) throw error;

  const items = (data ?? []) as StockItemWithCategory[];
  return items.filter((item) => (item.current_quantity ?? 0) <= (item.minimum_quantity ?? 0));
}

export async function createStockItem(data: StockItemInsert): Promise<StockItem> {
  const sku = await supabase.rpc('get_next_number', { p_scope: 'stock' });

  const { data: result, error } = await supabase
    .from('stock_items')
    .insert({ ...data, sku: sku.data ?? data.sku })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!result) throw new Error('Failed to create stock item');
  return result;
}

export async function updateStockItem(id: string, data: StockItemUpdate): Promise<StockItem> {
  const existing = await getStockItem(id);

  if (
    existing &&
    (data.cost_price !== undefined || data.selling_price !== undefined)
  ) {
    const costChanged = data.cost_price !== undefined && data.cost_price !== existing.cost_price;
    const sellingChanged = data.selling_price !== undefined && data.selling_price !== existing.selling_price;

    if (costChanged || sellingChanged) {
      await supabase.from('stock_price_history').insert({
        tenant_id: requireTenantId(),
        item_id: id,
        old_cost_price: costChanged ? existing.cost_price : null,
        new_cost_price: costChanged ? (data.cost_price ?? null) : null,
        old_selling_price: sellingChanged ? existing.selling_price : null,
        new_selling_price: sellingChanged ? (data.selling_price ?? null) : null,
      });
    }
  }

  const { data: result, error } = await supabase
    .from('stock_items')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!result) throw new Error('Stock item not found or not accessible');
  return result;
}

export async function deleteStockItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('stock_items')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function reserveStock(itemId: string, quantity: number, caseId?: string): Promise<void> {
  const item = await getStockItem(itemId);
  if (!item) throw new Error('Stock item not found');

  const current = item.current_quantity ?? 0;
  const reserved = item.quantity_reserved ?? 0;
  const available = current - reserved;
  if (available < quantity) throw new Error('Insufficient stock available to reserve');

  const { error: updateError } = await supabase
    .from('stock_items')
    .update({ quantity_reserved: reserved + quantity })
    .eq('id', itemId);
  if (updateError) throw updateError;

  await supabase.from('stock_transactions').insert({
    tenant_id: requireTenantId(),
    item_id: itemId,
    transaction_type: 'reserved',
    quantity,
    reference_type: caseId ? 'case' : null,
    reference_id: caseId ?? null,
  });
}

export async function releaseReservedStock(itemId: string, quantity: number): Promise<void> {
  const item = await getStockItem(itemId);
  if (!item) throw new Error('Stock item not found');

  const reserved = item.quantity_reserved ?? 0;
  const newReserved = Math.max(0, reserved - quantity);

  const { error } = await supabase
    .from('stock_items')
    .update({ quantity_reserved: newReserved })
    .eq('id', itemId);
  if (error) throw error;

  await supabase.from('stock_transactions').insert({
    tenant_id: requireTenantId(),
    item_id: itemId,
    transaction_type: 'released',
    quantity,
  });
}

// ============================================================
// Stock Transactions
// ============================================================

export async function getStockTransactions(filters?: StockTransactionFilters): Promise<StockTransaction[]> {
  // NOTE: stock_transactions has no deleted_at or transaction_date columns in live schema; use created_at.
  let query = supabase
    .from('stock_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.itemId) query = query.eq('item_id', filters.itemId);
  if (filters?.type) query = query.eq('transaction_type', filters.type);
  if (filters?.startDate) query = query.gte('created_at', filters.startDate);
  if (filters?.endDate) query = query.lte('created_at', filters.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function recordStockReceipt(
  itemId: string,
  quantity: number,
  options?: {
    poId?: string;
    cost?: number;
    serialNumbers?: string[];
    notes?: string;
  }
): Promise<void> {
  const item = await getStockItem(itemId);
  if (!item) throw new Error('Stock item not found');

  const current = item.current_quantity ?? 0;
  const newQty = current + quantity;
  // Preserve NULL when no cost is known so downstream COGS/valuation reports stay honest.
  const unitCost = options?.cost ?? item.cost_price ?? null;

  const { error: updateError } = await supabase
    .from('stock_items')
    .update({ current_quantity: newQty, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (updateError) throw updateError;

  const tenantId = requireTenantId();
  await supabase.from('stock_transactions').insert({
    tenant_id: tenantId,
    item_id: itemId,
    transaction_type: 'received',
    quantity,
    reference_type: options?.poId ? 'purchase_order' : null,
    reference_id: options?.poId ?? null,
    unit_cost: unitCost,
    total_cost: unitCost !== null ? unitCost * quantity : null,
    notes: options?.notes ?? null,
  });

  if (options?.serialNumbers && options.serialNumbers.length > 0) {
    // NOTE: stock_serial_numbers schema v1.0.0 does not carry purchase_order_id, purchase_date,
    // purchase_cost. Those facts are derivable from the linked PO. TODO(B8): if needed, add
    // those columns via migration or join through purchase_order_items.
    const serials = options.serialNumbers.map((sn) => ({
      tenant_id: tenantId,
      item_id: itemId,
      serial_number: sn,
      status: 'in_stock' as const,
    }));
    await supabase.from('stock_serial_numbers').insert(serials);
  }
}

export async function recordStockUsage(
  itemId: string,
  quantity: number,
  caseId: string,
  notes?: string
): Promise<void> {
  // Single atomic transaction (RPC): locks the stock row, decrements the writable
  // quantity_on_hand (current_quantity is a generated mirror — writing it directly
  // 400s), writes the 'used' stock_transaction, and logs the chain-of-custody +
  // case-history events so consuming a physical part against a case is forensically
  // traceable. Replaces the prior non-atomic read→update→insert sequence.
  const { error } = await supabase.rpc('record_stock_usage_for_case', {
    p_item_id: itemId,
    p_quantity: quantity,
    p_case_id: caseId,
    p_notes: notes ?? undefined,
  });
  if (error) throw error;
}

// ============================================================
// Stock Sales
// ============================================================

export async function getStockSales(filters?: SalesFilters): Promise<StockSaleWithDetails[]> {
  let query = supabase
    .from('stock_sales')
    .select(`
      *,
      customers_enhanced(id, customer_name, email, phone),
      cases(id, case_no, title),
      stock_sale_items(*, stock_items(id, name, brand, sku))
    `)
    .is('deleted_at', null)
    .order('sale_date', { ascending: false });

  // NOTE: stock_sales.payment_status was unified into stock_sales.status in v1.0.0.
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id);
  if (filters?.case_id) query = query.eq('case_id', filters.case_id);
  if (filters?.startDate) query = query.gte('sale_date', filters.startDate);
  if (filters?.endDate) query = query.lte('sale_date', filters.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as StockSaleWithDetails[];
}

export async function getStockSale(id: string): Promise<StockSaleWithDetails | null> {
  const { data, error } = await supabase
    .from('stock_sales')
    .select(`
      *,
      customers_enhanced(id, customer_name, email, phone),
      cases(id, case_no, title),
      stock_sale_items(*, stock_items(id, name, brand, sku, image_url))
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StockSaleWithDetails | null;
}

export async function getSalesByCase(caseId: string): Promise<StockSaleWithDetails[]> {
  return getStockSales({ case_id: caseId });
}

export async function getSalesByCustomer(customerId: string): Promise<StockSaleWithDetails[]> {
  return getStockSales({ customer_id: customerId });
}

export async function createStockSale(data: StockSaleCreateData): Promise<StockSale> {
  // Atomic, race-safe path: the entire sale (header + line items + per-item
  // quantity decrement + stock_transactions ledger rows + serial-number flips)
  // runs in ONE transaction inside the record_stock_sale RPC, which FOR UPDATE
  // locks each stock_items row and RAISES on oversell. This replaces the former
  // non-atomic browser-side write sequence (separate sale insert, per-item
  // UPDATE, per-item INSERT) that could leave quantities and the ledger diverged
  // on a mid-loop failure and allowed concurrent sales to oversell below zero.
  //
  // NOTE: server-side computes subtotal/discount/total and the sale number; the
  // RPC also recomputes them defensively. stock_items.current_quantity is a
  // GENERATED column over quantity_on_hand, so the RPC writes quantity_on_hand
  // (the real balance column) and the generated columns recompute automatically.
  const { data: sale, error } = await supabase.rpc('record_stock_sale', {
    p_sale: {
      customer_id: data.customer_id,
      case_id: data.case_id ?? null,
      notes: data.notes ?? null,
      payment_method: data.payment_method ?? null,
      discount_type: data.discount_type ?? null,
      discount_value: data.discount_value ?? null,
      tax_inclusive: data.tax_inclusive ?? false,
      tax_regime_key: data.taxComputation?.trace.regimeKey ?? null,
    },
    p_items: data.items.map((item) => ({
      stock_item_id: item.stock_item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      cost_price: item.cost_price ?? null,
      serial_number: item.serial_number ?? null,
      unit_code: item.unit_code ?? null,
      unit_label: item.unit_label ?? null,
      item_code: item.item_code ?? null,
      tax_treatment: item.tax_treatment ?? 'standard',
      treatment_reason_code: item.treatment_reason_code ?? null,
    })),
    // POS threads ONLY the document-level rollups (line_item_id null). Unlike invoices —
    // where persistDocumentTaxLines relabels per-line rows with real UUIDs so only rollups
    // are null — the kernel's POS per-line rows keep lineItemId:null, which would collide
    // with record_stock_sale's `line_item_id IS NULL` header/ledger filter and double-count
    // the tax. Rollups alone give the correct header total + one vat_records row per component.
    p_tax_lines: data.taxComputation
      ? data.taxComputation.rollups.map((l, i) => ({
          line_item_id: l.lineItemId,
          component_code: l.componentCode,
          component_label: l.componentLabel,
          jurisdiction_ref: l.jurisdictionRef,
          rate: l.rate,
          taxable_base: l.taxableBase,
          tax_amount: l.taxAmount,
          currency: data.currency,
          exchange_rate: 1,
          tax_amount_base: l.taxAmount,
          tax_treatment: l.taxTreatment,
          treatment_reason_code: l.treatmentReasonCode,
          regime_key: data.taxComputation!.trace.regimeKey,
          plugin_version: data.taxComputation!.trace.pluginVersion,
          pack_version_id: data.taxComputation!.trace.packVersionId,
          rule_trace: i === 0 ? data.taxComputation!.trace : null,
          sequence: l.sequence,
        }))
      : null,
  });
  if (error) throw error;
  if (!sale) throw new Error('Failed to create stock sale');
  return sale as StockSale;
}

export async function updateStockSale(id: string, data: Partial<StockSaleInsert>): Promise<StockSale> {
  const { data: result, error } = await supabase
    .from('stock_sales')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!result) throw new Error('Stock sale not found');
  return result;
}

export async function cancelStockSale(id: string): Promise<void> {
  const sale = await getStockSale(id);
  if (!sale) throw new Error('Sale not found');

  if (sale.stock_sale_items) {
    // stock_sale_items.item_id in live schema (not stock_item_id)
    const cancelItemIds = sale.stock_sale_items.map((item) => item.item_id);
    const { data: cancelStockItemsData } = await supabase
      .from('stock_items')
      .select('*')
      .in('id', cancelItemIds)
      .is('deleted_at', null);
    const cancelStockItemsMap = new Map((cancelStockItemsData ?? []).map((si) => [si.id, si]));

    for (const item of sale.stock_sale_items) {
      const stockItem = cancelStockItemsMap.get(item.item_id);
      if (!stockItem) continue;

      const currentQty = stockItem.current_quantity ?? 0;
      const newQty = currentQty + item.quantity;
      await supabase
        .from('stock_items')
        .update({ current_quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', item.item_id);

      await supabase.from('stock_transactions').insert({
        tenant_id: requireTenantId(),
        item_id: item.item_id,
        transaction_type: 'returned',
        quantity: item.quantity,
        reference_type: 'sale',
        reference_id: id,
        notes: `Returned from cancelled sale ${sale.sale_number}`,
      });

      // Serial number relinking on cancel:
      // stock_sale_items v1.0.0 does not carry serial_number, so we cannot revert serial state
      // without a sale-line→serial bridge. TODO(B8): if needed, link via a separate bridge table.
    }
  }

  await supabase
    .from('stock_sales')
    .update({ status: 'refunded', deleted_at: new Date().toISOString() })
    .eq('id', id);
}

// NOTE: addSaleToInvoice was removed in C2 cleanup (2026-05-25). The v1.0.0 schema does not
// support sale↔invoice linkage (no invoice_id on stock_sales, no invoice_line_item_id on
// stock_sale_items). The "Add Stock Sale" button in InvoiceDetailPage and the
// AddStockSaleToInvoiceModal component were removed alongside this function. If sale↔invoice
// linkage is needed, restore via migration adding stock_sale_items.invoice_line_item_id,
// then reintroduce a service that inserts invoice_line_items rows.

// ============================================================
// Serial Numbers
// ============================================================

export async function getSerialNumbers(itemId: string): Promise<StockSerialNumber[]> {
  const { data, error } = await supabase
    .from('stock_serial_numbers')
    .select('*')
    .eq('item_id', itemId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAvailableSerialNumbers(itemId: string): Promise<StockSerialNumber[]> {
  const { data, error } = await supabase
    .from('stock_serial_numbers')
    .select('*')
    .eq('item_id', itemId)
    .eq('status', 'in_stock')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addSerialNumbers(itemId: string, serialNumbers: string[]): Promise<void> {
  const tenantId = requireTenantId();
  const inserts = serialNumbers.map((sn) => ({
    tenant_id: tenantId,
    item_id: itemId,
    serial_number: sn,
    status: 'in_stock' as const,
  }));
  const { error } = await supabase.from('stock_serial_numbers').insert(inserts);
  if (error) throw error;
}

export async function markSerialAsSold(
  serialNumber: string,
  _saleId: string,
  _customerId: string
): Promise<void> {
  // NOTE: stock_serial_numbers v1.0.0 schema lacks sale_id, sold_to_customer_id, sold_date.
  // We can only mark status; sale↔serial linkage must be reconstructed via stock_sale_items.
  // TODO(B8): add a serial→sale bridge or link via item_id+sale_id pair if business needs it.
  const { error } = await supabase
    .from('stock_serial_numbers')
    .update({ status: 'sold' })
    .eq('serial_number', serialNumber);
  if (error) throw error;
}

// ============================================================
// Adjustments
// ============================================================

export async function getStockAdjustments(): Promise<StockAdjustmentSession[]> {
  const { data, error } = await supabase
    .from('stock_adjustment_sessions')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getStockAdjustment(
  id: string
): Promise<(StockAdjustmentSession & { items: StockAdjustmentSessionItem[] }) | null> {
  const { data, error } = await supabase
    .from('stock_adjustment_sessions')
    .select('*, stock_adjustment_session_items(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as StockAdjustmentSession & { stock_adjustment_session_items?: StockAdjustmentSessionItem[] };
  return { ...d, items: d.stock_adjustment_session_items ?? [] };
}

export async function createStockAdjustment(
  data: StockAdjustmentSessionInsert & {
    items: Array<{ stock_item_id: string; system_quantity: number; counted_quantity: number; notes?: string }>;
  }
): Promise<StockAdjustmentSession> {
  const numberResult = await supabase.rpc('get_next_number', { p_scope: 'stock_adjustment' });

  // NOTE: stock_adjustment_sessions v1.0.0 uses session_number, not adjustment_number.
  const tenantId = requireTenantId();
  const { items: _items, ...sessionFields } = data;
  const { data: session, error: sessionError } = await supabase
    .from('stock_adjustment_sessions')
    .insert({ ...sessionFields, tenant_id: tenantId, session_number: numberResult.data })
    .select()
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('Failed to create stock adjustment session');

  if (data.items && data.items.length > 0) {
    // NOTE: stock_adjustment_session_items v1.0.0 uses item_id and expected_quantity
    // (not stock_item_id and system_quantity).
    const itemInserts = data.items.map((item) => ({
      tenant_id: tenantId,
      session_id: session.id,
      item_id: item.stock_item_id,
      expected_quantity: item.system_quantity,
      counted_quantity: item.counted_quantity,
      notes: item.notes ?? null,
    }));
    const { error: itemsError } = await supabase
      .from('stock_adjustment_session_items')
      .insert(itemInserts);
    if (itemsError) throw itemsError;
  }

  return session;
}

export async function approveStockAdjustment(id: string, approvedBy: string): Promise<void> {
  // Atomic path: applying every counted-vs-expected variance to quantity_on_hand,
  // writing the stock_transactions ledger rows, and marking the session
  // approved/completed all happen in ONE transaction inside post_stock_adjustment,
  // which FOR UPDATE locks each stock_items row and RAISES if a negative variance
  // would drive on-hand below zero. This replaces the former non-atomic browser-side
  // loop (per-item read, per-item UPDATE, per-item INSERT, then a separate session
  // update) that could leave quantities and the ledger diverged on a mid-loop failure.
  const { error } = await supabase.rpc('post_stock_adjustment', {
    p_session_id: id,
    p_approved_by: approvedBy,
  });
  if (error) throw error;
}

// ============================================================
// Stats & Reports
// ============================================================

export async function getStockStats(): Promise<StockStats> {
  const [itemsResult, salesTodayResult] = await Promise.all([
    supabase.from('stock_items').select('*').is('deleted_at', null).eq('is_active', true),
    supabase
      .from('stock_sales')
      .select('total_amount, total_amount_base')
      .is('deleted_at', null)
      .gte('sale_date', new Date().toISOString().split('T')[0]),
  ]);

  const items = (itemsResult.data ?? []) as StockItem[];
  const salesToday = salesTodayResult.data ?? [];

  const saleableItems = items.filter((i) => i.item_type === 'saleable' || i.item_type === 'both');
  const internalItems = items.filter((i) => i.item_type === 'internal' || i.item_type === 'both');

  const stockValue = items.reduce(
    (sum, i) => sum + ((i.current_quantity ?? 0) * (i.cost_price ?? 0)),
    0
  );
  const saleableValue = saleableItems.reduce(
    (sum, i) => sum + ((i.current_quantity ?? 0) * (i.selling_price ?? 0)),
    0
  );
  const lowStockCount = items.filter((i) => (i.current_quantity ?? 0) <= (i.minimum_quantity ?? 0) && (i.current_quantity ?? 0) > 0).length;
  const outOfStockCount = items.filter((i) => (i.current_quantity ?? 0) === 0).length;
  const revenueToday = salesToday.reduce((sum, s) => sum + baseAmount(s, 'total_amount'), 0);

  return {
    totalItems: items.length,
    totalSaleableItems: saleableItems.length,
    totalInternalItems: internalItems.length,
    stockValue,
    saleableValue,
    lowStockCount,
    outOfStockCount,
    salesToday: salesToday.length,
    revenueToday,
  };
}

export async function getStockValuation(): Promise<Array<{ item: StockItem; costValue: number; sellValue: number; margin: number }>> {
  const items = await getStockItems();
  return items.map((item) => {
    const qty = item.current_quantity ?? 0;
    const costValue = qty * (item.cost_price ?? 0);
    const sellValue = qty * (item.selling_price ?? item.cost_price ?? 0);
    const margin = item.cost_price && item.selling_price
      ? ((item.selling_price - item.cost_price) / item.selling_price) * 100
      : 0;
    return { item, costValue, sellValue, margin };
  });
}

export async function getSalesReport(startDate: string, endDate: string) {
  // NOTE: stock_sale_items v1.0.0 has no cost_price or line_total columns. Cost basis must be
  // derived from stock_items.cost_price at sale time, which is not perfectly accurate for
  // post-sale price changes. TODO(B8): add cost_price + line_total back via migration if
  // accurate margin reporting is product-required.
  const { data, error } = await supabase
    .from('stock_sales')
    .select('*, stock_sale_items(quantity, unit_price, total, item_id, stock_items(cost_price))')
    .is('deleted_at', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: false });
  if (error) throw error;

  const sales = data ?? [];
  const totalRevenue = sales.reduce((sum, s) => sum + baseAmount(s, 'total_amount'), 0);
  const totalCost = sales.reduce((sum, s) => {
    const items = (s as unknown as {
      stock_sale_items?: Array<{ quantity: number; stock_items?: { cost_price: number | null } | null }>;
    }).stock_sale_items ?? [];
    return sum + items.reduce((si, i) => si + (i.quantity * (i.stock_items?.cost_price ?? 0)), 0);
  }, 0);

  return { sales, totalRevenue, totalCost, totalProfit: totalRevenue - totalCost };
}

export async function getTopSellingItems(_startDate: string, _endDate: string, limit = 10) {
  // NOTE: stock_sale_items v1.0.0 has no deleted_at or line_total columns; use total instead.
  // Date filtering would have to happen via the parent stock_sales.sale_date join — not supported
  // by the current implementation. TODO(B8): filter by sale_date once needed.
  const { data, error } = await supabase
    .from('stock_sale_items')
    .select('item_id, quantity, total, stock_items(id, name, brand, sku)');
  if (error) throw error;

  const map = new Map<string, { name: string; brand: string | null; sku: string | null; totalQty: number; totalRevenue: number }>();
  for (const item of data ?? []) {
    const si = item as unknown as {
      item_id: string; quantity: number; total: number;
      stock_items?: { id: string; name: string; brand: string | null; sku: string | null } | null;
    };
    const key = si.item_id;
    const existing = map.get(key);
    if (existing) {
      existing.totalQty += si.quantity;
      existing.totalRevenue += si.total;
    } else {
      map.set(key, {
        name: si.stock_items?.name ?? '',
        brand: si.stock_items?.brand ?? null,
        sku: si.stock_items?.sku ?? null,
        totalQty: si.quantity,
        totalRevenue: si.total,
      });
    }
  }

  return Array.from(map.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

export async function getLowStockCount(): Promise<number> {
  const items = await getLowStockItems();
  return items.length;
}

// ============================================================
// Integration Functions
// ============================================================

export interface StockTransactionWithItem extends StockTransaction {
  stock_items?: Pick<StockItem, 'id' | 'name' | 'brand' | 'sku'> | null;
  performed_by_profile?: { full_name: string | null } | null;
}

export async function getStockUsageByCase(caseId: string): Promise<StockTransactionWithItem[]> {
  // stock_transactions schema: no case_id column (use reference_type/reference_id),
  // no transaction_date (use created_at), no deleted_at.
  const { data, error } = await supabase
    .from('stock_transactions')
    .select('*, stock_items(id, name, brand, sku)')
    .eq('reference_type', 'case')
    .eq('reference_id', caseId)
    .eq('transaction_type', 'used')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StockTransactionWithItem[];
}

export async function getRecommendedDevices(dataSizeGB: number): Promise<StockItemWithCategory[]> {
  const items = await getSaleableItems();
  if (dataSizeGB <= 0) return items.slice(0, 6);

  // NOTE: stock_items v1.0.0 has no capacity column. Heuristically extract capacity from
  // the item name (e.g. "WD Blue 2TB"). TODO(B8): if capacity-based recommendation is product
  // critical, add a normalized capacity_gb numeric column via migration.
  const scored = items.map((item) => {
    const haystack = `${item.name ?? ''} ${item.description ?? ''}`.toLowerCase();
    let capacityGB = 0;
    const tbMatch = haystack.match(/(\d+(?:\.\d+)?)\s*tb/);
    const gbMatch = haystack.match(/(\d+(?:\.\d+)?)\s*gb/);
    if (tbMatch) capacityGB = parseFloat(tbMatch[1]) * 1024;
    else if (gbMatch) capacityGB = parseFloat(gbMatch[1]);
    const overhead = dataSizeGB * 1.2;
    const fits = capacityGB > 0 && capacityGB >= overhead;
    const diff = capacityGB > 0 ? Math.abs(capacityGB - overhead * 1.5) : Infinity;
    return { item, fits, diff };
  });

  const fitting = scored.filter((s) => s.fits).sort((a, b) => a.diff - b.diff);
  if (fitting.length > 0) return fitting.slice(0, 6).map((s) => s.item);
  return items.slice(0, 6);
}

export interface StockSaleItemWithWarranty extends StockSaleItem {
  stock_items?: Pick<StockItem, 'id' | 'name' | 'brand'> | null;
  daysRemaining?: number;
  warranty_end_date?: string | null;
  warranty_start_date?: string | null;
}

export async function getCustomerWarranties(_customerId: string): Promise<StockSaleItemWithWarranty[]> {
  // NOTE: stock_sale_items v1.0.0 has no warranty_start_date/warranty_end_date columns and no
  // deleted_at. Warranty tracking is not supported in the current schema.
  // TODO(B8): if warranty tracking is product needed, restore via migration or add a dedicated
  // warranties table. For now return empty so callers degrade gracefully.
  return [];
}

export async function getCustomerSerialNumbers(_customerId: string): Promise<StockSerialNumber[]> {
  // NOTE: stock_serial_numbers v1.0.0 has no sold_to_customer_id or sold_date columns.
  // Customer↔serial linkage must traverse stock_sale_items → stock_sales.customer_id.
  // TODO(B8): rewrite this to join through stock_sale_items if needed. Returning empty for now.
  return [];
}

export interface TodaysSalesSummary {
  count: number;
  revenue: number;
  sales: StockSaleWithDetails[];
}

export async function getTodaysSales(): Promise<TodaysSalesSummary> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('stock_sales')
    .select('*, customers_enhanced(id, customer_name), stock_sale_items(*, stock_items(id, name, brand, sku))')
    .is('deleted_at', null)
    .gte('sale_date', today)
    .order('sale_date', { ascending: false });
  if (error) throw error;
  const sales = (data ?? []) as unknown as StockSaleWithDetails[];
  const revenue = sales.reduce((sum, s) => sum + baseAmount(s as unknown as Record<string, unknown>, 'total_amount'), 0);
  return { count: sales.length, revenue, sales };
}

export interface StockValuationSummary {
  totalValue: number;
  internalValue: number;
  saleableValue: number;
  itemCount: number;
}

export async function getStockValuationSummary(): Promise<StockValuationSummary> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('item_type, current_quantity, cost_price')
    .is('deleted_at', null)
    .eq('is_active', true);
  if (error) throw error;

  const items = data ?? [];
  let totalValue = 0;
  let internalValue = 0;
  let saleableValue = 0;

  for (const item of items) {
    const val = (item.current_quantity ?? 0) * (item.cost_price ?? 0);
    totalValue += val;
    if (item.item_type === 'internal') internalValue += val;
    else if (item.item_type === 'saleable') saleableValue += val;
    else {
      internalValue += val / 2;
      saleableValue += val / 2;
    }
  }

  return { totalValue, internalValue, saleableValue, itemCount: items.length };
}

export interface ReceiveStockFromPOData {
  purchaseOrderId: string;
  items: Array<{
    poItemId: string;
    stockItemId: string;
    quantity: number;
    unitCost: number;
    serialNumbers?: string[];
  }>;
  receivedBy: string;
}

export async function receiveStockFromPO(data: ReceiveStockFromPOData): Promise<void> {
  for (const item of data.items) {
    if (item.quantity <= 0) continue;
    await recordStockReceipt(item.stockItemId, item.quantity, {
      poId: data.purchaseOrderId,
      cost: item.unitCost,
      serialNumbers: item.serialNumbers,
    });

    // NOTE: purchase_order_items has stock_item_id + received_quantity but no received_at column.
    await supabase
      .from('purchase_order_items')
      .update({
        stock_item_id: item.stockItemId,
        received_quantity: item.quantity,
      })
      .eq('id', item.poItemId);
  }
}

export async function getPortalCustomerPurchases(customerId: string): Promise<{
  sales: StockSaleWithDetails[];
  warranties: StockSaleItemWithWarranty[];
}> {
  const [sales, warranties] = await Promise.all([
    getSalesByCustomer(customerId),
    getCustomerWarranties(customerId),
  ]);
  return { sales, warranties };
}


export async function getAvailableQuantity(stockItemId: string): Promise<number> {
  const item = await getStockItem(stockItemId);
  if (!item) return 0;
  return Math.max(0, (item.current_quantity ?? 0) - (item.quantity_reserved ?? 0));
}


// ============================================================
// Barcode Lookup
// ============================================================

export async function getStockItemByBarcode(barcode: string): Promise<StockItemWithCategory | null> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('*, stock_categories(*)')
    .eq('barcode', barcode)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as StockItemWithCategory | null;
}

export async function getSerialNumberByBarcode(barcode: string): Promise<StockSerialNumber | null> {
  const { data, error } = await supabase
    .from('stock_serial_numbers')
    .select('*')
    .eq('serial_number', barcode)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as StockSerialNumber | null;
}

// ============================================================
// Stock Alerts
// ============================================================

export interface StockAlert {
  id: string;
  alert_type: string;
  stock_item_id: string | null;
  serial_number_id: string | null;
  customer_id: string | null;
  message: string;
  severity: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string | null;
  expires_at: string | null;
}

export interface StockAlertWithItem extends StockAlert {
  stock_items?: Pick<StockItem, 'id' | 'name' | 'brand' | 'sku' | 'current_quantity' | 'minimum_quantity'> | null;
}

export async function getStockAlerts(filters?: { type?: string; isRead?: boolean }): Promise<StockAlertWithItem[]> {
  let query = supabase
    .from('stock_alerts')
    .select('*, stock_items(id, name, brand, sku, current_quantity, minimum_quantity)')
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false });

  if (filters?.type) query = query.eq('alert_type', filters.type);
  if (filters?.isRead !== undefined) query = query.eq('is_read', filters.isRead);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as StockAlertWithItem[];
}

export async function markAlertRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('stock_alerts')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function dismissAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from('stock_alerts')
    .update({ is_dismissed: true })
    .eq('id', id);
  if (error) throw error;
}

export async function generateLowStockAlerts(): Promise<number> {
  const lowItems = await getLowStockItems();
  let count = 0;

  for (const item of lowItems) {
    const isOut = (item.current_quantity ?? 0) === 0;
    const alertType = isOut ? 'out_of_stock' : 'low_stock';
    const message = isOut
      ? `${item.name} is out of stock`
      : `${item.name} is low on stock (${item.current_quantity ?? 0} remaining, minimum: ${item.minimum_quantity ?? 0})`;

    const { data: existing } = await supabase
      .from('stock_alerts')
      .select('id')
      .eq('item_id', item.id)
      .eq('alert_type', alertType)
      .eq('is_dismissed', false)
      .maybeSingle();

    if (!existing) {
      // NOTE: stock_alerts v1.0.0 has no severity column; severity intent encoded via alert_type.
      await supabase.from('stock_alerts').insert({
        tenant_id: requireTenantId(),
        alert_type: alertType,
        item_id: item.id,
        message,
        is_read: false,
        is_dismissed: false,
      });
      count++;
    }
  }
  return count;
}

export async function generateWarrantyExpiryAlerts(_daysAhead = 30): Promise<number> {
  // NOTE: stock_serial_numbers v1.0.0 has no warranty_end_date column, and stock_alerts has no
  // serial_number_id or severity columns. Warranty expiry alerting is not supported by the current
  // schema.
  // TODO(B8): add warranty_end_date to stock_serial_numbers + serial_number_id/severity to
  // stock_alerts via migration, then restore this function.
  return 0;
}

export async function getUnreadAlertCount(): Promise<number> {
  const { count, error } = await supabase
    .from('stock_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .eq('is_dismissed', false);
  if (error) return 0;
  return count ?? 0;
}

// ============================================================
// Stock Locations
// ============================================================

// NOTE: stock_locations v1.0.0 schema does not include is_default or sort_order columns.
// Keeping them optional here lets the StockLocationsPage form compile, but they will be
// silently dropped on insert/update. TODO(B8): add via migration or remove from UI.
export interface StockLocation {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  address: string | null;
  is_active: boolean | null;
  is_default?: boolean | null;
  sort_order?: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
}

// NOTE: stock_item_locations table does not exist in v1.0.0 live schema. Type retained
// for consumer compatibility; runtime functions return empty / throw.

export async function getStockLocations(): Promise<StockLocation[]> {
  const { data, error } = await supabase
    .from('stock_locations')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as StockLocation[];
}

export async function createStockLocation(data: Omit<StockLocation, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<StockLocation> {
  // NOTE: stock_locations v1.0.0 has no is_default or sort_order columns; strip those before insert.
  const { is_default: _is_default, sort_order: _sort_order, ...insertData } = data;
  const { data: result, error } = await supabase
    .from('stock_locations')
    .insert({ ...insertData, tenant_id: requireTenantId() })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!result) throw new Error('Failed to create stock location');
  return result as unknown as StockLocation;
}

export async function updateStockLocation(id: string, data: Partial<StockLocation>): Promise<StockLocation> {
  // Strip server-managed and drift fields before update.
  const {
    is_default: _is_default,
    sort_order: _sort_order,
    id: _id,
    created_at: _created_at,
    deleted_at: _deleted_at,
    updated_at: _updated_at,
    ...updateData
  } = data;
  const { data: result, error } = await supabase
    .from('stock_locations')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!result) throw new Error('Stock location not found');
  return result as unknown as StockLocation;
}


// ============================================================
// Bulk Operations
// ============================================================

export async function bulkUpdatePrices(
  updates: Array<{ id: string; costPrice?: number; sellingPrice?: number }>
): Promise<number> {
  let count = 0;
  for (const update of updates) {
    const data: StockItemUpdate = { updated_at: new Date().toISOString() };
    if (update.costPrice !== undefined) data.cost_price = update.costPrice;
    if (update.sellingPrice !== undefined) data.selling_price = update.sellingPrice;
    await updateStockItem(update.id, data);
    count++;
  }
  return count;
}

export async function bulkAdjustQuantities(
  adjustments: Array<{ id: string; newQuantity: number; reason: string }>
): Promise<number> {
  let count = 0;
  const tenantId = requireTenantId();
  for (const adj of adjustments) {
    const item = await getStockItem(adj.id);
    if (!item) continue;

    const currentQty = item.current_quantity ?? 0;
    const variance = adj.newQuantity - currentQty;
    await supabase
      .from('stock_items')
      .update({ current_quantity: adj.newQuantity, updated_at: new Date().toISOString() })
      .eq('id', adj.id);

    if (variance !== 0) {
      await supabase.from('stock_transactions').insert({
        tenant_id: tenantId,
        item_id: adj.id,
        transaction_type: 'adjusted',
        quantity: variance,
        notes: adj.reason,
      });
    }
    count++;
  }
  return count;
}

export function exportStockItemsCSV(items: StockItemWithCategory[]): string {
  // NOTE: model, capacity, warranty_months, reserved_quantity columns do not exist on
  // stock_items in v1.0.0. CSV export retains them as empty fields for backward
  // compatibility with downstream tooling expecting these headers.
  const headers = ['SKU', 'Name', 'Brand', 'Model', 'Category', 'Type', 'Barcode', 'Cost Price', 'Selling Price', 'Current Qty', 'Reserved Qty', 'Min Qty', 'Capacity', 'Warranty Months'];
  const rows = items.map((item) => [
    item.sku ?? '',
    item.name,
    item.brand ?? '',
    '', // model not in schema
    item.stock_categories?.name ?? '',
    item.item_type ?? '',
    item.barcode ?? '',
    String(item.cost_price ?? 0),
    String(item.selling_price ?? 0),
    String(item.current_quantity ?? 0),
    String(item.quantity_reserved ?? 0),
    String(item.minimum_quantity ?? 0),
    '', // capacity not in schema
    '', // warranty_months not in schema
  ]);
  return [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// ============================================================
// Stock Valuation Methods (Cost Layers for FIFO/LIFO)
// ============================================================

export interface StockCostLayer {
  id: string;
  stock_item_id: string;
  quantity: number;
  unit_cost: number;
  remaining_quantity: number;
  purchase_order_id: string | null;
  received_at: string | null;
  created_at: string | null;
}

// NOTE: stock_cost_layers table does not exist in v1.0.0 live schema. FIFO/LIFO valuation is
// degraded to weighted-average via stock_items.cost_price.
// TODO(B8): create stock_cost_layers via migration if FIFO/LIFO is product-required.
export async function addCostLayer(
  _stockItemId: string,
  _quantity: number,
  _unitCost: number,
  _poId?: string
): Promise<void> {
  // No-op: cost layers not tracked in current schema.
}

export async function calculateItemCost(
  stockItemId: string,
  quantity: number,
  _method: 'fifo' | 'lifo' | 'average' = 'average'
): Promise<number> {
  // FIFO/LIFO degrade to average-cost in v1.0.0 schema.
  const item = await getStockItem(stockItemId);
  if (!item || !item.cost_price) return 0;
  return item.cost_price * quantity;
}
