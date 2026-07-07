import {
  HardDrive,
  Package,
  Settings as SettingsIcon,
  DollarSign,
  FileText,
  Shield,
  Globe,
  List,
  Building2,
  Database,
  ShoppingCart,
  ShieldCheck,
  Palette,
  Bell,
  SlidersHorizontal,
  Columns3,
  FileStack,
  ListChecks,
  Workflow,
  Receipt,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export type MasterDataTable =
  | 'catalog_device_types'
  | 'catalog_device_brands'
  | 'catalog_device_capacities'
  | 'catalog_accessories'
  | 'catalog_device_made_in'
  | 'catalog_device_encryption'
  | 'catalog_device_platter_counts'
  | 'catalog_device_head_counts'
  | 'inventory_locations'
  | 'catalog_interfaces'
  | 'catalog_service_types'
  | 'catalog_service_problems'
  | 'catalog_service_locations'
  | 'master_case_priorities'
  | 'master_case_statuses'
  | 'catalog_device_conditions'
  | 'catalog_device_roles'
  | 'customer_groups'
  | 'master_industries'
  | 'geo_countries'
  | 'geo_cities'
  | 'master_expense_categories'
  | 'master_quote_statuses'
  | 'master_invoice_statuses'
  | 'master_payment_methods'
  | 'master_inventory_categories'
  | 'master_inventory_status_types'
  | 'master_inventory_condition_types'
  | 'master_supplier_categories'
  | 'master_supplier_payment_terms'
  | 'master_purchase_order_statuses';

export interface SettingsCategory {
  id: string;
  title: string;
  icon: LucideIcon;
  backgroundColor: string;
  borderColor: string;
  tables: MasterDataTable[];
  actionLabel: string;
  description?: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'appearance',
    title: 'Appearance',
    icon: Palette,
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
    tables: [],
    actionLabel: 'Choose Theme',
    description: 'Pick the look and feel of xSuite for everyone in your workspace.',
  },
  {
    id: 'tax-registration',
    title: 'Tax Registration',
    icon: Receipt,
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
    tables: [],
    actionLabel: 'Manage Registration',
    description: 'Your tax registration number and registered/unregistered status — controls how every document is taxed.',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    icon: ListChecks,
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
    tables: [],
    actionLabel: 'Set Preferences',
    description: 'Workspace display preferences — rows per page and selection checkboxes on list tables.',
  },
  {
    id: 'table-columns',
    title: 'Table Columns',
    icon: Columns3,
    backgroundColor: '#475569',
    borderColor: '#475569',
    tables: [],
    actionLabel: 'Configure Columns',
    description: 'Choose the default and locked columns your team sees on the Cases table.',
  },
  {
    id: 'features',
    title: 'Features & Modules',
    icon: SlidersHorizontal,
    backgroundColor: '#0891b2',
    borderColor: '#0891b2',
    tables: [],
    actionLabel: 'Configure',
    description: 'Enable or disable modules, tabs, dashboard widgets, and workflow stages for your workspace.',
  },
  {
    id: 'device-media',
    title: 'Devices & Inventory',
    icon: HardDrive,
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    tables: [
      'catalog_device_types',
      'catalog_device_brands',
      'catalog_device_capacities',
      'catalog_accessories',
      'catalog_interfaces',
      'catalog_device_made_in',
      'catalog_device_encryption',
      'catalog_device_platter_counts',
      'catalog_device_head_counts',
      'inventory_locations',
      'master_inventory_categories',
      'master_inventory_status_types',
      'master_inventory_condition_types',
    ],
    actionLabel: 'Manage Categories',
    description: 'Manage storage device specifications and inventory settings',
  },
  {
    id: 'inventory-settings',
    title: 'Inventory Defaults',
    icon: Package,
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
    tables: [],
    actionLabel: 'Configure',
    description: 'Set default storage locations and configure inventory number sequences per device type.',
  },
  {
    id: 'case-service',
    title: 'Case & Service',
    icon: SettingsIcon,
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    tables: ['catalog_service_types', 'catalog_service_problems', 'master_case_priorities', 'master_case_statuses', 'catalog_service_locations', 'catalog_device_conditions', 'catalog_device_roles'],
    actionLabel: 'Manage Categories',
    description: 'Manage service types, case priorities, and status workflows',
  },
  {
    id: 'case-lifecycle',
    title: 'Case Lifecycle',
    icon: Workflow,
    backgroundColor: '#0369a1',
    borderColor: '#0369a1',
    tables: [],
    actionLabel: 'Map Statuses',
    description: 'Map your case statuses to lifecycle stages so dashboards and reports count them correctly.',
  },
  {
    id: 'client-financial',
    title: 'Client & Financial',
    icon: DollarSign,
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
    tables: [
      'customer_groups',
      'master_industries',
      'geo_countries',
      'geo_cities',
      'master_expense_categories',
      'master_quote_statuses',
      'master_invoice_statuses',
      'master_payment_methods',
    ],
    actionLabel: 'Manage Categories',
    description: 'Manage customer groups and financial configurations',
  },
  {
    id: 'procurement',
    title: 'Procurement',
    icon: ShoppingCart,
    backgroundColor: '#f97316',
    borderColor: '#f97316',
    tables: [
      'master_supplier_categories',
      'master_supplier_payment_terms',
      'master_purchase_order_statuses',
    ],
    actionLabel: 'Manage Categories',
    description: 'Manage supplier categories, payment terms, and purchase order statuses',
  },
  {
    id: 'general-settings',
    title: 'General Settings',
    icon: Building2,
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
    tables: [],
    actionLabel: 'Manage Settings',
    description: 'Configure company information, contact details, and branding',
  },
  {
    id: 'system-numbers',
    title: 'System & Numbers',
    icon: List,
    backgroundColor: '#475569',
    borderColor: '#475569',
    tables: [],
    actionLabel: 'Manage Sequences',
    description: 'Configure automatic numbering sequences for all entities',
  },
  {
    id: 'templates',
    title: 'Terms & Templates',
    icon: FileText,
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
    tables: [],
    actionLabel: 'Manage Categories',
    description: 'Quote/invoice terms, email and document templates, and print layouts',
  },
  {
    id: 'documents',
    title: 'Documents',
    icon: FileStack,
    backgroundColor: '#0369a1',
    borderColor: '#0369a1',
    tables: [],
    actionLabel: 'Customize Documents',
    description: 'Customize how invoices, quotes, and receipts look when printed or emailed.',
  },
  {
    id: 'client-portal',
    title: 'Client Portal',
    icon: Shield,
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
    tables: [],
    actionLabel: 'Go to Page',
    description: 'Configure client portal access and features',
  },
  {
    id: 'localization',
    title: 'Localization Center',
    icon: Globe,
    backgroundColor: '#14b8a6',
    borderColor: '#14b8a6',
    tables: [],
    actionLabel: 'Configure',
    description: 'Currencies and display, date & time, timezone, and document language',
  },
  {
    id: 'import-export',
    title: 'Import / Export',
    icon: Database,
    backgroundColor: '#1e40af',
    borderColor: '#1e40af',
    tables: [],
    actionLabel: 'Go to Page',
    description: 'Migrate data from legacy ERP systems or export current data',
  },
  {
    id: 'gdpr',
    title: 'GDPR & Compliance',
    icon: Shield,
    backgroundColor: '#059669',
    borderColor: '#059669',
    tables: [],
    actionLabel: 'Go to Page',
    description: 'Data subject requests, exports, retention policies, and compliance tools',
  },
  {
    id: 'security',
    title: 'Security',
    icon: ShieldCheck,
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
    tables: [],
    actionLabel: 'Manage Security',
    description: 'Two-factor authentication, session management, and security policies',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: Bell,
    backgroundColor: '#06b6d4',
    borderColor: '#06b6d4',
    tables: [],
    actionLabel: 'Manage Subscriptions',
    description: 'Choose which events notify you and on which channels',
  },
];

export interface SettingsGroup {
  id: string;
  label: string;
  categoryIds: string[];
}

// Ordered sections for the Settings dashboard. Every SettingsCategory id should
// appear in exactly one group; the dashboard renders any unlisted category under
// a trailing "More" section so nothing silently disappears.
export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: 'workspace', label: 'Workspace', categoryIds: ['appearance', 'preferences', 'table-columns', 'features', 'general-settings', 'notifications'] },
  { id: 'operations', label: 'Operations', categoryIds: ['device-media', 'inventory-settings', 'case-service', 'case-lifecycle', 'procurement'] },
  { id: 'finance', label: 'Client & Finance', categoryIds: ['client-financial', 'localization', 'tax-registration'] },
  { id: 'documents', label: 'Documents & Reports', categoryIds: ['templates', 'documents'] },
  { id: 'system', label: 'System & Data', categoryIds: ['system-numbers', 'import-export', 'client-portal'] },
  { id: 'compliance', label: 'Security & Compliance', categoryIds: ['security', 'gdpr'] },
];

export const TENANT_SCOPED_TABLES: MasterDataTable[] = ['inventory_locations', 'customer_groups'];
export const isTenantScopedTable = (table: MasterDataTable): boolean =>
  TENANT_SCOPED_TABLES.includes(table);
export const hasDeletedAt = (table: MasterDataTable): boolean =>
  TENANT_SCOPED_TABLES.includes(table);

// Catalogs whose rows feed the Case + Inventory device-form dropdowns and whose
// is_active is admin-writable (migration device_service_catalogs_writable_by_admins).
// CategoryDetail shows an active/inactive toggle for these so admins can hide an
// option from the wizards without deleting it — useDeviceFormCatalogs filters
// .eq('is_active', true), so toggling off removes it from the dropdowns.
export const ACTIVE_TOGGLE_TABLES: MasterDataTable[] = [
  'catalog_device_types', 'catalog_device_brands', 'catalog_device_capacities', 'catalog_accessories',
  'catalog_interfaces', 'catalog_device_made_in', 'catalog_device_encryption', 'catalog_device_platter_counts',
  'catalog_device_head_counts', 'master_inventory_categories', 'master_inventory_status_types',
  'master_inventory_condition_types', 'catalog_service_types', 'catalog_service_problems',
  'master_case_priorities', 'master_case_statuses', 'catalog_service_locations',
  'catalog_device_conditions', 'catalog_device_roles',
];
export const hasActiveToggle = (table: MasterDataTable): boolean =>
  ACTIVE_TOGGLE_TABLES.includes(table);

export const TABLE_LABELS: Record<MasterDataTable, string> = {
  catalog_device_types: 'Device Types',
  catalog_device_brands: 'Brands',
  catalog_device_capacities: 'Capacities',
  catalog_accessories: 'Accessories',
  catalog_interfaces: 'Interfaces',
  catalog_device_made_in: 'Made In',
  catalog_device_encryption: 'Encryption',
  catalog_device_platter_counts: 'Platter Count',
  catalog_device_head_counts: 'Head Count',
  inventory_locations: 'Inventory Locations',
  catalog_service_types: 'Service Types',
  catalog_service_problems: 'Service Problems',
  master_case_priorities: 'Case Priorities',
  master_case_statuses: 'Case Statuses',
  catalog_service_locations: 'Service Locations',
  catalog_device_conditions: 'Device Conditions',
  catalog_device_roles: 'Device Roles',
  customer_groups: 'Customer Groups',
  master_industries: 'Industries',
  geo_countries: 'Countries',
  geo_cities: 'Cities',
  master_expense_categories: 'Expense Categories',
  master_quote_statuses: 'Quote Statuses',
  master_invoice_statuses: 'Invoice Statuses',
  master_payment_methods: 'Client Payment Methods',
  master_inventory_categories: 'Inventory Categories',
  master_inventory_status_types: 'Inventory Status Types',
  master_inventory_condition_types: 'Inventory Condition Types',
  master_supplier_categories: 'Supplier Categories',
  master_supplier_payment_terms: 'Supplier Payment Terms',
  master_purchase_order_statuses: 'Purchase Order Statuses',
};
