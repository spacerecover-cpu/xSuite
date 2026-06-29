import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Receipt,
  CreditCard,
  Wallet,
  TrendingUp,
  ArrowLeftRight,
  Landmark,
  FileCheck,
  BarChart3,
  Users,
  Building2,
  Truck,
  ShoppingCart,
  Wrench,
  Package,
  Copy,
  BookOpen,
  UserCheck,
  Briefcase,
  UserPlus as UserPlusIcon,
  DollarSign as DollarSignIcon,
  Calendar,
  Layers,
  ClipboardList,
  Settings,
  CalendarCheck,
  Timer as TimerIcon,
  FileStack,
  UserCog,
  Shield,
  CircleDollarSign,
  Boxes,
  Banknote,
  CalendarClock,
  SlidersHorizontal,
} from 'lucide-react';

/** Live badge counters surfaced by `useSidebarBadges`. */
export type SidebarBadgeKey =
  | 'casesTodayCount'
  | 'invoicesAttentionCount'
  | 'pendingQuotesCount'
  | 'lowStockCount';

/** Subset of `ProtectedSidebarNavItem`'s `badgeColor` used by nav badges. */
export type NavBadgeColor = 'blue' | 'green' | 'orange';

export interface NavItemConfig {
  to: string;
  icon: LucideIcon;
  label: string;
  /** When set, the item shows this live counter as a badge (hidden when 0). */
  badgeKey?: SidebarBadgeKey;
  badgeColor?: NavBadgeColor;
  /** Override the route→module mapping `ProtectedSidebarNavItem` derives by default. */
  moduleKey?: string;
}

/** Context a section gate evaluates against — mirrors the Sidebar's hooks. */
export interface NavGateContext {
  isAdmin: boolean;
  hasModuleAccess: (module: string) => boolean;
  isEnabled: (feature: string) => boolean;
}

export interface NavSectionConfig {
  /** Stable key — used for the expanded-section preference AND React keys.
   *  These values are the SAME strings the SidebarPreferences store persists. */
  key: string;
  title: string;
  icon?: LucideIcon;
  /** Core Operations is always visible and always expanded (no collapse toggle). */
  alwaysExpanded?: boolean;
  /** Section-level visibility. Omit for always-visible sections. */
  gate?: (ctx: NavGateContext) => boolean;
  items: NavItemConfig[];
}

/**
 * Single source of truth for the primary sidebar navigation. The Sidebar renders
 * this by `map`; adding/reordering nav lives here, not in JSX. Item-level access
 * is still enforced by `ProtectedSidebarNavItem` (route→module); section gates
 * here mirror the tenant-feature + module checks the Sidebar used inline.
 */
export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    key: 'core',
    title: 'Core Operations',
    alwaysExpanded: true,
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/cases', icon: FolderOpen, label: 'Cases', badgeKey: 'casesTodayCount', badgeColor: 'blue' },
    ],
  },
  {
    key: 'financial',
    title: 'Financial',
    icon: CircleDollarSign,
    gate: ({ hasModuleAccess, isEnabled }) =>
      (hasModuleAccess('invoices') || hasModuleAccess('payments')) && isEnabled('nav.financial'),
    items: [
      { to: '/invoices', icon: Receipt, label: 'Invoices', badgeKey: 'invoicesAttentionCount', badgeColor: 'blue' },
      { to: '/payments', icon: CreditCard, label: 'Payments' },
      { to: '/expenses', icon: Wallet, label: 'Expenses' },
      { to: '/finance', icon: TrendingUp, label: 'Revenue' },
      { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
      { to: '/banking', icon: Landmark, label: 'Banking' },
      { to: '/vat-audit', icon: FileCheck, label: 'VAT & Audit' },
      { to: '/reports', icon: BarChart3, label: 'Financial Reports' },
    ],
  },
  {
    key: 'business',
    title: 'Business',
    icon: Briefcase,
    gate: ({ hasModuleAccess, isEnabled }) =>
      (hasModuleAccess('customers') || hasModuleAccess('companies')) && isEnabled('nav.business'),
    items: [
      { to: '/customers', icon: Users, label: 'Customers' },
      { to: '/quotes', icon: FileText, label: 'Quotes', badgeKey: 'pendingQuotesCount', badgeColor: 'green' },
      { to: '/companies', icon: Building2, label: 'Companies' },
      { to: '/suppliers', icon: Truck, label: 'Suppliers' },
      { to: '/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
    ],
  },
  {
    key: 'resources',
    title: 'Resources',
    icon: Boxes,
    gate: ({ hasModuleAccess, isEnabled }) =>
      (hasModuleAccess('inventory') || hasModuleAccess('stock') || hasModuleAccess('clone-drives')) &&
      isEnabled('nav.resources'),
    items: [
      { to: '/tools', icon: Wrench, label: 'Inventory' },
      { to: '/stock', icon: Package, label: 'Stock', badgeKey: 'lowStockCount', badgeColor: 'orange' },
      { to: '/clone-drives', icon: Copy, label: 'Clone Drives' },
      { to: '/procedures', icon: BookOpen, label: 'KB Center' },
    ],
  },
  {
    key: 'hr',
    title: 'Human Resources',
    icon: Users,
    gate: ({ hasModuleAccess, isEnabled }) =>
      (hasModuleAccess('hr-dashboard') || hasModuleAccess('employees')) && isEnabled('nav.hr'),
    items: [
      { to: '/hr', icon: UserCheck, label: 'HR Dashboard' },
      { to: '/hr/employees', icon: Users, label: 'Employees' },
      { to: '/hr/recruitment', icon: Briefcase, label: 'Recruitment' },
      { to: '/hr/onboarding', icon: UserPlusIcon, label: 'Onboarding' },
      { to: '/hr/performance', icon: TrendingUp, label: 'Performance' },
    ],
  },
  {
    key: 'payroll',
    title: 'Payroll',
    icon: Banknote,
    gate: ({ hasModuleAccess, isEnabled }) =>
      (hasModuleAccess('hr-dashboard') || hasModuleAccess('employees')) && isEnabled('nav.hr'),
    items: [
      { to: '/payroll', icon: DollarSignIcon, label: 'Payroll Dashboard' },
      { to: '/payroll/process', icon: Calendar, label: 'Process Payroll' },
      { to: '/payroll/components', icon: Layers, label: 'Salary Components' },
      { to: '/payroll/history', icon: ClipboardList, label: 'History' },
      { to: '/payroll/adjustments', icon: TrendingUp, label: 'Adjustments' },
      { to: '/payroll/loans', icon: Wallet, label: 'Loans' },
      { to: '/payroll/settings', icon: Settings, label: 'Settings' },
    ],
  },
  {
    key: 'employee',
    title: 'Employee Management',
    icon: CalendarClock,
    gate: ({ hasModuleAccess, isEnabled }) =>
      (hasModuleAccess('hr-dashboard') || hasModuleAccess('employees')) && isEnabled('nav.hr'),
    items: [
      { to: '/attendance', icon: CalendarCheck, label: 'Attendance' },
      { to: '/leave', icon: Calendar, label: 'Leave Management' },
      { to: '/timesheets', icon: TimerIcon, label: 'Timesheets' },
    ],
  },
  {
    key: 'system',
    title: 'System',
    icon: SlidersHorizontal,
    gate: ({ isAdmin }) => isAdmin,
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
      { to: '/settings/documents', icon: FileStack, label: 'Documents' },
      { to: '/users', icon: UserCog, label: 'User Management' },
      { to: '/admin', icon: Shield, label: 'Admin Panel' },
    ],
  },
];
