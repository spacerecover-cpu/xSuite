import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Pencil, RotateCcw, Braces, Eye, Loader2, UserRound, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { logger } from '../../lib/logger';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { renderTemplate } from '../../lib/templateEngine';
import {
  listMergedEmailTemplates,
  upsertOverride,
  removeOverride,
  NOTIFICATION_EVENT_VARIABLES,
  SAMPLE_EVENT_PAYLOAD,
  type MergedNotificationTemplate,
} from '../../lib/notificationTemplateService';

const MERGED_KEY = ['notification-templates', 'merged', 'email'] as const;

const EVENT_LABELS: Record<string, string> = {
  'case.phase_changed': 'Case status changed',
  'case.phase_changed.customer': 'Case status changed',
  'case.sla_breach': 'SLA breach alert',
  'case.follow_up_due': 'Scheduled follow-up due',
  'quote.expiring_soon': 'Quote expiring soon',
  'invoice.overdue.7d': 'Invoice overdue 7+ days',
  'invoice.overdue.14d': 'Invoice overdue 14+ days',
  'invoice.overdue.30d': 'Invoice overdue 30+ days (urgent)',
  'payment.received': 'Payment received',
  'payment.received.customer': 'Payment receipt',
  'inventory.low_stock': 'Stock running low',
  'inventory.out_of_stock': 'Item out of stock',
};

function sampleContextFor(eventType: string): Record<string, string> {
  const keys = NOTIFICATION_EVENT_VARIABLES[eventType] ?? [];
  return Object.fromEntries(keys.map((key) => [key, SAMPLE_EVENT_PAYLOAD[key] ?? '…']));
}

export const NotificationTemplatesTab: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { profile } = useAuth();

  const [editing, setEditing] = useState<MergedNotificationTemplate | null>(null);

  const { data: merged = [], isLoading } = useQuery({
    queryKey: MERGED_KEY,
    queryFn: listMergedEmailTemplates,
  });

  const groups = useMemo(() => {
    const customer = merged.filter((m) => m.eventType.endsWith('.customer'));
    const staff = merged.filter((m) => !m.eventType.endsWith('.customer'));
    return [
      { id: 'customer', title: 'Customer-facing emails', icon: UserRound, items: customer },
      { id: 'staff', title: 'Staff notifications', icon: Users, items: staff },
    ].filter((g) => g.items.length > 0);
  }, [merged]);

  const revertMutation = useMutation({
    mutationFn: (overrideId: string) => removeOverride(overrideId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MERGED_KEY });
      toast.success('Reverted to the system default');
    },
    onError: (err) => {
      logger.error('Failed to revert notification template:', err);
      toast.error('Could not revert the template');
    },
  });

  const handleRevert = async (item: MergedNotificationTemplate) => {
    if (!item.override) return;
    const ok = await confirm({
      title: 'Revert to System Default',
      message: `Remove your customized "${EVENT_LABELS[item.eventType] ?? item.eventType}" email? Delivery falls back to the system default immediately.`,
      confirmLabel: 'Revert',
      tone: 'danger',
    });
    if (ok) revertMutation.mutate(item.override.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-info-muted border-l-4 border-info rounded-lg p-4 text-sm text-info">
        <p className="font-semibold mb-1">Tenant email templates</p>
        <p>
          These emails are sent automatically when events happen (status changes, payments,
          overdue invoices…). Customize any of them for your lab — your version takes
          precedence over the system default, and you can revert at any time.
        </p>
      </div>

      {groups.map((group) => (
        <section
          key={group.id}
          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <header className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <group.icon className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">{group.title}</h2>
          </header>
          <div className="divide-y divide-slate-100">
            {group.items.map((item) => {
              const active = item.override ?? item.system;
              return (
                <div key={item.eventType} className="px-6 py-4 flex items-start gap-4">
                  <Mail className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">
                        {EVENT_LABELS[item.eventType] ?? item.eventType}
                      </span>
                      {item.override ? (
                        <Badge variant="success" size="sm">Customized</Badge>
                      ) : item.system ? (
                        <Badge variant="secondary" size="sm">System default</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">No template</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{item.eventType}</p>
                    {active?.subject_template && (
                      <p className="text-sm text-slate-600 mt-1 truncate">
                        <span className="text-slate-400">Subject:</span>{' '}
                        {active.subject_template}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.override && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevert(item)}
                        disabled={revertMutation.isPending}
                        title="Revert to system default"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Revert
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => setEditing(item)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      {item.override ? 'Edit' : 'Customize'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {editing && (
        <TemplateEditorModal
          item={editing}
          tenantId={profile?.tenant_id ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: MERGED_KEY });
          }}
        />
      )}
    </div>
  );
};

interface TemplateEditorModalProps {
  item: MergedNotificationTemplate;
  tenantId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  item,
  tenantId,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const base = item.override ?? item.system;
  const [subject, setSubject] = useState(base?.subject_template ?? '');
  const [body, setBody] = useState(base?.body_template ?? '');
  const [link, setLink] = useState(base?.link_template ?? '');
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const variables = NOTIFICATION_EVENT_VARIABLES[item.eventType] ?? [];
  const sampleCtx = useMemo(() => sampleContextFor(item.eventType), [item.eventType]);

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (el && document.activeElement === el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? start;
      const next = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      setBody((prev) => prev + token);
    }
  };

  const handleSave = async () => {
    if (!tenantId) {
      toast.error('No active tenant');
      return;
    }
    if (!body.trim()) {
      toast.error('The email body cannot be empty');
      return;
    }
    setSaving(true);
    try {
      await upsertOverride({
        tenantId,
        eventType: item.eventType,
        subjectTemplate: subject,
        bodyTemplate: body,
        linkTemplate: link.trim() || null,
        existingOverrideId: item.override?.id,
      });
      toast.success('Template saved — your version is now used for this email');
      onSaved();
    } catch (err) {
      logger.error('Failed to save notification template:', err);
      toast.error('Could not save the template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Customize: ${EVENT_LABELS[item.eventType] ?? item.eventType}`}
      icon={Mail}
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g., Update on your case {{case_no}}"
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">Body</label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 px-2 py-1 hover:bg-primary/10 rounded transition-colors"
            >
              <Eye className="w-3 h-3" />
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm"
            placeholder="Email body — click a variable below to insert it."
          />
        </div>

        {variables.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
              <Braces className="w-3 h-3" />
              Available variables (click to insert)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => insertVariable(key)}
                  className="px-2 py-0.5 text-xs font-mono bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-600 rounded transition-colors"
                >
                  {'{{'}{key}{'}}'}
                </button>
              ))}
            </div>
          </div>
        )}

        <Input
          label="Link (optional)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="e.g., /cases/{{case_id}}"
        />

        {showPreview && (
          <div className="border border-slate-200 rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Preview with sample data
            </p>
            <p className="text-sm font-medium text-slate-900 mb-1">
              {renderTemplate(subject, sampleCtx) || '(no subject)'}
            </p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {renderTemplate(body, sampleCtx)}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !tenantId}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save Template'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default NotificationTemplatesTab;
