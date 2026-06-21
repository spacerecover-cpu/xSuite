import React, { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { TemplatePicker } from '../templates/TemplatePicker';
import {
  createFollowUp,
  FOLLOW_UP_TYPE_LABELS,
  type FollowUpType,
} from '../../lib/followUpService';
import { followUpKeys } from '../../lib/queryKeys';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface FollowUpFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  /** Pre-selects the quote-chase preset and links the quote. */
  quoteId?: string;
  defaultType?: FollowUpType;
  defaultEmail?: string;
  /** Days from now for the default due date (quote chase preset: e.g. 3). */
  defaultInDays?: number;
}

const toDateTimeLocal = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Schedule a follow-up: an internal reminder (rides the notification stack) or
 * an auto-send email whose content is rendered from a template NOW and frozen
 * — what you preview here is exactly what the scheduler sends.
 */
export const FollowUpFormModal: React.FC<FollowUpFormModalProps> = ({
  isOpen,
  onClose,
  caseId,
  quoteId,
  defaultType,
  defaultEmail,
  defaultInDays = 3,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const dateId = useId();
  const messageId = useId();

  const [type, setType] = useState<FollowUpType>(defaultType ?? 'general');
  const [dueAt, setDueAt] = useState('');
  const [channel, setChannel] = useState<'internal' | 'email'>('internal');
  const [notes, setNotes] = useState('');
  const [sendTo, setSendTo] = useState(defaultEmail ?? '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const due = new Date();
      due.setDate(due.getDate() + defaultInDays);
      due.setMinutes(0, 0, 0);
      setDueAt(toDateTimeLocal(due));
      setType(defaultType ?? (quoteId ? 'quote_chase' : 'general'));
      setChannel('internal');
      setNotes('');
      setSendTo(defaultEmail ?? '');
      setSubject('');
      setMessage('');
      setTemplateId(null);
    }
  }, [isOpen, defaultType, defaultEmail, defaultInDays, quoteId]);

  const handleSave = async () => {
    if (!dueAt) {
      toast.error('Pick a due date');
      return;
    }
    if (channel === 'email' && !message.trim()) {
      toast.error('Write or pick the email message that will be sent');
      return;
    }
    setSaving(true);
    try {
      await createFollowUp({
        caseId,
        quoteId: quoteId ?? null,
        followUpDate: new Date(dueAt).toISOString(),
        type,
        notes: notes.trim() || undefined,
        channel,
        autoSend: channel === 'email',
        sendTo: channel === 'email' ? sendTo.trim() || undefined : undefined,
        subject: channel === 'email' ? subject.trim() || undefined : undefined,
        message: channel === 'email' ? message : undefined,
        templateId,
      });
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
      toast.success(
        channel === 'email'
          ? 'Follow-up email scheduled'
          : 'Follow-up reminder scheduled'
      );
      onClose();
    } catch (error) {
      logger.error('Error scheduling follow-up:', error);
      toast.error('Failed to schedule the follow-up');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Follow-up"
      icon={CalendarClock}
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as FollowUpType)}
            options={Object.entries(FOLLOW_UP_TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <div>
            <label htmlFor={dateId} className="block text-sm font-medium text-slate-700 mb-1">
              Due
            </label>
            <input
              id={dateId}
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1.5">When it's due</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChannel('internal')}
              className={`flex-1 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                channel === 'internal'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              Remind the team
              <span className="block text-xs font-normal text-slate-400 mt-0.5">
                In-app/email notification to subscribed staff
              </span>
            </button>
            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`flex-1 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                channel === 'email'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              Auto-send an email
              <span className="block text-xs font-normal text-slate-400 mt-0.5">
                The message below goes to the customer automatically
              </span>
            </button>
          </div>
        </div>

        {channel === 'internal' && (
          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What needs to happen? (shown in the reminder)"
          />
        )}

        {channel === 'email' && (
          <>
            <Input
              label="Send To"
              type="email"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="Leave empty to use the case customer's email"
            />
            <TemplatePicker
              typeCode="email"
              contextRefs={{ caseId, quoteId }}
              channel="plain"
              label="Email template"
              onApply={({ templateId: appliedId, subject: appliedSubject, body }) => {
                setTemplateId(appliedId);
                if (appliedSubject) setSubject(appliedSubject);
                setMessage(body);
              }}
            />
            <Input
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
            <div>
              <label
                htmlFor={messageId}
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Message (sent exactly as written)
              </label>
              <textarea
                id={messageId}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Pick a template above — placeholders are filled with this case's data now, and this exact text is sent when due."
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scheduling…
              </>
            ) : (
              'Schedule Follow-up'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FollowUpFormModal;
