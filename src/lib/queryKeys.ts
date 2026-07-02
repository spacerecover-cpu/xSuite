export const caseKeys = {
  all: ['cases'] as const,
  lists: () => [...caseKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...caseKeys.lists(), filters] as const,
  detail: (id: string) => [...caseKeys.all, 'detail', id] as const,
  devices: (caseId: string) => [...caseKeys.all, 'devices', caseId] as const,
  custody: (caseId: string) => [...caseKeys.all, 'custody', caseId] as const,
  activity: (caseId: string) => [...caseKeys.all, 'activity', caseId] as const,
  finance: (caseId: string) => [...caseKeys.all, 'finance', caseId] as const,
};

export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...customerKeys.lists(), filters] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
  timeline: (id: string) => [...customerKeys.all, 'timeline', id] as const,
};

export const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...companyKeys.lists(), filters] as const,
  detail: (id: string) => [...companyKeys.all, 'detail', id] as const,
};

export const quoteKeys = {
  all: ['quotes'] as const,
  lists: () => [...quoteKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...quoteKeys.lists(), filters] as const,
  detail: (id: string) => [...quoteKeys.all, 'detail', id] as const,
  recycleBin: () => [...quoteKeys.all, 'recycle-bin'] as const,
};

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...invoiceKeys.lists(), filters] as const,
  detail: (id: string) => [...invoiceKeys.all, 'detail', id] as const,
};

export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...paymentKeys.lists(), filters] as const,
};

export const creditNoteKeys = {
  all: ['credit_notes'] as const,
  byInvoice: (invoiceId: string) => [...creditNoteKeys.all, 'invoice', invoiceId] as const,
  byCase: (caseId: string) => [...creditNoteKeys.all, 'case', caseId] as const,
};

export const documentInstanceKeys = {
  all: ['document_instances'] as const,
  byCase: (caseId: string) => [...documentInstanceKeys.all, 'case', caseId] as const,
  detail: (id: string) => [...documentInstanceKeys.all, 'detail', id] as const,
  sections: (id: string) => [...documentInstanceKeys.all, 'sections', id] as const,
};

export const inventoryKeys = {
  all: ['inventory'] as const,
  lists: () => [...inventoryKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...inventoryKeys.lists(), filters] as const,
  detail: (id: string) => [...inventoryKeys.all, 'detail', id] as const,
  categories: () => [...inventoryKeys.all, 'categories'] as const,
  locations: () => [...inventoryKeys.all, 'locations'] as const,
  deviceTypeSettings: () => ['deviceTypeSettings'] as const,
};

export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...supplierKeys.lists(), filters] as const,
  detail: (id: string) => [...supplierKeys.all, 'detail', id] as const,
};

export const purchaseOrderKeys = {
  all: ['purchase-orders'] as const,
  lists: () => [...purchaseOrderKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...purchaseOrderKeys.lists(), filters] as const,
  detail: (id: string) => [...purchaseOrderKeys.all, 'detail', id] as const,
};

export const financialKeys = {
  revenue: () => ['revenue'] as const,
  expenses: (filters: Record<string, unknown>) => ['expenses', filters] as const,
  transactions: (filters: Record<string, unknown>) => ['transactions', filters] as const,
  banking: () => ['banking'] as const,
  vatAudit: (filters: Record<string, unknown>) => ['vat-audit', filters] as const,
  reports: () => ['financial-reports'] as const,
};

export const userKeys = {
  all: ['users'] as const,
  list: () => [...userKeys.all, 'list'] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  permissions: (role: string) => ['permissions', role] as const,
  modules: () => ['modules'] as const,
};

export const settingsKeys = {
  general: () => ['settings', 'general'] as const,
  listPageSize: () => ['settings', 'list-page-size'] as const,
  listSelection: () => ['settings', 'list-selection'] as const,
  systemNumbers: () => ['settings', 'system-numbers'] as const,
  locales: () => ['settings', 'locales'] as const,
  portal: () => ['settings', 'portal'] as const,
  categoryCount: (categoryId: string) => ['settings', 'category-count', categoryId] as const,
  masterData: (table: string) => ['settings', 'master-data', table] as const,
  seedStatus: (categoryId: string) => ['settings', 'seed-status', categoryId] as const,
};

export const stockKeys = {
  all: ['stock'] as const,
  items: () => [...stockKeys.all, 'items'] as const,
  item: (id: string) => [...stockKeys.all, 'item', id] as const,
  saleable: () => [...stockKeys.all, 'saleable'] as const,
  lowStock: () => [...stockKeys.all, 'low-stock'] as const,
  categories: () => [...stockKeys.all, 'categories'] as const,
  transactions: (itemId?: string) => [...stockKeys.all, 'transactions', itemId] as const,
  sales: () => [...stockKeys.all, 'sales'] as const,
  sale: (id: string) => [...stockKeys.all, 'sale', id] as const,
  salesByCase: (caseId: string) => [...stockKeys.all, 'sales-by-case', caseId] as const,
  serialNumbers: (itemId: string) => [...stockKeys.all, 'serials', itemId] as const,
  stats: () => [...stockKeys.all, 'stats'] as const,
  adjustments: () => [...stockKeys.all, 'adjustments'] as const,
  adjustment: (id: string) => [...stockKeys.all, 'adjustment', id] as const,
  returns: () => [...stockKeys.all, 'returns'] as const,
  return: (id: string) => [...stockKeys.all, 'return', id] as const,
  reservations: (itemId?: string) => [...stockKeys.all, 'reservations', itemId] as const,
  alerts: () => [...stockKeys.all, 'alerts'] as const,
  alertCount: () => [...stockKeys.all, 'alert-count'] as const,
  locations: () => [...stockKeys.all, 'locations'] as const,
  itemLocations: (itemId: string) => [...stockKeys.all, 'item-locations', itemId] as const,
  transfers: () => [...stockKeys.all, 'transfers'] as const,
  transfer: (id: string) => [...stockKeys.all, 'transfer', id] as const,
};

export const followUpKeys = {
  all: ['follow-ups'] as const,
  byCase: (caseId: string) => [...followUpKeys.all, 'case', caseId] as const,
  due: () => [...followUpKeys.all, 'due'] as const,
};

export const communicationKeys = {
  all: ['communications'] as const,
  byCase: (caseId: string) => [...communicationKeys.all, 'case', caseId] as const,
  byCustomer: (customerId: string) =>
    [...communicationKeys.all, 'customer', customerId] as const,
};

export const templateKeys = {
  all: ['document-templates'] as const,
  list: (typeCode: string, documentType?: string) =>
    [...templateKeys.all, 'list', typeCode, documentType ?? null] as const,
  variables: () => [...templateKeys.all, 'variables'] as const,
  context: (refs: Record<string, unknown>) => [...templateKeys.all, 'context', refs] as const,
};

export const brandingThemeKeys = {
  all: ['branding-themes'] as const,
  list: () => [...brandingThemeKeys.all, 'list'] as const,
  detail: (id: string) => [...brandingThemeKeys.all, 'detail', id] as const,
};

export const documentTemplatePdfKeys = {
  all: ['document-templates-pdf'] as const,
  list: () => [...documentTemplatePdfKeys.all, 'list'] as const,
  detail: (id: string) => [...documentTemplatePdfKeys.all, 'detail', id] as const,
  byType: (documentType: string) =>
    [...documentTemplatePdfKeys.all, 'by-type', documentType] as const,
};

export const documentTemplateVersionKeys = {
  all: ['document-template-versions'] as const,
  list: (templateId: string) =>
    [...documentTemplateVersionKeys.all, 'list', templateId] as const,
  detail: (id: string) => [...documentTemplateVersionKeys.all, 'detail', id] as const,
  deployed: (templateId: string) =>
    [...documentTemplateVersionKeys.all, 'deployed', templateId] as const,
};

export const masterDataKeys = {
  deviceTypes: () => ['master', 'device-types'] as const,
  deviceBrands: () => ['master', 'device-brands'] as const,
  deviceCapacities: () => ['master', 'device-capacities'] as const,
  deviceConditions: () => ['master', 'device-conditions'] as const,
  deviceAccessories: () => ['master', 'device-accessories'] as const,
  deviceEncryption: () => ['master', 'device-encryption'] as const,
  deviceInterfaces: () => ['master', 'device-interfaces'] as const,
  deviceMadeIn: () => ['master', 'device-made-in'] as const,
  deviceHeadCounts: () => ['master', 'device-head-counts'] as const,
  devicePlatterCounts: () => ['master', 'device-platter-counts'] as const,
  deviceComponentStatuses: () => ['master', 'device-component-statuses'] as const,
  deviceServiceProblems: () => ['master', 'device-service-problems'] as const,
  countries: () => ['master', 'countries'] as const,
  currencies: () => ['master', 'currencies'] as const,
  services: () => ['master', 'services'] as const,
  storageLocations: () => ['master', 'storage-locations'] as const,
};

export const payrollKeys = {
  all: ['payroll'] as const,

  salaryComponents: () => [...payrollKeys.all, 'salary-components'] as const,
  salaryComponent: (id: string) => [...payrollKeys.all, 'salary-component', id] as const,

  periods: (filters?: Record<string, unknown>) => [...payrollKeys.all, 'periods', filters] as const,
  period: (id: string) => [...payrollKeys.all, 'period', id] as const,
  currentPeriod: () => [...payrollKeys.all, 'current-period'] as const,

  records: (periodId: string) => [...payrollKeys.all, 'records', periodId] as const,
  record: (id: string) => [...payrollKeys.all, 'record', id] as const,
  recordItems: (recordId: string) => [...payrollKeys.all, 'record-items', recordId] as const,
  employeeHistory: (employeeId: string) => [...payrollKeys.all, 'employee-history', employeeId] as const,

  adjustments: (filters?: Record<string, unknown>) => [...payrollKeys.all, 'adjustments', filters] as const,
  pendingAdjustments: (employeeId?: string) => [...payrollKeys.all, 'pending-adjustments', employeeId] as const,

  loans: (filters?: Record<string, unknown>) => [...payrollKeys.all, 'loans', filters] as const,
  loan: (id: string) => [...payrollKeys.all, 'loan', id] as const,
  employeeLoans: (employeeId: string) => [...payrollKeys.all, 'employee-loans', employeeId] as const,
  loanRepayments: (loanId: string) => [...payrollKeys.all, 'loan-repayments', loanId] as const,

  salaryStructure: (employeeId: string) => [...payrollKeys.all, 'salary-structure', employeeId] as const,

  settings: () => [...payrollKeys.all, 'settings'] as const,
  dashboardStats: () => [...payrollKeys.all, 'dashboard-stats'] as const,

  bankFiles: (periodId?: string) => [...payrollKeys.all, 'bank-files', periodId] as const,
};

export const billingKeys = {
  all: ['billing'] as const,
  subscription: (tenantId: string) => [...billingKeys.all, 'subscription', tenantId] as const,
  plans: () => [...billingKeys.all, 'plans'] as const,
  planFeatures: (planId: string) => [...billingKeys.all, 'plan-features', planId] as const,
  invoices: (tenantId: string) => [...billingKeys.all, 'invoices', tenantId] as const,
  invoice: (invoiceId: string) => [...billingKeys.all, 'invoice', invoiceId] as const,
  usage: (tenantId: string) => [...billingKeys.all, 'usage', tenantId] as const,
  paymentMethods: (tenantId: string) => [...billingKeys.all, 'payment-methods', tenantId] as const,
  stats: () => [...billingKeys.all, 'stats'] as const,
};

export const kbKeys = {
  all: ['kb'] as const,
  categories: () => [...kbKeys.all, 'categories'] as const,
  articles: (filters?: Record<string, unknown>) => [...kbKeys.all, 'articles', filters] as const,
  article: (id: string) => [...kbKeys.all, 'article', id] as const,
  tags: () => [...kbKeys.all, 'tags'] as const,
  versions: (articleId: string) => [...kbKeys.all, 'versions', articleId] as const,
  stats: () => [...kbKeys.all, 'stats'] as const,
};

export const featureKeys = {
  all: ['features'] as const,
  feature: (key: string) => [...featureKeys.all, 'feature', key] as const,
  usage: (key: string) => [...featureKeys.all, 'usage', key] as const,
  plan: () => [...featureKeys.all, 'plan'] as const,
};

export const leaveKeys = {
  all: ['leave'] as const,
  requests: (filters?: Record<string, unknown>) => [...leaveKeys.all, 'requests', filters] as const,
  request: (id: string) => [...leaveKeys.all, 'request', id] as const,
  balances: (filters?: Record<string, unknown>) => [...leaveKeys.all, 'balances', filters] as const,
  types: () => [...leaveKeys.all, 'types'] as const,
  employees: () => [...leaveKeys.all, 'employees'] as const,
  stats: () => [...leaveKeys.all, 'stats'] as const,
};

export const timesheetKeys = {
  all: ['timesheets'] as const,
  list: (filters?: Record<string, unknown>) => [...timesheetKeys.all, 'list', filters] as const,
  detail: (id: string) => [...timesheetKeys.all, 'detail', id] as const,
  stats: () => [...timesheetKeys.all, 'stats'] as const,
  employees: () => [...timesheetKeys.all, 'employees'] as const,
  summary: (filters?: Record<string, unknown>) => [...timesheetKeys.all, 'summary', filters] as const,
};

export const recruitmentKeys = {
  all: ['recruitment'] as const,
  jobs: (filters?: Record<string, unknown>) => [...recruitmentKeys.all, 'jobs', filters] as const,
  job: (id: string) => [...recruitmentKeys.all, 'job', id] as const,
  candidates: (jobId?: string) => [...recruitmentKeys.all, 'candidates', jobId] as const,
  candidate: (id: string) => [...recruitmentKeys.all, 'candidate', id] as const,
  stats: () => [...recruitmentKeys.all, 'stats'] as const,
  departments: () => [...recruitmentKeys.all, 'departments'] as const,
  positions: () => [...recruitmentKeys.all, 'positions'] as const,
};

export const employeeOnboardingKeys = {
  all: ['employee-onboarding'] as const,
  checklists: () => [...employeeOnboardingKeys.all, 'checklists'] as const,
  checklist: (id: string) => [...employeeOnboardingKeys.all, 'checklist', id] as const,
  checklistItems: (checklistId: string) => [...employeeOnboardingKeys.all, 'checklist-items', checklistId] as const,
  tasks: (employeeId?: string) => [...employeeOnboardingKeys.all, 'tasks', employeeId] as const,
  task: (id: string) => [...employeeOnboardingKeys.all, 'task', id] as const,
  stats: () => [...employeeOnboardingKeys.all, 'stats'] as const,
};

export const performanceKeys = {
  all: ['performance'] as const,
  reviews: (filters?: Record<string, unknown>) => [...performanceKeys.all, 'reviews', filters] as const,
  review: (id: string) => [...performanceKeys.all, 'review', id] as const,
  employeeReviews: (employeeId: string) => [...performanceKeys.all, 'employee-reviews', employeeId] as const,
  stats: () => [...performanceKeys.all, 'stats'] as const,
  employees: () => [...performanceKeys.all, 'employees'] as const,
};

export const mfaKeys = {
  all: ['mfa'] as const,
  factors: () => [...mfaKeys.all, 'factors'] as const,
  assuranceLevel: () => [...mfaKeys.all, 'assurance-level'] as const,
};

export const gdprKeys = {
  all: ['gdpr'] as const,
  requests: (filters?: Record<string, unknown>) => [...gdprKeys.all, 'requests', filters] as const,
  request: (id: string) => [...gdprKeys.all, 'request', id] as const,
  retentionPolicies: () => [...gdprKeys.all, 'retention-policies'] as const,
};

export const platformAdminKeys = {
  all: ['platform-admin'] as const,
  dashboard: () => [...platformAdminKeys.all, 'dashboard'] as const,
  dashboardStats: () => [...platformAdminKeys.dashboard(), 'stats'] as const,
  mrrTrend: (days: number) => [...platformAdminKeys.dashboard(), 'mrr-trend', days] as const,
  planDistribution: () => [...platformAdminKeys.dashboard(), 'plan-distribution'] as const,
  atRiskTenants: (limit: number) => [...platformAdminKeys.dashboard(), 'at-risk', limit] as const,

  currentPlatformAdmin: () => [...platformAdminKeys.all, 'current-admin'] as const,

  tenants: () => [...platformAdminKeys.all, 'tenants'] as const,
  tenantsList: (filters?: Record<string, unknown>) => [...platformAdminKeys.tenants(), 'list', filters] as const,
  tenantDetail: (id: string) => [...platformAdminKeys.tenants(), 'detail', id] as const,
  tenantHealth: (id: string) => [...platformAdminKeys.tenants(), 'health', id] as const,
  tenantUsers: (id: string) => [...platformAdminKeys.tenants(), 'users', id] as const,
  tenantBilling: (id: string) => [...platformAdminKeys.tenants(), 'billing', id] as const,
  tenantActivity: (id: string) => [...platformAdminKeys.tenants(), 'activity', id] as const,
  tenantNotes: (id: string) => [...platformAdminKeys.tenants(), 'notes', id] as const,
  tenantHealthHistory: (id: string) => [...platformAdminKeys.tenants(), 'health-history', id] as const,

  tickets: () => [...platformAdminKeys.all, 'tickets'] as const,
  ticketsList: (filters?: Record<string, unknown>) => [...platformAdminKeys.tickets(), 'list', filters] as const,
  ticketDetail: (id: string) => [...platformAdminKeys.tickets(), 'detail', id] as const,
  ticketMessages: (id: string) => [...platformAdminKeys.tickets(), 'messages', id] as const,
  ticketStats: () => [...platformAdminKeys.tickets(), 'stats'] as const,

  announcements: () => [...platformAdminKeys.all, 'announcements'] as const,
  announcementsList: (includeInactive: boolean) => [...platformAdminKeys.announcements(), 'list', includeInactive] as const,
  announcementDismissals: (id: string) => [...platformAdminKeys.announcements(), 'dismissals', id] as const,
  activeAnnouncements: (userId: string, planCode: string) => [...platformAdminKeys.announcements(), 'active', userId, planCode] as const,

  settings: () => [...platformAdminKeys.all, 'settings'] as const,
  settingsCounts: () => [...platformAdminKeys.settings(), 'counts'] as const,

  plans: () => [...platformAdminKeys.all, 'plans'] as const,
  plansList: () => [...platformAdminKeys.plans(), 'list'] as const,
  planDetail: (id: string) => [...platformAdminKeys.plans(), 'detail', id] as const,
  planFeatures: (planId: string) => [...platformAdminKeys.plans(), 'features', planId] as const,
  planSubscribers: (planId: string) => [...platformAdminKeys.plans(), 'subscribers', planId] as const,

  coupons: () => [...platformAdminKeys.all, 'coupons'] as const,
  couponsList: () => [...platformAdminKeys.coupons(), 'list'] as const,
  couponRedemptions: (couponId: string) => [...platformAdminKeys.coupons(), 'redemptions', couponId] as const,
};

export const legalEntityKeys = {
  all: ['legal_entities'] as const,
  lists: () => [...legalEntityKeys.all, 'list'] as const,
  list: (tenantId: string) => [...legalEntityKeys.all, 'list', tenantId] as const,
  primary: (tenantId: string) => [...legalEntityKeys.all, 'primary', tenantId] as const,
  detail: (id: string) => [...legalEntityKeys.all, 'detail', id] as const,
};

export const dataMigrationKeys = {
  all: ['dataMigration'] as const,
  runs: () => [...dataMigrationKeys.all, 'runs'] as const,
  run: (id: string) => [...dataMigrationKeys.all, 'run', id] as const,
  validateResult: (fileHash: string) => [...dataMigrationKeys.all, 'validateResult', fileHash] as const,
  exportProgress: () => [...dataMigrationKeys.all, 'exportProgress'] as const,
};
