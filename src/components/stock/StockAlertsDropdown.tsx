import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertTriangle, AlertCircle, Info, CheckCheck, X } from 'lucide-react';
import {
  getStockAlerts,
  getUnreadAlertCount,
  markAlertRead,
  dismissAlert,
} from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';
import { useNavigate } from 'react-router-dom';

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-danger', bg: 'bg-danger-muted' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning-muted' },
  info: { icon: Info, color: 'text-info', bg: 'bg-info-muted' },
};

export const StockAlertsDropdown: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data: count = 0 } = useQuery({
    queryKey: stockKeys.alertCount(),
    queryFn: getUnreadAlertCount,
    refetchInterval: 60000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: stockKeys.alerts(),
    queryFn: () => getStockAlerts({ isRead: false }),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: markAlertRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: stockKeys.alertCount() });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: dismissAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.alerts() });
      queryClient.invalidateQueries({ queryKey: stockKeys.alertCount() });
    },
  });

  const markAllRead = async () => {
    for (const alert of alerts) {
      if (!alert.is_read) await markAlertRead(alert.id);
    }
    queryClient.invalidateQueries({ queryKey: stockKeys.alerts() });
    queryClient.invalidateQueries({ queryKey: stockKeys.alertCount() });
  };

  const previewAlerts = alerts.slice(0, 6);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
        title="Stock Alerts"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger text-danger-foreground text-xs font-bold rounded-full flex items-center justify-center leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-modal overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Stock Alerts</h3>
              {count > 0 && (
                <span className="px-1.5 py-0.5 bg-danger-muted text-danger text-xs font-bold rounded-full">
                  {count}
                </span>
              )}
            </div>
            {alerts.length > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/90 font-medium"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {previewAlerts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No unread alerts</p>
              </div>
            ) : (
              previewAlerts.map((alert) => {
                const cfg = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
                const Icon = cfg.icon;
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${!alert.is_read ? 'bg-info-muted/30' : ''}`}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg ${cfg.bg} flex-shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 leading-relaxed">{alert.message}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {alert.created_at ? new Date(alert.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!alert.is_read && (
                        <button
                          onClick={() => markReadMutation.mutate(alert.id)}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Mark as read"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => dismissMutation.mutate(alert.id)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-danger transition-colors"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
            <button
              onClick={() => { navigate('/stock/reports?tab=alerts'); setOpen(false); }}
              className="w-full text-center text-xs text-primary hover:text-primary/90 font-medium"
            >
              View all alerts
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
