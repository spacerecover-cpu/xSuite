import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { TenantConfigProvider } from './contexts/TenantConfigContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { PortalAuthProvider } from './contexts/PortalAuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { ConfirmProvider } from './hooks/useConfirm';
import { ProtectedRoute } from './components/ProtectedRoute';
import { FeatureRoute } from './components/FeatureRoute';
import { ProtectedPortalRoute } from './components/ProtectedPortalRoute';
import { ProtectedPlatformAdminRoute } from './components/ProtectedPlatformAdminRoute';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PortalLayout } from './components/layout/PortalLayout';
import { PlatformAdminLayout } from './components/layout/PlatformAdminLayout';
import { logger } from './lib/logger';
import { isChunkLoadError } from './lib/chunkError';

function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType<unknown> }>) {
  return lazy(() =>
    factory().catch((error: unknown) => {
      // A failed dynamic import is almost always a stale chunk after a new
      // deploy: the running tab references a content hash that no longer exists
      // on the server. Reload once to pull the fresh index.html + new hashes.
      // The no-store header on index.html (public/_headers) guarantees the
      // reload itself isn't served from a stale edge/browser cache.
      if (isChunkLoadError(error)) {
        const key = 'chunk_reload_at';
        const last = Number(sessionStorage.getItem(key) || 0);
        const now = Date.now();
        // Throttle to once per 20s so a genuinely broken deploy can't trap the
        // user in a reload loop; after that we fall through to the ErrorBoundary,
        // which shows a clear "new version available" recovery screen.
        if (now - last > 20000) {
          sessionStorage.setItem(key, String(now));
          window.location.reload();
          // Keep Suspense pending across the reload instead of flashing the
          // error boundary with a transient import failure.
          return new Promise<{ default: React.ComponentType<unknown> }>(() => {});
        }
      }
      logger.error('Failed to load route chunk', error);
      throw error;
    })
  );
}

const Login = lazyWithRetry(() => import('./pages/auth/Login').then(m => ({ default: m.Login as React.ComponentType<unknown> })));
const OnboardingWizard = lazyWithRetry(() => import('./pages/auth/OnboardingWizard').then(m => ({ default: m.OnboardingWizard as React.ComponentType<unknown> })));
const OnboardingPage = lazyWithRetry(() => import('./pages/onboarding/OnboardingPage').then(m => ({ default: m.OnboardingPage as React.ComponentType<unknown> })));
const Dashboard = lazyWithRetry(() => import('./pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard as React.ComponentType<unknown> })));
const SettingsDashboard = lazyWithRetry(() => import('./pages/settings/SettingsDashboard').then(m => ({ default: m.SettingsDashboard as React.ComponentType<unknown> })));
const CategoryDetail = lazyWithRetry(() => import('./pages/settings/CategoryDetail').then(m => ({ default: m.CategoryDetail as React.ComponentType<unknown> })));
const SystemNumbers = lazyWithRetry(() => import('./pages/settings/SystemNumbers').then(m => ({ default: m.SystemNumbers as React.ComponentType<unknown> })));
const GeneralSettings = lazyWithRetry(() => import('./pages/settings/GeneralSettings').then(m => ({ default: m.GeneralSettings as React.ComponentType<unknown> })));
const AppearanceSettings = lazyWithRetry(() => import('./pages/settings/AppearanceSettings').then(m => ({ default: m.AppearanceSettings as React.ComponentType<unknown> })));
const FeaturesSettings = lazyWithRetry(() => import('./pages/settings/FeaturesSettings').then(m => ({ default: m.FeaturesSettings as React.ComponentType<unknown> })));
const ClientsList = lazyWithRetry(() => import('./pages/clients/ClientsList').then(m => ({ default: m.ClientsList as React.ComponentType<unknown> })));
const CustomersListPage = lazyWithRetry(() => import('./pages/customers/CustomersListPage').then(m => ({ default: m.CustomersListPage as React.ComponentType<unknown> })));
const CustomerProfilePage = lazyWithRetry(() => import('./pages/customers/CustomerProfilePage').then(m => ({ default: m.CustomerProfilePage as React.ComponentType<unknown> })));
const CompaniesListPage = lazyWithRetry(() => import('./pages/companies/CompaniesListPage').then(m => ({ default: m.CompaniesListPage as React.ComponentType<unknown> })));
const CompanyProfilePage = lazyWithRetry(() => import('./pages/companies/CompanyProfilePage').then(m => ({ default: m.CompanyProfilePage as React.ComponentType<unknown> })));
const CasesList = lazyWithRetry(() => import('./pages/cases/CasesList').then(m => ({ default: m.CasesList as React.ComponentType<unknown> })));
const CaseDetail = lazyWithRetry(() => import('./pages/cases/CaseDetail').then(m => ({ default: m.CaseDetail as React.ComponentType<unknown> })));
const CaseReportsHub = lazyWithRetry(() => import('./pages/cases/CaseReportsHub').then(m => ({ default: m.CaseReportsHub as React.ComponentType<unknown> })));
const HRDashboard = lazyWithRetry(() => import('./pages/hr/HRDashboard').then(m => ({ default: m.HRDashboard as React.ComponentType<unknown> })));
const EmployeesList = lazyWithRetry(() => import('./pages/hr/EmployeesList').then(m => ({ default: m.EmployeesList as React.ComponentType<unknown> })));
const EmployeeProfilePage = lazyWithRetry(() => import('./pages/hr/EmployeeProfilePage').then(m => ({ default: m.EmployeeProfilePage as React.ComponentType<unknown> })));
const RecruitmentPage = lazyWithRetry(() => import('./pages/hr/RecruitmentPage').then(m => ({ default: m.RecruitmentPage as React.ComponentType<unknown> })));
const EmployeeOnboardingPage = lazyWithRetry(() => import('./pages/hr/EmployeeOnboardingPage').then(m => ({ default: m.EmployeeOnboardingPage as React.ComponentType<unknown> })));
const PerformanceReviewsPage = lazyWithRetry(() => import('./pages/hr/PerformanceReviewsPage').then(m => ({ default: m.PerformanceReviewsPage as React.ComponentType<unknown> })));
const PayrollDashboard = lazyWithRetry(() => import('./pages/payroll/PayrollDashboard').then(m => ({ default: m.PayrollDashboard as React.ComponentType<unknown> })));
const PayrollHistoryPage = lazyWithRetry(() => import('./pages/payroll/PayrollHistoryPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const ProcessPayrollPage = lazyWithRetry(() => import('./pages/payroll/ProcessPayrollPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const SalaryComponentsPage = lazyWithRetry(() => import('./pages/payroll/SalaryComponentsPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const PayrollPeriodDetailPage = lazyWithRetry(() => import('./pages/payroll/PayrollPeriodDetailPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const PayrollAdjustmentsPage = lazyWithRetry(() => import('./pages/payroll/PayrollAdjustmentsPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const EmployeeLoansPage = lazyWithRetry(() => import('./pages/payroll/EmployeeLoansPage').then(m => ({ default: m.EmployeeLoansPage as React.ComponentType<unknown> })));
const PayrollSettingsPage = lazyWithRetry(() => import('./pages/payroll/PayrollSettingsPage').then(m => ({ default: m.PayrollSettingsPage as React.ComponentType<unknown> })));
const AttendanceDashboard = lazyWithRetry(() => import('./pages/employee-management/AttendanceDashboard').then(m => ({ default: m.AttendanceDashboard as React.ComponentType<unknown> })));
const LeaveManagement = lazyWithRetry(() => import('./pages/employee-management/LeaveManagement').then(m => ({ default: m.LeaveManagement as React.ComponentType<unknown> })));
const TimesheetManagement = lazyWithRetry(() => import('./pages/employee-management/TimesheetManagement').then(m => ({ default: m.TimesheetManagement as React.ComponentType<unknown> })));
const TemplatesDashboard = lazyWithRetry(() => import('./pages/templates/TemplatesDashboard').then(m => ({ default: m.TemplatesDashboard as React.ComponentType<unknown> })));
const TemplateTypeDetail = lazyWithRetry(() => import('./pages/templates/TemplateTypeDetail').then(m => ({ default: m.TemplateTypeDetail as React.ComponentType<unknown> })));
const AccountingLocales = lazyWithRetry(() => import('./pages/settings/AccountingLocales').then(m => ({ default: m.AccountingLocales as React.ComponentType<unknown> })));
const CurrencySettings = lazyWithRetry(() => import('./pages/settings/CurrencySettings').then(m => ({ default: m.CurrencySettings as React.ComponentType<unknown> })));
const ClientPortalSettings = lazyWithRetry(() => import('./pages/settings/ClientPortalSettings').then(m => ({ default: m.ClientPortalSettings as React.ComponentType<unknown> })));
const ImportExport = lazyWithRetry(() => import('./pages/settings/ImportExport').then(m => ({ default: m.ImportExport as React.ComponentType<unknown> })));
const ReportSectionsPage = lazyWithRetry(() => import('./pages/settings/ReportSectionsPage').then(m => ({ default: m.ReportSectionsPage as React.ComponentType<unknown> })));
const BillingPage = lazyWithRetry(() => import('./pages/settings/BillingPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const PlansPage = lazyWithRetry(() => import('./pages/settings/PlansPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const SecuritySettingsPage = lazyWithRetry(() => import('./pages/settings/SecuritySettingsPage').then(m => ({ default: m.SecuritySettingsPage as React.ComponentType<unknown> })));
const GDPRCompliancePage = lazyWithRetry(() => import('./pages/settings/GDPRCompliancePage').then(m => ({ default: m.GDPRCompliancePage as React.ComponentType<unknown> })));
const NotificationPreferences = lazyWithRetry(() => import('./pages/settings/NotificationPreferences').then(m => ({ default: m.NotificationPreferences as React.ComponentType<unknown> })));
const NotificationsHistory = lazyWithRetry(() => import('./pages/notifications/NotificationsHistory').then(m => ({ default: m.NotificationsHistory as React.ComponentType<unknown> })));

const PortalLogin = lazyWithRetry(() => import('./pages/portal/PortalLogin').then(m => ({ default: m.PortalLogin as React.ComponentType<unknown> })));
const PortalDashboard = lazyWithRetry(() => import('./pages/portal/PortalDashboard').then(m => ({ default: m.PortalDashboard as React.ComponentType<unknown> })));
const PortalCases = lazyWithRetry(() => import('./pages/portal/PortalCases').then(m => ({ default: m.PortalCases as React.ComponentType<unknown> })));
const PortalQuotes = lazyWithRetry(() => import('./pages/portal/PortalQuotes').then(m => ({ default: m.PortalQuotes as React.ComponentType<unknown> })));
const PortalReports = lazyWithRetry(() => import('./pages/portal/PortalReports').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const PortalCommunications = lazyWithRetry(() => import('./pages/portal/PortalCommunications').then(m => ({ default: m.PortalCommunications as React.ComponentType<unknown> })));
const PortalSettings = lazyWithRetry(() => import('./pages/portal/PortalSettings').then(m => ({ default: m.PortalSettings as React.ComponentType<unknown> })));
const PortalPurchasesPage = lazyWithRetry(() => import('./pages/portal/PortalPurchasesPage').then(m => ({ default: m.PortalPurchasesPage as React.ComponentType<unknown> })));
const PortalPayments = lazyWithRetry(() => import('./pages/portal/PortalPayments').then(m => ({ default: m.PortalPayments as React.ComponentType<unknown> })));

const KBCenterPage = lazyWithRetry(() => import('./pages/kb/KBCenterPage').then(m => ({ default: m.KBCenterPage as React.ComponentType<unknown> })));
const KBArticleDetailPage = lazyWithRetry(() => import('./pages/kb/KBArticleDetailPage').then(m => ({ default: m.KBArticleDetailPage as React.ComponentType<unknown> })));

const PrintReceiptPage = lazyWithRetry(() => import('./pages/print/PrintReceiptPage').then(m => ({ default: m.PrintReceiptPage as React.ComponentType<unknown> })));
const PrintLabelPage = lazyWithRetry(() => import('./pages/print/PrintLabelPage').then(m => ({ default: m.PrintLabelPage as React.ComponentType<unknown> })));
const PrintCustomerCopyPage = lazyWithRetry(() => import('./pages/print/PrintCustomerCopyPage').then(m => ({ default: m.PrintCustomerCopyPage as React.ComponentType<unknown> })));
const PrintCheckoutPage = lazyWithRetry(() => import('./pages/print/PrintCheckoutPage').then(m => ({ default: m.PrintCheckoutPage as React.ComponentType<unknown> })));
const PrintPaymentReceiptPage = lazyWithRetry(() => import('./pages/print/PrintPaymentReceiptPage').then(m => ({ default: m.PrintPaymentReceiptPage as React.ComponentType<unknown> })));

const UserManagement = lazyWithRetry(() => import('./pages/users/UserManagement').then(m => ({ default: m.UserManagement as React.ComponentType<unknown> })));
const UserProfile = lazyWithRetry(() => import('./pages/users/UserProfile').then(m => ({ default: m.UserProfile as React.ComponentType<unknown> })));
const AdminPanel = lazyWithRetry(() => import('./pages/admin/AdminPanel').then(m => ({ default: m.AdminPanel as React.ComponentType<unknown> })));
const SystemLogs = lazyWithRetry(() => import('./pages/admin/SystemLogs').then(m => ({ default: m.SystemLogs as React.ComponentType<unknown> })));
const AuditTrails = lazyWithRetry(() => import('./pages/admin/AuditTrails').then(m => ({ default: m.AuditTrails as React.ComponentType<unknown> })));
const DatabaseManagement = lazyWithRetry(() => import('./pages/admin/DatabaseManagement').then(m => ({ default: m.DatabaseManagement as React.ComponentType<unknown> })));
const RolePermissions = lazyWithRetry(() => import('./pages/admin/RolePermissions').then(m => ({ default: m.RolePermissions as React.ComponentType<unknown> })));
const TenantManagement = lazyWithRetry(() => import('./pages/admin/TenantManagement').then(m => ({ default: m.TenantManagement as React.ComponentType<unknown> })));
const CloneDrivesList = lazyWithRetry(() => import('./pages/resources/CloneDrivesList').then(m => ({ default: m.CloneDrivesList as React.ComponentType<unknown> })));
const StockListPage = lazyWithRetry(() => import('./pages/stock/StockListPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const StockItemDetail = lazyWithRetry(() => import('./pages/stock/StockItemDetail').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const StockCategoriesPage = lazyWithRetry(() => import('./pages/stock/StockCategoriesPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const StockSalesPage = lazyWithRetry(() => import('./pages/stock/StockSalesPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const StockSaleDetailPage = lazyWithRetry(() => import('./pages/stock/StockSaleDetailPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const StockAdjustmentsPage = lazyWithRetry(() => import('./pages/stock/StockAdjustmentsPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const StockReportsPage = lazyWithRetry(() => import('./pages/stock/StockReportsPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const StockLocationsPage = lazyWithRetry(() => import('./pages/stock/StockLocationsPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const InventoryListPage = lazyWithRetry(() => import('./pages/inventory/InventoryListPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const InventoryFormPage = lazyWithRetry(() => import('./pages/inventory/InventoryFormPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const DonorSearchPage = lazyWithRetry(() => import('./pages/inventory/DonorSearchPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));

const InvoicesListPage = lazyWithRetry(() => import('./pages/financial/InvoicesListPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const InvoiceDetailPage = lazyWithRetry(() => import('./pages/financial/InvoiceDetailPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const PaymentsList = lazyWithRetry(() => import('./pages/financial/PaymentsList').then(m => ({ default: m.PaymentsList as React.ComponentType<unknown> })));
const ExpensesList = lazyWithRetry(() => import('./pages/financial/ExpensesList').then(m => ({ default: m.ExpensesList as React.ComponentType<unknown> })));
const RevenueDashboard = lazyWithRetry(() => import('./pages/financial/RevenueDashboard').then(m => ({ default: m.RevenueDashboard as React.ComponentType<unknown> })));
const TransactionsList = lazyWithRetry(() => import('./pages/financial/TransactionsList').then(m => ({ default: m.TransactionsList as React.ComponentType<unknown> })));
const BankingPage = lazyWithRetry(() => import('./pages/financial/BankingPage').then(m => ({ default: m.BankingPage as React.ComponentType<unknown> })));
const VATAuditPage = lazyWithRetry(() => import('./pages/financial/VATAuditPage').then(m => ({ default: m.VATAuditPage as React.ComponentType<unknown> })));
const ReportsDashboard = lazyWithRetry(() => import('./pages/financial/ReportsDashboard').then(m => ({ default: m.ReportsDashboard as React.ComponentType<unknown> })));

const QuotesListPage = lazyWithRetry(() => import('./pages/quotes/QuotesListPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const QuoteDetailPage = lazyWithRetry(() => import('./pages/quotes/QuoteDetailPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const QuotesRecycleBin = lazyWithRetry(() => import('./pages/quotes/QuotesRecycleBin').then(m => ({ default: m.default as React.ComponentType<unknown> })));

const SuppliersListPage = lazyWithRetry(() => import('./pages/suppliers/SuppliersListPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const SupplierProfilePage = lazyWithRetry(() => import('./pages/suppliers/SupplierProfilePage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const PurchaseOrdersListPage = lazyWithRetry(() => import('./pages/suppliers/PurchaseOrdersListPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));
const PurchaseOrderDetailPage = lazyWithRetry(() => import('./pages/suppliers/PurchaseOrderDetailPage').then(m => ({ default: m.default as React.ComponentType<unknown> })));

const PlatformDashboard = lazyWithRetry(() => import('./pages/platform-admin/PlatformDashboard').then(m => ({ default: m.PlatformDashboard as React.ComponentType<unknown> })));
const TenantsListPage = lazyWithRetry(() => import('./pages/platform-admin/TenantsListPage').then(m => ({ default: m.TenantsListPage as React.ComponentType<unknown> })));
const TenantDetailPage = lazyWithRetry(() => import('./pages/platform-admin/TenantDetailPage').then(m => ({ default: m.TenantDetailPage as React.ComponentType<unknown> })));
const SupportTicketsPage = lazyWithRetry(() => import('./pages/platform-admin/SupportTicketsPage').then(m => ({ default: m.SupportTicketsPage as React.ComponentType<unknown> })));
const TicketDetailPage = lazyWithRetry(() => import('./pages/platform-admin/TicketDetailPage').then(m => ({ default: m.TicketDetailPage as React.ComponentType<unknown> })));
const AnnouncementsPage = lazyWithRetry(() => import('./pages/platform-admin/AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage as React.ComponentType<unknown> })));
const TenantIsolationTestPage = lazyWithRetry(() => import('./pages/platform-admin/TenantIsolationTestPage').then(m => ({ default: m.TenantIsolationTestPage as React.ComponentType<unknown> })));
const RateLimitDashboardPage = lazyWithRetry(() => import('./pages/platform-admin/RateLimitDashboardPage').then(m => ({ default: m.RateLimitDashboardPage as React.ComponentType<unknown> })));
const PlatformSettingsPage = lazyWithRetry(() => import('./pages/platform-admin/PlatformSettingsPage').then(m => ({ default: m.PlatformSettingsPage as React.ComponentType<unknown> })));
const PlansManagementPage = lazyWithRetry(() => import('./pages/platform-admin/PlansManagementPage').then(m => ({ default: m.PlansManagementPage as React.ComponentType<unknown> })));
const PlanDetailPage = lazyWithRetry(() => import('./pages/platform-admin/PlanDetailPage').then(m => ({ default: m.PlanDetailPage as React.ComponentType<unknown> })));
const CouponsManagementPage = lazyWithRetry(() => import('./pages/platform-admin/CouponsManagementPage').then(m => ({ default: m.CouponsManagementPage as React.ComponentType<unknown> })));
const NotificationDLQ = lazyWithRetry(() => import('./pages/platform-admin/NotificationDLQ').then(m => ({ default: m.NotificationDLQ as React.ComponentType<unknown> })));

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
      <p className="text-slate-600 mt-4">Loading...</p>
    </div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          className: '',
          style: {
            background: 'transparent',
            padding: 0,
            boxShadow: 'none',
          },
        }}
        containerStyle={{
          top: '20px',
          right: '20px',
        }}
      />
      <AuthProvider>
        <TenantConfigProvider>
        <ThemeProvider>
        <LocaleProvider>
        <PermissionsProvider>
          <PortalAuthProvider>
            <ConfirmProvider>
            <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup/tenant" element={<OnboardingWizard />} />
              <Route path="/signup" element={<Navigate to="/signup/tenant" replace />} />
              <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

              <Route path="/health" element={
                <div style={{ padding: '20px', fontFamily: 'monospace' }}>
                  <h1>OK</h1>
                  <p>Status: healthy</p>
                  <p>Timestamp: {new Date().toISOString()}</p>
                </div>
              } />

              <Route path="/portal/login" element={<PortalLogin />} />

              <Route path="/print/receipt/:caseId" element={<ProtectedRoute><PrintReceiptPage /></ProtectedRoute>} />
              <Route path="/print/label/:caseId" element={<ProtectedRoute><PrintLabelPage /></ProtectedRoute>} />
              <Route path="/print/customer-copy/:caseId" element={<ProtectedRoute><PrintCustomerCopyPage /></ProtectedRoute>} />
              <Route path="/print/checkout/:caseId" element={<ProtectedRoute><PrintCheckoutPage /></ProtectedRoute>} />
              <Route path="/print/payment-receipt/:paymentId" element={<ProtectedRoute><PrintPaymentReceiptPage /></ProtectedRoute>} />

              <Route
                path="/portal"
                element={
                  <ProtectedPortalRoute>
                    <ErrorBoundary>
                      <PortalLayout />
                    </ErrorBoundary>
                  </ProtectedPortalRoute>
                }
              >
                <Route path="dashboard" element={<PortalDashboard />} />
                <Route path="cases" element={<PortalCases />} />
                <Route path="quotes" element={<PortalQuotes />} />
                <Route path="reports" element={<PortalReports />} />
                <Route path="purchases" element={<PortalPurchasesPage />} />
                <Route path="payments" element={<PortalPayments />} />
                <Route path="communications" element={<PortalCommunications />} />
                <Route path="settings" element={<PortalSettings />} />
                <Route index element={<Navigate to="/portal/dashboard" replace />} />
              </Route>

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <AppLayout />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            >
            <Route index element={<Dashboard />} />
            <Route path="notifications" element={<NotificationsHistory />} />
            <Route path="cases" element={<CasesList />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="case-reports" element={<CaseReportsHub />} />
            <Route path="clients" element={<ClientsList />} />
            <Route path="customers" element={<CustomersListPage />} />
            <Route path="customers/:id" element={<CustomerProfilePage />} />
            <Route path="companies" element={<CompaniesListPage />} />
            <Route path="companies/:id" element={<CompanyProfilePage />} />
            <Route
              path="suppliers"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <SuppliersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="suppliers/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <SupplierProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="purchase-orders"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <PurchaseOrdersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="purchase-orders/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <PurchaseOrderDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path="quotes" element={<QuotesListPage />} />
            <Route path="quotes/recycle-bin" element={<QuotesRecycleBin />} />
            <Route path="quotes/:id" element={<QuoteDetailPage />} />
            {/* Assets route removed - not yet implemented */}
            <Route path="stock" element={<StockListPage />} />
            <Route path="stock/categories" element={<StockCategoriesPage />} />
            <Route path="stock/sales" element={<StockSalesPage />} />
            <Route path="stock/sales/:id" element={<StockSaleDetailPage />} />
            <Route path="stock/adjustments" element={<StockAdjustmentsPage />} />
            <Route path="stock/reports" element={<StockReportsPage />} />
            <Route path="stock/locations" element={<StockLocationsPage />} />
            <Route path="stock/:id" element={<StockItemDetail />} />
            <Route path="inventory" element={<InventoryListPage />} />
            <Route path="inventory/new" element={<InventoryFormPage />} />
            <Route path="inventory/donor-search" element={<DonorSearchPage />} />
            <Route path="tools" element={<InventoryListPage />} />
            <Route path="clone-drives" element={<CloneDrivesList />} />
            <Route path="procedures" element={<KBCenterPage />} />
            <Route path="procedures/:id" element={<KBArticleDetailPage />} />
            <Route
              path="finance"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <RevenueDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="invoices"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <FeatureRoute featureKey="nav.financial">
                    <InvoicesListPage />
                  </FeatureRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="invoices/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <InvoiceDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="payments"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <FeatureRoute featureKey="nav.financial">
                    <PaymentsList />
                  </FeatureRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="expenses"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <FeatureRoute featureKey="nav.financial">
                    <ExpensesList />
                  </FeatureRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="transactions"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <TransactionsList />
                </ProtectedRoute>
              }
            />
            <Route
              path="banking"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <BankingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="vat-audit"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <VATAuditPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                  <FeatureRoute featureKey="nav.financial">
                    <ReportsDashboard />
                  </FeatureRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="users"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin']}>
                  <UserManagement />
                </ProtectedRoute>
              }
            />
            <Route path="profile" element={<UserProfile />} />
            {/* Integrations route removed - not yet implemented */}

            <Route path="hr">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <HRDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="employees"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <EmployeesList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="employees/:id"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <EmployeeProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="recruitment"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <RecruitmentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="onboarding"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <EmployeeOnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="performance"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <PerformanceReviewsPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="payroll">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <PayrollDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="process"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <ProcessPayrollPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="components"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <SalaryComponentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="history"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <PayrollHistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="periods/:id"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <PayrollPeriodDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="adjustments"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <PayrollAdjustmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="loans"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <EmployeeLoansPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <PayrollSettingsPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="attendance">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <AttendanceDashboard />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="leave">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <LeaveManagement />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="timesheets">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'hr']}>
                    <TimesheetManagement />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="templates">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <TemplatesDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="type/:typeCode"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <TemplateTypeDetail />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="settings">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <SettingsDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="general-settings"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <GeneralSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="appearance"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <AppearanceSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="features"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <FeaturesSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="system-numbers"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <SystemNumbers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="localization"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <AccountingLocales />
                  </ProtectedRoute>
                }
              />
              <Route
                path="currencies"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <CurrencySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="client-portal"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <ClientPortalSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="import-export"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin', 'accounts']}>
                    <ImportExport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="billing"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <BillingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="plans"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <PlansPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="report-sections"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <ReportSectionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="security"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <SecuritySettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="gdpr"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <GDPRCompliancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="notifications"
                element={<NotificationPreferences />}
              />
              <Route
                path=":categoryId"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <CategoryDetail />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="admin">
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />
              <Route
                path="logs"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <SystemLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <AuditTrails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="database"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <DatabaseManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="role-permissions"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <RolePermissions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="tenants"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <TenantManagement />
                  </ProtectedRoute>
                }
              />
            </Route>
            {/* Search route removed - not yet implemented */}
          </Route>

          <Route
            path="/platform-admin"
            element={
              <ProtectedPlatformAdminRoute>
                <ErrorBoundary>
                  <PlatformAdminLayout />
                </ErrorBoundary>
              </ProtectedPlatformAdminRoute>
            }
          >
            <Route index element={<PlatformDashboard />} />
            <Route path="tenants" element={<TenantsListPage />} />
            <Route path="tenants/:id" element={<TenantDetailPage />} />
            <Route path="tickets" element={<SupportTicketsPage />} />
            <Route path="tickets/:id" element={<TicketDetailPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="settings" element={<PlatformSettingsPage />} />
            <Route path="plans" element={<PlansManagementPage />} />
            <Route path="plans/:id" element={<PlanDetailPage />} />
            <Route path="coupons" element={<CouponsManagementPage />} />
            <Route path="isolation-tests" element={<TenantIsolationTestPage />} />
            <Route path="rate-limits" element={<RateLimitDashboardPage />} />
            <Route path="notifications/dlq" element={<NotificationDLQ />} />
          </Route>

              <Route path="*" element={
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
                  <p className="text-lg text-gray-600 mb-6">Page not found</p>
                  <a href="/" className="text-primary hover:text-primary/80 font-medium">Go back to dashboard</a>
                </div>
              } />
            </Routes>
          </Suspense>
            </ConfirmProvider>
          </PortalAuthProvider>
        </PermissionsProvider>
        </LocaleProvider>
        </ThemeProvider>
        </TenantConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
