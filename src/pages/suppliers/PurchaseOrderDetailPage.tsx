import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard as Edit, Package, Calendar, Truck, FileText, CheckCircle, Building2, MapPin, Clock, PackageCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import PurchaseOrderFormModal from '../../components/suppliers/PurchaseOrderFormModal';
import { ReceiveStockModal } from '../../components/suppliers/ReceiveStockModal';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  // Using `any` here preserves the original looseness while we focus on the
  // banned-table and useParams/maybeSingle fixes in scope. Tighter typing for
  // this page is tracked separately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [poLineItems, setPoLineItems] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      loadOrder(id);
    }
  }, [id]);

  const loadOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const [{ data, error }, { data: itemsData }] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select(`
            *,
            supplier:suppliers(*),
            status:master_purchase_order_statuses(name, color)
          `)
          .eq('id', orderId)
          .maybeSingle(),
        supabase
          .from('purchase_order_items')
          .select('*')
          .eq('purchase_order_id', orderId)
          .is('deleted_at', null),
      ]);

      if (error) throw error;

      // created_by/updated_by/approved_by/received_by FK to auth.users (not
      // profiles), which PostgREST cannot embed. profiles.id == auth.users.id,
      // so resolve the actor emails via a single direct profiles lookup.
      if (data) {
        const userIds = [
          data.created_by,
          data.updated_by,
          data.approved_by,
          data.received_by,
        ].filter((uid): uid is string => !!uid);
        const uniqueUserIds = Array.from(new Set(userIds));

        const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
        if (uniqueUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', uniqueUserIds);
          for (const profile of profiles ?? []) {
            profileMap.set(profile.id, { email: profile.email, full_name: profile.full_name });
          }
        }

        const resolveUser = (uid: string | null) =>
          uid ? profileMap.get(uid) ?? null : null;

        setOrder({
          ...data,
          created_by_user: resolveUser(data.created_by),
          updated_by_user: resolveUser(data.updated_by),
          approved_by_user: resolveUser(data.approved_by),
          received_by_user: resolveUser(data.received_by),
        });
      } else {
        setOrder(data);
      }
      setPoLineItems(itemsData ?? []);
    } catch (error: unknown) {
      logger.error('Error loading purchase order:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load purchase order');
      navigate('/purchase-orders');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading purchase order...</div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/purchase-orders')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{order.po_number}</h1>
              <Badge style={{ backgroundColor: order.status?.color || '#3b82f6', color: 'white' }}>
                {order.status?.name || 'Unknown'}
              </Badge>
            </div>
            <p className="text-gray-500 mt-1">
              Created on {format(new Date(order.created_at), 'MMM dd, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {['approved', 'ordered', 'received'].includes(order.status?.name?.toLowerCase() ?? '') && (
            <Button
              variant="secondary"
              onClick={() => setShowReceiveModal(true)}
            >
              <PackageCheck className="w-4 h-4 mr-2" />
              Receive into Stock
            </Button>
          )}
          <Button onClick={() => setShowEditModal(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Order
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                <Building2 className="inline w-5 h-5 mr-2" />
                Supplier Information
              </h3>
              <div className="space-y-3">
                <div>
                  <button
                    onClick={() => navigate(`/suppliers/${order.supplier.id}`)}
                    className="text-primary hover:text-primary/80 font-semibold text-lg"
                  >
                    {order.supplier.name}
                  </button>
                  <p className="text-sm text-gray-500">{order.supplier.supplier_number}</p>
                </div>
                {order.supplier.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <FileText className="w-4 h-4" />
                    <span>{order.supplier.email}</span>
                  </div>
                )}
                {order.supplier.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <FileText className="w-4 h-4" />
                    <span>{order.supplier.phone}</span>
                  </div>
                )}
                {order.supplier.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 mt-0.5" />
                    <div>
                      <div>{order.supplier.address}</div>
                      {order.supplier.city && (
                        <div>
                          {order.supplier.city}
                          {order.supplier.state && `, ${order.supplier.state}`}
                          {order.supplier.zip_code && ` ${order.supplier.zip_code}`}
                        </div>
                      )}
                      {order.supplier.country && <div>{order.supplier.country}</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                <Package className="inline w-5 h-5 mr-2" />
                Line Items
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Quantity</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Unit Price</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {order.line_items?.map((item: { description?: string; item_name?: string; quantity: number; unit_price?: number; total?: number; stock_item_id?: string | null }, index: number) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">
                          ${item.unit_price?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                          ${item.total?.toFixed(2) || '0.00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                        Subtotal:
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        ${order.subtotal?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                        Tax:
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        ${order.tax_amount?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-gray-300">
                      <td colSpan={3} className="px-4 py-3 text-right text-base font-bold text-gray-900">
                        Total:
                      </td>
                      <td className="px-4 py-3 text-right text-lg font-bold text-primary">
                        ${order.total_amount?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </Card>

          {(order.notes || order.internal_notes) && (
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  <FileText className="inline w-5 h-5 mr-2" />
                  Notes
                </h3>
                <div className="space-y-4">
                  {order.notes && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">
                        Supplier Notes
                      </label>
                      <p className="text-gray-600 bg-gray-50 p-3 rounded">{order.notes}</p>
                    </div>
                  )}
                  {order.internal_notes && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">
                        Internal Notes
                      </label>
                      <p className="text-gray-600 bg-warning-muted p-3 rounded border border-warning/30">
                        {order.internal_notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Order Date
                  </label>
                  <p className="font-medium">{format(new Date(order.order_date), 'MMM dd, yyyy')}</p>
                </div>
                {order.expected_delivery && (
                  <div>
                    <label className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Expected Delivery
                    </label>
                    <p className="font-medium">{format(new Date(order.expected_delivery), 'MMM dd, yyyy')}</p>
                  </div>
                )}
                {order.shipping_method && (
                  <div>
                    <label className="text-sm text-gray-500 flex items-center gap-1">
                      <Truck className="w-4 h-4" />
                      Shipping Method
                    </label>
                    <p className="font-medium">{order.shipping_method}</p>
                  </div>
                )}
                {order.tracking_number && (
                  <div>
                    <label className="text-sm text-gray-500">Tracking Number</label>
                    <p className="font-medium">{order.tracking_number}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {order.shipping_address && (
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Shipping Address
                </h3>
                <p className="text-gray-700 whitespace-pre-line">{order.shipping_address}</p>
              </div>
            </Card>
          )}

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Workflow Status</h3>
              <div className="space-y-3">
                {order.approved_at && (
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-success mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Approved</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(order.approved_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                      {order.approved_by_user && (
                        <p className="text-xs text-gray-500">by {order.approved_by_user.email}</p>
                      )}
                    </div>
                  </div>
                )}
                {order.received_at && (
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-success mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Received</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(order.received_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                      {order.received_by_user && (
                        <p className="text-xs text-gray-500">by {order.received_by_user.email}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Audit Information</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-gray-500">Created By</label>
                  <p className="font-medium">{order.created_by_user?.email || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}</p>
                </div>
                {order.updated_at && order.updated_at !== order.created_at && (
                  <div>
                    <label className="text-gray-500">Last Updated By</label>
                    <p className="font-medium">{order.updated_by_user?.email || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{format(new Date(order.updated_at), 'MMM dd, yyyy HH:mm')}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {showEditModal && id && (
        <PurchaseOrderFormModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            loadOrder(id);
            setShowEditModal(false);
          }}
          purchaseOrder={order}
        />
      )}

      {showReceiveModal && id && (
        <ReceiveStockModal
          isOpen={showReceiveModal}
          onClose={() => setShowReceiveModal(false)}
          purchaseOrderId={id}
          purchaseOrderItems={
            poLineItems.length > 0
              ? poLineItems.map((item) => ({
                  id: item.id,
                  description: item.description ?? item.item_name ?? 'Item',
                  quantity: item.quantity,
                  unit_price: item.unit_price ?? null,
                  stock_item_id: item.stock_item_id ?? null,
                }))
              : (order.line_items ?? []).map((item: { description?: string; item_name?: string; quantity: number; unit_price?: number }, idx: number) => ({
                  id: `line-${idx}`,
                  description: item.description ?? item.item_name ?? 'Item',
                  quantity: item.quantity,
                  unit_price: item.unit_price ?? null,
                  stock_item_id: null,
                }))
          }
          onSuccess={() => {
            loadOrder(id);
            setShowReceiveModal(false);
          }}
        />
      )}
    </div>
  );
}
