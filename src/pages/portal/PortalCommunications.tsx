import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { MessageSquare, Mail, Phone, Calendar as CalendarIcon } from 'lucide-react';
import { formatDate } from '../../lib/format';

interface Communication {
  id: string;
  type: string;
  subject: string | null;
  content: string | null;
  direction: string | null;
  created_at: string;
  sent_at: string | null;
  profiles: {
    full_name: string;
  } | null;
}

export const PortalCommunications: React.FC = () => {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();

  useEffect(() => {
    document.title = t('portal.communications.tabTitle');
  }, [t]);

  const { data: communications = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portal_communications', customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];

      // Gate messages on the customer having at least one case flagged for
      // portal visibility. customer_communications does not have a case_id
      // column, so this is the closest available proxy.
      const { data: visibleCases, error: visErr } = await supabase
        .from('cases')
        .select('id, case_portal_visibility!inner(is_visible)')
        .eq('customer_id', customer.id)
        .eq('case_portal_visibility.is_visible', true)
        .is('deleted_at', null)
        .limit(1);
      if (visErr) throw visErr;
      if (!visibleCases || visibleCases.length === 0) return [];

      const { data, error } = await supabase
        .from('customer_communications')
        .select(`
          id, type, subject, content, direction, created_at, sent_at,
          profiles:sent_by(full_name)
        `)
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as Communication[];
    },
    enabled: !!customer?.id,
  });

  const getCommunicationIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="w-5 h-5" />;
      case 'phone':
        return <Phone className="w-5 h-5" />;
      case 'meeting':
        return <CalendarIcon className="w-5 h-5" />;
      default:
        return <MessageSquare className="w-5 h-5" />;
    }
  };

  const getCommunicationColor = (type: string) => {
    switch (type) {
      case 'email':
        return '#3b82f6';
      case 'phone':
        return '#10b981';
      case 'meeting':
        return '#1e40af';
      case 'sms':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.communications.heading')}</h1>
          <p className="text-slate-600">{t('portal.communications.subtitle')}</p>
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 bg-slate-200 rounded" />
                  <div className="h-3 w-1/3 bg-slate-200 rounded" />
                  <div className="h-3 w-3/4 bg-slate-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.communications.heading')}</h1>
        <p className="text-slate-600">
          {t('portal.communications.subtitle')}
        </p>
      </div>

      {isError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm">
          <p className="text-danger">{t('portal.communications.loadError')}</p>
          <button onClick={() => refetch()} className="mt-2 text-primary underline">{t('portal.communications.retry')}</button>
        </div>
      )}

      {communications.length === 0 && !isError ? (
        <Card className="p-12 text-center">
          <MessageSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-lg text-slate-600 mb-2">{t('portal.communications.noCommsYet')}</p>
          <p className="text-sm text-slate-500">
            {t('portal.communications.noCommsSubtitle')}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {communications.map((comm) => (
            <Card key={comm.id} className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                  style={{ backgroundColor: getCommunicationColor(comm.type) }}
                >
                  {getCommunicationIcon(comm.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge
                      variant="custom"
                      color={getCommunicationColor(comm.type)}
                      size="sm"
                    >
                      {comm.type}
                    </Badge>
                    {comm.direction && (
                      <Badge variant="default" size="sm">
                        {comm.direction}
                      </Badge>
                    )}
                    <span className="text-xs text-slate-500">
                      {formatDate(comm.created_at)}
                    </span>
                  </div>

                  {comm.subject && (
                    <h3 className="font-semibold text-slate-900 mb-2">{comm.subject}</h3>
                  )}

                  {comm.content && (
                    <p className="text-slate-700 whitespace-pre-wrap mb-3">{comm.content}</p>
                  )}

                  {comm.profiles && (
                    <p className="text-xs text-slate-500">
                      {t('portal.communications.from', { name: comm.profiles.full_name })}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
