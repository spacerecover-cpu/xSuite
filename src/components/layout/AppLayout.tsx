import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ContentLoadingFallback } from '../shared/ContentLoadingFallback';
import { ChevronRight, Search, Command, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileNavDrawer } from './MobileNavDrawer';
import { StockAlertsDropdown } from '../stock/StockAlertsDropdown';
import { AnnouncementBanner } from '../shared/AnnouncementBanner';
import { NotificationBell } from './NotificationBell';
import { CommandPalette } from '../shared/CommandPalette';
import { useCommandPalette } from '../../hooks/useCommandPalette';
import { SidebarPreferencesProvider } from '../../contexts/SidebarPreferencesContext';
import { useLocale } from '../../contexts/LocaleContext';
import { HeaderSlotProvider, useHeaderSlot } from '../../contexts/HeaderSlotContext';

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
  'admin': 'Admin Panel',
  'profile': 'Profile',
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

const HeaderCurrentTitle: React.FC<{ routeLabel: string }> = ({ routeLabel }) => {
  const { header } = useHeaderSlot();
  const Icon = header.icon;
  return (
    <span className="flex items-center gap-2 min-w-0">
      {Icon && (
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-md shadow-sm flex-shrink-0"
          style={header.iconColor ? { backgroundColor: header.iconColor } : undefined}
        >
          <Icon className="w-3.5 h-3.5 text-white" />
        </span>
      )}
      <span className="text-[13px] font-semibold text-slate-700 truncate">{header.title ?? routeLabel}</span>
    </span>
  );
};

const HeaderActionsHost: React.FC = () => {
  const { setActionsHost } = useHeaderSlot();
  return <div ref={setActionsHost} className="hidden md:flex items-center gap-2 empty:hidden" />;
};

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const { label, section } = getBreadcrumbs(location.pathname);
  const palette = useCommandPalette();
  const { locale } = useLocale();
  const isRTL = locale === 'ar';
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes (webhook events never
  // cover this — it must be driven off the location).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);
  // Detect platform for the keyboard hint — Mac shows ⌘, others show Ctrl.
  // navigator.platform is deprecated but still the most reliable signal here;
  // userAgentData is gated behind feature detection.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <SidebarPreferencesProvider>
    <HeaderSlotProvider>
    <div className="h-dvh flex flex-col bg-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-modal focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary focus:shadow-lg focus:ring-2 focus:ring-ring focus:outline-none"
      >
        Skip to main content
      </a>
      <AnnouncementBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="flex-shrink-0 flex items-center gap-2 px-4 md:px-6 h-14 bg-surface border-b border-primary/15 shadow-sm">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden -ms-1 inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open navigation menu"
            aria-controls="mobile-nav-drawer"
            aria-expanded={drawerOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {section && (
              <>
                <span className="text-[13px] text-slate-400 font-medium truncate">{section}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
              </>
            )}
            <HeaderCurrentTitle routeLabel={label} />
          </div>
          <div className="flex items-center gap-2 ml-4">
            <HeaderActionsHost />
            {/* Click-target for users who don't know the keyboard shortcut.
                Discoverability matters — power users hit Cmd+K, the rest
                click the button. */}
            <button
              type="button"
              onClick={palette.open}
              className="hidden md:inline-flex items-center gap-2 px-2.5 h-8 rounded-md border border-slate-200 bg-white text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              aria-label="Open command palette"
              title="Search and navigate"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search…</span>
              <kbd className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-500">
                {isMac ? <Command className="w-2.5 h-2.5" /> : 'Ctrl'}
                K
              </kbd>
            </button>
            <NotificationBell />
            <StockAlertsDropdown />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 p-6 overflow-auto focus:outline-none">
          <Suspense fallback={<ContentLoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>
        </div>
      </div>
      <MobileNavDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} side={isRTL ? 'right' : 'left'} />
      <CommandPalette isOpen={palette.isOpen} onClose={palette.close} />
    </div>
    </HeaderSlotProvider>
    </SidebarPreferencesProvider>
  );
};
