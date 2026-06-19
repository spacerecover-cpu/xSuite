import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTenantFeatures } from '../../contexts/TenantConfigContext';
import { useSidebarPreferences } from '../../contexts/SidebarPreferencesContext';
import { useLocale } from '../../contexts/LocaleContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Building2,
  FileText,
  Receipt,
  Package,
  Wrench,
  Calendar,
  BookOpen,
  TrendingUp,
  CreditCard,
  Landmark,
  BarChart3,
  Settings,
  UserCog,
  Shield,
  FileStack,
  HardDrive,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Truck,
  LifeBuoy,
  ShoppingCart,
  Wallet,
  ArrowLeftRight,
  FileCheck,
  UserCheck,
  ClipboardList,
  CalendarCheck,
  Timer as TimerIcon,
  UserPlus as UserPlusIcon,
  Layers,
  DollarSign as DollarSignIcon,
  Briefcase,
  Copy,
  CircleDollarSign,
  Boxes,
  Banknote,
  CalendarClock,
  SlidersHorizontal,
} from 'lucide-react';
import { SidebarSection } from './SidebarSection';
import { ProtectedSidebarNavItem } from './ProtectedSidebarNavItem';
import { Tooltip } from '../ui/Tooltip';
import { useSidebarBadges } from '../../hooks/useSidebarBadges';

interface SidebarProps {
  /** 'docked' = the persistent desktop rail; 'drawer' = inside the mobile off-canvas panel. */
  mode?: 'docked' | 'drawer';
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export const Sidebar: React.FC<SidebarProps> = ({ mode = 'docked' }) => {
  const { profile, signOut } = useAuth();
  const { hasModuleAccess } = usePermissions();
  const { isEnabled } = useTenantFeatures();
  const { casesTodayCount, invoicesAttentionCount, pendingQuotesCount, lowStockCount } = useSidebarBadges();
  const { position, isCollapsed, toggleCollapsed, expandedSection, setExpandedSection } = useSidebarPreferences();
  const { locale } = useLocale();
  const navigate = useNavigate();

  // ≥1024 honors the saved collapse preference; 768–1023 forces the icon rail
  // (without clobbering the stored value); the drawer always renders expanded.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const collapsed = mode === 'drawer' ? false : isCollapsed || !isDesktop;
  const showToggle = mode === 'docked' && isDesktop;

  const handleSectionToggle = (sectionName: string, sectionCollapsed: boolean) => {
    setExpandedSection(sectionCollapsed ? null : sectionName);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Sidebar side is a per-user, physical preference. The first flex child sits on
  // the inline-start edge — left in LTR, right in RTL — so push the sidebar to
  // order-last only when the wanted physical side differs from that edge.
  const isRTL = locale === 'ar';
  const isRight = position === 'right';
  const orderLast = isRTL ? !isRight : isRight;
  const tooltipSide = isRight ? 'left' : 'right';
  const CollapseChevron = isRight
    ? (collapsed ? ChevronLeft : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';
  const canViewFinance = (hasModuleAccess('invoices') || hasModuleAccess('payments')) && isEnabled('nav.financial');
  const canViewClients = (hasModuleAccess('customers') || hasModuleAccess('companies')) && isEnabled('nav.business');
  const canViewLab = (hasModuleAccess('inventory') || hasModuleAccess('stock') || hasModuleAccess('clone-drives')) && isEnabled('nav.resources');
  const canViewHR = (hasModuleAccess('hr-dashboard') || hasModuleAccess('employees')) && isEnabled('nav.hr');

  const getRoleAvatarBg = (role?: string) => {
    switch (role) {
      case 'admin': return 'from-cat-6 to-cat-6/80';
      case 'technician': return 'from-cat-2 to-cat-2/80';
      case 'sales': return 'from-cat-3 to-cat-3/80';
      case 'accounts': return 'from-cat-4 to-cat-4/80';
      case 'hr': return 'from-cat-1 to-cat-1/80';
      default: return 'from-cat-7 to-cat-7/80';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const body = (
    <div className={`flex flex-col h-full ${collapsed ? 'items-center' : ''}`}>
      {/* Brand Header */}
      <div className={`relative border-b border-primary/15 ${collapsed ? 'px-3 py-4' : 'px-5 py-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3.5'}`}>
          <div className="flex items-center justify-center flex-shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground ring-1 ring-primary/30 shadow-md">
            <HardDrive className="w-5 h-5" strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight leading-tight text-slate-900">DataRecovery</h1>
              <p className="mt-0.5 text-xxs font-medium uppercase tracking-[0.16em] text-slate-400">Professional Suite</p>
            </div>
          )}
        </div>

        {showToggle && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`absolute top-1/2 -translate-y-1/2 ${isRight ? 'left-3' : 'right-3'} w-6 h-6 flex items-center justify-center rounded-lg bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700 transition-colors ${FOCUS_RING}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <CollapseChevron className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Primary" className={`flex-1 min-h-0 overflow-y-auto w-full ${collapsed ? 'px-2' : 'px-3'} py-2`}>
        <SidebarSection title="Core Operations" isCollapsed={collapsed} alwaysExpanded>
          <ProtectedSidebarNavItem to="/" icon={LayoutDashboard} label="Dashboard" isCollapsed={collapsed} />
          <ProtectedSidebarNavItem
            to="/cases"
            icon={FolderOpen}
            label="Cases"
            badge={casesTodayCount > 0 ? casesTodayCount : undefined}
            badgeColor="blue"
            isCollapsed={collapsed}
          />
          <ProtectedSidebarNavItem to="/case-reports" icon={FileText} label="Case Reports" isCollapsed={collapsed} />
        </SidebarSection>

        {canViewFinance && (
          <SidebarSection
            title="Financial"
            defaultCollapsed={expandedSection !== 'financial'}
            onToggle={(c) => handleSectionToggle('financial', c)}
            isCollapsed={collapsed}
            icon={CircleDollarSign}
          >
            <ProtectedSidebarNavItem
              to="/invoices"
              icon={Receipt}
              label="Invoices"
              badge={invoicesAttentionCount > 0 ? invoicesAttentionCount : undefined}
              badgeColor="blue"
              isCollapsed={collapsed}
            />
            <ProtectedSidebarNavItem to="/payments" icon={CreditCard} label="Payments" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/expenses" icon={Wallet} label="Expenses" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/finance" icon={TrendingUp} label="Revenue" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/transactions" icon={ArrowLeftRight} label="Transactions" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/banking" icon={Landmark} label="Banking" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/vat-audit" icon={FileCheck} label="VAT & Audit" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/reports" icon={BarChart3} label="Financial Reports" isCollapsed={collapsed} />
          </SidebarSection>
        )}

        {canViewClients && (
          <SidebarSection
            title="Business"
            defaultCollapsed={expandedSection !== 'business'}
            onToggle={(c) => handleSectionToggle('business', c)}
            isCollapsed={collapsed}
            icon={Briefcase}
          >
            <ProtectedSidebarNavItem to="/customers" icon={Users} label="Customers" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem
              to="/quotes"
              icon={FileText}
              label="Quotes"
              badge={pendingQuotesCount > 0 ? pendingQuotesCount : undefined}
              badgeColor="green"
              isCollapsed={collapsed}
            />
            <ProtectedSidebarNavItem to="/companies" icon={Building2} label="Companies" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/suppliers" icon={Truck} label="Suppliers" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/purchase-orders" icon={ShoppingCart} label="Purchase Orders" isCollapsed={collapsed} />
          </SidebarSection>
        )}

        {canViewLab && (
          <SidebarSection
            title="Resources"
            defaultCollapsed={expandedSection !== 'resources'}
            onToggle={(c) => handleSectionToggle('resources', c)}
            isCollapsed={collapsed}
            icon={Boxes}
          >
            <ProtectedSidebarNavItem to="/tools" icon={Wrench} label="Inventory" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem
              to="/stock"
              icon={Package}
              label="Stock"
              badge={lowStockCount > 0 ? lowStockCount : undefined}
              badgeColor="orange"
              isCollapsed={collapsed}
            />
            <ProtectedSidebarNavItem to="/clone-drives" icon={Copy} label="Clone Drives" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/procedures" icon={BookOpen} label="KB Center" isCollapsed={collapsed} />
          </SidebarSection>
        )}

        {canViewHR && (
          <SidebarSection
            title="Human Resources"
            defaultCollapsed={expandedSection !== 'hr'}
            onToggle={(c) => handleSectionToggle('hr', c)}
            isCollapsed={collapsed}
            icon={Users}
          >
            <ProtectedSidebarNavItem to="/hr" icon={UserCheck} label="HR Dashboard" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/hr/employees" icon={Users} label="Employees" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/hr/recruitment" icon={Briefcase} label="Recruitment" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/hr/onboarding" icon={UserPlusIcon} label="Onboarding" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/hr/performance" icon={TrendingUp} label="Performance" isCollapsed={collapsed} />
          </SidebarSection>
        )}

        {canViewHR && (
          <SidebarSection
            title="Payroll"
            defaultCollapsed={expandedSection !== 'payroll'}
            onToggle={(c) => handleSectionToggle('payroll', c)}
            isCollapsed={collapsed}
            icon={Banknote}
          >
            <ProtectedSidebarNavItem to="/payroll" icon={DollarSignIcon} label="Payroll Dashboard" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/payroll/process" icon={Calendar} label="Process Payroll" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/payroll/components" icon={Layers} label="Salary Components" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/payroll/history" icon={ClipboardList} label="History" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/payroll/adjustments" icon={TrendingUp} label="Adjustments" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/payroll/loans" icon={Wallet} label="Loans" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/payroll/settings" icon={Settings} label="Settings" isCollapsed={collapsed} />
          </SidebarSection>
        )}

        {canViewHR && (
          <SidebarSection
            title="Employee Management"
            defaultCollapsed={expandedSection !== 'employee'}
            onToggle={(c) => handleSectionToggle('employee', c)}
            isCollapsed={collapsed}
            icon={CalendarClock}
          >
            <ProtectedSidebarNavItem to="/attendance" icon={CalendarCheck} label="Attendance" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/leave" icon={Calendar} label="Leave Management" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/timesheets" icon={TimerIcon} label="Timesheets" isCollapsed={collapsed} />
          </SidebarSection>
        )}

        {isAdmin && (
          <SidebarSection
            title="System"
            defaultCollapsed={expandedSection !== 'system'}
            onToggle={(c) => handleSectionToggle('system', c)}
            isCollapsed={collapsed}
            icon={SlidersHorizontal}
          >
            <ProtectedSidebarNavItem to="/settings" icon={Settings} label="Settings" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/settings/documents" icon={FileStack} label="Documents" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/users" icon={UserCog} label="User Management" isCollapsed={collapsed} />
            <ProtectedSidebarNavItem to="/admin" icon={Shield} label="Admin Panel" isCollapsed={collapsed} />
          </SidebarSection>
        )}
      </nav>

      {/* Footer */}
      <div className="w-full border-t border-primary/15">
        {/* Help button */}
        <div className={collapsed ? 'px-2 py-2' : 'px-3 py-2'}>
          {(() => {
            const helpButton = (
              <button
                type="button"
                onClick={() => navigate('/procedures')}
                className={`group flex items-center rounded-lg text-slate-700 hover:bg-primary/[0.06] hover:text-primary transition-colors ${FOCUS_RING} ${
                  collapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-3 px-2.5 h-9'
                }`}
                aria-label="Help & Support"
              >
                <LifeBuoy className="w-[18px] h-[18px] flex-shrink-0 text-slate-500 group-hover:text-primary" strokeWidth={1.75} />
                {!collapsed && <span className="text-[13px] font-medium tracking-tight">Help &amp; Support</span>}
              </button>
            );
            return collapsed ? (
              <Tooltip label="Help & Support" side={tooltipSide}>
                {helpButton}
              </Tooltip>
            ) : (
              helpButton
            );
          })()}
        </div>

        {/* User card */}
        {profile && (
          <div className={collapsed ? 'px-2 pb-3' : 'px-3 pb-3'}>
            {collapsed ? (
              <div className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className={`w-[34px] h-[34px] rounded-xl bg-gradient-to-br ${getRoleAvatarBg(profile?.role ?? undefined)} flex items-center justify-center text-white font-bold text-sm shadow-md transition-transform hover:scale-105 ${FOCUS_RING}`}
                  title={profile.full_name}
                  aria-label={profile.full_name}
                >
                  {getInitials(profile.full_name)}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className={`absolute -top-1 -right-1 w-5 h-5 bg-danger hover:bg-danger/90 text-danger-foreground rounded-full flex items-center justify-center shadow-lg transition-colors ${FOCUS_RING}`}
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => navigate('/profile')}
                className="group flex items-center gap-3 p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors"
              >
                <div
                  className={`w-[34px] h-[34px] rounded-xl bg-gradient-to-br ${getRoleAvatarBg(profile?.role ?? undefined)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md`}
                >
                  {getInitials(profile.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-semibold tracking-tight leading-tight text-slate-900">
                    {profile.full_name}
                  </p>
                  <span className="inline-block mt-1 px-1.5 py-px text-xxs font-semibold uppercase tracking-wider rounded bg-primary text-primary-foreground">
                    {profile.role}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSignOut();
                  }}
                  className={`ml-auto p-1.5 rounded-lg flex-shrink-0 text-slate-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger-muted hover:text-danger transition-all ${FOCUS_RING}`}
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (mode === 'drawer') {
    return <div className="flex flex-col h-full w-full bg-primary/5">{body}</div>;
  }

  return (
    <aside
      className={`
        ${collapsed ? 'w-[72px]' : 'w-72'}
        ${orderLast ? 'order-last' : ''}
        ${isRight ? 'border-l' : 'border-r'} border-primary/15
        hidden md:flex flex-col flex-shrink-0 relative bg-primary/5
        transition-[width] duration-300 ease-in-out
      `}
    >
      {body}
    </aside>
  );
};
