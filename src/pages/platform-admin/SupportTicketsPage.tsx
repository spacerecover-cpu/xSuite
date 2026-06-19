import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Ticket, Search } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatCard } from '../../components/shared/StatCard';
import { Table } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { TicketStatusBadge } from '../../components/platform-admin/tickets/TicketStatusBadge';
import { TicketPriorityBadge } from '../../components/platform-admin/tickets/TicketPriorityBadge';
import { getSupportTickets, getTicketStats, type TicketWithDetails } from '../../lib/platformAdminService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { formatDistanceToNow } from 'date-fns';

interface TicketColumn {
  key: string;
  header: string;
  render?: (row: TicketWithDetails) => React.ReactNode;
  width?: string;
}

export const SupportTicketsPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [assignedToFilter, setAssignedToFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: platformAdminKeys.ticketStats(),
    queryFn: getTicketStats,
    refetchInterval: 30000,
  });

  const filters = {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    assignedTo: assignedToFilter !== 'all' ? assignedToFilter : undefined,
    search: searchQuery || undefined,
  };

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.ticketsList(filters),
    queryFn: () => getSupportTickets(filters),
  });

  const handleResetFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setAssignedToFilter('all');
    setSearchQuery('');
  };

  const columns: TicketColumn[] = [
    {
      key: 'ticket_number',
      header: 'Ticket #',
      render: (ticket) => <span className="font-medium">{ticket.ticket_number}</span>,
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (ticket) => <span className="text-slate-900">{ticket.subject}</span>,
    },
    {
      key: 'tenant',
      header: 'Tenant',
      render: (ticket) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/platform-admin/tenants/${ticket.tenant_id}`);
          }}
          className="text-primary hover:text-primary/90 text-sm"
        >
          {ticket.tenant?.company_name || 'Unknown'}
        </button>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (ticket) => <TicketPriorityBadge priority={ticket.priority ?? 'medium'} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (ticket) => <TicketStatusBadge status={ticket.status ?? 'open'} />,
    },
    {
      key: 'category',
      header: 'Category',
      render: (ticket) => (
        <span className="text-slate-600 capitalize">{ticket.category?.replace('_', ' ') ?? '—'}</span>
      ),
    },
    {
      key: 'assigned_admin',
      header: 'Assigned To',
      render: (ticket) => (
        <span className="text-slate-600">{ticket.assigned_admin?.full_name || 'Unassigned'}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (ticket) => (
        <span className="text-slate-600">{new Date(ticket.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'updated_at',
      header: 'Last Update',
      render: (ticket) => (
        <span className="text-slate-600">{formatDistanceToNow(new Date(ticket.updated_at))} ago</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Support Tickets</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Open"
          value={statsLoading ? '—' : String(stats?.open ?? 0)}
          icon={Ticket}
        />
        <StatCard
          label="In Progress"
          value={statsLoading ? '—' : String(stats?.inProgress ?? 0)}
          icon={Ticket}
        />
        <StatCard
          label="Waiting on Customer"
          value={statsLoading ? '—' : String(stats?.waitingCustomer ?? 0)}
          icon={Ticket}
        />
        <StatCard
          label="Resolved Today"
          value={statsLoading ? '—' : String(stats?.resolvedToday ?? 0)}
          icon={Ticket}
        />
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Filters</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting_customer">Waiting Customer</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="general">General</option>
                <option value="billing">Billing</option>
                <option value="technical">Technical</option>
                <option value="feature_request">Feature Request</option>
                <option value="bug_report">Bug Report</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assigned To</label>
              <select
                value={assignedToFilter}
                onChange={(e) => setAssignedToFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="unassigned">Unassigned</option>
                <option value="me">Assigned to Me</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ticket # or subject..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {(statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || assignedToFilter !== 'all' || searchQuery) && (
            <button
              onClick={handleResetFilters}
              className="text-sm text-primary hover:text-primary/90"
            >
              Reset Filters
            </button>
          )}
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No tickets found</p>
            {(statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || searchQuery) && (
              <button
                onClick={handleResetFilters}
                className="text-sm text-primary hover:text-primary/90 mt-2"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <Table<TicketWithDetails>
            data={tickets}
            columns={columns}
            onRowClick={(ticket) => navigate(`/platform-admin/tickets/${ticket.id}`)}
          />
        )}
      </Card>
    </div>
  );
};
