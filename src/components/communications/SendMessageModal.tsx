import React, { useEffect, useState } from 'react';
import { MessageCircle, MessageSquare, Copy, ExternalLink, Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
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

        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button variant="secondary" size="sm" className="text-xs" onClick={onClose} disabled={logging}>
            Close
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={handleCopy}
            disabled={!message.trim() || logging}
          >
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? 'Copied' : 'Copy Message'}
          </Button>
          {isWhatsApp && (
            <Button size="sm" className="text-xs" onClick={handleOpenWhatsApp} disabled={!message.trim() || logging}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Open WhatsApp
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SendMessageModal;
