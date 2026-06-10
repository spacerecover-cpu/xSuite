import React, { useEffect, useId, useState } from 'react';
import { MessageCircle, MessageSquare, Copy, ExternalLink, Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TemplatePicker } from '../templates/TemplatePicker';
import { openWhatsAppChat, isValidWhatsAppNumber } from '../../lib/whatsappUtils';
import {
  logCaseCommunication,
  logCustomerCommunication,
} from '../../lib/communicationsService';
import type { ContextRefs } from '../../lib/templateContextService';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

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
}

/**
 * WhatsApp/SMS handoff: render a tenant template with real case/customer data,
 * let the user tweak it, then copy to clipboard or open a prefilled wa.me chat.
 * No SMS provider — the device sends; xSuite logs the communication.
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
}) => {
  const toast = useToast();
  const [phone, setPhone] = useState(defaultPhone ?? '');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [logging, setLogging] = useState(false);
  const messageId = useId();

  const isWhatsApp = channel === 'whatsapp';
  const channelLabel = isWhatsApp ? 'WhatsApp' : 'SMS';
  const ChannelIcon = isWhatsApp ? MessageCircle : MessageSquare;

  useEffect(() => {
    if (isOpen) {
      setPhone(defaultPhone ?? '');
      setMessage('');
      setCopied(false);
    }
  }, [isOpen, defaultPhone]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Send ${channelLabel} Message`}
      icon={ChannelIcon}
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <Input
          label={isWhatsApp ? 'WhatsApp Number' : 'Phone Number'}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+968 9876 5432"
        />

        <TemplatePicker
          typeCode={channel}
          contextRefs={contextRefs}
          channel="plain"
          label={`${channelLabel} template`}
          onApply={({ body }) => setMessage(body)}
        />

        <div>
          <label htmlFor={messageId} className="block text-sm font-medium text-slate-700 mb-1">
            Message
          </label>
          <textarea
            id={messageId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder={`Write or pick a template — the message is sent from your ${isWhatsApp ? 'WhatsApp' : 'phone'}, and logged here.`}
          />
          <p className="mt-1 text-xs text-slate-400">
            xSuite logs this communication on the {caseId ? 'case' : 'customer'}; the message
            itself is sent from your device.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose} disabled={logging}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopy}
            disabled={!message.trim() || logging}
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Copied' : 'Copy Message'}
          </Button>
          {isWhatsApp && (
            <Button onClick={handleOpenWhatsApp} disabled={!message.trim() || logging}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Open WhatsApp
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SendMessageModal;
