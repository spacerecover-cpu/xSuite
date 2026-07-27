import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle,
  MessageSquare,
  Copy,
  ExternalLink,
  Check,
  Clock,
  Send,
  Loader2,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { TemplatePicker } from '../templates/TemplatePicker';
import {
  openWhatsAppChat,
  isValidWhatsAppNumber,
  formatPhoneForWhatsApp,
} from '../../lib/whatsappUtils';
import {
  logCaseCommunication,
  logCustomerCommunication,
} from '../../lib/communicationsService';
import {
  getIntegration,
  listRules,
  listTemplates as listWhatsAppTemplates,
  whatsappAdmin,
} from '../../lib/whatsappService';
import { whatsappKeys } from '../../lib/queryKeys';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import type { ContextRefs } from '../../lib/templateContextService';
import type { Database } from '../../types/database.types';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

type WhatsAppMessageInsert = Database['public']['Tables']['whatsapp_messages']['Insert'];

type ApiMode = 'template' | 'session' | 'handoff';

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: 'whatsapp' | 'sms';
  /** Logged against the case when present; otherwise against the customer. */
  caseId?: string;
  customerId?: string;
  defaultPhone?: string;
  contextRefs: ContextRefs;
  onLogged?: () => void;
  /**
   * Preloads the API template picker from this automation rule's bound template
   * and stamps the inserted whatsapp_messages row with the event_key — the
   * "Send progress update" entry point passes 'case.milestone'.
   */
  defaultEventKey?: string;
}

/**
 * WhatsApp/SMS compose surface. With the WhatsApp Business API connected it
 * sends through the platform (approved template, or free-form inside the open
 * 24h service window) by inserting a whatsapp_messages row under RLS and poking
 * the staff-gated send_now bridge. The wa.me/clipboard handoff stays as the
 * fallback (and the only path for SMS or unconnected tenants).
 */
export const SendMessageModal: React.FC<SendMessageModalProps> = ({
  isOpen,
  onClose,
  channel,
  caseId,
  customerId,
  defaultPhone,
  contextRefs,
  onLogged,
  defaultEventKey,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { config } = useTenantConfig();
  const tenantId = config?.tenantId ?? '';

  const [phone, setPhone] = useState(defaultPhone ?? '');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [logging, setLogging] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiMode, setApiMode] = useState<ApiMode>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [nowTs, setNowTs] = useState(() => Date.now());

  const isWhatsApp = channel === 'whatsapp';
  const channelLabel = isWhatsApp ? 'WhatsApp' : 'SMS';
  const ChannelIcon = isWhatsApp ? MessageCircle : MessageSquare;

  const { data: integration } = useQuery({
    queryKey: whatsappKeys.integration(),
    queryFn: getIntegration,
    enabled: isOpen && isWhatsApp,
  });
  const connected = isWhatsApp && integration?.connection_status === 'connected';

  const { data: waTemplates } = useQuery({
    queryKey: whatsappKeys.templates(),
    queryFn: listWhatsAppTemplates,
    enabled: isOpen && connected,
  });
  const { data: waRules } = useQuery({
    queryKey: whatsappKeys.rules(),
    queryFn: listRules,
    enabled: isOpen && connected && !!defaultEventKey,
  });

  const approvedTemplates = useMemo(
    () => (waTemplates ?? []).filter((t) => t.status === 'APPROVED'),
    [waTemplates]
  );
  const templateFamilies = useMemo(
    () => [...new Map(approvedTemplates.map((t) => [t.name, t])).values()],
    [approvedTemplates]
  );

  const phoneE164 = isValidWhatsAppNumber(phone)
    ? `+${formatPhoneForWhatsApp(phone)}`
    : null;

  const { data: contact } = useQuery({
    queryKey: [...whatsappKeys.all, 'contact', phoneE164] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('service_window_expires_at, opt_out_all')
        .eq('phone_e164', phoneE164 as string)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && connected && !!phoneE164,
    refetchInterval: 60_000,
  });

  const windowExpiry = contact?.service_window_expires_at
    ? new Date(contact.service_window_expires_at).getTime()
    : null;
  const windowOpen = windowExpiry !== null && windowExpiry > nowTs;
  const windowRemaining = useMemo(() => {
    if (!windowOpen || windowExpiry === null) return '';
    const totalMinutes = Math.max(0, Math.floor((windowExpiry - nowTs) / 60_000));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [windowOpen, windowExpiry, nowTs]);

  useEffect(() => {
    if (isOpen) {
      setPhone(defaultPhone ?? '');
      setMessage('');
      setCopied(false);
      setApiMode('template');
      setSelectedTemplateId('');
      setNowTs(Date.now());
    }
  }, [isOpen, defaultPhone]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Preselect the automation rule's bound template for the passed event
  // (family head by name — the rule may point at any language row).
  useEffect(() => {
    if (!isOpen || !connected || !defaultEventKey || selectedTemplateId) return;
    const rule = (waRules ?? []).find((r) => r.event_key === defaultEventKey);
    if (!rule?.template_id) return;
    const bound = approvedTemplates.find((t) => t.id === rule.template_id);
    const family = bound && templateFamilies.find((t) => t.name === bound.name);
    if (family) setSelectedTemplateId(family.id);
  }, [isOpen, connected, defaultEventKey, selectedTemplateId, waRules, approvedTemplates, templateFamilies]);

  const logHandoff = async () => {
    setLogging(true);
    try {
      if (caseId) {
        await logCaseCommunication({
          caseId,
          type: channel,
          subject: `${channelLabel} message`,
          content: message,
          sentTo: phone || undefined,
        });
      } else if (customerId) {
        await logCustomerCommunication({
          customerId,
          type: channel,
          subject: `${channelLabel} message`,
          content: message,
        });
      }
      onLogged?.();
    } catch (error) {
      logger.error(`Failed to log ${channelLabel} communication:`, error);
      toast.warning('Message prepared, but logging the communication failed');
    } finally {
      setLogging(false);
    }
  };

  const handleCopy = async () => {
    if (!message.trim()) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Message copied — paste it into your messaging app');
      await logHandoff();
    } catch (error) {
      logger.error('Clipboard write failed:', error);
      toast.error('Could not copy to clipboard');
    }
  };

  const handleOpenWhatsApp = async () => {
    if (!message.trim()) return;
    if (!phone || !isValidWhatsAppNumber(phone)) {
      toast.error('Enter a valid phone number with country code');
      return;
    }
    try {
      openWhatsAppChat({ phoneNumber: phone, customMessage: message });
      await logHandoff();
    } catch (error) {
      logger.error('Error opening WhatsApp:', error);
      toast.error('Failed to open WhatsApp. Please check the phone number.');
    }
  };

  const handleApiSend = async () => {
    if (!phoneE164) {
      toast.error('Enter a valid phone number with country code');
      return;
    }
    if (!tenantId) return;
    if (apiMode === 'template' && !selectedTemplateId) {
      toast.error('Choose an approved template');
      return;
    }
    if (apiMode === 'session' && !message.trim()) return;
    setSending(true);
    try {
      const row: WhatsAppMessageInsert = {
        tenant_id: tenantId,
        case_id: caseId ?? null,
        customer_id: customerId ?? null,
        to_phone_e164: phoneE164,
        priority: 1,
        initiated_by: user?.id ?? null,
        dedup_key: `manual:${crypto.randomUUID()}`,
        ...(apiMode === 'template'
          ? {
              message_kind: 'template' as const,
              template_id: selectedTemplateId,
              event_key: defaultEventKey ?? null,
            }
          : { message_kind: 'session_text' as const, session_body: message.trim() }),
      };
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .insert(row)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Message insert returned no row');
      try {
        await whatsappAdmin('send_now', { tenantId, messageId: data.id });
      } catch (pokeError) {
        // queued row survives — the dispatch scanner picks it up within a minute
        logger.error('send_now poke failed (message stays queued):', pokeError);
      }
      toast.success('WhatsApp message queued for delivery');
      queryClient.invalidateQueries({ queryKey: whatsappKeys.all });
      onLogged?.();
      onClose();
    } catch (error) {
      logger.error('WhatsApp API send failed:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to send WhatsApp message'
      );
    } finally {
      setSending(false);
    }
  };

  const showHandoff = !connected || apiMode === 'handoff';
  const apiSendDisabled =
    sending ||
    !phoneE164 ||
    (apiMode === 'template' && !selectedTemplateId) ||
    (apiMode === 'session' && (!message.trim() || !windowOpen || !!contact?.opt_out_all));

  const MODE_OPTIONS: Array<{ value: ApiMode; label: string }> = [
    { value: 'template', label: 'Template' },
    { value: 'session', label: 'Free-form reply' },
    { value: 'handoff', label: 'Manual handoff' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Send ${channelLabel} Message`}
      icon={ChannelIcon}
      titleSize="sm"
      size="lg"
      showClose
      closeOnBackdrop={false}
    >
      <div className="space-y-5">
        <Input
          label={isWhatsApp ? 'WhatsApp Number' : 'Phone Number'}
          floatingLabel
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+968 9876 5432"
        />

        {connected && (
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setApiMode(opt.value)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  apiMode === opt.value
                    ? 'bg-white text-primary shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {connected && apiMode === 'template' && (
          <div className="space-y-2">
            <Select
              label="Approved template"
              floatingLabel
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              placeholder={
                templateFamilies.length === 0
                  ? 'No approved templates yet'
                  : 'Choose a template…'
              }
              options={templateFamilies.map((t) => ({ value: t.id, label: t.name }))}
              disabled={templateFamilies.length === 0}
            />
            <p className="text-xs text-slate-500">
              The approved template body is rendered with this{' '}
              {caseId ? 'case' : 'customer'}&apos;s live data and sent from your business
              number{defaultEventKey === 'case.milestone' ? ' as a recovery progress update' : ''}.
            </p>
          </div>
        )}

        {connected && apiMode === 'session' && (
          <div className="space-y-3">
            <div>
              {windowOpen ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2.5 py-1 text-xs font-medium text-success">
                  <Clock className="w-3 h-3" />
                  Window open · {windowRemaining} left
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                  <Clock className="w-3 h-3" />
                  24h window closed — customer must message first, or use a template
                </span>
              )}
              {contact?.opt_out_all && (
                <span className="ml-2 inline-flex items-center rounded-full bg-danger-muted px-2.5 py-1 text-xs font-medium text-danger">
                  Customer opted out
                </span>
              )}
            </div>
            <Textarea
              label="Reply"
              floatingLabel
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="resize-none"
              placeholder="Type a free-form reply…"
              hint="Free-form replies are only deliverable inside the 24-hour service window after the customer's last message."
              disabled={!windowOpen}
            />
          </div>
        )}

        {showHandoff && (
          <>
            <TemplatePicker
              typeCode={channel}
              contextRefs={contextRefs}
              channel="plain"
              label={`${channelLabel} template`}
              onApply={({ body }) => setMessage(body)}
            />

            <Textarea
              label="Message"
              floatingLabel
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              className="resize-none"
              placeholder={`Write or pick a template — the message is sent from your ${isWhatsApp ? 'WhatsApp' : 'phone'}, and logged here.`}
              hint={`xSuite logs this communication on the ${caseId ? 'case' : 'customer'}; the message itself is sent from your device.`}
            />
          </>
        )}

        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={onClose}
            disabled={logging || sending}
          >
            Close
          </Button>
          {showHandoff ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={handleCopy}
                disabled={!message.trim() || logging}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                )}
                {copied ? 'Copied' : 'Copy Message'}
              </Button>
              {isWhatsApp && (
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={handleOpenWhatsApp}
                  disabled={!message.trim() || logging}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open WhatsApp
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              className="text-xs"
              onClick={handleApiSend}
              disabled={apiSendDisabled}
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              Send via WhatsApp
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SendMessageModal;
