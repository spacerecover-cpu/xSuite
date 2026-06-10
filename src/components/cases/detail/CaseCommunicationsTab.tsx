import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  Inbox,
  StickyNote,
  CalendarClock,
} from 'lucide-react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { formatDateTime } from '../../../lib/format';
import { listCaseCommunications } from '../../../lib/communicationsService';
import { communicationKeys } from '../../../lib/queryKeys';
import { EmailDocumentModal } from '../EmailDocumentModal';
import { SendMessageModal } from '../../communications/SendMessageModal';
import { FollowUpFormModal } from '../../communications/FollowUpFormModal';
import { useTenantFeature } from '../../../contexts/TenantConfigContext';

interface CaseCommunicationsTabProps {
  caseId: string;
  caseNumber: string;
  customerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  companyName: string;
}

const CHANNEL_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  email: { icon: Mail, label: 'Email' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp' },
  sms: { icon: MessageSquare, label: 'SMS' },
  phone: { icon: Phone, label: 'Phone' },
};

export const CaseCommunicationsTab: React.FC<CaseCommunicationsTabProps> = ({
  caseId,
  caseNumber,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
  companyName,
}) => {
  const queryClient = useQueryClient();
  const [showEmail, setShowEmail] = useState(false);
  const [messageChannel, setMessageChannel] = useState<'whatsapp' | 'sms' | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const followUpsEnabled = useTenantFeature('automation.case_follow_ups');

  const { data: communications = [], isLoading } = useQuery({
    queryKey: communicationKeys.byCase(caseId),
    queryFn: () => listCaseCommunications(caseId),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: communicationKeys.byCase(caseId) });

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Communications</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Every email and message exchanged on this case — sent documents log here
              automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowEmail(true)}>
              <Mail className="w-4 h-4 mr-2" />
              Email
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMessageChannel('whatsapp')}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMessageChannel('sms')}>
              <MessageSquare className="w-4 h-4 mr-2" />
              SMS
            </Button>
            {followUpsEnabled && (
              <Button size="sm" onClick={() => setShowFollowUp(true)}>
                <CalendarClock className="w-4 h-4 mr-2" />
                Schedule Follow-up
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : communications.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Inbox className="w-16 h-16 mx-auto mb-3 text-slate-300" />
            <p className="text-lg font-medium mb-1">No communications yet</p>
            <p className="text-sm">
              Emails sent with documents are logged here automatically; use the buttons above
              to reach the customer.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {communications.map((comm) => {
              const meta = CHANNEL_META[comm.type ?? ''] ?? {
                icon: StickyNote,
                label: comm.type ?? 'Note',
              };
              const MetaIcon = meta.icon;
              return (
                <div
                  key={comm.id}
                  className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                      <MetaIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="secondary" size="sm">
                          {meta.label}
                        </Badge>
                        {comm.direction && comm.direction !== 'internal' && (
                          <Badge
                            variant={comm.direction === 'outbound' ? 'info' : 'success'}
                            size="sm"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            {comm.direction}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">
                          {formatDateTime(comm.created_at)}
                        </span>
                      </div>
                      {comm.subject && (
                        <p className="font-medium text-slate-900 text-sm mb-0.5">
                          {comm.subject}
                        </p>
                      )}
                      {comm.sent_to && (
                        <p className="text-xs text-slate-500 mb-1">To: {comm.sent_to}</p>
                      )}
                      {comm.content && (
                        <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-4">
                          {comm.content}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEmail && (
        <EmailDocumentModal
          isOpen={showEmail}
          onClose={() => {
            setShowEmail(false);
            refresh();
          }}
          caseId={caseId}
          customerId={customerId ?? undefined}
          caseNumber={caseNumber}
          customerName={customerName}
          customerEmail={customerEmail ?? undefined}
          companyName={companyName}
        />
      )}

      {messageChannel && (
        <SendMessageModal
          isOpen={!!messageChannel}
          onClose={() => setMessageChannel(null)}
          channel={messageChannel}
          caseId={caseId}
          customerId={customerId ?? undefined}
          defaultPhone={customerPhone ?? ''}
          contextRefs={{ caseId, customerId: customerId ?? undefined }}
          onLogged={refresh}
        />
      )}

      {showFollowUp && (
        <FollowUpFormModal
          isOpen={showFollowUp}
          onClose={() => setShowFollowUp(false)}
          caseId={caseId}
          defaultEmail={customerEmail ?? undefined}
        />
      )}
    </Card>
  );
};
