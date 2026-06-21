import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Table } from '../../ui/Table';
import { Skeleton } from '../../ui/Skeleton';
import { getTenantUsers } from '@/lib/platformAdminService';
import { platformAdminKeys } from '@/lib/queryKeys';
import { formatDistanceToNow } from 'date-fns';

interface TenantUsersTabProps {
  tenantId: string;
}

interface TenantUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  last_login_at: string | null;
  created_at: string;
}

export const TenantUsersTab: React.FC<TenantUsersTabProps> = ({ tenantId }) => {
  const { data: usersRaw = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.tenantUsers(tenantId),
    queryFn: () => getTenantUsers(tenantId),
  });
  const users = usersRaw as unknown as TenantUserRow[];

  const getRoleBadgeVariant = (role: string | null): 'danger' | 'warning' | 'info' | 'default' => {
    switch (role) {
      case 'admin': return 'danger';
      case 'manager': return 'warning';
      case 'engineer': return 'info';
      case 'viewer': return 'default';
      default: return 'default';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <Card className="p-12 text-center">
        <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">No users found</p>
      </Card>
    );
  }

  return (
    <Card>
      <Table
        data={users}
        columns={[
          {
            key: 'full_name',
            header: 'Name',
            render: (user) => <span className="font-medium">{user.full_name || 'N/A'}</span>,
          },
          {
            key: 'email',
            header: 'Email',
            render: (user) => <span className="text-slate-600">{user.email}</span>,
          },
          {
            key: 'role',
            header: 'Role',
            render: (user) => (
              <Badge variant={getRoleBadgeVariant(user.role)}>
                {user.role?.toUpperCase() ?? '-'}
              </Badge>
            ),
          },
          {
            key: 'last_login_at',
            header: 'Last Login',
            render: (user) => (
              <span className="text-slate-600">
                {user.last_login_at
                  ? formatDistanceToNow(new Date(user.last_login_at)) + ' ago'
                  : 'Never'}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (user) => (
              <Badge variant={user.last_login_at ? 'success' : 'default'}>
                {user.last_login_at ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
        ]}
      />
    </Card>
  );
};
