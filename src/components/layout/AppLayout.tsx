import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { StockAlertsDropdown } from '../stock/StockAlertsDropdown';
import { AnnouncementBanner } from '../shared/AnnouncementBanner';
import { NotificationBell } from './NotificationBell';

const routeLabels: Record<string, string> = {
  '': 'Dashboard',
  'cases': 'Cases',
  'invoices': 'Invoices',
  'payments': 'Payments',
  'expenses': 'Expenses',
  'finance': 'Revenue',
  'transactions': 'Transactions',
  'banking': 'Banking',
  'vat-audit': 'VAT & Audit',
  'reports': 'Reports',
  'customers': 'Customers',
  'quotes': 'Quotes',
  'companies': 'Companies',
  'suppliers': 'Suppliers',
  'purchase-orders': 'Purchase Orders',
  'tools': 'Inventory',
  'stock': 'Stock',
  'clone-drives': 'Clone Drives',
  'procedures': 'KB Center',
  'hr': 'Human Resources',
  'payroll': 'Payroll',
  'attendance': 'Attendance',
  'leave': 'Leave Management',
  'timesheets': 'Timesheets',
  'settings': 'Settings',
  'users': 'User Management',
  'integrations': 'Integrations',
  'admin': 'Admin Panel',
  'profile': 'Profile',
  'search': 'Search',
};

const sectionLabels: Record<string, string> = {
  'cases': 'Core Operations',
  'invoices': 'Financial',
  'payments': 'Financial',
  'expenses': 'Financial',
  'finance': 'Financial',
  'transactions': 'Financial',
  'banking': 'Financial',
  'vat-audit': 'Financial',
  'reports': 'Financial',
  'customers': 'Business',
  'quotes': 'Business',
  'companies': 'Business',
  'suppliers': 'Business',
  'purchase-orders': 'Business',
  'tools': 'Resources',
  'stock': 'Resources',
  'clone-drives': 'Resources',
  'procedures': 'Resources',
  'hr': 'Human Resources',
  'payroll': 'Payroll',
  'attendance': 'Employee Management',
  'leave': 'Employee Management',
  'timesheets': 'Employee Management',
  'settings': 'System',
  'users': 'System',
  'integrations': 'System',
  'admin': 'System',
};

function getBreadcrumbs(pathname: string): { label: string; section?: string } {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { label: 'Dashboard' };
  }

  const firstSegment = segments[0];
  const label = routeLabels[firstSegment] || firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1).replace(/-/g, ' ');
  const section = sectionLabels[firstSegment];

  return { label, section };
}

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const { label, section } = getBreadcrumbs(location.pathname);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <AnnouncementBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex-shrink-0 flex items-center px-6 h-14"
          style={{
            background: '#ffffff',
            borderBottom: '1px solid rgb(var(--color-primary) / 0.15)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {section && (
              <>
                <span className="text-[13px] text-slate-400 font-medium truncate">{section}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
              </>
            )}
            <span className="text-[13px] font-semibold text-slate-700 truncate">{label}</span>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <NotificationBell />
            <StockAlertsDropdown />
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
        </div>
      </div>
    </div>
  );
};
