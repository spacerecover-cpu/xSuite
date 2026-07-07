import { Suspense } from 'react';
import type { ComponentProps } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Z } from './lib/ui/zIndex';
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
import { RequireTenantWorkspace } from './components/RequireTenantWorkspace';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorFallback } from './components/RouteErrorFallback';
import { NavigationProgress } from './components/layout/NavigationProgress';
import { PortalLayout } from './components/layout/PortalLayout';
import { PlatformAdminLayout } from './components/layout/PlatformAdminLayout';
import { lazyRouteWithRetry as page } from './lib/lazyWithRetry';

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
      <p className="text-slate-600 mt-4">Loading...</p>
    </div>
  </div>
);

type StaffRoles = NonNullable<ComponentProps<typeof ProtectedRoute>['allowedRoles']>;
const FINANCE_ROLES: StaffRoles = ['owner', 'admin', 'accounts'];
const HR_ROLES: StaffRoles = ['owner', 'admin', 'hr'];
const ADMIN_ROLES: StaffRoles = ['owner', 'admin'];

// Root layout route: providers + global chrome. Everything lives under the
// data router so navigation state (useNavigation) is observable app-wide.
function RootLayout() {
  return (
    <>
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
          zIndex: Z.toast,
        }}
      />
      <AuthProvider>
        <TenantConfigProvider>
        <ThemeProvider>
        <LocaleProvider>
        <PermissionsProvider>
          <PortalAuthProvider>
            <ConfirmProvider>
              <NavigationProgress />
              <Suspense fallback={<LoadingFallback />}>
                <Outlet />
              </Suspense>
            </ConfirmProvider>
          </PortalAuthProvider>
        </PermissionsProvider>
        </LocaleProvider>
        </ThemeProvider>
        </TenantConfigProvider>
      </AuthProvider>
    </>
  );
}

// Routes resolve their page chunks via route.lazy: the router downloads the
// chunk DURING navigation (previous page stays interactive, NavigationProgress
// + sidebar pending states show), and the export names below are typechecked
// against each page module.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />} errorElement={<RouteErrorFallback />} hydrateFallbackElement={<LoadingFallback />}>
      <Route path="/login" lazy={page(() => import('./pages/auth/Login'), 'Login')} />
      <Route path="/reset-password" lazy={page(() => import('./pages/auth/ResetPassword'), 'ResetPassword')} />
      <Route path="/signup/tenant" lazy={page(() => import('./pages/auth/OnboardingWizard'), 'OnboardingWizard')} />
      <Route path="/signup" element={<Navigate to="/signup/tenant" replace />} />

      <Route
        path="/health"
        element={
          <div style={{ padding: '20px', fontFamily: 'monospace' }}>
            <h1>OK</h1>
            <p>Status: healthy</p>
            <p>Timestamp: {new Date().toISOString()}</p>
          </div>
        }
      />

      <Route path="/portal/login" lazy={page(() => import('./pages/portal/PortalLogin'), 'PortalLogin')} />

      <Route element={<ProtectedRoute />}>
        <Route element={<RequireTenantWorkspace />}>
          <Route path="/onboarding" lazy={page(() => import('./pages/onboarding/OnboardingPage'), 'OnboardingPage')} />
          <Route path="/print/receipt/:caseId" lazy={page(() => import('./pages/print/PrintReceiptPage'), 'PrintReceiptPage')} />
          <Route path="/print/label/:caseId" lazy={page(() => import('./pages/print/PrintLabelPage'), 'PrintLabelPage')} />
          <Route path="/print/customer-copy/:caseId" lazy={page(() => import('./pages/print/PrintCustomerCopyPage'), 'PrintCustomerCopyPage')} />
          <Route path="/print/checkout/:caseId" lazy={page(() => import('./pages/print/PrintCheckoutPage'), 'PrintCheckoutPage')} />
          <Route path="/print/delivery-challan/:caseId/:batchId" lazy={page(() => import('./pages/print/PrintDeliveryChallanPage'), 'PrintDeliveryChallanPage')} />
          <Route path="/print/payment-receipt/:paymentId" lazy={page(() => import('./pages/print/PrintPaymentReceiptPage'), 'PrintPaymentReceiptPage')} />
        </Route>
      </Route>

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
        <Route path="dashboard" lazy={page(() => import('./pages/portal/PortalDashboard'), 'PortalDashboard')} />
        <Route path="cases" lazy={page(() => import('./pages/portal/PortalCases'), 'PortalCases')} />
        <Route path="quotes" lazy={page(() => import('./pages/portal/PortalQuotes'), 'PortalQuotes')} />
        <Route path="reports" element={<Navigate to="/portal/documents" replace />} />
        <Route path="documents" lazy={page(() => import('./pages/portal/PortalDocuments'), 'PortalDocuments')} />
        <Route path="purchases" lazy={page(() => import('./pages/portal/PortalPurchasesPage'), 'PortalPurchasesPage')} />
        <Route path="payments" lazy={page(() => import('./pages/portal/PortalPayments'), 'PortalPayments')} />
        <Route path="communications" lazy={page(() => import('./pages/portal/PortalCommunications'), 'PortalCommunications')} />
        <Route path="settings" lazy={page(() => import('./pages/portal/PortalSettings'), 'PortalSettings')} />
        <Route index element={<Navigate to="/portal/dashboard" replace />} />
      </Route>

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RequireTenantWorkspace>
              <ErrorBoundary>
                <AppLayout />
              </ErrorBoundary>
            </RequireTenantWorkspace>
          </ProtectedRoute>
        }
      >
        <Route index lazy={page(() => import('./pages/dashboard/Dashboard'), 'Dashboard')} />
        <Route path="notifications" lazy={page(() => import('./pages/notifications/NotificationsHistory'), 'NotificationsHistory')} />
        <Route path="cases" lazy={page(() => import('./pages/cases/CasesList'), 'CasesList')} />
        <Route path="cases/:id" lazy={page(() => import('./pages/cases/CaseDetail'), 'CaseDetail')} />
        <Route path="clients" lazy={page(() => import('./pages/clients/ClientsList'), 'ClientsList')} />
        <Route path="customers" lazy={page(() => import('./pages/customers/CustomersListPage'), 'CustomersListPage')} />
        <Route path="customers/:id" lazy={page(() => import('./pages/customers/CustomerProfilePage'), 'CustomerProfilePage')} />
        <Route path="companies" lazy={page(() => import('./pages/companies/CompaniesListPage'), 'CompaniesListPage')} />
        <Route path="companies/:id" lazy={page(() => import('./pages/companies/CompanyProfilePage'), 'CompanyProfilePage')} />
        <Route path="quotes" lazy={page(() => import('./pages/quotes/QuotesListPage'), 'default')} />
        <Route path="quotes/recycle-bin" lazy={page(() => import('./pages/quotes/QuotesRecycleBin'), 'default')} />
        <Route path="quotes/:id" lazy={page(() => import('./pages/quotes/QuoteDetailPage'), 'default')} />
        {/* Assets route removed - not yet implemented */}
        <Route path="stock" lazy={page(() => import('./pages/stock/StockListPage'), 'default')} />
        <Route path="stock/categories" lazy={page(() => import('./pages/stock/StockCategoriesPage'), 'default')} />
        <Route path="stock/sales" lazy={page(() => import('./pages/stock/StockSalesPage'), 'default')} />
        <Route path="stock/sales/:id" lazy={page(() => import('./pages/stock/StockSaleDetailPage'), 'default')} />
        <Route path="stock/adjustments" lazy={page(() => import('./pages/stock/StockAdjustmentsPage'), 'default')} />
        <Route path="stock/reports" lazy={page(() => import('./pages/stock/StockReportsPage'), 'default')} />
        <Route path="stock/locations" lazy={page(() => import('./pages/stock/StockLocationsPage'), 'default')} />
        <Route path="stock/:id" lazy={page(() => import('./pages/stock/StockItemDetail'), 'default')} />
        <Route path="inventory" lazy={page(() => import('./pages/inventory/InventoryListPage'), 'default')} />
        <Route path="inventory/locations" lazy={page(() => import('./pages/inventory/InventoryLocationsPage'), 'default')} />
        <Route path="inventory/donor-search" lazy={page(() => import('./pages/inventory/DonorSearchPage'), 'default')} />
        <Route path="tools" lazy={page(() => import('./pages/inventory/InventoryListPage'), 'default')} />
        <Route path="clone-drives" lazy={page(() => import('./pages/resources/CloneDrivesList'), 'CloneDrivesList')} />
        <Route path="procedures" lazy={page(() => import('./pages/kb/KBCenterPage'), 'KBCenterPage')} />
        <Route path="procedures/:id" lazy={page(() => import('./pages/kb/KBArticleDetailPage'), 'KBArticleDetailPage')} />
        <Route path="profile" lazy={page(() => import('./pages/users/UserProfile'), 'UserProfile')} />
        {/* Integrations route removed - not yet implemented */}

        <Route element={<ProtectedRoute allowedRoles={FINANCE_ROLES} />}>
          <Route path="finance" lazy={page(() => import('./pages/financial/RevenueDashboard'), 'RevenueDashboard')} />
          <Route path="invoices/:id" lazy={page(() => import('./pages/financial/InvoiceDetailPage'), 'default')} />
          <Route path="transactions" lazy={page(() => import('./pages/financial/TransactionsList'), 'TransactionsList')} />
          <Route path="banking" lazy={page(() => import('./pages/financial/BankingPage'), 'BankingPage')} />
          <Route path="vat-audit" lazy={page(() => import('./pages/financial/VATAuditPage'), 'VATAuditPage')} />
          <Route path="suppliers" lazy={page(() => import('./pages/suppliers/SuppliersListPage'), 'default')} />
          <Route path="suppliers/:id" lazy={page(() => import('./pages/suppliers/SupplierProfilePage'), 'default')} />
          <Route path="purchase-orders" lazy={page(() => import('./pages/suppliers/PurchaseOrdersListPage'), 'default')} />
          <Route path="purchase-orders/:id" lazy={page(() => import('./pages/suppliers/PurchaseOrderDetailPage'), 'default')} />
          <Route element={<FeatureRoute featureKey="nav.financial" />}>
            <Route path="invoices" lazy={page(() => import('./pages/financial/InvoicesListPage'), 'default')} />
            <Route path="payments" lazy={page(() => import('./pages/financial/PaymentsList'), 'PaymentsList')} />
            <Route path="expenses" lazy={page(() => import('./pages/financial/ExpensesList'), 'ExpensesList')} />
            <Route path="reports" lazy={page(() => import('./pages/financial/ReportsDashboard'), 'ReportsDashboard')} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={ADMIN_ROLES} />}>
          <Route path="users" lazy={page(() => import('./pages/users/UserManagement'), 'UserManagement')} />
          <Route path="templates">
            <Route index lazy={page(() => import('./pages/templates/TemplatesDashboard'), 'TemplatesDashboard')} />
            <Route path="type/:typeCode" lazy={page(() => import('./pages/templates/TemplateTypeDetail'), 'TemplateTypeDetail')} />
          </Route>
          <Route path="admin">
            <Route index lazy={page(() => import('./pages/admin/AdminPanel'), 'AdminPanel')} />
            <Route path="logs" lazy={page(() => import('./pages/admin/SystemLogs'), 'SystemLogs')} />
            <Route path="audit" lazy={page(() => import('./pages/admin/AuditTrails'), 'AuditTrails')} />
            <Route path="database" lazy={page(() => import('./pages/admin/DatabaseManagement'), 'DatabaseManagement')} />
            <Route path="role-permissions" lazy={page(() => import('./pages/admin/RolePermissions'), 'RolePermissions')} />
            <Route path="tenants" lazy={page(() => import('./pages/admin/TenantManagement'), 'TenantManagement')} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={HR_ROLES} />}>
          <Route path="hr">
            <Route index lazy={page(() => import('./pages/hr/HRDashboard'), 'HRDashboard')} />
            <Route path="employees" lazy={page(() => import('./pages/hr/EmployeesList'), 'EmployeesList')} />
            <Route path="employees/:id" lazy={page(() => import('./pages/hr/EmployeeProfilePage'), 'EmployeeProfilePage')} />
            <Route path="recruitment" lazy={page(() => import('./pages/hr/RecruitmentPage'), 'RecruitmentPage')} />
            <Route path="onboarding" lazy={page(() => import('./pages/hr/EmployeeOnboardingPage'), 'EmployeeOnboardingPage')} />
            <Route path="performance" lazy={page(() => import('./pages/hr/PerformanceReviewsPage'), 'PerformanceReviewsPage')} />
          </Route>
          <Route path="payroll">
            <Route index lazy={page(() => import('./pages/payroll/PayrollDashboard'), 'PayrollDashboard')} />
            <Route path="process" lazy={page(() => import('./pages/payroll/ProcessPayrollPage'), 'default')} />
            <Route path="components" lazy={page(() => import('./pages/payroll/SalaryComponentsPage'), 'default')} />
            <Route path="history" lazy={page(() => import('./pages/payroll/PayrollHistoryPage'), 'default')} />
            <Route path="periods/:id" lazy={page(() => import('./pages/payroll/PayrollPeriodDetailPage'), 'default')} />
            <Route path="adjustments" lazy={page(() => import('./pages/payroll/PayrollAdjustmentsPage'), 'default')} />
            <Route path="loans" lazy={page(() => import('./pages/payroll/EmployeeLoansPage'), 'EmployeeLoansPage')} />
            <Route path="settings" lazy={page(() => import('./pages/payroll/PayrollSettingsPage'), 'PayrollSettingsPage')} />
          </Route>
          <Route path="attendance" lazy={page(() => import('./pages/employee-management/AttendanceDashboard'), 'AttendanceDashboard')} />
          <Route path="leave" lazy={page(() => import('./pages/employee-management/LeaveManagement'), 'LeaveManagement')} />
          <Route path="timesheets" lazy={page(() => import('./pages/employee-management/TimesheetManagement'), 'TimesheetManagement')} />
        </Route>

        <Route path="settings">
          <Route element={<ProtectedRoute allowedRoles={ADMIN_ROLES} />}>
            <Route index lazy={page(() => import('./pages/settings/SettingsDashboard'), 'SettingsDashboard')} />
            <Route path="general-settings" lazy={page(() => import('./pages/settings/GeneralSettings'), 'GeneralSettings')} />
            <Route path="appearance" lazy={page(() => import('./pages/settings/AppearanceSettings'), 'AppearanceSettings')} />
            <Route path="tax-registration" lazy={page(() => import('./pages/settings/TaxRegistrationSettings'), 'TaxRegistrationSettings')} />
            <Route path="preferences" lazy={page(() => import('./pages/settings/PreferencesSettings'), 'PreferencesSettings')} />
            <Route path="table-columns" lazy={page(() => import('./pages/settings/TableColumnsSettings'), 'TableColumnsSettings')} />
            <Route path="case-lifecycle" lazy={page(() => import('./pages/settings/CaseLifecycleSettings'), 'CaseLifecycleSettings')} />
            <Route path="features" lazy={page(() => import('./pages/settings/FeaturesSettings'), 'FeaturesSettings')} />
            <Route path="system-numbers" lazy={page(() => import('./pages/settings/SystemNumbers'), 'SystemNumbers')} />
            <Route path="localization" lazy={page(() => import('./pages/settings/AccountingLocales'), 'LocalizationCenter')} />
            <Route path="currencies" lazy={page(() => import('./pages/settings/CurrencySettings'), 'CurrencySettings')} />
            <Route path="client-portal" lazy={page(() => import('./pages/settings/ClientPortalSettings'), 'ClientPortalSettings')} />
            <Route path="billing" lazy={page(() => import('./pages/settings/BillingPage'), 'default')} />
            <Route path="plans" lazy={page(() => import('./pages/settings/PlansPage'), 'default')} />
            <Route path="documents" lazy={page(() => import('./pages/settings/DocumentTemplatesPage'), 'DocumentTemplatesPage')} />
            <Route path="security" lazy={page(() => import('./pages/settings/SecuritySettingsPage'), 'SecuritySettingsPage')} />
            <Route path="gdpr" lazy={page(() => import('./pages/settings/GDPRCompliancePage'), 'GDPRCompliancePage')} />
            <Route path="inventory" lazy={page(() => import('./pages/settings/InventorySettingsPage'), 'default')} />
            <Route path=":categoryId" lazy={page(() => import('./pages/settings/CategoryDetail'), 'CategoryDetail')} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={FINANCE_ROLES} />}>
            <Route path="import-export" lazy={page(() => import('./pages/settings/ImportExportCenter'), 'ImportExportCenter')} />
          </Route>
          <Route path="notifications" lazy={page(() => import('./pages/settings/NotificationPreferences'), 'NotificationPreferences')} />
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
        <Route index lazy={page(() => import('./pages/platform-admin/PlatformDashboard'), 'PlatformDashboard')} />
        <Route path="tenants" lazy={page(() => import('./pages/platform-admin/TenantsListPage'), 'TenantsListPage')} />
        <Route path="tenants/:id" lazy={page(() => import('./pages/platform-admin/TenantDetailPage'), 'TenantDetailPage')} />
        <Route path="tickets" lazy={page(() => import('./pages/platform-admin/SupportTicketsPage'), 'SupportTicketsPage')} />
        <Route path="tickets/:id" lazy={page(() => import('./pages/platform-admin/TicketDetailPage'), 'TicketDetailPage')} />
        <Route path="announcements" lazy={page(() => import('./pages/platform-admin/AnnouncementsPage'), 'AnnouncementsPage')} />
        <Route path="settings" lazy={page(() => import('./pages/platform-admin/PlatformSettingsPage'), 'PlatformSettingsPage')} />
        <Route path="plans" lazy={page(() => import('./pages/platform-admin/PlansManagementPage'), 'PlansManagementPage')} />
        <Route path="plans/:id" lazy={page(() => import('./pages/platform-admin/PlanDetailPage'), 'PlanDetailPage')} />
        <Route path="coupons" lazy={page(() => import('./pages/platform-admin/CouponsManagementPage'), 'CouponsManagementPage')} />
        <Route path="isolation-tests" lazy={page(() => import('./pages/platform-admin/TenantIsolationTestPage'), 'TenantIsolationTestPage')} />
        <Route path="rate-limits" lazy={page(() => import('./pages/platform-admin/RateLimitDashboardPage'), 'RateLimitDashboardPage')} />
        <Route path="notifications/dlq" lazy={page(() => import('./pages/platform-admin/NotificationDLQ'), 'NotificationDLQ')} />
        <Route path="countries" lazy={page(() => import('./pages/platform-admin/CountryPacksPage'), 'CountryPacksPage')} />
        <Route path="countries/:countryId" lazy={page(() => import('./pages/platform-admin/CountryPackEditorPage'), 'CountryPackEditorPage')} />
      </Route>

      <Route
        path="*"
        element={
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">404</h1>
            <p className="text-lg text-slate-600 mb-6">Page not found</p>
            <a href="/" className="text-primary hover:text-primary/80 font-medium">Go back to dashboard</a>
          </div>
        }
      />
    </Route>
  )
);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
