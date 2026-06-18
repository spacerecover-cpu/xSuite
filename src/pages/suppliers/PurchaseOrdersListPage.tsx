import { useState, useEffect } from 'react';
import { Plus, Search, Package, DollarSign, Clock, CheckCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PageHeader } from '../../components/shared/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/shared/DataTable';
import { ExportButton } from '../../components/shared/ExportButton';
import { Badge } from '../../components/ui/Badge';
import { StatsCard } from '../../components/ui/StatsCard';
import { Input } from '../../components/ui/Input';
import { Pager } from '../../components/ui/Pager';
import PurchaseOrderFormModal from '../../components/suppliers/PurchaseOrderFormModal';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';
import { baseAmount } from '../../lib/financialMath';
import type { Database } from '../../types/database.types';

type PurchaseOrderRow = Database['public']['Tables']['purchase_orders']['Row'];
type StatusRow = Database['public']['Tables']['master_purchase_order_statuses']['Row'];

type SupplierSummary = {
  name: string | null;
  supplier_number: string | null;
};

type StatusSummary = {
  name: string | null;
  color: string | null;
};

type PurchaseOrderWithJoins = PurchaseOrderRow & {
  supplier: SupplierSummary | null;
  status: StatusSummary | null;
};

const PAGE_SIZE = 50;

// Pending/Approved KPIs are status-NAME based (the dropdown stores status_id), so
// the global counts resolve these names → ids, matching the original in-memory rule.
const PENDING_STATUS_NAMES = ['Draft', 'Ordered'];
const APPROVED_STATUS_NAMES = ['Approved', 'Received'];

export default function PurchaseOrdersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderWithJoins | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter]);

  // Command-palette deep-link: /purchase-orders?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: ordersPage, isLoading: loading } = useQuery({
    queryKey: ['purchase_orders', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select(
          `
          *,
          supplier:suppliers(name, supplier_number),
          status:master_purchase_order_statuses(name, color)
        `,
          { count: 'exact' },
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        const s = sanitizeFilterValue(debouncedSearch);
        // Supplier name/number live on a joined table; resolve matching supplier
        // ids first so they can be OR-ed with the base po_number column.
        const { data: supMatches } = await supabase
          .from('suppliers')
          .select('id')
          .is('deleted_at', null)
          .or(`name.ilike.%${s}%,supplier_number.ilike.%${s}%`);
        const supIds = (supMatches ?? []).map((row) => row.id);
        const orParts = [`po_number.ilike.%${s}%`];
        if (supIds.length) orParts.push(`supplier_id.in.(${supIds.join(',')})`);
        query = query.or(orParts.join(','));
      }
      if (statusFilter !== 'all') query = query.eq('status_id', statusFilter);

      const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as PurchaseOrderWithJoins[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  const orders = ordersPage?.rows ?? [];
  const totalOrders = ordersPage?.total ?? 0;

  const { data: statuses = [] } = useQuery({
    queryKey: ['purchase_order_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_purchase_order_statuses')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as StatusRow[];
    },
  });

  // Global KPIs: counts via head-only queries and a base-currency value sum across
  // ALL non-deleted POs — never a reduction over the current page. Cross-document
  // money MUST use total_amount_base (baseAmount), or a multi-currency tenant adds
  // foreign amounts under one symbol.
  const { data: stats } = useQuery({
    queryKey: ['purchase_order_stats'],
    queryFn: async () => {
      const { data: statusRows } = await supabase
        .from('master_purchase_order_statuses')
        .select('id, name');
      const idsFor = (names: string[]) =>
        (statusRows ?? []).filter((s) => names.includes(s.name)).map((s) => s.id);
      const pendingIds = idsFor(PENDING_STATUS_NAMES);
      const approvedIds = idsFor(APPROVED_STATUS_NAMES);

      const base = () =>
        supabase
          .from('purchase_orders')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null);
      const countIn = async (ids: string[]): Promise<number> => {
        if (ids.length === 0) return 0;
        const { count } = await base().in('status_id', ids);
        return count ?? 0;
      };

      const [totalRes, pending, approved, moneyRes] = await Promise.all([
        base(),
        countIn(pendingIds),
        countIn(approvedIds),
        supabase
          .from('purchase_orders')
          .select('total_amount, total_amount_base')
          .is('deleted_at', null),
      ]);

      const totalValue = (moneyRes.data ?? []).reduce(
        (sum, o) => sum + baseAmount(o, 'total_amount'),
        0,
      );

      return {
        total: totalRes.count ?? 0,
        pending,
        approved,
        totalValue,
      };
    },
  });

  const handleModalClose = () => {
    setShowAddModal(false);
    setSelectedOrder(null);
  };

  const handleModalSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_order_stats'] });
  };

  const columns: Column<PurchaseOrderWithJoins>[] = [
    {
      key: 'po_number',
      header: 'PO Number',
      render: (order) => (
        <button
          onClick={() => navigate(`/purchase-orders/${order.id}`)}
          className="text-primary hover:text-primary/80 font-medium"
        >
          {order.po_number ?? '-'}
        </button>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (order) => (
        <div>
          <div className="font-medium">{order.supplier?.name ?? '-'}</div>
          <div className="text-sm text-gray-500">{order.supplier?.supplier_number ?? ''}</div>
        </div>
      ),
    },
    {
      key: 'order_date',
      header: 'Order Date',
      render: (order) =>
        order.order_date ? format(new Date(order.order_date), 'MMM dd, yyyy') : '-',
    },
    {
      key: 'expected_delivery_date',
      header: 'Expected Delivery',
      render: (order) =>
        order.expected_delivery_date ? format(new Date(order.expected_delivery_date), 'MMM dd, yyyy') : '-',
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      render: (order) => (
        <span className="font-semibold">
          {formatCurrency(order.total_amount ?? 0)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => (
        <Badge style={{ backgroundColor: order.status?.color ?? '#3b82f6', color: 'white' }}>
          {order.status?.name ?? 'Unknown'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (order) => format(new Date(order.created_at), 'MMM dd, yyyy'),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Manage purchase orders and track deliveries"
        actions={
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Purchase Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard
          title="Total Orders"
          value={(stats?.total ?? 0).toString()}
          icon={Package}
        />
        <StatsCard
          title="Pending Orders"
          value={(stats?.pending ?? 0).toString()}
          icon={Clock}
          color="orange"
        />
        <StatsCard
          title="Approved/Received"
          value={(stats?.approved ?? 0).toString()}
          icon={CheckCircle}
          color="green"
        />
        <StatsCard
          title="Total Value"
          value={formatCurrency(stats?.totalValue ?? 0)}
          icon={DollarSign}
          color="blue"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by PO number, supplier..."
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              >
                <option value="all">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>

              <ExportButton
                filename="purchase-orders"
                columns={[
                  { key: 'po_number', label: 'PO #' },
                  { key: 'order_date', label: 'Order Date' },
                  { key: 'expected_delivery_date', label: 'Expected' },
                  { key: 'received_at', label: 'Received' },
                  {
                    key: (r) => (r.suppliers as { name?: string } | null)?.name,
                    label: 'Supplier',
                  },
                  { key: 'currency', label: 'Currency' },
                  { key: 'subtotal', label: 'Subtotal' },
                  { key: 'tax_amount', label: 'Tax' },
                  { key: 'shipping_cost', label: 'Shipping' },
                  { key: 'total_amount', label: 'Total' },
                  {
                    key: (r) => (r.master_purchase_order_statuses as { name?: string } | null)?.name,
                    label: 'Status',
                  },
                ]}
                getRows={async () => {
                  let q = supabase
                    .from('purchase_orders')
                    .select('po_number, order_date, expected_delivery_date, received_at, currency, subtotal, tax_amount, shipping_cost, total_amount, suppliers:supplier_id(name), master_purchase_order_statuses:status_id(name)')
                    .is('deleted_at', null);
                  if (searchQuery) {
                    q = q.ilike('po_number', `%${searchQuery}%`);
                  }
                  if (statusFilter !== 'all') q = q.eq('status_id', statusFilter);
                  const { data, error } = await q.order('order_date', { ascending: false, nullsFirst: false });
                  if (error) throw error;
                  return data ?? [];
                }}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading purchase orders…</div>
        ) : (
          <>
            <DataTable<PurchaseOrderWithJoins>
              columns={columns}
              data={orders}
              emptyMessage="No purchase orders found"
            />
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={totalOrders}
              onPageChange={setPage}
              itemNoun="purchase orders"
            />
          </>
        )}
      </div>

      {showAddModal && (
        <PurchaseOrderFormModal
          isOpen={showAddModal}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          purchaseOrder={
            selectedOrder
              ? {
                  id: selectedOrder.id,
                  po_number: selectedOrder.po_number ?? undefined,
                  supplier_id: selectedOrder.supplier_id,
                  status_id: selectedOrder.status_id ?? undefined,
                  order_date: selectedOrder.order_date ?? undefined,
                  expected_delivery: selectedOrder.expected_delivery_date ?? undefined,
                  shipping_address: selectedOrder.shipping_address ?? undefined,
                  notes: selectedOrder.notes ?? undefined,
                }
              : null
          }
        />
      )}
    </div>
  );
}
