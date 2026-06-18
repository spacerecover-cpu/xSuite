import React, { useEffect, useState } from 'react';
import { Plus, Search, Users, RefreshCw } from 'lucide-react';
import { EmptyState } from '../../components/shared/EmptyState';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { Pager } from '../../components/ui/Pager';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { Database } from '../../types/database.types';

type Employee = Database['public']['Tables']['employees']['Row'] & {
  profiles: Database['public']['Tables']['profiles']['Row'] | null;
  departments: Database['public']['Tables']['departments']['Row'] | null;
  positions: Database['public']['Tables']['positions']['Row'] | null;
};

type StatusFilter = 'all' | 'active' | 'on_leave';

const PAGE_SIZE = 50;

export const EmployeesList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter]);

  const { data: employeesPage, isLoading: loading } = useQuery({
    queryKey: ['employees', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('employees')
        .select(
          `
          *,
          profiles!employees_user_profile_fkey (*),
          departments (*),
          positions (*)
        `,
          { count: 'exact' },
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        const s = sanitizeFilterValue(debouncedSearch);
        query = query.or(
          `first_name.ilike.%${s}%,last_name.ilike.%${s}%,employee_number.ilike.%${s}%`,
        );
      }
      if (statusFilter !== 'all') query = query.eq('employment_status', statusFilter);

      const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Employee[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  const employees = employeesPage?.rows ?? [];
  const totalEmployees = employeesPage?.total ?? 0;

  // KPIs are global count-only aggregates (every matching row, RLS-scoped to the
  // tenant), independent of the current page or the active search/status filter.
  const { data: stats } = useQuery({
    queryKey: ['employee_stats'],
    queryFn: async () => {
      const base = () =>
        supabase.from('employees').select('*', { count: 'exact', head: true }).is('deleted_at', null);
      const [totalRes, activeRes, onLeaveRes] = await Promise.all([
        base(),
        base().eq('employment_status', 'active'),
        base().eq('employment_status', 'on_leave'),
      ]);
      return {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        onLeave: onLeaveRes.count ?? 0,
      };
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['employee_stats'] });
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-primary shadow-primary/40">
            <Users className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Employees</h1>
            <p className="text-slate-600 text-base">
              Manage your organization's workforce
            </p>
            <div className="flex gap-4 mt-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-info"></div>
                <span className="text-slate-600">{stats?.total ?? 0} Total Employees</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-success"></div>
                <span className="text-slate-600">{stats?.active ?? 0} Active</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-warning"></div>
                <span className="text-slate-600">{stats?.onLeave ?? 0} On Leave</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleRefresh}
            variant="secondary"
            disabled={loading}
            title="Refresh employees list"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="lg:w-80 flex-shrink-0">
              <Input
                type="text"
                placeholder="Search by name or employee #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'active'
                    ? 'bg-success text-success-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'on_leave' ? 'all' : 'on_leave')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'on_leave'
                    ? 'bg-warning text-warning-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                On Leave
              </button>
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <EmptyState
            icon={Users}
            title="No employees found"
            description={
              searchTerm || statusFilter !== 'all'
                ? 'No employees found matching your criteria.'
                : 'No employees found. Add your first employee to get started.'
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-shadow cursor-pointer overflow-hidden"
                onClick={() => navigate(`/hr/employees/${employee.id}`)}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-semibold text-lg">
                        {employee.profiles?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{employee.profiles?.full_name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-slate-600">{employee.employee_number}</span>
                          {employee.positions && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-sm text-slate-600">{employee.positions.title}</span>
                            </>
                          )}
                          {employee.departments && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-sm text-slate-600">{employee.departments.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={statusToBadgeVariant(employee.employment_status ?? '')}>
                        {(employee.employment_status ?? 'unknown').replace('_', ' ')}
                      </Badge>
                      <Badge variant="info">
                        {(employee.employment_type ?? 'unknown').replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={totalEmployees}
              onPageChange={setPage}
              itemNoun="employees"
            />
          </div>
        </>
      )}
    </div>
  );
};
