import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTenantFeatures } from '../../contexts/TenantConfigContext';
import { useSidebarPreferences } from '../../contexts/SidebarPreferencesContext';
import { useLocale } from '../../contexts/LocaleContext';
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
} from 'lucide-react';
import { SidebarSection } from './SidebarSection';
import { ProtectedSidebarNavItem } from './ProtectedSidebarNavItem';
import { useSidebarBadges } from '../../hooks/useSidebarBadges';

export const Sidebar: React.FC = () => {
  const { profile, signOut } = useAuth();
  const { hasModuleAccess } = usePermissions();
  const { isEnabled } = useTenantFeatures();
  const { casesTodayCount, invoicesAttentionCount, pendingQuotesCount, lowStockCount } = useSidebarBadges();
  const { position, isCollapsed, toggleCollapsed, expandedSection, setExpandedSection } = useSidebarPreferences();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [userCardHovered, setUserCardHovered] = useState(false);
  const [helpHovered, setHelpHovered] = useState(false);

  const handleSectionToggle = (sectionName: string, collapsed: boolean) => {
    setExpandedSection(collapsed ? null : sectionName);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Sidebar side is a per-user, physical preference. The first flex child sits on
  // the inline-start edge — left in LTR, right in RTL — so push the sidebar to
  // order-last only when the wanted physical side differs from that edge. The
  // divider, collapse affordance, and chevron all key off the physical side.
  const isRTL = locale === 'ar';
  const isRight = position === 'right';
  const orderLast = isRTL ? !isRight : isRight;
  const CollapseChevron = isRight
    ? (isCollapsed ? ChevronLeft : ChevronRight)
    : (isCollapsed ? ChevronRight : ChevronLeft);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';
  const canViewFinance = (hasModuleAccess('invoices') || hasModuleAccess('payments')) && isEnabled('nav.financial');
  const canViewClients = (hasModuleAccess('customers') || hasModuleAccess('companies')) && isEnabled('nav.business');
  const canViewLab = (hasModuleAccess('inventory') || hasModuleAccess('stock') || hasModuleAccess('clone-drives')) && isEnabled('nav.resources');
  const canViewHR = (hasModuleAccess('hr-dashboard') || hasModuleAccess('employees')) && isEnabled('nav.hr');

  const getRoleColor = (_role?: string) => {
    return { bg: 'rgb(var(--color-primary) / 0.12)', text: 'rgb(var(--color-primary))' };
  };

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

  const roleColors = getRoleColor(profile?.role ?? undefined);

  return (
    <aside
      className={`
        ${isCollapsed ? 'w-[72px]' : 'w-72'}
        ${orderLast ? 'order-last' : ''}
        flex flex-col transition-all duration-300 ease-in-out flex-shrink-0
        relative
      `}
      style={{
        background: 'rgb(var(--color-primary) / 0.05)',
        ...(isRight
          ? { borderLeft: '1px solid rgb(var(--color-primary) / 0.15)' }
          : { borderRight: '1px solid rgb(var(--color-primary) / 0.15)' }),
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div className={`flex flex-col h-full ${isCollapsed ? 'items-center' : ''}`}>

        {/* Brand Header */}
        <div
          className={`${isCollapsed ? 'px-3 py-4' : 'px-5 py-5'} relative`}
          style={{ borderBottom: '1px solid rgb(var(--color-primary) / 0.15)' }}
        >
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3.5'}`}>
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgb(var(--color-primary))',
                boxShadow: '0 0 0 1px rgb(var(--color-primary) / 0.3), 0 4px 12px rgb(var(--color-primary) / 0.25)',
              }}
            >
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <div>
                <h1 style={{ fontSize: '15px', fontWeight: 600, color: '#151E2C', lineHeight: 1.2, letterSpacing: '-0.01em' }}>DataRecovery</h1>
                <p style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b', marginTop: '2px', letterSpacing: '0.02em' }}>Professional Suite</p>
              </div>
            )}
          </div>

          <button
            onClick={toggleCollapsed}
            className={`absolute top-1/2 -translate-y-1/2 ${isRight ? 'left-3' : 'right-3'} w-6 h-6 flex items-center justify-center rounded-lg transition-all duration-200`}
            style={{ background: '#E0E6ED', color: '#64748b' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#D4DCE8';
              (e.currentTarget as HTMLButtonElement).style.color = '#3A4A5C';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#E0E6ED';
              (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
            }}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed}
          >
            <CollapseChevron className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Navigation */}
        <nav
          className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-3'} py-2`}
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 transparent' }}
        >
          <SidebarSection
            title="Core Operations"
            defaultCollapsed={false}
            onToggle={() => {}}
            isCollapsed={isCollapsed}
            alwaysExpanded={true}
          >
            <ProtectedSidebarNavItem
              to="/"
              icon={LayoutDashboard}
              label="Dashboard"
              isCollapsed={isCollapsed}
            />
            <ProtectedSidebarNavItem
              to="/cases"
              icon={FolderOpen}
              label="Cases"
              badge={casesTodayCount > 0 ? casesTodayCount : undefined}
              badgeColor="blue"
              isCollapsed={isCollapsed}
            />
            <ProtectedSidebarNavItem
              to="/case-reports"
              icon={FileText}
              label="Case Reports"
              isCollapsed={isCollapsed}
            />
          </SidebarSection>

          {canViewFinance && (
            <SidebarSection
              title="Financial"
              defaultCollapsed={expandedSection !== 'financial'}
              onToggle={(collapsed) => handleSectionToggle('financial', collapsed)}
              isCollapsed={isCollapsed}
              accentColor="amber"
            >
              <ProtectedSidebarNavItem
                to="/invoices"
                icon={Receipt}
                label="Invoices"
                badge={invoicesAttentionCount > 0 ? invoicesAttentionCount : undefined}
                badgeColor="blue"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/payments"
                icon={CreditCard}
                label="Payments"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/expenses"
                icon={Wallet}
                label="Expenses"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/finance"
                icon={TrendingUp}
                label="Revenue"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/transactions"
                icon={ArrowLeftRight}
                label="Transactions"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/banking"
                icon={Landmark}
                label="Banking"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/vat-audit"
                icon={FileCheck}
                label="VAT & Audit"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/reports"
                icon={BarChart3}
                label="Financial Reports"
                isCollapsed={isCollapsed}
              />
            </SidebarSection>
          )}

          {canViewClients && (
            <SidebarSection
              title="Business"
              defaultCollapsed={expandedSection !== 'business'}
              onToggle={(collapsed) => handleSectionToggle('business', collapsed)}
              isCollapsed={isCollapsed}
              accentColor="emerald"
            >
              <ProtectedSidebarNavItem
                to="/customers"
                icon={Users}
                label="Customers"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/quotes"
                icon={FileText}
                label="Quotes"
                badge={pendingQuotesCount > 0 ? pendingQuotesCount : undefined}
                badgeColor="green"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/companies"
                icon={Building2}
                label="Companies"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/suppliers"
                icon={Truck}
                label="Suppliers"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/purchase-orders"
                icon={ShoppingCart}
                label="Purchase Orders"
                isCollapsed={isCollapsed}
              />
            </SidebarSection>
          )}

          {canViewLab && (
            <SidebarSection
              title="Resources"
              defaultCollapsed={expandedSection !== 'resources'}
              onToggle={(collapsed) => handleSectionToggle('resources', collapsed)}
              isCollapsed={isCollapsed}
              accentColor="teal"
            >
              <ProtectedSidebarNavItem
                to="/tools"
                icon={Wrench}
                label="Inventory"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/stock"
                icon={Package}
                label="Stock"
                badge={lowStockCount > 0 ? lowStockCount : undefined}
                badgeColor="orange"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/clone-drives"
                icon={Copy}
                label="Clone Drives"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/procedures"
                icon={BookOpen}
                label="KB Center"
                isCollapsed={isCollapsed}
              />
            </SidebarSection>
          )}

          {canViewHR && (
            <SidebarSection
              title="Human Resources"
              defaultCollapsed={expandedSection !== 'hr'}
              onToggle={(collapsed) => handleSectionToggle('hr', collapsed)}
              isCollapsed={isCollapsed}
              accentColor="sky"
            >
              <ProtectedSidebarNavItem
                to="/hr"
                icon={UserCheck}
                label="HR Dashboard"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/hr/employees"
                icon={Users}
                label="Employees"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/hr/recruitment"
                icon={Briefcase}
                label="Recruitment"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/hr/onboarding"
                icon={UserPlusIcon}
                label="Onboarding"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/hr/performance"
                icon={TrendingUp}
                label="Performance"
                isCollapsed={isCollapsed}
              />
            </SidebarSection>
          )}

          {canViewHR && (
            <SidebarSection
              title="Payroll"
              defaultCollapsed={expandedSection !== 'payroll'}
              onToggle={(collapsed) => handleSectionToggle('payroll', collapsed)}
              isCollapsed={isCollapsed}
              accentColor="payroll"
            >
              <ProtectedSidebarNavItem
                to="/payroll"
                icon={DollarSignIcon}
                label="Payroll Dashboard"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/payroll/process"
                icon={Calendar}
                label="Process Payroll"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/payroll/components"
                icon={Layers}
                label="Salary Components"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/payroll/history"
                icon={ClipboardList}
                label="History"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/payroll/adjustments"
                icon={TrendingUp}
                label="Adjustments"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/payroll/loans"
                icon={Wallet}
                label="Loans"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/payroll/settings"
                icon={Settings}
                label="Settings"
                isCollapsed={isCollapsed}
              />
            </SidebarSection>
          )}

          {canViewHR && (
            <SidebarSection
              title="Employee Management"
              defaultCollapsed={expandedSection !== 'employee'}
              onToggle={(collapsed) => handleSectionToggle('employee', collapsed)}
              isCollapsed={isCollapsed}
              accentColor="employee"
            >
              <ProtectedSidebarNavItem
                to="/attendance"
                icon={CalendarCheck}
                label="Attendance"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/leave"
                icon={Calendar}
                label="Leave Management"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/timesheets"
                icon={TimerIcon}
                label="Timesheets"
                isCollapsed={isCollapsed}
              />
            </SidebarSection>
          )}

          {isAdmin && (
            <SidebarSection
              title="System"
              defaultCollapsed={expandedSection !== 'system'}
              onToggle={(collapsed) => handleSectionToggle('system', collapsed)}
              isCollapsed={isCollapsed}
              accentColor="slate"
            >
              <ProtectedSidebarNavItem
                to="/settings"
                icon={Settings}
                label="Settings"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/users"
                icon={UserCog}
                label="User Management"
                isCollapsed={isCollapsed}
              />
              <ProtectedSidebarNavItem
                to="/admin"
                icon={Shield}
                label="Admin Panel"
                isCollapsed={isCollapsed}
              />
            </SidebarSection>
          )}
        </nav>

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgb(var(--color-primary) / 0.15)' }}>
          {/* Help button */}
          <div className={`${isCollapsed ? 'px-2 py-2' : 'px-3 py-2'}`}>
            {isCollapsed ? (
              <button
                onClick={() => navigate('/procedures')}
                className="w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-[180ms] mx-auto"
                title="Help & Support"
                style={{ background: 'transparent', color: '#64748b' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#E8ECF2';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgb(var(--color-primary))';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
                }}
              >
                <LifeBuoy className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/procedures')}
                className="w-full flex items-center gap-3 rounded-lg transition-all duration-[180ms]"
                style={{
                  padding: '9px 10px',
                  background: helpHovered ? '#E8ECF2' : 'transparent',
                  borderLeft: `3px solid ${helpHovered ? '#A8C4E8' : 'transparent'}`,
                }}
                onMouseEnter={() => setHelpHovered(true)}
                onMouseLeave={() => setHelpHovered(false)}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0 transition-all duration-[180ms]"
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: helpHovered ? '#D4DCE8' : '#E8ECF2',
                  }}
                >
                  <LifeBuoy
                    style={{
                      width: '13px',
                      height: '13px',
                      strokeWidth: 1.5,
                      color: helpHovered ? 'rgb(var(--color-primary))' : '#6880A0',
                      transition: 'color 0.18s ease',
                    }}
                  />
                </div>
                <span
                  className="font-medium transition-colors duration-[180ms]"
                  style={{ fontSize: '13px', color: helpHovered ? 'rgb(var(--color-primary))' : '#64748b' }}
                >
                  Help & Support
                </span>
              </button>
            )}
          </div>

          {/* User card */}
          {profile && (
            <div className={`${isCollapsed ? 'px-2 pb-3' : 'px-3 pb-3'}`}>
              {isCollapsed ? (
                <div className="relative flex justify-center">
                  <div
                    onClick={() => navigate('/profile')}
                    className={`rounded-xl bg-gradient-to-br ${getRoleAvatarBg(profile?.role ?? undefined)} flex items-center justify-center text-white font-bold text-sm cursor-pointer transition-all duration-200`}
                    style={{ width: '34px', height: '34px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                    title={profile.full_name}
                  >
                    {getInitials(profile.full_name)}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-danger hover:bg-danger/90 text-danger-foreground rounded-full flex items-center justify-center transition-all duration-200 shadow-lg"
                    title="Logout"
                  >
                    <LogOut className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-3 cursor-pointer transition-all duration-[180ms]"
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    background: userCardHovered ? '#DDE4EC' : '#EAEFF4',
                    boxShadow: userCardHovered ? '0 1px 4px rgb(var(--color-primary) / 0.08)' : 'none',
                  }}
                  onMouseEnter={() => setUserCardHovered(true)}
                  onMouseLeave={() => setUserCardHovered(false)}
                >
                  <div
                    className={`rounded-xl bg-gradient-to-br ${getRoleAvatarBg(profile?.role ?? undefined)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
                    style={{ width: '34px', height: '34px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}
                  >
                    {getInitials(profile.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate leading-tight" style={{ fontSize: '13px', fontWeight: 500, color: '#151E2C' }}>
                      {profile.full_name}
                    </p>
                    <span
                      className="inline-block mt-1 uppercase tracking-wider"
                      style={{ fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '4px', background: roleColors.bg, color: roleColors.text }}
                    >
                      {profile.role}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSignOut();
                    }}
                    className="p-1.5 rounded-lg flex-shrink-0"
                    style={{
                      opacity: userCardHovered ? 1 : 0,
                      background: 'transparent',
                      color: '#64748b',
                      transition: 'opacity 0.18s ease, background 0.18s ease, color 0.18s ease',
                      marginLeft: 'auto',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgb(var(--color-danger-muted))';
                      (e.currentTarget as HTMLButtonElement).style.color = 'rgb(var(--color-danger))';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
                    }}
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
