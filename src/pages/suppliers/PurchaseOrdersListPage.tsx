import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Package, DollarSign, Clock, CheckCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/shared/DataTable';
import { ExportButton } from '../../components/shared/ExportButton';
import { Badge } from '../../components/ui/Badge';
import { StatsCard } from '../../components/ui/StatsCard';
import { Input } from '../../components/ui/Input';
import PurchaseOrderFormModal from '../../components/suppliers/PurchaseOrderFormModal';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';
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

export default function PurchaseOrdersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { formatCurrency } = useCurrency();
  const [orders, setOrders] = useState<PurchaseOrderWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderWithJoins | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    totalValue: 0,
  });

  // Command-palette deep-link: /purchase-orders?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void loadOrders();
    void loadStatuses();
  }, []);

  const filteredOrders = useMemo(() => {
    let filtered = [...orders];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.po_number?.toLowerCase().includes(query) ||
          order.supplier?.name?.toLowerCase().includes(query) ||
          order.supplier?.supplier_number?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status_id === statusFilter);
    }

    return filtered;
  }, [orders, searchQuery, statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name, supplier_number),
          status:master_purchase_order_statuses(name, color)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as PurchaseOrderWithJoins[];
      setOrders(rows);
      calculateStats(rows);
    } catch (err: unknown) {
      logger.error('Error loading purchase orders:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const loadStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('master_purchase_order_statuses')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setStatuses(data ?? []);
    } catch (err) {
      logger.error('Error loading statuses:', err);
    }
  };

  const calculateStats = (orderData: PurchaseOrderWithJoins[]) => {
    const pending = orderData.filter((o) => o.status?.name === 'Draft' || o.status?.name === 'Ordered');
    const approved = orderData.filter((o) => o.status?.name === 'Approved' || o.status?.name === 'Received');
    const totalValue = orderData.reduce((sum, o) => sum + baseAmount(o, 'total_amount'), 0);

    setStats({
      total: orderData.length,
      pending: pending.length,
      approved: approved.length,
      totalValue,
    });
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setSelectedOrder(null);
  };

  const handleModalSuccess = () => {
    void loadOrders();
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
          value={stats.total.toString()}
          icon={Package}
        />
        <StatsCard
          title="Pending Orders"
          value={stats.pending.toString()}
          icon={Clock}
          color="orange"
        />
        <StatsCard
          title="Approved/Received"
          value={stats.approved.toString()}
          icon={CheckCircle}
          color="green"
        />
        <StatsCard
          title="Total Value"
          value={formatCurrency(stats.totalValue)}
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
          <DataTable<PurchaseOrderWithJoins>
            columns={columns}
            data={filteredOrders}
            emptyMessage="No purchase orders found"
          />
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
