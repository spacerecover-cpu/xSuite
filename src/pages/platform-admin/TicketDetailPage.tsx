import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Building2, Calendar, AlertCircle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TicketStatusBadge } from '../../components/platform-admin/tickets/TicketStatusBadge';
import { TicketPriorityBadge } from '../../components/platform-admin/tickets/TicketPriorityBadge';
import { TicketMessage } from '../../components/platform-admin/tickets/TicketMessage';
import {
  getTicketDetails,
  getTicketMessages,
  addTicketMessage,
  updateTicketStatus,
} from '../../lib/platformAdminService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { usePlatformAdmin } from '../../contexts/PlatformAdminContext';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '../../hooks/useToast';

export const TicketDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { admin } = usePlatformAdmin();
  const { success: showSuccess, error: showError } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: platformAdminKeys.ticketDetail(id!),
    queryFn: () => getTicketDetails(id!),
    enabled: !!id,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: platformAdminKeys.ticketMessages(id!),
    queryFn: () => getTicketMessages(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const replyMutation = useMutation({
    mutationFn: () => {
      if (!admin) throw new Error('Not authenticated');
      return addTicketMessage(id!, admin.user_id, replyText, 'support', isInternalNote);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.ticketMessages(id!) });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.ticketDetail(id!) });
      setReplyText('');
      setIsInternalNote(false);
      showSuccess('Reply sent successfully');
    },
    onError: () => {
      showError('Failed to send reply');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed') =>
      updateTicketStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.ticketDetail(id!) });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.ticketsList() });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.ticketStats() });
      showSuccess('Status updated successfully');
    },
    onError: () => {
      showError('Failed to update status');
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    replyMutation.mutate();
  };

  const handleResolve = () => {
    updateStatusMutation.mutate('resolved');
    setShowResolveDialog(false);
  };

  const handleClose = () => {
    updateStatusMutation.mutate('closed');
    setShowCloseDialog(false);
  };

  if (ticketLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Ticket not found</p>
        <Button onClick={() => navigate('/platform-admin/tickets')} className="mt-4">
          Back to Tickets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" onClick={() => navigate('/platform-admin/tickets')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-900">{ticket.ticket_number}</h1>
                <TicketStatusBadge status={ticket.status ?? 'open'} />
                <TicketPriorityBadge priority={ticket.priority ?? 'medium'} />
              </div>
              <h2 className="text-xl text-slate-700 mb-2">{ticket.subject}</h2>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <Link
                  to={`/platform-admin/tenants/${ticket.tenant_id}`}
                  className="text-primary hover:text-primary/90 flex items-center gap-1"
                >
                  <Building2 className="w-4 h-4" />
                  {ticket.tenant?.company_name}
                </Link>
                <span>Created {formatDistanceToNow(new Date(ticket.created_at))} ago</span>
                <span>Updated {formatDistanceToNow(new Date(ticket.updated_at))} ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Conversation</h3>
            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-6">
              {messagesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No messages yet</p>
              ) : (
                messages.map((message) => (
                  <TicketMessage
                    key={message.id}
                    message={{
                      ...message,
                      sender_name: message.sender_type === 'support' ? admin?.name : ticket.customer?.full_name,
                    }}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmitReply} className="space-y-4 border-t border-slate-200 pt-6">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Internal note (not visible to customer)
                </label>
                <Button
                  type="submit"
                  disabled={!replyText.trim() || replyMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Reply
                </Button>
              </div>
              {isInternalNote && (
                <div className="bg-warning-muted border border-warning/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-warning">
                    This message will be marked as internal and will not be visible to the customer.
                  </p>
                </div>
              )}
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Ticket Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={ticket.status ?? 'open'}
                  onChange={(e) =>
                    updateStatusMutation.mutate(
                      e.target.value as 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed'
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting_customer">Waiting Customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <div className="flex items-center gap-2">
                  <TicketPriorityBadge priority={ticket.priority ?? 'medium'} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <p className="text-sm text-slate-900 capitalize">
                  {ticket.category?.replace('_', ' ')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assigned To</label>
                <p className="text-sm text-slate-900">
                  {ticket.assigned_admin?.full_name || 'Unassigned'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Calendar className="w-3 h-3" />
                  <span>Created</span>
                </div>
                <p className="text-sm text-slate-900">
                  {new Date(ticket.created_at).toLocaleString()}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Calendar className="w-3 h-3" />
                  <span>Last Updated</span>
                </div>
                <p className="text-sm text-slate-900">
                  {new Date(ticket.updated_at).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Tenant Info</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Company</p>
                <Link
                  to={`/platform-admin/tenants/${ticket.tenant_id}`}
                  className="text-sm font-medium text-primary hover:text-primary/90"
                >
                  {ticket.tenant?.company_name}
                </Link>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Contact Email</p>
                <p className="text-sm text-slate-900">{ticket.customer?.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Contact Name</p>
                <p className="text-sm text-slate-900">{ticket.customer?.full_name}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Actions</h3>
            <div className="space-y-2">
              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <Button
                  variant="ghost"
                  className="w-full justify-start border border-success/40 text-success hover:bg-success-muted"
                  onClick={() => setShowResolveDialog(true)}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark as Resolved
                </Button>
              )}

              {ticket.status !== 'closed' && (
                <Button
                  variant="ghost"
                  className="w-full justify-start border border-slate-300 text-slate-600 hover:bg-slate-50"
                  onClick={() => setShowCloseDialog(true)}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Close Ticket
                </Button>
              )}

              {ticket.status === 'closed' && (
                <Button
                  variant="ghost"
                  className="w-full justify-start border border-primary/40 text-primary hover:bg-info-muted"
                  onClick={() => updateStatusMutation.mutate('open')}
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Reopen Ticket
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full justify-start border border-danger/40 text-danger hover:bg-danger-muted"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Ticket
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showResolveDialog}
        onClose={() => setShowResolveDialog(false)}
        onConfirm={handleResolve}
        title="Mark as Resolved"
        message="Are you sure you want to mark this ticket as resolved?"
        confirmText="Resolve"
        variant="info"
      />

      <ConfirmDialog
        isOpen={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        onConfirm={handleClose}
        title="Close Ticket"
        message="Are you sure you want to close this ticket?"
        confirmText="Close"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          navigate('/platform-admin/tickets');
          setShowDeleteDialog(false);
        }}
        title="Delete Ticket"
        message="Are you sure you want to delete this ticket? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};
