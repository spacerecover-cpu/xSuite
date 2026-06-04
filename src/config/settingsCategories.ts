import {
  HardDrive,
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
  Coins,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export type MasterDataTable =
  | 'catalog_device_types'
  | 'catalog_device_brands'
  | 'catalog_device_capacities'
  | 'catalog_accessories'
  | 'catalog_device_interfaces'
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
    id: 'device-media',
    title: 'Device & Media',
    icon: HardDrive,
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    tables: [
      'catalog_device_types',
      'catalog_device_brands',
      'catalog_device_capacities',
      'catalog_accessories',
      'catalog_device_interfaces',
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
    title: 'Templates',
    icon: FileText,
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
    tables: [],
    actionLabel: 'Manage Categories',
    description: 'Email templates, document templates, and print layouts',
  },
  {
    id: 'report-sections',
    title: 'Report Sections',
    icon: FileText,
    backgroundColor: '#be185d',
    borderColor: '#be185d',
    tables: [],
    actionLabel: 'Manage Sections',
    description: 'Professional report section library and content presets',
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
    title: 'Localization',
    icon: Globe,
    backgroundColor: '#14b8a6',
    borderColor: '#14b8a6',
    tables: [],
    actionLabel: 'Go to Page',
    description: 'Language, timezone, currency, and regional settings',
  },
  {
    id: 'currencies',
    title: 'Currencies',
    icon: Coins,
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    tables: [],
    actionLabel: 'Manage Currencies',
    description: 'Add and manage the transaction currencies you invoice in.',
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

export const TENANT_SCOPED_TABLES: MasterDataTable[] = ['inventory_locations', 'customer_groups'];
export const isTenantScopedTable = (table: MasterDataTable): boolean =>
  TENANT_SCOPED_TABLES.includes(table);
export const hasDeletedAt = (table: MasterDataTable): boolean =>
  TENANT_SCOPED_TABLES.includes(table);

export const TABLE_LABELS: Record<MasterDataTable, string> = {
  catalog_device_types: 'Device Types',
  catalog_device_brands: 'Brands',
  catalog_device_capacities: 'Capacities',
  catalog_accessories: 'Accessories',
  catalog_device_interfaces: 'Device Interface',
  catalog_interfaces: 'Interfaces',
  catalog_device_made_in: 'Device Made In',
  catalog_device_encryption: 'Device Encryption',
  catalog_device_platter_counts: 'Device Platter No',
  catalog_device_head_counts: 'Device Head No',
  inventory_locations: 'Inventory Locations',
  catalog_service_types: 'Service Types',
  catalog_service_problems: 'Device Problems',
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
