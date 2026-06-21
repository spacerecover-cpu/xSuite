import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ShoppingBag, Package, Calendar, DollarSign } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { baseAmount } from '../../lib/financialMath';
import { useCurrency } from '../../hooks/useCurrency';

type StockItemEmbed = {
  id: string;
  name: string | null;
  brand: string | null;
  sku: string | null;
} | null;

export const PortalPurchasesPage: React.FC = () => {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    document.title = t('portal.purchases.tabTitle');
  }, [t]);

  const {
    data: purchases,
    isLoading: loadingPurchases,
    isError: purchasesError,
    refetch: refetchPurchases,
  } = useQuery({
    queryKey: ['portal_purchases', customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      const { data, error } = await supabase
        .from('stock_sales')
        .select(`
          id, sale_number, created_at, total_amount, total_amount_base, status,
          stock_sale_items (
            id, quantity, unit_price, total,
            stock_items ( id, name, brand, sku )
          )
        `)
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!customer?.id,
  });

  const totalSpent = (purchases ?? []).reduce((sum, s) => sum + baseAmount(s, 'total_amount'), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('portal.purchases.heading')}</h1>
        <p className="text-slate-500 mt-1">{t('portal.purchases.subtitle')}</p>
      </div>

      {purchasesError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm">
          <p className="text-danger">{t('portal.purchases.loadError')}</p>
          <button
            onClick={() => {
              refetchPurchases();
            }}
            className="mt-2 text-primary underline"
          >
            {t('portal.purchases.retry')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-info-muted rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-info" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{t('portal.purchases.totalOrders')}</p>
              <p className="text-2xl font-bold text-slate-900">{purchases?.length ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warning-muted rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-warning" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{t('portal.purchases.totalSpent')}</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalSpent)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">{t('portal.purchases.purchaseHistory')}</h2>
        </div>
        {loadingPurchases ? (
          <div className="p-8 text-center text-slate-500">{t('portal.purchases.loadingPurchases')}</div>
        ) : !purchases?.length ? (
          <div className="p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">{t('portal.purchases.noPurchasesYet')}</p>
            <p className="text-slate-400 text-sm mt-1">{t('portal.purchases.noPurchasesSubtitle')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {purchases.map((sale) => (
              <div key={sale.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-slate-900 text-sm">{sale.sale_number ?? `Sale #${sale.id.slice(0, 8)}`}</span>
                      {sale.status && (
                        <Badge color={sale.status === 'completed' ? 'success' : sale.status === 'pending' ? 'warning' : 'default'}>
                          {sale.status}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(sale.created_at)}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {(sale.stock_sale_items ?? []).map((item) => {
                        const si = item.stock_items as StockItemEmbed;
                        return (
                          <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <div>
                                <span className="text-sm font-medium text-slate-800">
                                  {si?.brand ? `${si.brand} ` : ''}{si?.name ?? t('portal.purchases.device')}
                                </span>
                                {si?.sku && <span className="text-xs text-slate-500 ml-1">({si.sku})</span>}
                                <span className="text-xs text-slate-500 ml-2">× {item.quantity}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="font-semibold text-slate-900">{formatCurrency(item.total ?? 0)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(sale.total_amount ?? 0)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PortalPurchasesPage;
