ALTER TABLE public.master_modules
  ADD COLUMN IF NOT EXISTS is_gateable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_flag_key text;

-- Core areas always available (never gated):
UPDATE public.master_modules SET is_gateable = false WHERE slug IN ('dashboard','settings');

-- Bridge modules to the legacy tenants.feature_flags registry nav.* keys (back-compat):
UPDATE public.master_modules SET feature_flag_key = 'nav.hr'        WHERE slug IN ('hr','payroll');
UPDATE public.master_modules SET feature_flag_key = 'nav.financial' WHERE slug IN ('invoices','expenses','banking','reports');
UPDATE public.master_modules SET feature_flag_key = 'nav.business'  WHERE slug IN ('customers','quotes');
UPDATE public.master_modules SET feature_flag_key = 'nav.resources' WHERE slug IN ('inventory','stock','suppliers');

-- Canonical idempotent seed covering the full module catalog (15 rows live in DB as of 2026-07-19).
-- order_index is GENERATED ALWAYS AS (sort_order) STORED, so it is intentionally omitted here.
INSERT INTO public.master_modules (name, slug, description, icon, sort_order, is_active, category, is_gateable, feature_flag_key) VALUES
  ('Dashboard', 'dashboard', 'Main dashboard and overview', 'LayoutDashboard', 1, true, 'Dashboard', false, NULL),
  ('Cases', 'cases', 'Case management and tracking', 'Briefcase', 2, true, 'Cases', true, NULL),
  ('Customers', 'customers', 'Customer and company management', 'Users', 3, true, 'Customers', true, 'nav.business'),
  ('Invoices', 'invoices', 'Invoice management', 'FileText', 4, true, 'Invoices', true, 'nav.financial'),
  ('Quotes', 'quotes', 'Quote and proposal management', 'FileCheck', 5, true, 'Quotes', true, 'nav.business'),
  ('Inventory', 'inventory', 'Inventory and donor drive management', 'Package', 6, true, 'Inventory', true, 'nav.resources'),
  ('Stock', 'stock', 'Stock and sales management', 'ShoppingCart', 7, true, 'Stock', true, 'nav.resources'),
  ('Suppliers', 'suppliers', 'Supplier relationship management', 'Truck', 8, true, 'Suppliers', true, 'nav.resources'),
  ('Banking', 'banking', 'Bank accounts and reconciliation', 'Building2', 9, true, 'Banking', true, 'nav.financial'),
  ('Expenses', 'expenses', 'Expense tracking and management', 'Receipt', 10, true, 'Expenses', true, 'nav.financial'),
  ('HR', 'hr', 'Human resources management', 'UserCog', 11, true, 'HR', true, 'nav.hr'),
  ('Payroll', 'payroll', 'Payroll processing', 'DollarSign', 12, true, 'Payroll', true, 'nav.hr'),
  ('Reports', 'reports', 'Business reports and analytics', 'BarChart3', 13, true, 'Reports', true, 'nav.financial'),
  ('Knowledge Base', 'knowledge-base', 'Internal knowledge base', 'BookOpen', 14, true, 'Knowledge Base', true, NULL),
  ('Settings', 'settings', 'System and tenant settings', 'Settings', 15, true, 'Settings', false, NULL)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  is_gateable = EXCLUDED.is_gateable,
  feature_flag_key = EXCLUDED.feature_flag_key;
