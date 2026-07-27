import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  Clock,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { listMessages, retryMessage, type WhatsAppMessage } from '../../../lib/whatsappService';
import { whatsappKeys } from '../../../lib/queryKeys';
import { WHATSAPP_EVENT_CATALOG } from '../../../lib/whatsapp/events';
import { formatDateTime } from '../../../lib/format';
import type { Database } from '../../../types/database.types';

type InboundRow = Database['public']['Tables']['whatsapp_inbound_messages']['Row'];

const EVENT_LABELS = new Map(WHATSAPP_EVENT_CATALOG.map((e) => [e.key, e.label]));

async function listInboundForCase(caseId: string): Promise<InboundRow[]> {
  const { data, error } = await supabase
    .from('whatsapp_inbound_messages')
    .select('*')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('received_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

type ThreadItem =
  | { kind: 'outbound'; at: string; outbound: WhatsAppMessage }
  | { kind: 'inbound'; at: string; inbound: InboundRow };

const StatusTicks: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'read':
      return <CheckCheck className="w-3.5 h-3.5 text-info" aria-label="Read" />;
    case 'delivered':
      return <CheckCheck className="w-3.5 h-3.5 text-slate-400" aria-label="Delivered" />;
    case 'sent':
      return <Check className="w-3.5 h-3.5 text-slate-400" aria-label="Sent" />;
    case 'failed':
      return <AlertTriangle className="w-3.5 h-3.5 text-danger" aria-label="Failed" />;
    case 'skipped':
      return <Ban className="w-3.5 h-3.5 text-warning" aria-label="Skipped" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-slate-400" aria-label="Queued" />;
  }
};

const OutboundBubble: React.FC<{
  message: WhatsAppMessage;
  onRetry: () => void;
  retrying: boolean;
}> = ({ message, onRetry, retrying }) => {
  const eventLabel = message.event_key
    ? EVENT_LABELS.get(message.event_key) ?? message.event_key
    : null;
  const body =
    message.body_preview ??
    message.session_body ??
    (message.template_name ? `Template: ${message.template_name}` : 'Queued message');
  const failed = message.status === 'failed';

  return (
    <div className="flex justify-end">
      <div
        className={`max-w-md rounded-lg rounded-tr-none p-3 shadow-sm ${
          failed ? 'bg-danger-muted border border-danger/30' : 'bg-primary/10'
        }`}
      >
        {eventLabel && (
          <div className="mb-1 text-xxs font-medium uppercase tracking-wide text-slate-500">
            {eventLabel}
          </div>
        )}
        <div className="whitespace-pre-wrap text-sm text-slate-800">{body}</div>
        {failed && (
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="text-xs text-danger">{message.last_error ?? 'Send failed'}</p>
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-danger/30 bg-white px-2 py-1 text-xs font-medium text-danger hover:bg-danger-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </div>
        )}
        {message.status === 'skipped' && message.skip_reason && (
          <p className="mt-1 text-xs text-warning">
            Skipped — {message.skip_reason.replace(/_/g, ' ')}
          </p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-xxs text-slate-400">
          <span>{formatDateTime(message.created_at)}</span>
          <StatusTicks status={message.status} />
        </div>
      </div>
    </div>
  );
};

const InboundBubble: React.FC<{ message: InboundRow }> = ({ message }) => (
  <div className="flex justify-start">
    <div className="max-w-md rounded-lg rounded-tl-none bg-white border border-slate-200 p-3 shadow-sm">
      <div className="whitespace-pre-wrap text-sm text-slate-800">
        {message.body || `[${message.message_type}]`}
      </div>
      {message.button_payload && (
        <div className="mt-1 text-xs text-slate-500">Button: {message.button_payload}</div>
      )}
      <div className="mt-1 text-xxs text-slate-400">{formatDateTime(message.received_at)}</div>
    </div>
  </div>
);

interface WhatsAppThreadProps {
  caseId: string;
}

/**
 * Merged WhatsApp conversation for a case: outbound rows from whatsapp_messages
 * (delivery ticks per webhook status) interleaved with inbound replies. Polls so
 * ticks and replies appear while staff keep the tab open.
 */
export const WhatsAppThread: React.FC<WhatsAppThreadProps> = ({ caseId }) => {
  const queryClient = useQueryClient();

  const { data: outbound = [] } = useQuery({
    queryKey: whatsappKeys.byCase(caseId),
    queryFn: () => listMessages({ caseId }),
    refetchInterval: 15_000,
  });

  const { data: inbound = [] } = useQuery({
    queryKey: [...whatsappKeys.byCase(caseId), 'inbound'] as const,
    queryFn: () => listInboundForCase(caseId),
    refetchInterval: 15_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => retryMessage(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: whatsappKeys.byCase(caseId) }),
  });

  const items: ThreadItem[] = [
    ...outbound.map((m) => ({ kind: 'outbound' as const, at: m.created_at, outbound: m })),
    ...inbound.map((m) => ({ kind: 'inbound' as const, at: m.received_at, inbound: m })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-4 h-4 text-success" />
        <h3 className="text-sm font-semibold text-slate-900">WhatsApp Conversation</h3>
        <span className="text-xs text-slate-400">
          {items.length} message{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="rounded-xl bg-slate-100 p-4 space-y-3 max-h-96 overflow-y-auto">
        {items.map((item) =>
          item.kind === 'outbound' ? (
            <OutboundBubble
              key={`out-${item.outbound.id}`}
              message={item.outbound}
              onRetry={() => retry.mutate(item.outbound.id)}
              retrying={retry.isPending}
            />
          ) : (
            <InboundBubble key={`in-${item.inbound.id}`} message={item.inbound} />
          )
        )}
      </div>
    </section>
  );
};

export default WhatsAppThread;
