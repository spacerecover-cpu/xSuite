import React, { Suspense } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { ContentLoadingFallback } from '../shared/ContentLoadingFallback';
import { LayoutDashboard, Users, Ticket, Megaphone, LogOut, Settings, ChevronRight, CreditCard, Tag, AlertOctagon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PlatformAdminProvider } from '../../contexts/PlatformAdminContext';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { path: '/platform-admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/platform-admin/tenants', label: 'Tenants', icon: Users },
  { path: '/platform-admin/plans', label: 'Plans & Billing', icon: CreditCard },
  { path: '/platform-admin/coupons', label: 'Coupons', icon: Tag },
  { path: '/platform-admin/tickets', label: 'Support Tickets', icon: Ticket },
  { path: '/platform-admin/announcements', label: 'Announcements', icon: Megaphone },
  { path: '/platform-admin/notifications/dlq', label: 'Notification DLQ', icon: AlertOctagon },
  { path: '/platform-admin/settings', label: 'Settings', icon: Settings },
];

export const PlatformAdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const breadcrumbs = getBreadcrumbs(location.pathname);

  return (
    <PlatformAdminProvider>
      <div className="min-h-screen bg-slate-50">
      <div className="flex h-screen overflow-hidden">
        <aside className="w-64 bg-slate-900 text-white flex flex-col">
          <div className="p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold">Platform Admin</h1>
            <p className="text-sm text-slate-400 mt-1">SaaS Management</p>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path ||
                              (item.path !== '/platform-admin' && location.pathname.startsWith(item.path));

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-slate-800 rounded-lg">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center font-semibold">
                {user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{profile?.full_name || 'Admin'}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm">Sign Out</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="bg-white border-b border-slate-200 px-8 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight className="w-4 h-4" />}
                  {crumb.path ? (
                    <Link to={crumb.path} className="hover:text-slate-900">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-slate-900 font-medium">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="p-8">
            <Suspense fallback={<ContentLoadingFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
    </PlatformAdminProvider>
  );
};

function getBreadcrumbs(pathname: string): Array<{ label: string; path?: string }> {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length === 1) {
    return [{ label: 'Platform Admin' }];
  }

  const breadcrumbs: Array<{ label: string; path?: string }> = [
    { label: 'Platform Admin', path: '/platform-admin' },
  ];

  if (parts[1] === 'tenants') {
    breadcrumbs.push({ label: 'Tenants', path: parts.length === 2 ? undefined : '/platform-admin/tenants' });
    if (parts.length > 2) {
      breadcrumbs.push({ label: 'Tenant Details' });
    }
  } else if (parts[1] === 'tickets') {
    breadcrumbs.push({ label: 'Support Tickets', path: parts.length === 2 ? undefined : '/platform-admin/tickets' });
    if (parts.length > 2) {
      breadcrumbs.push({ label: 'Ticket Details' });
    }
  } else if (parts[1] === 'announcements') {
    breadcrumbs.push({ label: 'Announcements' });
  } else if (parts[1] === 'plans') {
    breadcrumbs.push({ label: 'Subscription Plans', path: parts.length === 2 ? undefined : '/platform-admin/plans' });
    if (parts.length > 2) {
      breadcrumbs.push({ label: 'Plan Details' });
    }
  } else if (parts[1] === 'coupons') {
    breadcrumbs.push({ label: 'Coupons' });
  } else if (parts[1] === 'notifications') {
    breadcrumbs.push({ label: 'Notifications', path: '/platform-admin' });
    if (parts[2] === 'dlq') {
      breadcrumbs.push({ label: 'Dead Letter Queue' });
    }
  } else if (parts[1] === 'settings') {
    breadcrumbs.push({ label: 'Platform Settings' });
  }

  return breadcrumbs;
}
