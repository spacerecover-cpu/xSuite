-- ============================================================
-- BASELINE SCHEMA DUMP — Live Supabase DB (2026-04-09)
-- Project: ssmbegiyjivrcwgcqutu (xSuite)
-- This replaces all prior incremental migrations.
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- ============================================================
-- 2. CUSTOM TYPES (ENUMS)
-- ============================================================

CREATE TYPE public.custody_action_category AS ENUM ('creation', 'modification', 'access', 'transfer', 'verification', 'communication', 'evidence_handling', 'financial', 'critical_event');
CREATE TYPE public.custody_status AS ENUM ('in_custody', 'in_transit', 'checked_out', 'archived', 'disposed');
CREATE TYPE public.custody_transfer_status AS ENUM ('initiated', 'pending_acceptance', 'accepted', 'rejected', 'cancelled');
CREATE TYPE public.integrity_check_result AS ENUM ('passed', 'failed', 'warning', 'not_applicable');


-- ============================================================
-- 3. TABLES
-- ============================================================

-- Table: account_balance_snapshots
CREATE TABLE public.account_balance_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bank_account_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  balance numeric(12,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: account_transfers
CREATE TABLE public.account_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  transfer_date timestamp with time zone NOT NULL DEFAULT now(),
  reference text,
  notes text,
  status text DEFAULT 'completed'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: accounting_locales
CREATE TABLE public.accounting_locales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  locale_code text NOT NULL,
  name text NOT NULL,
  currency_code text,
  date_format text,
  number_format text,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  currency_symbol text,
  decimal_places integer DEFAULT 2,
  currency_position text DEFAULT 'before'::text,
  decimal_separator text DEFAULT '.'::text,
  thousands_separator text DEFAULT ','::text
);

-- Table: announcement_dismissals
CREATE TABLE public.announcement_dismissals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  dismissed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: asset_assignments
CREATE TABLE public.asset_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT now(),
  returned_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: asset_categories
CREATE TABLE public.asset_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  depreciation_method text DEFAULT 'straight_line'::text,
  useful_life_years integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: asset_depreciation
CREATE TABLE public.asset_depreciation (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  depreciation_amount numeric(12,2) NOT NULL,
  accumulated_depreciation numeric(12,2) NOT NULL,
  book_value numeric(12,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: asset_maintenance
CREATE TABLE public.asset_maintenance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  maintenance_type text NOT NULL,
  description text,
  cost numeric(12,2),
  vendor text,
  scheduled_date date,
  completed_date date,
  performed_by text,
  status text DEFAULT 'scheduled'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: assets
CREATE TABLE public.assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_number text,
  name text NOT NULL,
  description text,
  category_id uuid,
  serial_number text,
  model text,
  manufacturer text,
  purchase_date date,
  purchase_price numeric(12,2),
  current_value numeric(12,2),
  salvage_value numeric(12,2),
  location text,
  status text DEFAULT 'active'::text,
  assigned_to uuid,
  warranty_expiry date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: attendance_records
CREATE TABLE public.attendance_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  date date NOT NULL,
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  status text DEFAULT 'present'::text,
  hours_worked numeric(5,2),
  overtime_hours numeric(5,2) DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: audit_trails
CREATE TABLE public.audit_trails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  performed_by uuid,
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: bank_accounts
CREATE TABLE public.bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  bank_name text,
  account_number text,
  iban text,
  swift_code text,
  branch_code text,
  currency text DEFAULT 'USD'::text,
  account_type text DEFAULT 'checking'::text,
  opening_balance numeric(12,2) DEFAULT 0,
  current_balance numeric(12,2) DEFAULT 0,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: bank_reconciliation_sessions
CREATE TABLE public.bank_reconciliation_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bank_account_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  opening_balance numeric(12,2),
  closing_balance numeric(12,2),
  status text DEFAULT 'in_progress'::text,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: bank_transactions
CREATE TABLE public.bank_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bank_account_id uuid NOT NULL,
  transaction_date timestamp with time zone NOT NULL,
  description text,
  reference text,
  amount numeric(12,2) NOT NULL,
  type text NOT NULL,
  category text,
  is_reconciled boolean DEFAULT false,
  reconciled_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: billing_coupons
CREATE TABLE public.billing_coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  paypal_coupon_id text,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL,
  discount_value numeric NOT NULL,
  currency text DEFAULT 'USD'::text,
  applies_to_plans text[],
  duration text DEFAULT 'once'::text,
  duration_months integer,
  max_redemptions integer,
  redemptions_count integer DEFAULT 0,
  valid_from timestamp with time zone DEFAULT now(),
  valid_until timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: billing_events
CREATE TABLE public.billing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  paypal_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at timestamp with time zone,
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: billing_invoice_items
CREATE TABLE public.billing_invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  paypal_item_id text,
  description text NOT NULL,
  quantity integer DEFAULT 1,
  unit_amount integer NOT NULL,
  amount integer NOT NULL,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  item_type text DEFAULT 'subscription'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: billing_invoices
CREATE TABLE public.billing_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subscription_id uuid,
  paypal_invoice_id text,
  paypal_payment_id text,
  paypal_transaction_id text,
  invoice_number text NOT NULL,
  invoice_date timestamp with time zone DEFAULT now(),
  due_date timestamp with time zone,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  currency text DEFAULT 'USD'::text,
  subtotal integer NOT NULL DEFAULT 0,
  discount_amount integer DEFAULT 0,
  tax_amount integer DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  amount_paid integer DEFAULT 0,
  amount_due integer DEFAULT 0,
  tax_rate numeric,
  tax_type text,
  tax_country text,
  status text DEFAULT 'draft'::text,
  paid_at timestamp with time zone,
  payment_method text,
  invoice_pdf_url text,
  memo text,
  footer text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: branches
CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  address text,
  city_id uuid,
  country_id uuid,
  phone text,
  email text,
  is_main boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_attachments
CREATE TABLE public.case_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  category text,
  description text,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_communications
CREATE TABLE public.case_communications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'note'::text,
  subject text,
  content text,
  direction text DEFAULT 'internal'::text,
  sent_to text,
  sent_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_devices
CREATE TABLE public.case_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  device_type_id uuid,
  brand_id uuid,
  model text,
  serial_number text,
  capacity_id uuid,
  interface_id uuid,
  condition_id uuid,
  device_role_id bigint,
  role_notes text,
  encryption_id uuid,
  form_factor_id uuid,
  firmware_version text,
  pcb_number text,
  head_count_id uuid,
  platter_count_id uuid,
  made_in_id uuid,
  password text,
  physical_damage text,
  symptoms text,
  diagnosis text,
  recovery_result text,
  data_recovered_size text,
  notes text,
  photos text[],
  accessories text[],
  is_primary boolean DEFAULT false,
  storage_location text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_diagnostics
CREATE TABLE public.case_diagnostics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  device_id uuid,
  diagnostic_type text,
  tool_used text,
  result text,
  findings text,
  recommendations text,
  performed_by uuid,
  performed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_engineers
CREATE TABLE public.case_engineers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_text text DEFAULT 'Team Member'::text,
  assigned_at timestamp with time zone DEFAULT now(),
  removed_at timestamp with time zone,
  assigned_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_follow_ups
CREATE TABLE public.case_follow_ups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  follow_up_date timestamp with time zone NOT NULL,
  type text DEFAULT 'general'::text,
  notes text,
  status text DEFAULT 'pending'::text,
  completed_at timestamp with time zone,
  assigned_to uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_internal_notes
CREATE TABLE public.case_internal_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  content text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_job_history
CREATE TABLE public.case_job_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  action text NOT NULL,
  details text,
  old_value text,
  new_value text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_milestones
CREATE TABLE public.case_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending'::text,
  due_date timestamp with time zone,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_portal_visibility
CREATE TABLE public.case_portal_visibility (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  is_visible boolean DEFAULT true,
  visible_fields text[] DEFAULT '{}'::text[],
  show_diagnostics boolean DEFAULT false,
  show_timeline boolean DEFAULT true,
  custom_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_qa_checklists
CREATE TABLE public.case_qa_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  checklist_name text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending'::text,
  completed_by uuid,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_quote_items
CREATE TABLE public.case_quote_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  total_price numeric(12,2) NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_quotes
CREATE TABLE public.case_quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  quote_number text,
  status text DEFAULT 'draft'::text,
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  notes text,
  valid_until timestamp with time zone,
  approved_at timestamp with time zone,
  approved_by uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_recovery_attempts
CREATE TABLE public.case_recovery_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  device_id uuid,
  attempt_number integer DEFAULT 1,
  method text,
  tool_used text,
  result text,
  data_recovered text,
  notes text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_report_sections
CREATE TABLE public.case_report_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  report_id uuid NOT NULL,
  section_type text,
  title text,
  content text,
  sort_order integer DEFAULT 0,
  is_visible boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: case_reports
CREATE TABLE public.case_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  template_id uuid,
  report_number text,
  title text NOT NULL,
  status text DEFAULT 'draft'::text,
  content jsonb DEFAULT '{}'::jsonb,
  generated_at timestamp with time zone,
  generated_by uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: cases
CREATE TABLE public.cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_number text,
  customer_id uuid,
  company_id uuid,
  status_id uuid,
  priority_id uuid,
  service_type_id uuid,
  service_location_id uuid,
  subject text,
  description text,
  diagnosis text,
  resolution text,
  internal_notes text,
  estimated_completion timestamp with time zone,
  actual_completion timestamp with time zone,
  total_amount numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  net_amount numeric(12,2) DEFAULT 0,
  is_urgent boolean DEFAULT false,
  is_warranty boolean DEFAULT false,
  warranty_details text,
  referred_by text,
  branch_id uuid,
  assigned_to uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  case_no text GENERATED ALWAYS AS (case_number) STORED,
  title text GENERATED ALWAYS AS (subject) STORED,
  assigned_engineer_id uuid GENERATED ALWAYS AS (assigned_to) STORED,
  status text,
  priority text,
  client_reference text,
  contact_id uuid
);

-- Table: catalog_accessories
CREATE TABLE public.catalog_accessories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: catalog_device_brands
CREATE TABLE public.catalog_device_brands (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_capacities
CREATE TABLE public.catalog_device_capacities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  size_bytes bigint,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_component_statuses
CREATE TABLE public.catalog_device_component_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_conditions
CREATE TABLE public.catalog_device_conditions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_encryption
CREATE TABLE public.catalog_device_encryption (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_form_factors
CREATE TABLE public.catalog_device_form_factors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_head_counts
CREATE TABLE public.catalog_device_head_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_interfaces
CREATE TABLE public.catalog_device_interfaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_made_in
CREATE TABLE public.catalog_device_made_in (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_platter_counts
CREATE TABLE public.catalog_device_platter_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_device_roles
CREATE TABLE public.catalog_device_roles (
  id bigint NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: catalog_device_types
CREATE TABLE public.catalog_device_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_donor_compatibility_matrix
CREATE TABLE public.catalog_donor_compatibility_matrix (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_model text NOT NULL,
  target_model text NOT NULL,
  brand_id uuid,
  compatibility_level text DEFAULT 'unknown'::text,
  pcb_number text,
  firmware_range text,
  head_map text,
  notes text,
  verified_by uuid,
  verified_at timestamp with time zone,
  success_count integer DEFAULT 0,
  failure_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_interfaces
CREATE TABLE public.catalog_interfaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_service_categories
CREATE TABLE public.catalog_service_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_service_line_items
CREATE TABLE public.catalog_service_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid,
  name text NOT NULL,
  description text,
  default_price numeric(10,2),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_service_locations
CREATE TABLE public.catalog_service_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_service_problems
CREATE TABLE public.catalog_service_problems (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: catalog_service_types
CREATE TABLE public.catalog_service_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: chain_of_custody
CREATE TABLE public.chain_of_custody (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  device_id uuid,
  action_category custody_action_category NOT NULL,
  action text NOT NULL,
  description text,
  actor_id uuid,
  actor_name text NOT NULL,
  actor_role text,
  location text,
  custody_status custody_status,
  evidence_hash text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: chain_of_custody_access_log
CREATE TABLE public.chain_of_custody_access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  custody_entry_id uuid,
  device_id uuid,
  access_type text NOT NULL,
  access_purpose text NOT NULL,
  access_method text,
  tools_used text[],
  accessor_id uuid,
  accessor_name text NOT NULL,
  supervisor_id uuid,
  supervisor_approved boolean DEFAULT false,
  access_started_at timestamp with time zone DEFAULT now(),
  access_ended_at timestamp with time zone,
  access_location text,
  ip_address inet,
  device_fingerprint text,
  notes text,
  findings text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: chain_of_custody_integrity_checks
CREATE TABLE public.chain_of_custody_integrity_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  device_id uuid,
  check_type text NOT NULL,
  result integrity_check_result NOT NULL,
  expected_hash text,
  actual_hash text,
  details text,
  checked_by uuid,
  checked_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: chain_of_custody_transfers
CREATE TABLE public.chain_of_custody_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  device_id uuid,
  from_person_id uuid,
  from_person_name text NOT NULL,
  to_person_id uuid,
  to_person_name text NOT NULL,
  transfer_reason text NOT NULL,
  transfer_status custody_transfer_status DEFAULT 'initiated'::custody_transfer_status,
  from_location text,
  to_location text,
  notes text,
  accepted_at timestamp with time zone,
  rejected_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: clone_drives
CREATE TABLE public.clone_drives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid,
  device_id uuid,
  drive_label text,
  serial_number text,
  capacity text,
  status text DEFAULT 'available'::text,
  assigned_to uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: companies
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_number text,
  name text NOT NULL,
  email text,
  phone text,
  website text,
  address text,
  city_id uuid,
  country_id uuid,
  industry_id uuid,
  tax_number text,
  registration_number text,
  logo_url text,
  notes text,
  is_active boolean DEFAULT true,
  contact_person text,
  contact_email text,
  contact_phone text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  company_name text GENERATED ALWAYS AS (name) STORED
);

-- Table: company_documents
CREATE TABLE public.company_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: company_settings
CREATE TABLE public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_name text,
  company_email text,
  company_phone text,
  company_address text,
  company_website text,
  company_logo_url text,
  tax_number text,
  registration_number text,
  default_currency text DEFAULT 'USD'::text,
  date_format text DEFAULT 'DD/MM/YYYY'::text,
  time_zone text DEFAULT 'UTC'::text,
  fiscal_year_start integer DEFAULT 1,
  invoice_prefix text DEFAULT 'INV'::text,
  quote_prefix text DEFAULT 'QT'::text,
  case_prefix text DEFAULT 'CASE'::text,
  portal_enabled boolean DEFAULT true,
  portal_maintenance_mode boolean DEFAULT false,
  portal_maintenance_message text,
  portal_custom_css text,
  portal_welcome_message text,
  email_notifications boolean DEFAULT true,
  sms_notifications boolean DEFAULT false,
  accounting_locale text DEFAULT 'en-ZA'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  location jsonb,
  basic_info jsonb DEFAULT '{}'::jsonb,
  contact_info jsonb DEFAULT '{}'::jsonb,
  branding jsonb DEFAULT '{}'::jsonb,
  online_presence jsonb DEFAULT '{}'::jsonb,
  legal_compliance jsonb DEFAULT '{}'::jsonb,
  banking_info jsonb DEFAULT '{}'::jsonb,
  localization jsonb DEFAULT '{}'::jsonb,
  clone_defaults jsonb DEFAULT '{}'::jsonb,
  portal_settings jsonb DEFAULT '{}'::jsonb
);

-- Table: coupon_redemptions
CREATE TABLE public.coupon_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  coupon_id uuid NOT NULL,
  subscription_id uuid,
  redeemed_at timestamp with time zone NOT NULL DEFAULT now(),
  discount_applied numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: customer_communications
CREATE TABLE public.customer_communications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  type text NOT NULL,
  subject text,
  content text,
  direction text DEFAULT 'outbound'::text,
  status text DEFAULT 'sent'::text,
  sent_by uuid,
  sent_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: customer_company_relationships
CREATE TABLE public.customer_company_relationships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  company_id uuid NOT NULL,
  role text,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: customer_groups
CREATE TABLE public.customer_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  discount_percentage numeric(5,2),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: customers_enhanced
CREATE TABLE public.customers_enhanced (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_number text,
  customer_name text NOT NULL,
  email text,
  mobile_number text,
  phone text,
  whatsapp_number text,
  address text,
  city_id uuid,
  country_id uuid,
  company_name text,
  industry_id uuid,
  customer_group_id uuid,
  profile_photo_url text,
  id_type text,
  id_number text,
  tax_number text,
  notes text,
  source text,
  referred_by uuid,
  portal_enabled boolean DEFAULT false,
  portal_password_hash text,
  portal_last_login timestamp with time zone,
  portal_failed_login_attempts integer DEFAULT 0,
  portal_locked_until timestamp with time zone,
  is_active boolean DEFAULT true,
  total_cases integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: data_retention_policies
CREATE TABLE public.data_retention_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  table_name text NOT NULL,
  retention_days integer NOT NULL DEFAULT 2555,
  auto_purge boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: data_subject_requests
CREATE TABLE public.data_subject_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  request_type text NOT NULL,
  subject_email text NOT NULL,
  subject_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  requested_by uuid NOT NULL,
  processed_by uuid,
  notes text,
  export_file_path text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: database_backups
CREATE TABLE public.database_backups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  backup_type text DEFAULT 'manual'::text,
  file_url text,
  file_size bigint,
  status text DEFAULT 'completed'::text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: departments
CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  manager_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: device_diagnostics
CREATE TABLE public.device_diagnostics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  device_id uuid,
  diagnostic_type text,
  tool_used text,
  result jsonb DEFAULT '{}'::jsonb,
  notes text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: document_templates
CREATE TABLE public.document_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  category_id uuid,
  type_id uuid,
  content text,
  variables jsonb DEFAULT '[]'::jsonb,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  template_type_id uuid
);

-- Table: employee_documents
CREATE TABLE public.employee_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  category text,
  expiry_date date,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: employee_loans
CREATE TABLE public.employee_loans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  loan_number text,
  loan_type text DEFAULT 'personal'::text,
  amount numeric(12,2) NOT NULL,
  interest_rate numeric(5,2) DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  installment_amount numeric(12,2) NOT NULL,
  installments integer NOT NULL,
  paid_installments integer DEFAULT 0,
  remaining_amount numeric(12,2),
  status text DEFAULT 'active'::text,
  start_date date NOT NULL,
  end_date date,
  approved_by uuid,
  approved_at timestamp with time zone,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: employee_salary_components
CREATE TABLE public.employee_salary_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  component_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  percentage numeric(5,2),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: employee_salary_config
CREATE TABLE public.employee_salary_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  basic_salary numeric(12,2) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: employee_salary_structures
CREATE TABLE public.employee_salary_structures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  name text NOT NULL,
  effective_date date NOT NULL,
  components jsonb DEFAULT '[]'::jsonb,
  total_earnings numeric(12,2) DEFAULT 0,
  total_deductions numeric(12,2) DEFAULT 0,
  net_salary numeric(12,2) DEFAULT 0,
  is_current boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: employees
CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  employee_number text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  mobile text,
  date_of_birth date,
  gender text,
  nationality text,
  id_number text,
  passport_number text,
  department_id uuid,
  position_id uuid,
  manager_id uuid,
  employment_type text DEFAULT 'full_time'::text,
  employment_status text DEFAULT 'active'::text,
  hire_date date,
  probation_end_date date,
  termination_date date,
  termination_reason text,
  address text,
  city text,
  country text,
  postal_code text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  bank_name text,
  bank_account_number text,
  bank_branch text,
  basic_salary numeric(12,2) DEFAULT 0,
  salary_currency text DEFAULT 'USD'::text,
  avatar_url text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: expense_attachments
CREATE TABLE public.expense_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: expenses
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  expense_number text,
  category_id uuid,
  bank_account_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  expense_date timestamp with time zone DEFAULT now(),
  description text,
  vendor text,
  reference text,
  tax_amount numeric(12,2) DEFAULT 0,
  is_billable boolean DEFAULT false,
  case_id uuid,
  status text DEFAULT 'approved'::text,
  receipt_url text,
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: financial_audit_logs
CREATE TABLE public.financial_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  performed_by uuid,
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address inet
);

-- Table: financial_transactions
CREATE TABLE public.financial_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  transaction_type text NOT NULL,
  category_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  transaction_date timestamp with time zone DEFAULT now(),
  description text,
  reference_type text,
  reference_id uuid,
  bank_account_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: geo_cities
CREATE TABLE public.geo_cities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL,
  name text NOT NULL,
  state_province text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: geo_countries
CREATE TABLE public.geo_countries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  code3 text,
  phone_code text,
  currency_code text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  currency_symbol text NOT NULL DEFAULT '$'::text,
  currency_name text NOT NULL DEFAULT 'US Dollar'::text,
  decimal_places integer NOT NULL DEFAULT 2,
  decimal_separator text NOT NULL DEFAULT '.'::text,
  thousands_separator text NOT NULL DEFAULT ','::text,
  currency_position text NOT NULL DEFAULT 'before'::text,
  tax_system text NOT NULL DEFAULT 'NONE'::text,
  tax_label text NOT NULL DEFAULT 'Tax'::text,
  tax_number_label text NOT NULL DEFAULT 'Tax ID'::text,
  tax_number_format text,
  tax_number_placeholder text,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY'::text,
  time_format text NOT NULL DEFAULT '12h'::text,
  timezone text NOT NULL DEFAULT 'UTC'::text,
  week_starts_on integer NOT NULL DEFAULT 0,
  address_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone_format text,
  postal_code_format text,
  postal_code_label text NOT NULL DEFAULT 'Postal Code'::text,
  locale_code text NOT NULL DEFAULT 'en-US'::text,
  language_code text NOT NULL DEFAULT 'en'::text,
  fiscal_year_start text NOT NULL DEFAULT '01-01'::text,
  invoice_prefix_required boolean NOT NULL DEFAULT false,
  tax_invoice_required boolean NOT NULL DEFAULT false
);

-- Table: import_export_jobs
CREATE TABLE public.import_export_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_id uuid,
  type text NOT NULL,
  entity_type text NOT NULL,
  status text DEFAULT 'pending'::text,
  file_url text,
  file_name text,
  total_records integer DEFAULT 0,
  processed_records integer DEFAULT 0,
  success_records integer DEFAULT 0,
  error_records integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: import_export_logs
CREATE TABLE public.import_export_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  row_number integer,
  status text,
  message text,
  data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: import_export_templates
CREATE TABLE public.import_export_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  entity_type text NOT NULL,
  mapping jsonb DEFAULT '{}'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: import_field_mappings
CREATE TABLE public.import_field_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_id uuid NOT NULL,
  source_field text NOT NULL,
  target_field text NOT NULL,
  transformation text,
  default_value text,
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_assignments
CREATE TABLE public.inventory_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  assigned_to uuid,
  assigned_by uuid,
  assignment_type text,
  notes text,
  assigned_at timestamp with time zone DEFAULT now(),
  returned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_case_assignments
CREATE TABLE public.inventory_case_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  case_id uuid NOT NULL,
  assigned_by uuid,
  purpose text,
  notes text,
  assigned_at timestamp with time zone DEFAULT now(),
  returned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_items
CREATE TABLE public.inventory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_number text,
  name text NOT NULL,
  description text,
  category_id uuid,
  item_category_id uuid,
  brand_id uuid,
  model text,
  serial_number text,
  capacity_id uuid,
  interface_id uuid,
  condition_id uuid,
  status_id uuid,
  location_id uuid,
  purchase_date date,
  purchase_price numeric(12,2),
  supplier_id uuid,
  firmware_version text,
  pcb_number text,
  head_map text,
  notes text,
  photos text[],
  is_donor boolean DEFAULT false,
  donor_parts_available jsonb DEFAULT '{}'::jsonb,
  quantity integer DEFAULT 1,
  min_quantity integer DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_locations
CREATE TABLE public.inventory_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  location_code text,
  description text,
  parent_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_parts_usage
CREATE TABLE public.inventory_parts_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  donor_item_id uuid,
  case_id uuid,
  part_type text NOT NULL,
  part_description text,
  quantity integer DEFAULT 1,
  status text DEFAULT 'used'::text,
  harvested_by uuid,
  harvested_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_photos
CREATE TABLE public.inventory_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  photo_url text NOT NULL,
  caption text,
  sort_order integer DEFAULT 0,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_reservations
CREATE TABLE public.inventory_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  case_id uuid,
  reserved_by uuid,
  reserved_until timestamp with time zone,
  notes text,
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_search_templates
CREATE TABLE public.inventory_search_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: inventory_status_history
CREATE TABLE public.inventory_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  old_status_id uuid,
  new_status_id uuid,
  changed_by uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: inventory_transactions
CREATE TABLE public.inventory_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  transaction_type text NOT NULL,
  quantity integer DEFAULT 1,
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: invoice_line_items
CREATE TABLE public.invoice_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  discount numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,2),
  tax_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: invoices
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_number text,
  case_id uuid,
  customer_id uuid,
  company_id uuid,
  status_id uuid,
  invoice_type text DEFAULT 'tax_invoice'::text,
  invoice_date timestamp with time zone DEFAULT now(),
  due_date timestamp with time zone,
  currency text DEFAULT 'USD'::text,
  subtotal numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,2),
  tax_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  amount_paid numeric(12,2) DEFAULT 0,
  balance_due numeric(12,2) DEFAULT 0,
  notes text,
  terms text,
  footer text,
  bank_account_id uuid,
  converted_from_quote_id uuid,
  is_proforma boolean DEFAULT false,
  sent_at timestamp with time zone,
  paid_at timestamp with time zone,
  voided_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  status text
);

-- Table: kb_article_tags
CREATE TABLE public.kb_article_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  article_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: kb_article_versions
CREATE TABLE public.kb_article_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  article_id uuid NOT NULL,
  version_number integer NOT NULL,
  title text,
  content text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: kb_articles
CREATE TABLE public.kb_articles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  category_id uuid,
  title text NOT NULL,
  slug text,
  content text,
  excerpt text,
  status text DEFAULT 'draft'::text,
  is_pinned boolean DEFAULT false,
  view_count integer DEFAULT 0,
  author_id uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: kb_categories
CREATE TABLE public.kb_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  slug text,
  description text,
  parent_id uuid,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: kb_tags
CREATE TABLE public.kb_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  slug text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: leave_balances
CREATE TABLE public.leave_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  leave_type_id uuid NOT NULL,
  year integer NOT NULL,
  total_days numeric(5,1) NOT NULL,
  used_days numeric(5,1) DEFAULT 0,
  remaining_days numeric(5,1),
  carried_over numeric(5,1) DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: leave_requests
CREATE TABLE public.leave_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  leave_type_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,1) NOT NULL,
  reason text,
  status text DEFAULT 'pending'::text,
  attachment_url text,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: loan_repayments
CREATE TABLE public.loan_repayments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  repayment_date date NOT NULL,
  payment_method text,
  reference text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: master_case_priorities
CREATE TABLE public.master_case_priorities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_case_report_templates
CREATE TABLE public.master_case_report_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_data jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_case_statuses
CREATE TABLE public.master_case_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  sort_order integer DEFAULT 0,
  is_default boolean DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  type text DEFAULT 'active'::text
);

-- Table: master_currency_codes
CREATE TABLE public.master_currency_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  symbol text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_expense_categories
CREATE TABLE public.master_expense_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_industries
CREATE TABLE public.master_industries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_inventory_categories
CREATE TABLE public.master_inventory_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_inventory_condition_types
CREATE TABLE public.master_inventory_condition_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_inventory_item_categories
CREATE TABLE public.master_inventory_item_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_inventory_status_types
CREATE TABLE public.master_inventory_status_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_invoice_statuses
CREATE TABLE public.master_invoice_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_leave_types
CREATE TABLE public.master_leave_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  default_days numeric DEFAULT 0,
  is_paid boolean DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_modules
CREATE TABLE public.master_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  icon text,
  parent_id uuid,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  category text,
  order_index integer GENERATED ALWAYS AS (sort_order) STORED
);

-- Table: master_payment_methods
CREATE TABLE public.master_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_payroll_components
CREATE TABLE public.master_payroll_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  description text,
  is_taxable boolean DEFAULT false,
  is_mandatory boolean DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_purchase_order_statuses
CREATE TABLE public.master_purchase_order_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_quote_statuses
CREATE TABLE public.master_quote_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_supplier_categories
CREATE TABLE public.master_supplier_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_supplier_payment_terms
CREATE TABLE public.master_supplier_payment_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  days integer DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_template_categories
CREATE TABLE public.master_template_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_template_types
CREATE TABLE public.master_template_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  code text
);

-- Table: master_template_variables
CREATE TABLE public.master_template_variables (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  variable_key text NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: master_transaction_categories
CREATE TABLE public.master_transaction_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: ndas
CREATE TABLE public.ndas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid,
  company_id uuid,
  nda_number text,
  title text NOT NULL,
  content text,
  status text DEFAULT 'draft'::text,
  signed_at timestamp with time zone,
  expires_at timestamp with time zone,
  file_url text,
  signed_by_name text,
  signed_by_email text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: number_sequences
CREATE TABLE public.number_sequences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  scope text NOT NULL,
  prefix text,
  current_value bigint DEFAULT 0,
  padding integer DEFAULT 4,
  reset_annually boolean DEFAULT false,
  last_reset_year integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: number_sequences_audit
CREATE TABLE public.number_sequences_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sequence_id uuid,
  scope text,
  old_value bigint,
  new_value bigint,
  action text,
  user_role text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: onboarding_checklist_items
CREATE TABLE public.onboarding_checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  checklist_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to_role text,
  sort_order integer DEFAULT 0,
  is_required boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: onboarding_checklists
CREATE TABLE public.onboarding_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: onboarding_progress
CREATE TABLE public.onboarding_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  current_step text DEFAULT 'company_info'::text,
  steps_completed text[] DEFAULT '{}'::text[],
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: onboarding_tasks
CREATE TABLE public.onboarding_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  checklist_item_id uuid,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending'::text,
  completed_at timestamp with time zone,
  completed_by uuid,
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payment_allocations
CREATE TABLE public.payment_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payment_disbursements
CREATE TABLE public.payment_disbursements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  disbursement_number text,
  bank_account_id uuid,
  amount numeric(12,2) NOT NULL,
  disbursement_date timestamp with time zone DEFAULT now(),
  payee_name text,
  payee_type text,
  reference text,
  notes text,
  status text DEFAULT 'completed'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payment_receipts
CREATE TABLE public.payment_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  receipt_number text,
  payment_id uuid,
  customer_id uuid,
  amount numeric(12,2) NOT NULL,
  receipt_date timestamp with time zone DEFAULT now(),
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payments
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_number text,
  invoice_id uuid,
  customer_id uuid,
  bank_account_id uuid,
  payment_method_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  payment_date timestamp with time zone DEFAULT now(),
  reference text,
  notes text,
  status text DEFAULT 'completed'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payroll_adjustments
CREATE TABLE public.payroll_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  period_id uuid,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  description text,
  status text DEFAULT 'pending'::text,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payroll_bank_files
CREATE TABLE public.payroll_bank_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text,
  file_format text DEFAULT 'csv'::text,
  record_count integer DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  status text DEFAULT 'generated'::text,
  generated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payroll_periods
CREATE TABLE public.payroll_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  pay_date date,
  status text DEFAULT 'draft'::text,
  total_earnings numeric(12,2) DEFAULT 0,
  total_deductions numeric(12,2) DEFAULT 0,
  total_net numeric(12,2) DEFAULT 0,
  employee_count integer DEFAULT 0,
  processed_by uuid,
  processed_at timestamp with time zone,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payroll_record_items
CREATE TABLE public.payroll_record_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  record_id uuid NOT NULL,
  component_id uuid,
  component_name text NOT NULL,
  component_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  is_taxable boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payroll_records
CREATE TABLE public.payroll_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  basic_salary numeric(12,2) NOT NULL,
  total_earnings numeric(12,2) DEFAULT 0,
  total_deductions numeric(12,2) DEFAULT 0,
  net_salary numeric(12,2) DEFAULT 0,
  working_days numeric(5,1),
  hours_worked numeric(7,2),
  overtime_hours numeric(7,2) DEFAULT 0,
  overtime_amount numeric(12,2) DEFAULT 0,
  status text DEFAULT 'draft'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: payroll_settings
CREATE TABLE public.payroll_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  pay_frequency text DEFAULT 'monthly'::text,
  pay_day integer DEFAULT 25,
  currency text DEFAULT 'USD'::text,
  tax_calculation_method text DEFAULT 'progressive'::text,
  overtime_rate numeric(5,2) DEFAULT 1.5,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: pdf_generation_logs
CREATE TABLE public.pdf_generation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_type text NOT NULL,
  document_id uuid,
  file_name text,
  file_url text,
  file_size bigint,
  generation_time_ms integer,
  status text DEFAULT 'success'::text,
  error_message text,
  generated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: performance_reviews
CREATE TABLE public.performance_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  reviewer_id uuid,
  review_period text,
  review_date date,
  overall_rating numeric(3,1),
  ratings jsonb DEFAULT '{}'::jsonb,
  strengths text,
  improvements text,
  goals text,
  comments text,
  status text DEFAULT 'draft'::text,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: plan_features
CREATE TABLE public.plan_features (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  feature_key text NOT NULL,
  feature_name text NOT NULL,
  feature_name_ar text,
  is_enabled boolean DEFAULT true,
  limit_value integer,
  limit_type text,
  display_order integer DEFAULT 0,
  is_highlighted boolean DEFAULT false,
  deleted_at timestamp with time zone
);

-- Table: platform_admins
CREATE TABLE public.platform_admins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'admin'::text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  mfa_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Table: platform_announcements
CREATE TABLE public.platform_announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_ar text,
  content_en text NOT NULL,
  content_ar text,
  announcement_type text DEFAULT 'info'::text,
  target_audience text DEFAULT 'all'::text,
  show_as_banner boolean DEFAULT true,
  show_in_app boolean NOT NULL DEFAULT true,
  is_dismissible boolean DEFAULT true,
  start_date timestamp with time zone DEFAULT now(),
  end_date timestamp with time zone,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: platform_audit_logs
CREATE TABLE public.platform_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  tenant_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  performed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: platform_metrics
CREATE TABLE public.platform_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  total_tenants integer DEFAULT 0,
  active_tenants integer DEFAULT 0,
  trial_tenants integer DEFAULT 0,
  paying_tenants integer DEFAULT 0,
  total_users integer DEFAULT 0,
  active_users integer DEFAULT 0,
  mrr numeric DEFAULT 0,
  arr numeric DEFAULT 0,
  new_tenants integer DEFAULT 0,
  churned_tenants integer DEFAULT 0,
  open_tickets integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: portal_link_history
CREATE TABLE public.portal_link_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: positions
CREATE TABLE public.positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  title text NOT NULL,
  department_id uuid,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: profiles
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  tenant_id uuid,
  email text NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  phone text,
  role text NOT NULL DEFAULT 'viewer'::text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  case_access_level text DEFAULT 'full'::text,
  is_active boolean NOT NULL DEFAULT true,
  email_verified_at timestamp with time zone,
  last_login_at timestamp with time zone,
  password_reset_required boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  mfa_enabled boolean DEFAULT false,
  mfa_enrolled_at timestamp with time zone
);

-- Table: purchase_order_items
CREATE TABLE public.purchase_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  product_id uuid,
  stock_item_id uuid,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  discount numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,2),
  tax_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL,
  received_quantity integer DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: purchase_orders
CREATE TABLE public.purchase_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  po_number text,
  supplier_id uuid NOT NULL,
  status_id uuid,
  order_date timestamp with time zone DEFAULT now(),
  expected_delivery_date timestamp with time zone,
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  shipping_cost numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'USD'::text,
  shipping_address text,
  notes text,
  terms text,
  approved_by uuid,
  approved_at timestamp with time zone,
  received_at timestamp with time zone,
  received_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: quote_history
CREATE TABLE public.quote_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  action text NOT NULL,
  details text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: quote_items
CREATE TABLE public.quote_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  discount numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,2),
  tax_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: quotes
CREATE TABLE public.quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_number text,
  case_id uuid,
  customer_id uuid,
  company_id uuid,
  status_id uuid,
  quote_type text DEFAULT 'standard'::text,
  quote_date timestamp with time zone DEFAULT now(),
  valid_until timestamp with time zone,
  currency text DEFAULT 'USD'::text,
  subtotal numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,2),
  tax_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  notes text,
  terms text,
  approved_at timestamp with time zone,
  approved_by text,
  rejected_at timestamp with time zone,
  rejection_reason text,
  converted_to_invoice_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  status text
);

-- Table: rate_limits
CREATE TABLE public.rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: receipt_allocations
CREATE TABLE public.receipt_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: receipts
CREATE TABLE public.receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  receipt_number text,
  customer_id uuid,
  amount numeric(12,2) NOT NULL,
  receipt_date timestamp with time zone DEFAULT now(),
  payment_method text,
  reference text,
  notes text,
  status text DEFAULT 'issued'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: reconciliation_matches
CREATE TABLE public.reconciliation_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid,
  bank_transaction_id uuid,
  matched_record_type text,
  matched_record_id uuid,
  match_type text DEFAULT 'manual'::text,
  confidence numeric(5,2),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: recruitment_candidates
CREATE TABLE public.recruitment_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  resume_url text,
  cover_letter text,
  status text DEFAULT 'applied'::text,
  rating integer,
  notes text,
  interview_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: recruitment_jobs
CREATE TABLE public.recruitment_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  title text NOT NULL,
  department_id uuid,
  position_id uuid,
  description text,
  requirements text,
  employment_type text DEFAULT 'full_time'::text,
  location text,
  salary_range text,
  status text DEFAULT 'open'::text,
  openings integer DEFAULT 1,
  filled integer DEFAULT 0,
  posted_at timestamp with time zone,
  closes_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: report_section_library
CREATE TABLE public.report_section_library (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  section_type text,
  default_content text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  section_key text,
  section_name text,
  section_name_ar text,
  section_description text,
  section_description_ar text,
  category text DEFAULT 'general'::text,
  icon text DEFAULT 'FileText'::text,
  color text DEFAULT '#6B7280'::text,
  default_content_template text,
  is_system boolean DEFAULT false,
  is_hidden_in_editor boolean DEFAULT false,
  display_order integer DEFAULT 0
);

-- Table: report_section_presets
CREATE TABLE public.report_section_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  section_library_id uuid,
  content text,
  usage_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: report_template_section_mappings
CREATE TABLE public.report_template_section_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid,
  section_id uuid,
  sort_order integer DEFAULT 0,
  is_required boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: resource_clone_drives
CREATE TABLE public.resource_clone_drives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label text NOT NULL,
  serial_number text,
  brand_id uuid,
  capacity_id uuid,
  interface_id uuid,
  status text DEFAULT 'available'::text,
  condition text DEFAULT 'good'::text,
  location text,
  assigned_to_case_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: role_module_permissions
CREATE TABLE public.role_module_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  role text NOT NULL,
  module_id uuid NOT NULL,
  can_access boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: salary_components
CREATE TABLE public.salary_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  calculation_type text DEFAULT 'fixed'::text,
  percentage numeric(5,2),
  is_taxable boolean DEFAULT false,
  is_mandatory boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: signup_otps
CREATE TABLE public.signup_otps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
  verified boolean DEFAULT false,
  attempts integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: stock_adjustment_session_items
CREATE TABLE public.stock_adjustment_session_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  item_id uuid NOT NULL,
  expected_quantity integer,
  counted_quantity integer,
  variance integer,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: stock_adjustment_sessions
CREATE TABLE public.stock_adjustment_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_number text,
  status text DEFAULT 'draft'::text,
  reason text,
  notes text,
  started_by uuid,
  completed_by uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: stock_adjustments
CREATE TABLE public.stock_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  adjustment_type text NOT NULL,
  quantity integer NOT NULL,
  reason text,
  reference text,
  notes text,
  adjusted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: stock_alerts
CREATE TABLE public.stock_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  alert_type text NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  is_resolved boolean DEFAULT false,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_dismissed boolean DEFAULT false
);

-- Table: stock_categories
CREATE TABLE public.stock_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  parent_id uuid,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: stock_items
CREATE TABLE public.stock_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sku text,
  name text NOT NULL,
  description text,
  category_id uuid,
  location_id uuid,
  unit text DEFAULT 'piece'::text,
  cost_price numeric(12,2) DEFAULT 0,
  selling_price numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,2),
  quantity_on_hand integer DEFAULT 0,
  quantity_reserved integer DEFAULT 0,
  quantity_available integer GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  reorder_level integer DEFAULT 0,
  reorder_quantity integer DEFAULT 0,
  is_saleable boolean DEFAULT true,
  is_active boolean DEFAULT true,
  barcode text,
  weight numeric(10,3),
  dimensions text,
  supplier_id uuid,
  notes text,
  photos text[],
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  item_type text DEFAULT 'part'::text,
  current_quantity numeric GENERATED ALWAYS AS (quantity_on_hand) STORED,
  minimum_quantity numeric GENERATED ALWAYS AS (reorder_level) STORED,
  brand text
);

-- Table: stock_locations
CREATE TABLE public.stock_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  description text,
  address text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: stock_movements
CREATE TABLE public.stock_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  from_location_id uuid,
  to_location_id uuid,
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: stock_price_history
CREATE TABLE public.stock_price_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  old_cost_price numeric(12,2),
  new_cost_price numeric(12,2),
  old_selling_price numeric(12,2),
  new_selling_price numeric(12,2),
  changed_by uuid,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: stock_sale_items
CREATE TABLE public.stock_sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  item_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  discount numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: stock_sales
CREATE TABLE public.stock_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_number text,
  case_id uuid,
  customer_id uuid,
  sale_date timestamp with time zone DEFAULT now(),
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  status text DEFAULT 'completed'::text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: stock_serial_numbers
CREATE TABLE public.stock_serial_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  serial_number text NOT NULL,
  status text DEFAULT 'in_stock'::text,
  location_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: stock_transactions
CREATE TABLE public.stock_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  transaction_type text NOT NULL,
  quantity integer NOT NULL,
  unit_cost numeric(12,2),
  total_cost numeric(12,2),
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: subscription_plans
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  code text,
  description text,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  price_yearly numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD'::text,
  paypal_product_id text,
  paypal_plan_monthly_id text,
  paypal_plan_yearly_id text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{"max_cases": 100, "max_users": 5, "max_storage_gb": 10}'::jsonb,
  trial_days integer DEFAULT 14,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  api_calls_per_hour integer DEFAULT 1000,
  email_sends_per_day integer DEFAULT 100,
  pdf_generations_per_hour integer DEFAULT 50,
  storage_limit_mb integer DEFAULT 5120
);

-- Table: supplier_audit_trail
CREATE TABLE public.supplier_audit_trail (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: supplier_communications
CREATE TABLE public.supplier_communications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  type text NOT NULL,
  subject text,
  content text,
  direction text DEFAULT 'outbound'::text,
  sent_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: supplier_contacts
CREATE TABLE public.supplier_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  mobile text,
  is_primary boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: supplier_documents
CREATE TABLE public.supplier_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: supplier_performance_metrics
CREATE TABLE public.supplier_performance_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  metric_type text NOT NULL,
  value numeric(10,2),
  period_start date,
  period_end date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: supplier_products
CREATE TABLE public.supplier_products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  name text NOT NULL,
  sku text,
  description text,
  unit_price numeric(12,2),
  currency text DEFAULT 'USD'::text,
  lead_time_days integer,
  min_order_quantity integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: suppliers
CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_number text,
  name text NOT NULL,
  email text,
  phone text,
  website text,
  address text,
  city_id uuid,
  country_id uuid,
  category_id uuid,
  payment_terms_id uuid,
  tax_number text,
  registration_number text,
  contact_person text,
  contact_email text,
  contact_phone text,
  bank_name text,
  bank_account text,
  bank_branch text,
  rating integer,
  notes text,
  is_active boolean DEFAULT true,
  credit_limit numeric(12,2),
  outstanding_balance numeric(12,2) DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: support_ticket_messages
CREATE TABLE public.support_ticket_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  is_internal_note boolean DEFAULT false,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: support_tickets
CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL,
  tenant_id uuid NOT NULL,
  customer_id uuid,
  subject text NOT NULL,
  category text DEFAULT 'general'::text,
  priority text DEFAULT 'medium'::text,
  status text DEFAULT 'open'::text,
  assigned_to uuid,
  resolution_notes text,
  satisfaction_rating integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  closed_at timestamp with time zone,
  deleted_at timestamp with time zone
);

-- Table: system_logs
CREATE TABLE public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'info'::text,
  category text,
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  ip_address inet,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: system_seed_status
CREATE TABLE public.system_seed_status (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  is_seeded boolean DEFAULT false,
  seeded_at timestamp with time zone,
  record_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: system_settings
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value jsonb,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: tax_rates
CREATE TABLE public.tax_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  rate numeric(5,2) NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: template_versions
CREATE TABLE public.template_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version_number integer NOT NULL,
  content text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: templates
CREATE TABLE public.templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  content text,
  template_type text,
  category text,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: tenant_activity_log
CREATE TABLE public.tenant_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  activity_type text NOT NULL,
  activity_details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: tenant_health_metrics
CREATE TABLE public.tenant_health_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recorded_at timestamp with time zone DEFAULT now(),
  health_score integer,
  churn_risk text,
  engagement_level text,
  days_since_last_login integer DEFAULT 0,
  active_users_count integer DEFAULT 0,
  cases_created_last_30d integer DEFAULT 0,
  revenue_last_30d numeric DEFAULT 0,
  support_tickets_open integer DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: tenant_impersonation_sessions
CREATE TABLE public.tenant_impersonation_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  reason text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  actions_performed jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- Table: tenant_payment_methods
CREATE TABLE public.tenant_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_method_id text NOT NULL,
  payment_provider text DEFAULT 'paypal'::text,
  type text NOT NULL,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  card_funding text,
  paypal_email text,
  paypal_account_id text,
  bank_name text,
  bank_last4 text,
  is_default boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  billing_name text,
  billing_email text,
  billing_address jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: tenant_rate_limits
CREATE TABLE public.tenant_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  resource_type text NOT NULL,
  max_requests integer NOT NULL,
  window_seconds integer NOT NULL DEFAULT 3600,
  current_count integer DEFAULT 0,
  window_start timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: tenant_subscriptions
CREATE TABLE public.tenant_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'trialing'::text,
  billing_interval text NOT NULL DEFAULT 'month'::text,
  paypal_subscription_id text,
  paypal_plan_id text,
  paypal_customer_email text,
  paypal_payer_id text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  trial_start timestamp with time zone,
  trial_end timestamp with time zone,
  trial_used boolean DEFAULT false,
  cancelled_at timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  cancel_reason text,
  last_payment_date timestamp with time zone,
  last_payment_amount integer,
  next_billing_date timestamp with time zone,
  billing_email text,
  billing_name text,
  billing_address jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: tenants
CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  domain text,
  status text NOT NULL DEFAULT 'trial'::text,
  plan_id uuid,
  trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
  subscription_status text DEFAULT 'trialing'::text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  paypal_customer_id text,
  paypal_subscription_id text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  country_id uuid,
  currency_code text NOT NULL DEFAULT 'USD'::text,
  currency_symbol text NOT NULL DEFAULT '$'::text,
  decimal_places integer NOT NULL DEFAULT 2,
  tax_system text NOT NULL DEFAULT 'NONE'::text,
  tax_label text NOT NULL DEFAULT 'Tax'::text,
  tax_number_label text NOT NULL DEFAULT 'Tax ID'::text,
  tax_number text,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  locale_code text NOT NULL DEFAULT 'en-US'::text,
  timezone text NOT NULL DEFAULT 'UTC'::text,
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY'::text,
  fiscal_year_start text NOT NULL DEFAULT '01-01'::text
);

-- Table: timesheets
CREATE TABLE public.timesheets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  case_id uuid,
  date date NOT NULL,
  hours numeric(5,2) NOT NULL,
  description text,
  status text DEFAULT 'submitted'::text,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: usage_records
CREATE TABLE public.usage_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  metric_name text NOT NULL,
  quantity bigint NOT NULL DEFAULT 0,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  last_value bigint,
  delta bigint,
  reported_to_paypal boolean DEFAULT false,
  paypal_usage_record_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: usage_snapshots
CREATE TABLE public.usage_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  snapshot_hour integer,
  total_users integer DEFAULT 0,
  active_users integer DEFAULT 0,
  total_cases integer DEFAULT 0,
  cases_this_month integer DEFAULT 0,
  storage_bytes bigint DEFAULT 0,
  api_calls_today integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: user_activity_logs
CREATE TABLE public.user_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: user_activity_sessions
CREATE TABLE public.user_activity_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_start timestamp with time zone DEFAULT now(),
  session_end timestamp with time zone,
  ip_address inet,
  user_agent text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: user_preferences
CREATE TABLE public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  preferences jsonb DEFAULT '{}'::jsonb,
  theme text DEFAULT 'light'::text,
  language text DEFAULT 'en'::text,
  notifications jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: user_sessions
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token text,
  ip_address inet,
  user_agent text,
  started_at timestamp with time zone DEFAULT now(),
  last_active_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: user_sidebar_preferences
CREATE TABLE public.user_sidebar_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  collapsed_sections text[] DEFAULT '{}'::text[],
  pinned_items text[] DEFAULT '{}'::text[],
  sidebar_width integer,
  is_collapsed boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: vat_records
CREATE TABLE public.vat_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  vat_amount numeric(12,2) NOT NULL,
  vat_rate numeric(5,2) NOT NULL,
  tax_period text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: vat_returns
CREATE TABLE public.vat_returns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  output_vat numeric(12,2) DEFAULT 0,
  input_vat numeric(12,2) DEFAULT 0,
  net_vat numeric(12,2) DEFAULT 0,
  status text DEFAULT 'draft'::text,
  submitted_at timestamp with time zone,
  submitted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

-- Table: vat_transactions
CREATE TABLE public.vat_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  vat_return_id uuid,
  transaction_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  vat_amount numeric(12,2) NOT NULL,
  description text,
  reference_type text,
  reference_id uuid,
  transaction_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);


-- ============================================================
-- 4. PRIMARY KEYS & UNIQUE CONSTRAINTS
-- (regenerated from the live database 2026-06-10 — the original dump
--  emitted this section header with no statements, so no table had a PK
--  and every FK below failed on fresh replay)
-- ============================================================

ALTER TABLE public.account_balance_snapshots ADD CONSTRAINT account_balance_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.account_transfers ADD CONSTRAINT account_transfers_pkey PRIMARY KEY (id);
ALTER TABLE public.accounting_locales ADD CONSTRAINT accounting_locales_pkey PRIMARY KEY (id);
ALTER TABLE public.announcement_dismissals ADD CONSTRAINT announcement_dismissals_announcement_id_user_id_key UNIQUE (announcement_id, user_id);
ALTER TABLE public.announcement_dismissals ADD CONSTRAINT announcement_dismissals_pkey PRIMARY KEY (id);
ALTER TABLE public.asset_assignments ADD CONSTRAINT asset_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.asset_categories ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.asset_depreciation ADD CONSTRAINT asset_depreciation_pkey PRIMARY KEY (id);
ALTER TABLE public.asset_maintenance ADD CONSTRAINT asset_maintenance_pkey PRIMARY KEY (id);
ALTER TABLE public.assets ADD CONSTRAINT assets_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_trails ADD CONSTRAINT audit_trails_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_reconciliation_sessions ADD CONSTRAINT bank_reconciliation_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_coupons ADD CONSTRAINT billing_coupons_code_key UNIQUE (code);
ALTER TABLE public.billing_coupons ADD CONSTRAINT billing_coupons_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_paypal_event_id_key UNIQUE (paypal_event_id);
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_invoice_items ADD CONSTRAINT billing_invoice_items_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_invoice_number_key UNIQUE (invoice_number);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.branches ADD CONSTRAINT branches_pkey PRIMARY KEY (id);
ALTER TABLE public.case_attachments ADD CONSTRAINT case_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.case_communications ADD CONSTRAINT case_communications_pkey PRIMARY KEY (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_pkey PRIMARY KEY (id);
ALTER TABLE public.case_diagnostics ADD CONSTRAINT case_diagnostics_pkey PRIMARY KEY (id);
ALTER TABLE public.case_engineers ADD CONSTRAINT case_engineers_pkey PRIMARY KEY (id);
ALTER TABLE public.case_follow_ups ADD CONSTRAINT case_follow_ups_pkey PRIMARY KEY (id);
ALTER TABLE public.case_internal_notes ADD CONSTRAINT case_internal_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.case_job_history ADD CONSTRAINT case_job_history_pkey PRIMARY KEY (id);
ALTER TABLE public.case_milestones ADD CONSTRAINT case_milestones_pkey PRIMARY KEY (id);
ALTER TABLE public.case_portal_visibility ADD CONSTRAINT case_portal_visibility_case_id_key UNIQUE (case_id);
ALTER TABLE public.case_portal_visibility ADD CONSTRAINT case_portal_visibility_pkey PRIMARY KEY (id);
ALTER TABLE public.case_qa_checklists ADD CONSTRAINT case_qa_checklists_pkey PRIMARY KEY (id);
ALTER TABLE public.case_quote_items ADD CONSTRAINT case_quote_items_pkey PRIMARY KEY (id);
ALTER TABLE public.case_quotes ADD CONSTRAINT case_quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.case_recovery_attempts ADD CONSTRAINT case_recovery_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.case_report_sections ADD CONSTRAINT case_report_sections_pkey PRIMARY KEY (id);
ALTER TABLE public.case_reports ADD CONSTRAINT case_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.cases ADD CONSTRAINT cases_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_accessories ADD CONSTRAINT catalog_accessories_name_key UNIQUE (name);
ALTER TABLE public.catalog_accessories ADD CONSTRAINT catalog_accessories_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_brands ADD CONSTRAINT catalog_device_brands_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_brands ADD CONSTRAINT catalog_device_brands_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_capacities ADD CONSTRAINT catalog_device_capacities_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_capacities ADD CONSTRAINT catalog_device_capacities_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_component_statuses ADD CONSTRAINT catalog_device_component_statuses_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_component_statuses ADD CONSTRAINT catalog_device_component_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_conditions ADD CONSTRAINT catalog_device_conditions_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_conditions ADD CONSTRAINT catalog_device_conditions_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_encryption ADD CONSTRAINT catalog_device_encryption_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_encryption ADD CONSTRAINT catalog_device_encryption_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_form_factors ADD CONSTRAINT catalog_device_form_factors_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_form_factors ADD CONSTRAINT catalog_device_form_factors_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_head_counts ADD CONSTRAINT catalog_device_head_counts_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_head_counts ADD CONSTRAINT catalog_device_head_counts_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_interfaces ADD CONSTRAINT catalog_device_interfaces_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_interfaces ADD CONSTRAINT catalog_device_interfaces_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_made_in ADD CONSTRAINT catalog_device_made_in_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_made_in ADD CONSTRAINT catalog_device_made_in_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_platter_counts ADD CONSTRAINT catalog_device_platter_counts_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_platter_counts ADD CONSTRAINT catalog_device_platter_counts_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_roles ADD CONSTRAINT catalog_device_roles_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_roles ADD CONSTRAINT catalog_device_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_device_types ADD CONSTRAINT catalog_device_types_name_key UNIQUE (name);
ALTER TABLE public.catalog_device_types ADD CONSTRAINT catalog_device_types_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_donor_compatibility_matrix ADD CONSTRAINT catalog_donor_compatibility_matrix_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_interfaces ADD CONSTRAINT catalog_interfaces_name_key UNIQUE (name);
ALTER TABLE public.catalog_interfaces ADD CONSTRAINT catalog_interfaces_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_service_categories ADD CONSTRAINT catalog_service_categories_name_key UNIQUE (name);
ALTER TABLE public.catalog_service_categories ADD CONSTRAINT catalog_service_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_service_line_items ADD CONSTRAINT catalog_service_line_items_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_service_locations ADD CONSTRAINT catalog_service_locations_name_key UNIQUE (name);
ALTER TABLE public.catalog_service_locations ADD CONSTRAINT catalog_service_locations_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_service_problems ADD CONSTRAINT catalog_service_problems_name_key UNIQUE (name);
ALTER TABLE public.catalog_service_problems ADD CONSTRAINT catalog_service_problems_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_service_types ADD CONSTRAINT catalog_service_types_name_key UNIQUE (name);
ALTER TABLE public.catalog_service_types ADD CONSTRAINT catalog_service_types_pkey PRIMARY KEY (id);
ALTER TABLE public.chain_of_custody ADD CONSTRAINT chain_of_custody_pkey PRIMARY KEY (id);
ALTER TABLE public.chain_of_custody_access_log ADD CONSTRAINT chain_of_custody_access_log_pkey PRIMARY KEY (id);
ALTER TABLE public.chain_of_custody_integrity_checks ADD CONSTRAINT chain_of_custody_integrity_checks_pkey PRIMARY KEY (id);
ALTER TABLE public.chain_of_custody_transfers ADD CONSTRAINT chain_of_custody_transfers_pkey PRIMARY KEY (id);
ALTER TABLE public.clone_drives ADD CONSTRAINT clone_drives_pkey PRIMARY KEY (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE public.company_documents ADD CONSTRAINT company_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_tenant_id_key UNIQUE (tenant_id);
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.coupon_redemptions ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_communications ADD CONSTRAINT customer_communications_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_company_relationships ADD CONSTRAINT customer_company_relationship_tenant_id_customer_id_company_key UNIQUE (tenant_id, customer_id, company_id);
ALTER TABLE public.customer_company_relationships ADD CONSTRAINT customer_company_relationships_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_groups ADD CONSTRAINT customer_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.customers_enhanced ADD CONSTRAINT customers_enhanced_pkey PRIMARY KEY (id);
ALTER TABLE public.database_backups ADD CONSTRAINT database_backups_pkey PRIMARY KEY (id);
ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
ALTER TABLE public.device_diagnostics ADD CONSTRAINT device_diagnostics_pkey PRIMARY KEY (id);
ALTER TABLE public.document_templates ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_documents ADD CONSTRAINT employee_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_loans ADD CONSTRAINT employee_loans_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_salary_components ADD CONSTRAINT employee_salary_components_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_salary_config ADD CONSTRAINT employee_salary_config_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_salary_structures ADD CONSTRAINT employee_salary_structures_pkey PRIMARY KEY (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.financial_audit_logs ADD CONSTRAINT financial_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.geo_cities ADD CONSTRAINT geo_cities_pkey PRIMARY KEY (id);
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_code3_key UNIQUE (code3);
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_code_key UNIQUE (code);
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_pkey PRIMARY KEY (id);
ALTER TABLE public.import_export_jobs ADD CONSTRAINT import_export_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.import_export_logs ADD CONSTRAINT import_export_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.import_export_templates ADD CONSTRAINT import_export_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.import_field_mappings ADD CONSTRAINT import_field_mappings_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_assignments ADD CONSTRAINT inventory_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_case_assignments ADD CONSTRAINT inventory_case_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_parts_usage ADD CONSTRAINT inventory_parts_usage_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_photos ADD CONSTRAINT inventory_photos_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_search_templates ADD CONSTRAINT inventory_search_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_status_history ADD CONSTRAINT inventory_status_history_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.kb_article_tags ADD CONSTRAINT kb_article_tags_article_id_tag_id_key UNIQUE (article_id, tag_id);
ALTER TABLE public.kb_article_tags ADD CONSTRAINT kb_article_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.kb_article_versions ADD CONSTRAINT kb_article_versions_pkey PRIMARY KEY (id);
ALTER TABLE public.kb_articles ADD CONSTRAINT kb_articles_pkey PRIMARY KEY (id);
ALTER TABLE public.kb_categories ADD CONSTRAINT kb_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.kb_tags ADD CONSTRAINT kb_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.leave_balances ADD CONSTRAINT leave_balances_tenant_id_employee_id_leave_type_id_year_key UNIQUE (tenant_id, employee_id, leave_type_id, year);
ALTER TABLE public.leave_balances ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_pkey PRIMARY KEY (id);
ALTER TABLE public.master_case_priorities ADD CONSTRAINT master_case_priorities_name_key UNIQUE (name);
ALTER TABLE public.master_case_priorities ADD CONSTRAINT master_case_priorities_pkey PRIMARY KEY (id);
ALTER TABLE public.master_case_report_templates ADD CONSTRAINT master_case_report_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.master_case_statuses ADD CONSTRAINT master_case_statuses_name_key UNIQUE (name);
ALTER TABLE public.master_case_statuses ADD CONSTRAINT master_case_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.master_expense_categories ADD CONSTRAINT master_expense_categories_name_key UNIQUE (name);
ALTER TABLE public.master_expense_categories ADD CONSTRAINT master_expense_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.master_industries ADD CONSTRAINT master_industries_name_key UNIQUE (name);
ALTER TABLE public.master_industries ADD CONSTRAINT master_industries_pkey PRIMARY KEY (id);
ALTER TABLE public.master_inventory_categories ADD CONSTRAINT master_inventory_categories_name_key UNIQUE (name);
ALTER TABLE public.master_inventory_categories ADD CONSTRAINT master_inventory_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.master_inventory_condition_types ADD CONSTRAINT master_inventory_condition_types_name_key UNIQUE (name);
ALTER TABLE public.master_inventory_condition_types ADD CONSTRAINT master_inventory_condition_types_pkey PRIMARY KEY (id);
ALTER TABLE public.master_inventory_item_categories ADD CONSTRAINT master_inventory_item_categories_name_key UNIQUE (name);
ALTER TABLE public.master_inventory_item_categories ADD CONSTRAINT master_inventory_item_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.master_inventory_status_types ADD CONSTRAINT master_inventory_status_types_name_key UNIQUE (name);
ALTER TABLE public.master_inventory_status_types ADD CONSTRAINT master_inventory_status_types_pkey PRIMARY KEY (id);
ALTER TABLE public.master_invoice_statuses ADD CONSTRAINT master_invoice_statuses_name_key UNIQUE (name);
ALTER TABLE public.master_invoice_statuses ADD CONSTRAINT master_invoice_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.master_leave_types ADD CONSTRAINT master_leave_types_name_key UNIQUE (name);
ALTER TABLE public.master_leave_types ADD CONSTRAINT master_leave_types_pkey PRIMARY KEY (id);
ALTER TABLE public.master_modules ADD CONSTRAINT master_modules_name_key UNIQUE (name);
ALTER TABLE public.master_modules ADD CONSTRAINT master_modules_slug_key UNIQUE (slug);
ALTER TABLE public.master_modules ADD CONSTRAINT master_modules_pkey PRIMARY KEY (id);
ALTER TABLE public.master_payment_methods ADD CONSTRAINT master_payment_methods_name_key UNIQUE (name);
ALTER TABLE public.master_payment_methods ADD CONSTRAINT master_payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE public.master_payroll_components ADD CONSTRAINT master_payroll_components_name_key UNIQUE (name);
ALTER TABLE public.master_payroll_components ADD CONSTRAINT master_payroll_components_pkey PRIMARY KEY (id);
ALTER TABLE public.master_purchase_order_statuses ADD CONSTRAINT master_purchase_order_statuses_name_key UNIQUE (name);
ALTER TABLE public.master_purchase_order_statuses ADD CONSTRAINT master_purchase_order_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.master_quote_statuses ADD CONSTRAINT master_quote_statuses_name_key UNIQUE (name);
ALTER TABLE public.master_quote_statuses ADD CONSTRAINT master_quote_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.master_supplier_categories ADD CONSTRAINT master_supplier_categories_name_key UNIQUE (name);
ALTER TABLE public.master_supplier_categories ADD CONSTRAINT master_supplier_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.master_supplier_payment_terms ADD CONSTRAINT master_supplier_payment_terms_name_key UNIQUE (name);
ALTER TABLE public.master_supplier_payment_terms ADD CONSTRAINT master_supplier_payment_terms_pkey PRIMARY KEY (id);
ALTER TABLE public.master_template_categories ADD CONSTRAINT master_template_categories_name_key UNIQUE (name);
ALTER TABLE public.master_template_categories ADD CONSTRAINT master_template_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.master_template_types ADD CONSTRAINT master_template_types_name_key UNIQUE (name);
ALTER TABLE public.master_template_types ADD CONSTRAINT master_template_types_pkey PRIMARY KEY (id);
ALTER TABLE public.master_template_variables ADD CONSTRAINT master_template_variables_name_key UNIQUE (name);
ALTER TABLE public.master_template_variables ADD CONSTRAINT master_template_variables_pkey PRIMARY KEY (id);
ALTER TABLE public.master_transaction_categories ADD CONSTRAINT master_transaction_categories_name_key UNIQUE (name);
ALTER TABLE public.master_transaction_categories ADD CONSTRAINT master_transaction_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.ndas ADD CONSTRAINT ndas_pkey PRIMARY KEY (id);
ALTER TABLE public.number_sequences ADD CONSTRAINT number_sequences_tenant_id_scope_key UNIQUE (tenant_id, scope);
ALTER TABLE public.number_sequences ADD CONSTRAINT number_sequences_pkey PRIMARY KEY (id);
ALTER TABLE public.number_sequences_audit ADD CONSTRAINT number_sequences_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_checklist_items ADD CONSTRAINT onboarding_checklist_items_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_checklists ADD CONSTRAINT onboarding_checklists_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_progress ADD CONSTRAINT onboarding_progress_tenant_id_key UNIQUE (tenant_id);
ALTER TABLE public.onboarding_progress ADD CONSTRAINT onboarding_progress_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_tasks ADD CONSTRAINT onboarding_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_disbursements ADD CONSTRAINT payment_disbursements_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_adjustments ADD CONSTRAINT payroll_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_bank_files ADD CONSTRAINT payroll_bank_files_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_periods ADD CONSTRAINT payroll_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_record_items ADD CONSTRAINT payroll_record_items_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_settings ADD CONSTRAINT payroll_settings_tenant_id_key UNIQUE (tenant_id);
ALTER TABLE public.payroll_settings ADD CONSTRAINT payroll_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.pdf_generation_logs ADD CONSTRAINT pdf_generation_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.plan_features ADD CONSTRAINT plan_features_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_email_key UNIQUE (email);
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_user_id_key UNIQUE (user_id);
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_announcements ADD CONSTRAINT platform_announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_audit_logs ADD CONSTRAINT platform_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_metrics ADD CONSTRAINT platform_metrics_metric_date_key UNIQUE (metric_date);
ALTER TABLE public.platform_metrics ADD CONSTRAINT platform_metrics_pkey PRIMARY KEY (id);
ALTER TABLE public.portal_link_history ADD CONSTRAINT portal_link_history_pkey PRIMARY KEY (id);
ALTER TABLE public.positions ADD CONSTRAINT positions_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_email_key UNIQUE (tenant_id, email);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.quote_history ADD CONSTRAINT quote_history_pkey PRIMARY KEY (id);
ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_pkey PRIMARY KEY (id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.receipt_allocations ADD CONSTRAINT receipt_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.receipts ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_matches ADD CONSTRAINT reconciliation_matches_pkey PRIMARY KEY (id);
ALTER TABLE public.recruitment_candidates ADD CONSTRAINT recruitment_candidates_pkey PRIMARY KEY (id);
ALTER TABLE public.recruitment_jobs ADD CONSTRAINT recruitment_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.report_section_library ADD CONSTRAINT report_section_library_pkey PRIMARY KEY (id);
ALTER TABLE public.report_section_presets ADD CONSTRAINT report_section_presets_pkey PRIMARY KEY (id);
ALTER TABLE public.report_template_section_mappings ADD CONSTRAINT report_template_section_mappings_pkey PRIMARY KEY (id);
ALTER TABLE public.resource_clone_drives ADD CONSTRAINT resource_clone_drives_pkey PRIMARY KEY (id);
ALTER TABLE public.role_module_permissions ADD CONSTRAINT role_module_permissions_tenant_id_role_module_id_key UNIQUE (tenant_id, role, module_id);
ALTER TABLE public.role_module_permissions ADD CONSTRAINT role_module_permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.salary_components ADD CONSTRAINT salary_components_pkey PRIMARY KEY (id);
ALTER TABLE public.signup_otps ADD CONSTRAINT signup_otps_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_adjustment_session_items ADD CONSTRAINT stock_adjustment_session_items_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_adjustment_sessions ADD CONSTRAINT stock_adjustment_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_alerts ADD CONSTRAINT stock_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_categories ADD CONSTRAINT stock_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_locations ADD CONSTRAINT stock_locations_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_price_history ADD CONSTRAINT stock_price_history_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_sale_items ADD CONSTRAINT stock_sale_items_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_sales ADD CONSTRAINT stock_sales_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_serial_numbers ADD CONSTRAINT stock_serial_numbers_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_transactions ADD CONSTRAINT stock_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_slug_key UNIQUE (slug);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.supplier_audit_trail ADD CONSTRAINT supplier_audit_trail_pkey PRIMARY KEY (id);
ALTER TABLE public.supplier_communications ADD CONSTRAINT supplier_communications_pkey PRIMARY KEY (id);
ALTER TABLE public.supplier_contacts ADD CONSTRAINT supplier_contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.supplier_documents ADD CONSTRAINT supplier_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.supplier_performance_metrics ADD CONSTRAINT supplier_performance_metrics_pkey PRIMARY KEY (id);
ALTER TABLE public.supplier_products ADD CONSTRAINT supplier_products_pkey PRIMARY KEY (id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
ALTER TABLE public.support_ticket_messages ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
ALTER TABLE public.system_logs ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.system_seed_status ADD CONSTRAINT system_seed_status_category_key UNIQUE (category);
ALTER TABLE public.system_seed_status ADD CONSTRAINT system_seed_status_pkey PRIMARY KEY (id);
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_key_key UNIQUE (key);
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.tax_rates ADD CONSTRAINT tax_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.template_versions ADD CONSTRAINT template_versions_pkey PRIMARY KEY (id);
ALTER TABLE public.templates ADD CONSTRAINT templates_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_activity_log ADD CONSTRAINT tenant_activity_log_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_health_metrics ADD CONSTRAINT tenant_health_metrics_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_impersonation_sessions ADD CONSTRAINT tenant_impersonation_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_payment_methods ADD CONSTRAINT tenant_payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_paypal_subscription_id_key UNIQUE (paypal_subscription_id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_tenant_id_key UNIQUE (tenant_id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_domain_key UNIQUE (domain);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_paypal_customer_id_key UNIQUE (paypal_customer_id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_paypal_subscription_id_key UNIQUE (paypal_subscription_id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
ALTER TABLE public.timesheets ADD CONSTRAINT timesheets_pkey PRIMARY KEY (id);
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);
ALTER TABLE public.usage_snapshots ADD CONSTRAINT usage_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.user_activity_logs ADD CONSTRAINT user_activity_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.user_activity_sessions ADD CONSTRAINT user_activity_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_tenant_id_user_id_key UNIQUE (tenant_id, user_id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_sidebar_preferences ADD CONSTRAINT user_sidebar_preferences_tenant_id_user_id_key UNIQUE (tenant_id, user_id);
ALTER TABLE public.user_sidebar_preferences ADD CONSTRAINT user_sidebar_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.vat_records ADD CONSTRAINT vat_records_pkey PRIMARY KEY (id);
ALTER TABLE public.vat_returns ADD CONSTRAINT vat_returns_pkey PRIMARY KEY (id);
ALTER TABLE public.vat_transactions ADD CONSTRAINT vat_transactions_pkey PRIMARY KEY (id);

-- Primary keys and unique constraints are defined inline in the CREATE TABLE statements above.


-- ============================================================
-- 5. CHECK CONSTRAINTS
-- ============================================================

ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_type_check CHECK ((type = ANY (ARRAY['credit'::text, 'debit'::text])));
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'uncollectible'::text])));
ALTER TABLE public.data_subject_requests ADD CONSTRAINT data_subject_requests_request_type_check CHECK ((request_type = ANY (ARRAY['export'::text, 'deletion'::text, 'rectification'::text, 'access'::text])));
ALTER TABLE public.data_subject_requests ADD CONSTRAINT data_subject_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'rejected'::text])));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_currency_position_check CHECK ((currency_position = ANY (ARRAY['before'::text, 'after'::text])));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_tax_system_check CHECK ((tax_system = ANY (ARRAY['VAT'::text, 'GST'::text, 'SALES_TAX'::text, 'NONE'::text])));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_time_format_check CHECK ((time_format = ANY (ARRAY['12h'::text, '24h'::text])));
ALTER TABLE public.geo_countries ADD CONSTRAINT geo_countries_week_starts_on_check CHECK (((week_starts_on >= 0) AND (week_starts_on <= 6)));
ALTER TABLE public.import_export_templates ADD CONSTRAINT import_export_templates_type_check CHECK ((type = ANY (ARRAY['import'::text, 'export'::text])));
ALTER TABLE public.master_payroll_components ADD CONSTRAINT master_payroll_components_type_check CHECK ((type = ANY (ARRAY['earning'::text, 'deduction'::text, 'employer_contribution'::text])));
ALTER TABLE public.payroll_adjustments ADD CONSTRAINT payroll_adjustments_type_check CHECK ((type = ANY (ARRAY['bonus'::text, 'deduction'::text, 'advance'::text, 'reimbursement'::text, 'other'::text])));
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'support'::text, 'billing'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_case_access_level_check CHECK ((case_access_level = ANY (ARRAY['full'::text, 'restricted'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'technician'::text, 'sales'::text, 'accounts'::text, 'hr'::text, 'viewer'::text])));
ALTER TABLE public.salary_components ADD CONSTRAINT salary_components_type_check CHECK ((type = ANY (ARRAY['earning'::text, 'deduction'::text, 'employer_contribution'::text])));
ALTER TABLE public.tenant_impersonation_sessions ADD CONSTRAINT impersonation_reason_not_empty CHECK ((reason <> ''::text));
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text])));
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'unpaid'::text])));
ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_format CHECK ((slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'::text));
ALTER TABLE public.tenants ADD CONSTRAINT tenants_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'suspended'::text, 'cancelled'::text, 'deleted'::text])));
ALTER TABLE public.tenants ADD CONSTRAINT tenants_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'unpaid'::text])));
ALTER TABLE public.tenants ADD CONSTRAINT tenants_tax_system_check CHECK ((tax_system = ANY (ARRAY['VAT'::text, 'GST'::text, 'SALES_TAX'::text, 'NONE'::text])));


-- ============================================================
-- 6. FOREIGN KEYS
-- ============================================================

ALTER TABLE public.account_balance_snapshots ADD CONSTRAINT account_balance_snapshots_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.account_balance_snapshots ADD CONSTRAINT account_balance_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.account_transfers ADD CONSTRAINT account_transfers_from_account_id_fkey FOREIGN KEY (from_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.account_transfers ADD CONSTRAINT account_transfers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.account_transfers ADD CONSTRAINT account_transfers_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.accounting_locales ADD CONSTRAINT accounting_locales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.announcement_dismissals ADD CONSTRAINT announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.platform_announcements (id) ON DELETE CASCADE;
ALTER TABLE public.asset_assignments ADD CONSTRAINT asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets (id) ON DELETE CASCADE;
ALTER TABLE public.asset_assignments ADD CONSTRAINT asset_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.asset_categories ADD CONSTRAINT asset_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.asset_depreciation ADD CONSTRAINT asset_depreciation_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets (id) ON DELETE CASCADE;
ALTER TABLE public.asset_depreciation ADD CONSTRAINT asset_depreciation_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.asset_maintenance ADD CONSTRAINT asset_maintenance_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets (id) ON DELETE CASCADE;
ALTER TABLE public.asset_maintenance ADD CONSTRAINT asset_maintenance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.assets ADD CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.asset_categories (id);
ALTER TABLE public.assets ADD CONSTRAINT assets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.audit_trails ADD CONSTRAINT audit_trails_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.bank_reconciliation_sessions ADD CONSTRAINT bank_reconciliation_sessions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.bank_reconciliation_sessions ADD CONSTRAINT bank_reconciliation_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id);
ALTER TABLE public.billing_invoice_items ADD CONSTRAINT billing_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices (id) ON DELETE CASCADE;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.tenant_subscriptions (id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.branches ADD CONSTRAINT branches_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.geo_cities (id);
ALTER TABLE public.branches ADD CONSTRAINT branches_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.geo_countries (id);
ALTER TABLE public.branches ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_attachments ADD CONSTRAINT case_attachments_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_attachments ADD CONSTRAINT case_attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_communications ADD CONSTRAINT case_communications_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_communications ADD CONSTRAINT case_communications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.catalog_device_brands (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_capacity_id_fkey FOREIGN KEY (capacity_id) REFERENCES public.catalog_device_capacities (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_condition_id_fkey FOREIGN KEY (condition_id) REFERENCES public.catalog_device_conditions (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_device_role_id_fkey FOREIGN KEY (device_role_id) REFERENCES public.catalog_device_roles (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_device_type_id_fkey FOREIGN KEY (device_type_id) REFERENCES public.catalog_device_types (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_encryption_id_fkey FOREIGN KEY (encryption_id) REFERENCES public.catalog_device_encryption (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_form_factor_id_fkey FOREIGN KEY (form_factor_id) REFERENCES public.catalog_device_form_factors (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_head_count_id_fkey FOREIGN KEY (head_count_id) REFERENCES public.catalog_device_head_counts (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_interface_id_fkey FOREIGN KEY (interface_id) REFERENCES public.catalog_interfaces (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_made_in_id_fkey FOREIGN KEY (made_in_id) REFERENCES public.catalog_device_made_in (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_platter_count_id_fkey FOREIGN KEY (platter_count_id) REFERENCES public.catalog_device_platter_counts (id);
ALTER TABLE public.case_devices ADD CONSTRAINT case_devices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_diagnostics ADD CONSTRAINT case_diagnostics_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_diagnostics ADD CONSTRAINT case_diagnostics_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.case_diagnostics ADD CONSTRAINT case_diagnostics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_engineers ADD CONSTRAINT case_engineers_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_engineers ADD CONSTRAINT case_engineers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_follow_ups ADD CONSTRAINT case_follow_ups_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_follow_ups ADD CONSTRAINT case_follow_ups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_internal_notes ADD CONSTRAINT case_internal_notes_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_internal_notes ADD CONSTRAINT case_internal_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_job_history ADD CONSTRAINT case_job_history_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_job_history ADD CONSTRAINT case_job_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_milestones ADD CONSTRAINT case_milestones_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_milestones ADD CONSTRAINT case_milestones_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_portal_visibility ADD CONSTRAINT case_portal_visibility_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_portal_visibility ADD CONSTRAINT case_portal_visibility_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_qa_checklists ADD CONSTRAINT case_qa_checklists_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_qa_checklists ADD CONSTRAINT case_qa_checklists_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_quote_items ADD CONSTRAINT case_quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.case_quotes (id) ON DELETE CASCADE;
ALTER TABLE public.case_quote_items ADD CONSTRAINT case_quote_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_quotes ADD CONSTRAINT case_quotes_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_quotes ADD CONSTRAINT case_quotes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_recovery_attempts ADD CONSTRAINT case_recovery_attempts_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_recovery_attempts ADD CONSTRAINT case_recovery_attempts_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.case_recovery_attempts ADD CONSTRAINT case_recovery_attempts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_report_sections ADD CONSTRAINT case_report_sections_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.case_reports (id) ON DELETE CASCADE;
ALTER TABLE public.case_report_sections ADD CONSTRAINT case_report_sections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.case_reports ADD CONSTRAINT case_reports_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.case_reports ADD CONSTRAINT case_reports_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.master_case_report_templates (id);
ALTER TABLE public.case_reports ADD CONSTRAINT case_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.cases ADD CONSTRAINT cases_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id);
ALTER TABLE public.cases ADD CONSTRAINT cases_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.cases ADD CONSTRAINT cases_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.master_case_priorities (id);
ALTER TABLE public.cases ADD CONSTRAINT cases_service_location_id_fkey FOREIGN KEY (service_location_id) REFERENCES public.catalog_service_locations (id);
ALTER TABLE public.cases ADD CONSTRAINT cases_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.catalog_service_types (id);
ALTER TABLE public.cases ADD CONSTRAINT cases_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.master_case_statuses (id);
ALTER TABLE public.cases ADD CONSTRAINT cases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.catalog_donor_compatibility_matrix ADD CONSTRAINT catalog_donor_compatibility_matrix_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.catalog_device_brands (id);
ALTER TABLE public.catalog_service_line_items ADD CONSTRAINT catalog_service_line_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.catalog_service_categories (id);
ALTER TABLE public.chain_of_custody ADD CONSTRAINT chain_of_custody_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id) ON DELETE CASCADE;
ALTER TABLE public.chain_of_custody ADD CONSTRAINT chain_of_custody_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.chain_of_custody ADD CONSTRAINT chain_of_custody_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.chain_of_custody_access_log ADD CONSTRAINT chain_of_custody_access_log_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.chain_of_custody_access_log ADD CONSTRAINT chain_of_custody_access_log_custody_entry_id_fkey FOREIGN KEY (custody_entry_id) REFERENCES public.chain_of_custody (id);
ALTER TABLE public.chain_of_custody_access_log ADD CONSTRAINT chain_of_custody_access_log_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.chain_of_custody_access_log ADD CONSTRAINT chain_of_custody_access_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.chain_of_custody_integrity_checks ADD CONSTRAINT chain_of_custody_integrity_checks_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.chain_of_custody_integrity_checks ADD CONSTRAINT chain_of_custody_integrity_checks_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.chain_of_custody_integrity_checks ADD CONSTRAINT chain_of_custody_integrity_checks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.chain_of_custody_transfers ADD CONSTRAINT chain_of_custody_transfers_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.chain_of_custody_transfers ADD CONSTRAINT chain_of_custody_transfers_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.chain_of_custody_transfers ADD CONSTRAINT chain_of_custody_transfers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.clone_drives ADD CONSTRAINT clone_drives_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.clone_drives ADD CONSTRAINT clone_drives_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.clone_drives ADD CONSTRAINT clone_drives_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.companies ADD CONSTRAINT companies_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.geo_cities (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.geo_countries (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.master_industries (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.company_documents ADD CONSTRAINT company_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
ALTER TABLE public.company_documents ADD CONSTRAINT company_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.coupon_redemptions ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.billing_coupons (id);
ALTER TABLE public.coupon_redemptions ADD CONSTRAINT coupon_redemptions_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.tenant_subscriptions (id);
ALTER TABLE public.coupon_redemptions ADD CONSTRAINT coupon_redemptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.customer_communications ADD CONSTRAINT customer_communications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id) ON DELETE CASCADE;
ALTER TABLE public.customer_communications ADD CONSTRAINT customer_communications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.customer_company_relationships ADD CONSTRAINT customer_company_relationships_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
ALTER TABLE public.customer_company_relationships ADD CONSTRAINT customer_company_relationships_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id) ON DELETE CASCADE;
ALTER TABLE public.customer_company_relationships ADD CONSTRAINT customer_company_relationships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.customer_groups ADD CONSTRAINT customer_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.customers_enhanced ADD CONSTRAINT customers_enhanced_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.geo_cities (id);
ALTER TABLE public.customers_enhanced ADD CONSTRAINT customers_enhanced_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.geo_countries (id);
ALTER TABLE public.customers_enhanced ADD CONSTRAINT customers_enhanced_customer_group_id_fkey FOREIGN KEY (customer_group_id) REFERENCES public.customer_groups (id);
ALTER TABLE public.customers_enhanced ADD CONSTRAINT customers_enhanced_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.master_industries (id);
ALTER TABLE public.customers_enhanced ADD CONSTRAINT customers_enhanced_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.data_retention_policies ADD CONSTRAINT data_retention_policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.data_subject_requests ADD CONSTRAINT data_subject_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.database_backups ADD CONSTRAINT database_backups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.departments ADD CONSTRAINT departments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.device_diagnostics ADD CONSTRAINT device_diagnostics_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.case_devices (id);
ALTER TABLE public.device_diagnostics ADD CONSTRAINT device_diagnostics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.document_templates ADD CONSTRAINT document_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.master_template_categories (id);
ALTER TABLE public.document_templates ADD CONSTRAINT document_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.document_templates ADD CONSTRAINT document_templates_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.master_template_types (id);
ALTER TABLE public.employee_documents ADD CONSTRAINT employee_documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE CASCADE;
ALTER TABLE public.employee_documents ADD CONSTRAINT employee_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.employee_loans ADD CONSTRAINT employee_loans_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE CASCADE;
ALTER TABLE public.employee_loans ADD CONSTRAINT employee_loans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.employee_salary_components ADD CONSTRAINT employee_salary_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.salary_components (id);
ALTER TABLE public.employee_salary_components ADD CONSTRAINT employee_salary_components_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE CASCADE;
ALTER TABLE public.employee_salary_components ADD CONSTRAINT employee_salary_components_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.employee_salary_config ADD CONSTRAINT employee_salary_config_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE CASCADE;
ALTER TABLE public.employee_salary_config ADD CONSTRAINT employee_salary_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.employee_salary_structures ADD CONSTRAINT employee_salary_structures_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE CASCADE;
ALTER TABLE public.employee_salary_structures ADD CONSTRAINT employee_salary_structures_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.employees (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses (id) ON DELETE CASCADE;
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.master_expense_categories (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.financial_audit_logs ADD CONSTRAINT financial_audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.master_transaction_categories (id);
ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.geo_cities ADD CONSTRAINT geo_cities_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.geo_countries (id);
ALTER TABLE public.import_export_jobs ADD CONSTRAINT import_export_jobs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.import_export_templates (id);
ALTER TABLE public.import_export_jobs ADD CONSTRAINT import_export_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.import_export_logs ADD CONSTRAINT import_export_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.import_export_jobs (id) ON DELETE CASCADE;
ALTER TABLE public.import_export_logs ADD CONSTRAINT import_export_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.import_export_templates ADD CONSTRAINT import_export_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.import_field_mappings ADD CONSTRAINT import_field_mappings_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.import_export_templates (id) ON DELETE CASCADE;
ALTER TABLE public.import_field_mappings ADD CONSTRAINT import_field_mappings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_assignments ADD CONSTRAINT inventory_assignments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items (id);
ALTER TABLE public.inventory_assignments ADD CONSTRAINT inventory_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_case_assignments ADD CONSTRAINT inventory_case_assignments_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.inventory_case_assignments ADD CONSTRAINT inventory_case_assignments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items (id);
ALTER TABLE public.inventory_case_assignments ADD CONSTRAINT inventory_case_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.catalog_device_brands (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_capacity_id_fkey FOREIGN KEY (capacity_id) REFERENCES public.catalog_device_capacities (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.master_inventory_categories (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_condition_id_fkey FOREIGN KEY (condition_id) REFERENCES public.master_inventory_condition_types (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_interface_id_fkey FOREIGN KEY (interface_id) REFERENCES public.catalog_interfaces (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_item_category_id_fkey FOREIGN KEY (item_category_id) REFERENCES public.master_inventory_item_categories (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.master_inventory_status_types (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_parts_usage ADD CONSTRAINT inventory_parts_usage_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.inventory_parts_usage ADD CONSTRAINT inventory_parts_usage_donor_item_id_fkey FOREIGN KEY (donor_item_id) REFERENCES public.inventory_items (id);
ALTER TABLE public.inventory_parts_usage ADD CONSTRAINT inventory_parts_usage_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_photos ADD CONSTRAINT inventory_photos_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items (id);
ALTER TABLE public.inventory_photos ADD CONSTRAINT inventory_photos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items (id);
ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_search_templates ADD CONSTRAINT inventory_search_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_status_history ADD CONSTRAINT inventory_status_history_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items (id);
ALTER TABLE public.inventory_status_history ADD CONSTRAINT inventory_status_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items (id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices (id) ON DELETE CASCADE;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.master_invoice_statuses (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.kb_article_tags ADD CONSTRAINT kb_article_tags_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.kb_articles (id) ON DELETE CASCADE;
ALTER TABLE public.kb_article_tags ADD CONSTRAINT kb_article_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.kb_tags (id) ON DELETE CASCADE;
ALTER TABLE public.kb_article_tags ADD CONSTRAINT kb_article_tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.kb_article_versions ADD CONSTRAINT kb_article_versions_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.kb_articles (id) ON DELETE CASCADE;
ALTER TABLE public.kb_article_versions ADD CONSTRAINT kb_article_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.kb_articles ADD CONSTRAINT kb_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.kb_categories (id);
ALTER TABLE public.kb_articles ADD CONSTRAINT kb_articles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.kb_categories ADD CONSTRAINT kb_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.kb_categories (id);
ALTER TABLE public.kb_categories ADD CONSTRAINT kb_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.kb_tags ADD CONSTRAINT kb_tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.leave_balances ADD CONSTRAINT leave_balances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.leave_balances ADD CONSTRAINT leave_balances_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.master_leave_types (id);
ALTER TABLE public.leave_balances ADD CONSTRAINT leave_balances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.master_leave_types (id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.employee_loans (id) ON DELETE CASCADE;
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.master_modules ADD CONSTRAINT master_modules_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.master_modules (id);
ALTER TABLE public.ndas ADD CONSTRAINT ndas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id);
ALTER TABLE public.ndas ADD CONSTRAINT ndas_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.ndas ADD CONSTRAINT ndas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.number_sequences ADD CONSTRAINT number_sequences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.number_sequences_audit ADD CONSTRAINT number_sequences_audit_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.number_sequences (id);
ALTER TABLE public.number_sequences_audit ADD CONSTRAINT number_sequences_audit_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_checklist_items ADD CONSTRAINT onboarding_checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.onboarding_checklists (id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_checklist_items ADD CONSTRAINT onboarding_checklist_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_checklists ADD CONSTRAINT onboarding_checklists_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_progress ADD CONSTRAINT onboarding_progress_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_tasks ADD CONSTRAINT onboarding_tasks_checklist_item_id_fkey FOREIGN KEY (checklist_item_id) REFERENCES public.onboarding_checklist_items (id);
ALTER TABLE public.onboarding_tasks ADD CONSTRAINT onboarding_tasks_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.onboarding_tasks ADD CONSTRAINT onboarding_tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices (id);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments (id);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payment_disbursements ADD CONSTRAINT payment_disbursements_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.payment_disbursements ADD CONSTRAINT payment_disbursements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments (id);
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.master_payment_methods (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_adjustments ADD CONSTRAINT payroll_adjustments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.payroll_adjustments ADD CONSTRAINT payroll_adjustments_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.payroll_periods (id);
ALTER TABLE public.payroll_adjustments ADD CONSTRAINT payroll_adjustments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_bank_files ADD CONSTRAINT payroll_bank_files_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.payroll_periods (id);
ALTER TABLE public.payroll_bank_files ADD CONSTRAINT payroll_bank_files_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_periods ADD CONSTRAINT payroll_periods_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_record_items ADD CONSTRAINT payroll_record_items_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.salary_components (id);
ALTER TABLE public.payroll_record_items ADD CONSTRAINT payroll_record_items_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.payroll_records (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_record_items ADD CONSTRAINT payroll_record_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.payroll_periods (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.payroll_settings ADD CONSTRAINT payroll_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.pdf_generation_logs ADD CONSTRAINT pdf_generation_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.plan_features ADD CONSTRAINT plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans (id) ON DELETE CASCADE;
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_admins (id);
ALTER TABLE public.platform_audit_logs ADD CONSTRAINT platform_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.platform_admins (id);
ALTER TABLE public.platform_audit_logs ADD CONSTRAINT platform_audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id);
ALTER TABLE public.portal_link_history ADD CONSTRAINT portal_link_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id) ON DELETE CASCADE;
ALTER TABLE public.portal_link_history ADD CONSTRAINT portal_link_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.positions ADD CONSTRAINT positions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments (id);
ALTER TABLE public.positions ADD CONSTRAINT positions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.supplier_products (id);
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders (id) ON DELETE CASCADE;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.master_purchase_order_statuses (id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.quote_history ADD CONSTRAINT quote_history_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes (id) ON DELETE CASCADE;
ALTER TABLE public.quote_history ADD CONSTRAINT quote_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes (id) ON DELETE CASCADE;
ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies (id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_converted_to_invoice_id_fkey FOREIGN KEY (converted_to_invoice_id) REFERENCES public.invoices (id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.master_quote_statuses (id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.receipt_allocations ADD CONSTRAINT receipt_allocations_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices (id);
ALTER TABLE public.receipt_allocations ADD CONSTRAINT receipt_allocations_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts (id);
ALTER TABLE public.receipt_allocations ADD CONSTRAINT receipt_allocations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.receipts ADD CONSTRAINT receipts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_matches ADD CONSTRAINT reconciliation_matches_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions (id);
ALTER TABLE public.reconciliation_matches ADD CONSTRAINT reconciliation_matches_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.bank_reconciliation_sessions (id);
ALTER TABLE public.reconciliation_matches ADD CONSTRAINT reconciliation_matches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.recruitment_candidates ADD CONSTRAINT recruitment_candidates_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.recruitment_jobs (id);
ALTER TABLE public.recruitment_candidates ADD CONSTRAINT recruitment_candidates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.recruitment_jobs ADD CONSTRAINT recruitment_jobs_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments (id);
ALTER TABLE public.recruitment_jobs ADD CONSTRAINT recruitment_jobs_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions (id);
ALTER TABLE public.recruitment_jobs ADD CONSTRAINT recruitment_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.report_section_presets ADD CONSTRAINT report_section_presets_section_library_id_fkey FOREIGN KEY (section_library_id) REFERENCES public.report_section_library (id);
ALTER TABLE public.report_template_section_mappings ADD CONSTRAINT report_template_section_mappings_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_section_library (id);
ALTER TABLE public.report_template_section_mappings ADD CONSTRAINT report_template_section_mappings_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.master_case_report_templates (id);
ALTER TABLE public.resource_clone_drives ADD CONSTRAINT resource_clone_drives_assigned_to_case_id_fkey FOREIGN KEY (assigned_to_case_id) REFERENCES public.cases (id);
ALTER TABLE public.resource_clone_drives ADD CONSTRAINT resource_clone_drives_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.catalog_device_brands (id);
ALTER TABLE public.resource_clone_drives ADD CONSTRAINT resource_clone_drives_capacity_id_fkey FOREIGN KEY (capacity_id) REFERENCES public.catalog_device_capacities (id);
ALTER TABLE public.resource_clone_drives ADD CONSTRAINT resource_clone_drives_interface_id_fkey FOREIGN KEY (interface_id) REFERENCES public.catalog_interfaces (id);
ALTER TABLE public.resource_clone_drives ADD CONSTRAINT resource_clone_drives_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.role_module_permissions ADD CONSTRAINT role_module_permissions_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.master_modules (id);
ALTER TABLE public.role_module_permissions ADD CONSTRAINT role_module_permissions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.salary_components ADD CONSTRAINT salary_components_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustment_session_items ADD CONSTRAINT stock_adjustment_session_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_adjustment_session_items ADD CONSTRAINT stock_adjustment_session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.stock_adjustment_sessions (id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustment_session_items ADD CONSTRAINT stock_adjustment_session_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustment_sessions ADD CONSTRAINT stock_adjustment_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_alerts ADD CONSTRAINT stock_alerts_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_alerts ADD CONSTRAINT stock_alerts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_categories ADD CONSTRAINT stock_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.stock_categories (id);
ALTER TABLE public.stock_categories ADD CONSTRAINT stock_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.stock_categories (id);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations (id);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_locations ADD CONSTRAINT stock_locations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_from_location_id_fkey FOREIGN KEY (from_location_id) REFERENCES public.stock_locations (id);
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_to_location_id_fkey FOREIGN KEY (to_location_id) REFERENCES public.stock_locations (id);
ALTER TABLE public.stock_price_history ADD CONSTRAINT stock_price_history_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_price_history ADD CONSTRAINT stock_price_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_sale_items ADD CONSTRAINT stock_sale_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_sale_items ADD CONSTRAINT stock_sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.stock_sales (id) ON DELETE CASCADE;
ALTER TABLE public.stock_sale_items ADD CONSTRAINT stock_sale_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_sales ADD CONSTRAINT stock_sales_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.stock_sales ADD CONSTRAINT stock_sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers_enhanced (id);
ALTER TABLE public.stock_sales ADD CONSTRAINT stock_sales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_serial_numbers ADD CONSTRAINT stock_serial_numbers_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_serial_numbers ADD CONSTRAINT stock_serial_numbers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_locations (id);
ALTER TABLE public.stock_serial_numbers ADD CONSTRAINT stock_serial_numbers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.stock_transactions ADD CONSTRAINT stock_transactions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items (id);
ALTER TABLE public.stock_transactions ADD CONSTRAINT stock_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_audit_trail ADD CONSTRAINT supplier_audit_trail_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id);
ALTER TABLE public.supplier_audit_trail ADD CONSTRAINT supplier_audit_trail_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_communications ADD CONSTRAINT supplier_communications_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_communications ADD CONSTRAINT supplier_communications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_contacts ADD CONSTRAINT supplier_contacts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_contacts ADD CONSTRAINT supplier_contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_documents ADD CONSTRAINT supplier_documents_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_documents ADD CONSTRAINT supplier_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_performance_metrics ADD CONSTRAINT supplier_performance_metrics_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id);
ALTER TABLE public.supplier_performance_metrics ADD CONSTRAINT supplier_performance_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_products ADD CONSTRAINT supplier_products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers (id) ON DELETE CASCADE;
ALTER TABLE public.supplier_products ADD CONSTRAINT supplier_products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.master_supplier_categories (id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.geo_cities (id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.geo_countries (id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_payment_terms_id_fkey FOREIGN KEY (payment_terms_id) REFERENCES public.master_supplier_payment_terms (id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.support_ticket_messages ADD CONSTRAINT support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets (id) ON DELETE CASCADE;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.system_logs ADD CONSTRAINT system_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.tax_rates ADD CONSTRAINT tax_rates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.template_versions ADD CONSTRAINT template_versions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates (id) ON DELETE CASCADE;
ALTER TABLE public.template_versions ADD CONSTRAINT template_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.templates ADD CONSTRAINT templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.tenant_activity_log ADD CONSTRAINT tenant_activity_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.tenant_health_metrics ADD CONSTRAINT tenant_health_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.tenant_impersonation_sessions ADD CONSTRAINT tenant_impersonation_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.platform_admins (id);
ALTER TABLE public.tenant_impersonation_sessions ADD CONSTRAINT tenant_impersonation_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id);
ALTER TABLE public.tenant_payment_methods ADD CONSTRAINT tenant_payment_methods_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.tenant_rate_limits ADD CONSTRAINT tenant_rate_limits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans (id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.geo_countries (id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans (id);
ALTER TABLE public.timesheets ADD CONSTRAINT timesheets_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases (id);
ALTER TABLE public.timesheets ADD CONSTRAINT timesheets_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id);
ALTER TABLE public.timesheets ADD CONSTRAINT timesheets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.usage_snapshots ADD CONSTRAINT usage_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.user_activity_logs ADD CONSTRAINT user_activity_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.user_activity_sessions (id);
ALTER TABLE public.user_activity_logs ADD CONSTRAINT user_activity_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.user_activity_sessions ADD CONSTRAINT user_activity_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.user_sidebar_preferences ADD CONSTRAINT user_sidebar_preferences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.vat_records ADD CONSTRAINT vat_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.vat_returns ADD CONSTRAINT vat_returns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.vat_transactions ADD CONSTRAINT vat_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE;
ALTER TABLE public.vat_transactions ADD CONSTRAINT vat_transactions_vat_return_id_fkey FOREIGN KEY (vat_return_id) REFERENCES public.vat_returns (id);


-- ============================================================
-- 7. INDEXES
-- ============================================================

CREATE INDEX idx_account_snapshots_tenant ON public.account_balance_snapshots USING btree (tenant_id);
CREATE INDEX idx_account_transfers_tenant ON public.account_transfers USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_accounting_locales_tenant ON public.accounting_locales USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_asset_assignments_tenant ON public.asset_assignments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_asset_categories_tenant ON public.asset_categories USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_asset_depreciation_tenant ON public.asset_depreciation USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_asset_maintenance_tenant ON public.asset_maintenance USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_assets_tenant ON public.assets USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_attendance_records_tenant ON public.attendance_records USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_audit_trails_record ON public.audit_trails USING btree (record_type, record_id);
CREATE INDEX idx_audit_trails_tenant ON public.audit_trails USING btree (tenant_id);
CREATE INDEX idx_bank_accounts_tenant ON public.bank_accounts USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_bank_recon_sessions_tenant ON public.bank_reconciliation_sessions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_bank_transactions_tenant ON public.bank_transactions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_billing_events_processed ON public.billing_events USING btree (processed) WHERE (processed = false);
CREATE INDEX idx_billing_events_tenant ON public.billing_events USING btree (tenant_id);
CREATE INDEX idx_billing_invoice_items_invoice ON public.billing_invoice_items USING btree (invoice_id);
CREATE INDEX idx_billing_invoices_status ON public.billing_invoices USING btree (status);
CREATE INDEX idx_billing_invoices_tenant ON public.billing_invoices USING btree (tenant_id);
CREATE INDEX idx_branches_tenant ON public.branches USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_attachments_case ON public.case_attachments USING btree (case_id);
CREATE INDEX idx_case_attachments_tenant ON public.case_attachments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_communications_tenant ON public.case_communications USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_devices_case ON public.case_devices USING btree (case_id);
CREATE INDEX idx_case_devices_tenant ON public.case_devices USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_diagnostics_tenant ON public.case_diagnostics USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_engineers_tenant ON public.case_engineers USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_follow_ups_tenant ON public.case_follow_ups USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_internal_notes_tenant ON public.case_internal_notes USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_job_history_tenant ON public.case_job_history USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_milestones_tenant ON public.case_milestones USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_portal_visibility_tenant ON public.case_portal_visibility USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_qa_checklists_tenant ON public.case_qa_checklists USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_quote_items_tenant ON public.case_quote_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_quotes_tenant ON public.case_quotes USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_recovery_attempts_tenant ON public.case_recovery_attempts USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_report_sections_tenant ON public.case_report_sections USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_reports_tenant ON public.case_reports USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cases_customer ON public.cases USING btree (customer_id);
CREATE INDEX idx_cases_number ON public.cases USING btree (case_number);
CREATE INDEX idx_cases_status ON public.cases USING btree (status_id);
CREATE INDEX idx_cases_tenant ON public.cases USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_chain_of_custody_case ON public.chain_of_custody USING btree (case_id);
CREATE INDEX idx_chain_of_custody_tenant ON public.chain_of_custody USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_coc_access_log_tenant ON public.chain_of_custody_access_log USING btree (tenant_id);
CREATE INDEX idx_coc_integrity_checks_tenant ON public.chain_of_custody_integrity_checks USING btree (tenant_id);
CREATE INDEX idx_coc_transfers_tenant ON public.chain_of_custody_transfers USING btree (tenant_id);
CREATE INDEX idx_clone_drives_tenant ON public.clone_drives USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_companies_tenant ON public.companies USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_company_documents_tenant ON public.company_documents USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_company_settings_tenant ON public.company_settings USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_coupon_redemptions_tenant ON public.coupon_redemptions USING btree (tenant_id);
CREATE INDEX idx_customer_communications_tenant ON public.customer_communications USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_customer_company_rel_tenant ON public.customer_company_relationships USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_customer_groups_tenant ON public.customer_groups USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_customers_enhanced_email ON public.customers_enhanced USING btree (email) WHERE (deleted_at IS NULL);
CREATE INDEX idx_customers_enhanced_number ON public.customers_enhanced USING btree (customer_number);
CREATE INDEX idx_customers_enhanced_tenant ON public.customers_enhanced USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_data_retention_policies_tenant_id ON public.data_retention_policies USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_data_subject_requests_tenant_id ON public.data_subject_requests USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_database_backups_tenant ON public.database_backups USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_departments_tenant ON public.departments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_device_diagnostics_tenant ON public.device_diagnostics USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_document_templates_tenant ON public.document_templates USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_employee_documents_tenant ON public.employee_documents USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_employee_loans_tenant ON public.employee_loans USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_employee_salary_components_tenant ON public.employee_salary_components USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_employee_salary_config_tenant ON public.employee_salary_config USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_employee_salary_structures_tenant ON public.employee_salary_structures USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_employees_tenant ON public.employees USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_expense_attachments_tenant ON public.expense_attachments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_expenses_tenant ON public.expenses USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_financial_audit_logs_tenant ON public.financial_audit_logs USING btree (tenant_id);
CREATE INDEX idx_financial_transactions_tenant ON public.financial_transactions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_geo_cities_country ON public.geo_cities USING btree (country_id);
CREATE INDEX idx_import_export_jobs_tenant ON public.import_export_jobs USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_import_export_logs_tenant ON public.import_export_logs USING btree (tenant_id);
CREATE INDEX idx_import_export_templates_tenant ON public.import_export_templates USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_import_field_mappings_tenant ON public.import_field_mappings USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_assignments_tenant ON public.inventory_assignments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_case_assignments_tenant ON public.inventory_case_assignments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_items_tenant ON public.inventory_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_locations_tenant ON public.inventory_locations USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_parts_usage_tenant ON public.inventory_parts_usage USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_photos_tenant ON public.inventory_photos USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_reservations_tenant ON public.inventory_reservations USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_search_templates_tenant ON public.inventory_search_templates USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inventory_status_history_tenant ON public.inventory_status_history USING btree (tenant_id);
CREATE INDEX idx_inventory_transactions_tenant ON public.inventory_transactions USING btree (tenant_id);
CREATE INDEX idx_invoice_line_items_tenant ON public.invoice_line_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_invoices_case ON public.invoices USING btree (case_id);
CREATE INDEX idx_invoices_customer ON public.invoices USING btree (customer_id);
CREATE INDEX idx_invoices_tenant ON public.invoices USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kb_article_tags_tenant ON public.kb_article_tags USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kb_article_versions_tenant ON public.kb_article_versions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kb_articles_tenant ON public.kb_articles USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kb_categories_tenant ON public.kb_categories USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kb_tags_tenant ON public.kb_tags USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_leave_balances_tenant ON public.leave_balances USING btree (tenant_id);
CREATE INDEX idx_leave_requests_tenant ON public.leave_requests USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_loan_repayments_tenant ON public.loan_repayments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_ndas_tenant ON public.ndas USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_number_sequences_tenant ON public.number_sequences USING btree (tenant_id);
CREATE INDEX idx_number_sequences_audit_tenant ON public.number_sequences_audit USING btree (tenant_id);
CREATE INDEX idx_onboarding_checklist_items_tenant ON public.onboarding_checklist_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_onboarding_checklists_tenant ON public.onboarding_checklists USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_onboarding_tasks_tenant ON public.onboarding_tasks USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payment_allocations_tenant ON public.payment_allocations USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payment_disbursements_tenant ON public.payment_disbursements USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payment_receipts_tenant ON public.payment_receipts USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payments_tenant ON public.payments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payroll_adjustments_tenant ON public.payroll_adjustments USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payroll_bank_files_tenant ON public.payroll_bank_files USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payroll_periods_tenant ON public.payroll_periods USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payroll_record_items_tenant ON public.payroll_record_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payroll_records_tenant ON public.payroll_records USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_pdf_generation_logs_tenant ON public.pdf_generation_logs USING btree (tenant_id);
CREATE INDEX idx_performance_reviews_tenant ON public.performance_reviews USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_plan_features_plan_id ON public.plan_features USING btree (plan_id);
CREATE INDEX idx_platform_audit_logs_admin ON public.platform_audit_logs USING btree (admin_id);
CREATE INDEX idx_platform_audit_logs_performed_at ON public.platform_audit_logs USING btree (performed_at DESC);
CREATE INDEX idx_platform_audit_logs_tenant ON public.platform_audit_logs USING btree (tenant_id);
CREATE INDEX idx_portal_link_history_tenant ON public.portal_link_history USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_positions_tenant ON public.positions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email) WHERE (deleted_at IS NULL);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role) WHERE (deleted_at IS NULL);
CREATE INDEX idx_profiles_tenant_id ON public.profiles USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_purchase_order_items_tenant ON public.purchase_order_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_purchase_orders_tenant ON public.purchase_orders USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_quote_history_tenant ON public.quote_history USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_quote_items_tenant ON public.quote_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_quotes_tenant ON public.quotes USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_rate_limits_key ON public.rate_limits USING btree (key);
CREATE INDEX idx_rate_limits_window_start ON public.rate_limits USING btree (window_start);
CREATE INDEX idx_receipt_allocations_tenant ON public.receipt_allocations USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_receipts_tenant ON public.receipts USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_recon_matches_tenant ON public.reconciliation_matches USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_recruitment_candidates_tenant ON public.recruitment_candidates USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_recruitment_jobs_tenant ON public.recruitment_jobs USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_report_section_library_display_order ON public.report_section_library USING btree (display_order) WHERE (is_active = true);
CREATE INDEX idx_resource_clone_drives_tenant ON public.resource_clone_drives USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_role_module_permissions_tenant ON public.role_module_permissions USING btree (tenant_id);
CREATE INDEX idx_salary_components_tenant ON public.salary_components USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_signup_otps_email ON public.signup_otps USING btree (email);
CREATE INDEX idx_signup_otps_expires ON public.signup_otps USING btree (expires_at);
CREATE INDEX idx_stock_adj_session_items_tenant ON public.stock_adjustment_session_items USING btree (tenant_id);
CREATE INDEX idx_stock_adj_sessions_tenant ON public.stock_adjustment_sessions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_stock_adjustments_tenant ON public.stock_adjustments USING btree (tenant_id);
CREATE INDEX idx_stock_alerts_tenant ON public.stock_alerts USING btree (tenant_id);
CREATE INDEX idx_stock_categories_tenant ON public.stock_categories USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_stock_items_sku ON public.stock_items USING btree (sku);
CREATE INDEX idx_stock_items_tenant ON public.stock_items USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_stock_locations_tenant ON public.stock_locations USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_stock_movements_tenant ON public.stock_movements USING btree (tenant_id);
CREATE INDEX idx_stock_price_history_tenant ON public.stock_price_history USING btree (tenant_id);
CREATE INDEX idx_stock_sale_items_tenant ON public.stock_sale_items USING btree (tenant_id);
CREATE INDEX idx_stock_sales_tenant ON public.stock_sales USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_stock_serial_numbers_tenant ON public.stock_serial_numbers USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_stock_transactions_tenant ON public.stock_transactions USING btree (tenant_id);
CREATE INDEX idx_supplier_audit_trail_tenant ON public.supplier_audit_trail USING btree (tenant_id);
CREATE INDEX idx_supplier_communications_tenant ON public.supplier_communications USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_supplier_contacts_tenant ON public.supplier_contacts USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_supplier_documents_tenant ON public.supplier_documents USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_supplier_performance_tenant ON public.supplier_performance_metrics USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_supplier_products_tenant ON public.supplier_products USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_suppliers_tenant ON public.suppliers USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_support_ticket_messages_ticket ON public.support_ticket_messages USING btree (ticket_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);
CREATE INDEX idx_support_tickets_tenant ON public.support_tickets USING btree (tenant_id);
CREATE INDEX idx_system_logs_tenant ON public.system_logs USING btree (tenant_id);
CREATE INDEX idx_tax_rates_tenant ON public.tax_rates USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_template_versions_tenant ON public.template_versions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_templates_tenant ON public.templates USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_tenant_activity_log_tenant ON public.tenant_activity_log USING btree (tenant_id);
CREATE INDEX idx_tenant_health_metrics_tenant ON public.tenant_health_metrics USING btree (tenant_id);
CREATE INDEX idx_impersonation_sessions_active ON public.tenant_impersonation_sessions USING btree (admin_id) WHERE (ended_at IS NULL);
CREATE INDEX idx_impersonation_sessions_admin ON public.tenant_impersonation_sessions USING btree (admin_id);
CREATE INDEX idx_impersonation_sessions_tenant ON public.tenant_impersonation_sessions USING btree (tenant_id);
CREATE INDEX idx_tenant_payment_methods_tenant ON public.tenant_payment_methods USING btree (tenant_id);
CREATE INDEX idx_tenant_rate_limits_tenant_id ON public.tenant_rate_limits USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_tenant_subscriptions_status ON public.tenant_subscriptions USING btree (status);
CREATE INDEX idx_tenant_subscriptions_tenant ON public.tenant_subscriptions USING btree (tenant_id);
CREATE INDEX idx_tenants_country_id ON public.tenants USING btree (country_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_tenants_slug ON public.tenants USING btree (slug) WHERE (deleted_at IS NULL);
CREATE INDEX idx_tenants_status ON public.tenants USING btree (status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_timesheets_tenant ON public.timesheets USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_usage_records_tenant ON public.usage_records USING btree (tenant_id);
CREATE INDEX idx_usage_snapshots_tenant ON public.usage_snapshots USING btree (tenant_id);
CREATE INDEX idx_user_activity_logs_tenant ON public.user_activity_logs USING btree (tenant_id);
CREATE INDEX idx_user_activity_sessions_tenant ON public.user_activity_sessions USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_user_preferences_tenant ON public.user_preferences USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_user_sessions_tenant ON public.user_sessions USING btree (tenant_id);
CREATE INDEX idx_user_sidebar_preferences_tenant ON public.user_sidebar_preferences USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_vat_records_tenant ON public.vat_records USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_vat_returns_tenant ON public.vat_returns USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_vat_transactions_tenant ON public.vat_transactions USING btree (tenant_id) WHERE (deleted_at IS NULL);


-- ============================================================
-- 8. RLS ENABLE + FORCE
-- ============================================================

ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_balance_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_locales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_dismissals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.asset_depreciation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_depreciation FORCE ROW LEVEL SECURITY;
ALTER TABLE public.asset_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_maintenance FORCE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_trails FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_coupons FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_communications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_diagnostics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_engineers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_follow_ups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_internal_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_job_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_job_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_milestones FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_portal_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_portal_visibility FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_qa_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_qa_checklists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_quote_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_recovery_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_report_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_report_sections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.case_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_accessories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_capacities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_capacities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_component_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_component_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_conditions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_encryption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_encryption FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_form_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_form_factors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_head_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_head_counts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_interfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_interfaces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_made_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_made_in FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_platter_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_platter_counts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_device_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_donor_compatibility_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_donor_compatibility_matrix FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_interfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_interfaces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_problems FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_service_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody_access_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody_integrity_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody_integrity_checks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clone_drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clone_drives FORCE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customer_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_communications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customer_company_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_company_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers_enhanced ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers_enhanced FORCE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_subject_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.database_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_backups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_diagnostics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_loans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_components FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_config FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_structures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.geo_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_cities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.geo_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_countries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.import_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_export_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.import_export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_export_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.import_export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_export_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.import_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_field_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_case_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_case_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_parts_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_parts_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_search_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_search_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kb_article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_article_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kb_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_article_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kb_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_case_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_case_priorities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_case_report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_case_report_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_case_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_case_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_currency_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_currency_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_expense_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_industries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_condition_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_condition_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_item_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_status_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_status_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_invoice_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_invoice_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_leave_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_modules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_payment_methods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_payroll_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_payroll_components FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_purchase_order_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_purchase_order_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_quote_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_quote_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_supplier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_supplier_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_supplier_payment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_supplier_payment_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_template_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_template_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_template_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_template_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_template_variables FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_transaction_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_transaction_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ndas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ndas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.number_sequences_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_sequences_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklist_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_disbursements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_bank_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_bank_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_record_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_record_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_generation_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_link_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_link_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quote_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_matches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.report_section_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_section_library FORCE ROW LEVEL SECURITY;
ALTER TABLE public.report_section_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_section_presets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.report_template_section_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_template_section_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.resource_clone_drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_clone_drives FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_module_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_components FORCE ROW LEVEL SECURITY;
ALTER TABLE public.signup_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_otps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_session_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_price_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_sales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_serial_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_serial_numbers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_audit_trail FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_communications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_performance_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_seed_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_seed_status FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_activity_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_health_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_impersonation_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_payment_methods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_sidebar_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sidebar_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vat_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vat_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_transactions FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 10. FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_validate_user_creation(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_existing uuid; v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('owner', 'admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  SELECT id INTO v_existing FROM profiles WHERE email = p_email AND deleted_at IS NULL;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User exists'); END IF;
  RETURN jsonb_build_object('success', true, 'can_create', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.anonymize_customer_data(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_anon_email text;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM customers_enhanced
  WHERE id = p_customer_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF v_tenant_id != get_current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_anon_email := 'anonymized_' || encode(gen_random_bytes(8), 'hex') || '@redacted.local';

  UPDATE customers_enhanced SET
    first_name = 'ANONYMIZED',
    last_name = 'CUSTOMER',
    email = v_anon_email,
    phone = NULL,
    mobile = NULL,
    address_line1 = NULL,
    address_line2 = NULL,
    city = NULL,
    postal_code = NULL,
    notes = 'Data anonymized per GDPR request',
    updated_at = now()
  WHERE id = p_customer_id AND tenant_id = v_tenant_id;

  UPDATE customer_communications SET
    subject = 'ANONYMIZED',
    content = 'Content removed per GDPR request',
    updated_at = now()
  WHERE customer_id = p_customer_id AND tenant_id = v_tenant_id;

  INSERT INTO audit_trails (tenant_id, table_name, record_id, action, changes, performed_by)
  VALUES (
    v_tenant_id,
    'customers_enhanced',
    p_customer_id,
    'anonymize',
    jsonb_build_object('reason', 'GDPR data deletion request', 'anonymized_at', now()),
    auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE quotes SET status_id = (SELECT id FROM master_quote_statuses WHERE name = 'Approved'), approved_at = now(), approved_by = auth.uid()::text, updated_at = now()
  WHERE id = p_quote_id AND tenant_id = get_current_tenant_id();
END;
$function$;

CREATE OR REPLACE FUNCTION public.authenticate_portal_customer(p_email text, p_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_customer RECORD;
BEGIN
  SELECT id, customer_number, customer_name, email, mobile_number, profile_photo_url, portal_enabled, portal_password_hash
  INTO v_customer FROM customers_enhanced
  WHERE LOWER(email) = LOWER(p_email) AND portal_enabled = true AND deleted_at IS NULL;
  IF NOT FOUND OR v_customer.portal_password_hash IS NULL THEN RETURN NULL; END IF;
  UPDATE customers_enhanced SET portal_last_login = now() WHERE id = v_customer.id;
  RETURN json_build_object('id', v_customer.id, 'customer_number', v_customer.customer_number, 'customer_name', v_customer.customer_name, 'email', v_customer.email, 'mobile_number', v_customer.mobile_number, 'profile_photo_url', v_customer.profile_photo_url);
END;
$function$;

CREATE OR REPLACE FUNCTION public.belongs_to_tenant(check_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true AND deleted_at IS NULL AND (tenant_id IS NULL OR tenant_id = check_tenant_id)); $function$;

CREATE OR REPLACE FUNCTION public.change_portal_password(p_customer_id uuid, p_new_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE customers_enhanced SET portal_password_hash = p_new_hash, updated_at = now()
  WHERE id = p_customer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_module_access(p_module_slug text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_role text; v_has_access boolean;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid() AND deleted_at IS NULL;
  IF v_role IN ('owner', 'admin') THEN RETURN true; END IF;
  SELECT can_access INTO v_has_access FROM role_module_permissions rmp
  JOIN master_modules m ON m.id = rmp.module_id
  WHERE rmp.role = v_role AND m.slug = p_module_slug AND rmp.tenant_id = get_current_tenant_id();
  RETURN COALESCE(v_has_access, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_requests integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start timestamptz;
  v_count int;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  DELETE FROM rate_limits WHERE key = p_key AND window_start < v_window_start;
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM rate_limits
  WHERE key = p_key AND window_start >= v_window_start;
  IF v_count >= p_max_requests THEN
    RETURN false;
  END IF;
  INSERT INTO rate_limits (key, request_count, window_start)
  VALUES (p_key, 1, now());
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_tenant_rate_limit(p_tenant_id uuid, p_resource text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_requests integer;
  v_window_seconds integer;
  v_current_count integer;
  v_window_start timestamptz;
BEGIN
  SELECT
    CASE p_resource
      WHEN 'api_calls' THEN sp.api_calls_per_hour
      WHEN 'email_sends' THEN sp.email_sends_per_day
      WHEN 'pdf_generations' THEN sp.pdf_generations_per_hour
      ELSE 1000
    END,
    CASE p_resource
      WHEN 'email_sends' THEN 86400
      ELSE 3600
    END
  INTO v_max_requests, v_window_seconds
  FROM tenant_subscriptions ts
  JOIN subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = p_tenant_id
    AND ts.status = 'active'
  LIMIT 1;

  IF v_max_requests IS NULL THEN
    v_max_requests := 100;
    v_window_seconds := 3600;
  END IF;

  INSERT INTO tenant_rate_limits (tenant_id, resource_type, max_requests, window_seconds, current_count, window_start)
  VALUES (p_tenant_id, p_resource, v_max_requests, v_window_seconds, 1, now())
  ON CONFLICT (tenant_id, resource_type) WHERE deleted_at IS NULL
  DO UPDATE SET
    current_count = CASE
      WHEN tenant_rate_limits.window_start + (tenant_rate_limits.window_seconds || ' seconds')::interval < now()
      THEN 1
      ELSE tenant_rate_limits.current_count + 1
    END,
    window_start = CASE
      WHEN tenant_rate_limits.window_start + (tenant_rate_limits.window_seconds || ' seconds')::interval < now()
      THEN now()
      ELSE tenant_rate_limits.window_start
    END,
    updated_at = now()
  RETURNING current_count, window_start INTO v_current_count, v_window_start;

  RETURN v_current_count <= v_max_requests;
END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_proforma_to_tax_invoice(p_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_invoice_id uuid; v_quote RECORD;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id AND tenant_id = get_current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;

  INSERT INTO invoices (tenant_id, case_id, customer_id, company_id, invoice_type, subtotal, tax_amount, discount_amount, total_amount, converted_from_quote_id, created_by)
  VALUES (v_quote.tenant_id, v_quote.case_id, v_quote.customer_id, v_quote.company_id, 'tax_invoice', v_quote.subtotal, v_quote.tax_amount, v_quote.discount_amount, v_quote.total_amount, p_quote_id, auth.uid())
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_line_items (tenant_id, invoice_id, description, quantity, unit_price, total)
  SELECT v_quote.tenant_id, v_invoice_id, qi.description, qi.quantity, qi.unit_price, qi.total
  FROM quote_items qi WHERE qi.quote_id = p_quote_id;

  UPDATE quotes SET converted_to_invoice_id = v_invoice_id, updated_at = now() WHERE id = p_quote_id;
  RETURN v_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_case_permanently(p_case_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role('admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE cases SET deleted_at = now(), updated_at = now() WHERE id = p_case_id AND tenant_id = get_current_tenant_id();
END;
$function$;

CREATE OR REPLACE FUNCTION public.disable_customer_portal_access(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE customers_enhanced SET portal_enabled = false, portal_password_hash = NULL, updated_at = now()
  WHERE id = p_customer_id AND tenant_id = get_current_tenant_id();
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_customer_data(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_result jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM customers_enhanced
  WHERE id = p_customer_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF v_tenant_id != get_current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_result := jsonb_build_object(
    'exported_at', now(),
    'customer_id', p_customer_id,
    'personal_info', (
      SELECT to_jsonb(c.*) FROM customers_enhanced c WHERE c.id = p_customer_id AND c.deleted_at IS NULL
    ),
    'cases', COALESCE((
      SELECT jsonb_agg(to_jsonb(cs.*))
      FROM cases cs
      WHERE cs.customer_id = p_customer_id AND cs.tenant_id = v_tenant_id AND cs.deleted_at IS NULL
    ), '[]'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(to_jsonb(inv.*))
      FROM invoices inv
      WHERE inv.customer_id = p_customer_id AND inv.tenant_id = v_tenant_id AND inv.deleted_at IS NULL
    ), '[]'::jsonb),
    'quotes', COALESCE((
      SELECT jsonb_agg(to_jsonb(q.*))
      FROM quotes q
      WHERE q.customer_id = p_customer_id AND q.tenant_id = v_tenant_id AND q.deleted_at IS NULL
    ), '[]'::jsonb),
    'communications', COALESCE((
      SELECT jsonb_agg(to_jsonb(cc.*))
      FROM customer_communications cc
      WHERE cc.customer_id = p_customer_id AND cc.tenant_id = v_tenant_id AND cc.deleted_at IS NULL
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(p.*))
      FROM payments p
      WHERE p.customer_id = p_customer_id AND p.tenant_id = v_tenant_id AND p.deleted_at IS NULL
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_next_number(p_scope text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number(p_scope); END; $function$;

CREATE OR REPLACE FUNCTION public.get_accessible_modules()
 RETURNS TABLE(module_id uuid, module_name text, module_slug text, can_access boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid() AND deleted_at IS NULL;
  RETURN QUERY
  SELECT m.id, m.name, m.slug,
    CASE WHEN v_role IN ('owner', 'admin') THEN true
    ELSE COALESCE((SELECT rmp.can_access FROM role_module_permissions rmp WHERE rmp.module_id = m.id AND rmp.role = v_role AND rmp.tenant_id = get_current_tenant_id()), false)
    END
  FROM master_modules m WHERE m.is_active = true ORDER BY m.sort_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_portal_customer_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$ BEGIN RETURN NULLIF(current_setting('app.portal_customer_id', true), '')::UUID; EXCEPTION WHEN OTHERS THEN RETURN NULL; END; $function$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT tenant_id FROM profiles WHERE id = auth.uid() AND deleted_at IS NULL; $function$;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT role FROM profiles WHERE id = auth.uid() AND deleted_at IS NULL; $function$;

CREATE OR REPLACE FUNCTION public.get_next_case_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('cases'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_company_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('companies'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_customer_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('customers'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_disbursement_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('disbursements'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('invoices'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_number(p_scope text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_prefix text;
  v_padding integer;
  v_next_val bigint;
  v_reset boolean;
  v_current_year integer;
  v_last_year integer;
BEGIN
  v_tenant_id := get_current_tenant_id();
  v_current_year := EXTRACT(YEAR FROM now())::integer;

  SELECT prefix, padding, reset_annually, current_value, last_reset_year
  INTO v_prefix, v_padding, v_reset, v_next_val, v_last_year
  FROM number_sequences
  WHERE tenant_id = v_tenant_id AND scope = p_scope;

  IF NOT FOUND THEN
    INSERT INTO number_sequences (tenant_id, scope, prefix, current_value, padding)
    VALUES (v_tenant_id, p_scope, UPPER(LEFT(p_scope, 4)), 1, 4)
    RETURNING prefix, padding, current_value INTO v_prefix, v_padding, v_next_val;
  ELSE
    IF v_reset AND (v_last_year IS NULL OR v_last_year < v_current_year) THEN
      v_next_val := 1;
      UPDATE number_sequences SET current_value = 1, last_reset_year = v_current_year, updated_at = now()
      WHERE tenant_id = v_tenant_id AND scope = p_scope;
    ELSE
      v_next_val := v_next_val + 1;
      UPDATE number_sequences SET current_value = v_next_val, updated_at = now()
      WHERE tenant_id = v_tenant_id AND scope = p_scope;
    END IF;
  END IF;

  RETURN COALESCE(v_prefix, '') || '-' || LPAD(v_next_val::text, COALESCE(v_padding, 4), '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_next_po_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('purchase_orders'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_receipt_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('receipts'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_supplier_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('suppliers'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_ticket_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('support_tickets'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_transfer_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN get_next_number('transfers'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_tenant_storage_bytes(p_tenant_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_total bigint := 0;
BEGIN
  SELECT COALESCE(SUM(file_size), 0) INTO v_total FROM case_attachments WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_case_access_level()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE al TEXT; BEGIN SELECT case_access_level INTO al FROM profiles WHERE id = auth.uid(); RETURN COALESCE(al, 'full'); END; $function$;

CREATE OR REPLACE FUNCTION public.get_user_profiles_with_email()
 RETURNS TABLE(id uuid, full_name text, role text, phone text, avatar_url text, is_active boolean, last_login_at timestamp with time zone, password_reset_required boolean, case_access_level text, created_at timestamp with time zone, updated_at timestamp with time zone, email text, tenant_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.role, p.phone, p.avatar_url, p.is_active, p.last_login_at, p.password_reset_required, p.case_access_level, p.created_at, p.updated_at, u.email::text, p.tenant_id
  FROM profiles p LEFT JOIN auth.users u ON p.id = u.id
  WHERE p.tenant_id = get_current_tenant_id() OR is_platform_admin()
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE user_role text; BEGIN SELECT role INTO user_role FROM profiles WHERE id = auth.uid() AND deleted_at IS NULL; RETURN COALESCE(user_role, 'none'); END; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, tenant_id, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer'),
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    role = COALESCE(NULLIF(EXCLUDED.role, 'viewer'), profiles.role),
    tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id),
    updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(required_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true AND deleted_at IS NULL
    AND CASE required_role
      WHEN 'viewer' THEN role IN ('owner','admin','manager','technician','sales','accounts','hr','viewer')
      WHEN 'member' THEN role IN ('owner','admin','manager','technician','sales','accounts','hr')
      WHEN 'technician' THEN role IN ('owner','admin','manager','technician')
      WHEN 'sales' THEN role IN ('owner','admin','manager','sales')
      WHEN 'accounts' THEN role IN ('owner','admin','manager','accounts')
      WHEN 'hr' THEN role IN ('owner','admin','manager','hr')
      WHEN 'manager' THEN role IN ('owner','admin','manager')
      WHEN 'admin' THEN role IN ('owner','admin')
      WHEN 'owner' THEN role = 'owner'
      ELSE false
    END
  );
$function$;

CREATE OR REPLACE FUNCTION public.increment_preset_usage(p_preset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN UPDATE report_section_presets SET usage_count = usage_count + 1 WHERE id = p_preset_id; END; $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true AND deleted_at IS NULL); $function$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true AND deleted_at IS NULL); $function$;

CREATE OR REPLACE FUNCTION public.is_hr_or_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'hr') AND is_active = true AND deleted_at IS NULL); END; $function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tenant_id IS NULL AND role IN ('owner', 'admin') AND is_active = true AND deleted_at IS NULL); $function$;

CREATE OR REPLACE FUNCTION public.is_portal_account_locked(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_locked_until timestamptz;
BEGIN
  SELECT portal_locked_until INTO v_locked_until FROM customers_enhanced WHERE email = p_email;
  IF v_locked_until IS NULL OR v_locked_until < now() THEN
    UPDATE customers_enhanced SET portal_failed_login_attempts = 0, portal_locked_until = NULL WHERE email = p_email AND (portal_locked_until IS NOT NULL OR portal_failed_login_attempts > 0);
    RETURN jsonb_build_object('locked', false);
  END IF;
  RETURN jsonb_build_object('locked', true, 'locked_until', v_locked_until, 'minutes_remaining', EXTRACT(EPOCH FROM (v_locked_until - now())) / 60);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_portal_enabled()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_enabled boolean; BEGIN SELECT COALESCE(portal_enabled, true) INTO v_enabled FROM company_settings LIMIT 1; RETURN COALESCE(v_enabled, true); EXCEPTION WHEN OTHERS THEN RETURN true; END; $function$;

CREATE OR REPLACE FUNCTION public.is_portal_in_maintenance_mode()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_mm boolean; v_msg text; BEGIN SELECT COALESCE(portal_maintenance_mode, false), COALESCE(portal_maintenance_message, 'The portal is currently undergoing maintenance.') INTO v_mm, v_msg FROM company_settings LIMIT 1; RETURN jsonb_build_object('maintenance_mode', COALESCE(v_mm, false), 'maintenance_message', COALESCE(v_msg, '')); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('maintenance_mode', false, 'maintenance_message', ''); END; $function$;

CREATE OR REPLACE FUNCTION public.is_portal_user()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN (current_setting('request.jwt.claims', true)::json->>'portal_token') IS NOT NULL; END; $function$;

CREATE OR REPLACE FUNCTION public.is_staff_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'technician', 'sales', 'accounts', 'hr') AND is_active = true AND deleted_at IS NULL); $function$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL AND role IN ('owner', 'admin') AND is_active = true AND deleted_at IS NULL); $function$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL AND role = 'owner' AND is_active = true AND deleted_at IS NULL); $function$;

CREATE OR REPLACE FUNCTION public.log_audit_trail(p_record_type text, p_record_id uuid, p_action text, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_changed_fields text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO audit_trails (tenant_id, record_type, record_id, action, old_values, new_values, changed_fields, performed_by)
  VALUES (get_current_tenant_id(), p_record_type, p_record_id, p_action, p_old_values, p_new_values, p_changed_fields, auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_case_communication(p_case_id uuid, p_type text, p_subject text DEFAULT NULL::text, p_content text DEFAULT NULL::text, p_direction text DEFAULT 'internal'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO case_communications (tenant_id, case_id, type, subject, content, direction, sent_by)
  VALUES (get_current_tenant_id(), p_case_id, p_type, p_subject, p_content, p_direction, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_case_history(p_case_id uuid, p_action text, p_details text DEFAULT NULL::text, p_old_value text DEFAULT NULL::text, p_new_value text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO case_job_history (tenant_id, case_id, action, details, old_value, new_value, performed_by)
  VALUES (get_current_tenant_id(), p_case_id, p_action, p_details, p_old_value, p_new_value, auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_chain_of_custody(p_case_id uuid, p_device_id uuid, p_action_category text, p_action text, p_description text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_custody_status text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_user_name text;
  v_user_role text;
BEGIN
  SELECT full_name, role INTO v_user_name, v_user_role FROM profiles WHERE id = auth.uid();
  INSERT INTO chain_of_custody (tenant_id, case_id, device_id, action_category, action, description, actor_id, actor_name, actor_role, location, custody_status, metadata)
  VALUES (get_current_tenant_id(), p_case_id, p_device_id, p_action_category::custody_action_category, p_action, p_description, auth.uid(), COALESCE(v_user_name, 'System'), v_user_role, p_location, p_custody_status::custody_status, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_brand(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM catalog_device_brands WHERE LOWER(name) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.lookup_capacity(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM catalog_device_capacities WHERE LOWER(name) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.lookup_condition_type(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM catalog_device_conditions WHERE LOWER(name) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.lookup_country(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM geo_countries WHERE LOWER(name) = LOWER(p_name) OR LOWER(code) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.lookup_device_type(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM catalog_device_types WHERE LOWER(name) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.lookup_interface(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM catalog_interfaces WHERE LOWER(name) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.lookup_status_type(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM master_inventory_status_types WHERE LOWER(name) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.lookup_storage_location(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT id FROM inventory_locations WHERE LOWER(name) = LOWER(p_name) LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.reject_quote(p_quote_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE quotes SET status_id = (SELECT id FROM master_quote_statuses WHERE name = 'Rejected'), rejected_at = now(), rejection_reason = p_reason, updated_at = now()
  WHERE id = p_quote_id AND tenant_id = get_current_tenant_id();
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_donor_drives(p_criteria jsonb)
 RETURNS SETOF inventory_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT i.* FROM inventory_items i
  WHERE i.tenant_id = get_current_tenant_id()
  AND i.is_donor = true AND i.deleted_at IS NULL
  AND (p_criteria->>'brand_id' IS NULL OR i.brand_id = (p_criteria->>'brand_id')::uuid)
  AND (p_criteria->>'capacity_id' IS NULL OR i.capacity_id = (p_criteria->>'capacity_id')::uuid)
  AND (p_criteria->>'model' IS NULL OR i.model ILIKE '%' || (p_criteria->>'model') || '%');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_customer_portal_password(p_customer_id uuid, p_password_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE customers_enhanced SET portal_password_hash = p_password_hash, portal_enabled = true, updated_at = now()
  WHERE id = p_customer_id AND tenant_id = get_current_tenant_id();
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tenant_and_audit_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE current_tenant uuid;
BEGIN
  current_tenant := get_current_tenant_id();
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NULL THEN NEW.tenant_id := current_tenant; END IF;
    IF NEW.tenant_id IS DISTINCT FROM current_tenant AND NOT is_platform_admin() THEN
      RAISE EXCEPTION 'Cannot insert data for a different tenant';
    END IF;
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Cannot change tenant_id of existing record';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_tenant_config_from_country()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  country_config RECORD;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.country_id IS DISTINCT FROM OLD.country_id) THEN
    IF NEW.country_id IS NOT NULL THEN
      SELECT * INTO country_config FROM geo_countries WHERE id = NEW.country_id;
      IF FOUND THEN
        NEW.currency_code := country_config.currency_code;
        NEW.currency_symbol := country_config.currency_symbol;
        NEW.decimal_places := country_config.decimal_places;
        NEW.tax_system := country_config.tax_system;
        NEW.tax_label := country_config.tax_label;
        NEW.tax_number_label := country_config.tax_number_label;
        NEW.default_tax_rate := country_config.default_tax_rate;
        NEW.locale_code := country_config.locale_code;
        NEW.timezone := country_config.timezone;
        NEW.date_format := country_config.date_format;
        NEW.fiscal_year_start := country_config.fiscal_year_start;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.test_tenant_isolation()
 RETURNS TABLE(test_name text, passed boolean, details text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table_name text;
  v_has_tenant_id boolean;
  v_has_rls boolean;
  v_restrictive_count integer;
  v_total_tables integer := 0;
  v_passed_tables integer := 0;
BEGIN
  FOR v_table_name IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = t.table_name
          AND c.column_name = 'tenant_id'
      )
    ORDER BY t.table_name
  LOOP
    v_total_tables := v_total_tables + 1;

    SELECT relrowsecurity INTO v_has_rls
    FROM pg_class
    WHERE relname = v_table_name AND relnamespace = 'public'::regnamespace;

    SELECT count(*) INTO v_restrictive_count
    FROM pg_policies
    WHERE tablename = v_table_name
      AND schemaname = 'public'
      AND permissive = 'RESTRICTIVE';

    IF v_has_rls AND v_restrictive_count > 0 THEN
      v_passed_tables := v_passed_tables + 1;
      test_name := 'RLS + RESTRICTIVE policy: ' || v_table_name;
      passed := true;
      details := 'RLS enabled, ' || v_restrictive_count || ' restrictive policy(ies)';
      RETURN NEXT;
    ELSE
      test_name := 'RLS + RESTRICTIVE policy: ' || v_table_name;
      passed := false;
      details := 'RLS=' || COALESCE(v_has_rls::text, 'null') || ', restrictive_policies=' || v_restrictive_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  test_name := 'SUMMARY: Tenant-scoped tables with proper isolation';
  passed := (v_passed_tables = v_total_tables);
  details := v_passed_tables || '/' || v_total_tables || ' tables pass';
  RETURN NEXT;

  FOR v_table_name IN
    SELECT unnest(ARRAY[
      'get_current_tenant_id',
      'is_platform_admin',
      'is_tenant_owner',
      'is_tenant_admin',
      'is_admin',
      'is_staff_user',
      'has_role',
      'belongs_to_tenant',
      'get_my_role'
    ])
  LOOP
    test_name := 'Security function exists: ' || v_table_name;
    passed := EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = v_table_name AND pronamespace = 'public'::regnamespace
    );
    details := CASE WHEN passed THEN 'Function exists' ELSE 'MISSING' END;
    RETURN NEXT;
  END LOOP;

  SELECT count(*) INTO v_total_tables
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'tenant_id'
    );

  SELECT count(*) INTO v_passed_tables
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'tenant_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'deleted_at'
    );

  test_name := 'SUMMARY: Tenant tables with soft-delete (deleted_at)';
  passed := (v_passed_tables = v_total_tables);
  details := v_passed_tables || '/' || v_total_tables || ' tables have deleted_at';
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_number_sequence(p_scope text, p_prefix text, p_padding integer, p_reset boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE number_sequences SET prefix = p_prefix, padding = p_padding, reset_annually = p_reset, updated_at = now()
  WHERE tenant_id = get_current_tenant_id() AND scope = p_scope;
  IF NOT FOUND THEN
    INSERT INTO number_sequences (tenant_id, scope, prefix, padding, reset_annually)
    VALUES (get_current_tenant_id(), p_scope, p_prefix, p_padding, p_reset);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;



-- (added: existed on the live DB since the v1.0 rebuild; missed by the dump)
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := current_setting('role', true);
  -- service_role and postgres can do anything (DB owner needs DDL ability)
  IF v_role IN ('service_role', 'postgres') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Audit table % is append-only. Mutations are not permitted.', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

-- ============================================================
-- 9. RLS POLICIES
-- ============================================================

CREATE POLICY "account_balance_snapshots_delete" ON public.account_balance_snapshots FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "account_balance_snapshots_insert" ON public.account_balance_snapshots FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "account_balance_snapshots_select" ON public.account_balance_snapshots FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "account_balance_snapshots_tenant_isolation" ON public.account_balance_snapshots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "account_balance_snapshots_update" ON public.account_balance_snapshots FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "account_transfers_delete" ON public.account_transfers FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "account_transfers_insert" ON public.account_transfers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "account_transfers_select" ON public.account_transfers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "account_transfers_tenant_isolation" ON public.account_transfers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "account_transfers_update" ON public.account_transfers FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "accounting_locales_delete" ON public.accounting_locales FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "accounting_locales_insert" ON public.accounting_locales FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "accounting_locales_select" ON public.accounting_locales FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "accounting_locales_tenant_isolation" ON public.accounting_locales
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "accounting_locales_update" ON public.accounting_locales FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "announcement_dismissals_insert" ON public.announcement_dismissals FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "announcement_dismissals_select" ON public.announcement_dismissals FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "asset_assignments_delete" ON public.asset_assignments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "asset_assignments_insert" ON public.asset_assignments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "asset_assignments_select" ON public.asset_assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "asset_assignments_tenant_isolation" ON public.asset_assignments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "asset_assignments_update" ON public.asset_assignments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "asset_categories_delete" ON public.asset_categories FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "asset_categories_insert" ON public.asset_categories FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "asset_categories_select" ON public.asset_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "asset_categories_tenant_isolation" ON public.asset_categories
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "asset_categories_update" ON public.asset_categories FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "asset_depreciation_delete" ON public.asset_depreciation FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "asset_depreciation_insert" ON public.asset_depreciation FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "asset_depreciation_select" ON public.asset_depreciation FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "asset_depreciation_tenant_isolation" ON public.asset_depreciation
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "asset_depreciation_update" ON public.asset_depreciation FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "asset_maintenance_delete" ON public.asset_maintenance FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "asset_maintenance_insert" ON public.asset_maintenance FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "asset_maintenance_select" ON public.asset_maintenance FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "asset_maintenance_tenant_isolation" ON public.asset_maintenance
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "asset_maintenance_update" ON public.asset_maintenance FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "assets_delete" ON public.assets FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "assets_insert" ON public.assets FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "assets_select" ON public.assets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "assets_tenant_isolation" ON public.assets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "assets_update" ON public.assets FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "attendance_records_delete" ON public.attendance_records FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "attendance_records_insert" ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "attendance_records_select" ON public.attendance_records FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "attendance_records_tenant_isolation" ON public.attendance_records
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "attendance_records_update" ON public.attendance_records FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "audit_trails_delete" ON public.audit_trails FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "audit_trails_insert" ON public.audit_trails FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "audit_trails_select" ON public.audit_trails FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "audit_trails_tenant_isolation" ON public.audit_trails
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "audit_trails_update" ON public.audit_trails FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bank_accounts_delete" ON public.bank_accounts FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "bank_accounts_insert" ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "bank_accounts_select" ON public.bank_accounts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "bank_accounts_tenant_isolation" ON public.bank_accounts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "bank_accounts_update" ON public.bank_accounts FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bank_reconciliation_sessions_delete" ON public.bank_reconciliation_sessions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "bank_reconciliation_sessions_insert" ON public.bank_reconciliation_sessions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "bank_reconciliation_sessions_select" ON public.bank_reconciliation_sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "bank_reconciliation_sessions_tenant_isolation" ON public.bank_reconciliation_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "bank_reconciliation_sessions_update" ON public.bank_reconciliation_sessions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bank_transactions_delete" ON public.bank_transactions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "bank_transactions_insert" ON public.bank_transactions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "bank_transactions_select" ON public.bank_transactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "bank_transactions_tenant_isolation" ON public.bank_transactions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "bank_transactions_update" ON public.bank_transactions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "billing_coupons_manage" ON public.billing_coupons FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "billing_coupons_select" ON public.billing_coupons FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "billing_events_delete" ON public.billing_events FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "billing_events_insert" ON public.billing_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "billing_events_select" ON public.billing_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "billing_events_tenant_isolation" ON public.billing_events
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "billing_events_update" ON public.billing_events FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "billing_invoice_items_manage" ON public.billing_invoice_items FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "billing_invoice_items_select" ON public.billing_invoice_items FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM billing_invoices bi
  WHERE ((bi.id = billing_invoice_items.invoice_id) AND ((bi.tenant_id = get_current_tenant_id()) OR is_platform_admin())))));

CREATE POLICY "billing_invoices_delete" ON public.billing_invoices FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "billing_invoices_insert" ON public.billing_invoices FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "billing_invoices_select" ON public.billing_invoices FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "billing_invoices_tenant_isolation" ON public.billing_invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "billing_invoices_update" ON public.billing_invoices FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "branches_delete" ON public.branches FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "branches_insert" ON public.branches FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "branches_select" ON public.branches FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "branches_tenant_isolation" ON public.branches
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "branches_update" ON public.branches FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_attachments_delete" ON public.case_attachments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_attachments_insert" ON public.case_attachments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_attachments_select" ON public.case_attachments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_attachments_tenant_isolation" ON public.case_attachments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_attachments_update" ON public.case_attachments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_communications_delete" ON public.case_communications FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_communications_insert" ON public.case_communications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_communications_select" ON public.case_communications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_communications_tenant_isolation" ON public.case_communications
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_communications_update" ON public.case_communications FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_devices_delete" ON public.case_devices FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_devices_insert" ON public.case_devices FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_devices_select" ON public.case_devices FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_devices_tenant_isolation" ON public.case_devices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_devices_update" ON public.case_devices FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_diagnostics_delete" ON public.case_diagnostics FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_diagnostics_insert" ON public.case_diagnostics FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_diagnostics_select" ON public.case_diagnostics FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_diagnostics_tenant_isolation" ON public.case_diagnostics
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_diagnostics_update" ON public.case_diagnostics FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_engineers_delete" ON public.case_engineers FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_engineers_insert" ON public.case_engineers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_engineers_select" ON public.case_engineers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_engineers_tenant_isolation" ON public.case_engineers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_engineers_update" ON public.case_engineers FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_follow_ups_delete" ON public.case_follow_ups FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_follow_ups_insert" ON public.case_follow_ups FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_follow_ups_select" ON public.case_follow_ups FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_follow_ups_tenant_isolation" ON public.case_follow_ups
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_follow_ups_update" ON public.case_follow_ups FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_internal_notes_delete" ON public.case_internal_notes FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_internal_notes_insert" ON public.case_internal_notes FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_internal_notes_select" ON public.case_internal_notes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_internal_notes_tenant_isolation" ON public.case_internal_notes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_internal_notes_update" ON public.case_internal_notes FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_job_history_delete" ON public.case_job_history FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_job_history_insert" ON public.case_job_history FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_job_history_select" ON public.case_job_history FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_job_history_tenant_isolation" ON public.case_job_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_job_history_update" ON public.case_job_history FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_milestones_delete" ON public.case_milestones FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_milestones_insert" ON public.case_milestones FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_milestones_select" ON public.case_milestones FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_milestones_tenant_isolation" ON public.case_milestones
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_milestones_update" ON public.case_milestones FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_portal_visibility_delete" ON public.case_portal_visibility FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_portal_visibility_insert" ON public.case_portal_visibility FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_portal_visibility_select" ON public.case_portal_visibility FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_portal_visibility_tenant_isolation" ON public.case_portal_visibility
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_portal_visibility_update" ON public.case_portal_visibility FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_qa_checklists_delete" ON public.case_qa_checklists FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_qa_checklists_insert" ON public.case_qa_checklists FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_qa_checklists_select" ON public.case_qa_checklists FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_qa_checklists_tenant_isolation" ON public.case_qa_checklists
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_qa_checklists_update" ON public.case_qa_checklists FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_quote_items_delete" ON public.case_quote_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_quote_items_insert" ON public.case_quote_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_quote_items_select" ON public.case_quote_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_quote_items_tenant_isolation" ON public.case_quote_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_quote_items_update" ON public.case_quote_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_quotes_delete" ON public.case_quotes FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_quotes_insert" ON public.case_quotes FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_quotes_select" ON public.case_quotes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_quotes_tenant_isolation" ON public.case_quotes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_quotes_update" ON public.case_quotes FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_recovery_attempts_delete" ON public.case_recovery_attempts FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_recovery_attempts_insert" ON public.case_recovery_attempts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_recovery_attempts_select" ON public.case_recovery_attempts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_recovery_attempts_tenant_isolation" ON public.case_recovery_attempts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_recovery_attempts_update" ON public.case_recovery_attempts FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_report_sections_delete" ON public.case_report_sections FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_report_sections_insert" ON public.case_report_sections FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_report_sections_select" ON public.case_report_sections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_report_sections_tenant_isolation" ON public.case_report_sections
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_report_sections_update" ON public.case_report_sections FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_reports_delete" ON public.case_reports FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "case_reports_insert" ON public.case_reports FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_reports_select" ON public.case_reports FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_reports_tenant_isolation" ON public.case_reports
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_reports_update" ON public.case_reports FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "cases_delete" ON public.cases FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "cases_insert" ON public.cases FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "cases_select" ON public.cases FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "cases_tenant_isolation" ON public.cases
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "cases_update" ON public.cases FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "catalog_accessories_delete" ON public.catalog_accessories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_accessories_insert" ON public.catalog_accessories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_accessories_select" ON public.catalog_accessories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_accessories_update" ON public.catalog_accessories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_brands_delete" ON public.catalog_device_brands FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_brands_insert" ON public.catalog_device_brands FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_brands_select" ON public.catalog_device_brands FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_brands_update" ON public.catalog_device_brands FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_capacities_delete" ON public.catalog_device_capacities FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_capacities_insert" ON public.catalog_device_capacities FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_capacities_select" ON public.catalog_device_capacities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_capacities_update" ON public.catalog_device_capacities FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_component_statuses_delete" ON public.catalog_device_component_statuses FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_component_statuses_insert" ON public.catalog_device_component_statuses FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_component_statuses_select" ON public.catalog_device_component_statuses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_component_statuses_update" ON public.catalog_device_component_statuses FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_conditions_delete" ON public.catalog_device_conditions FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_conditions_insert" ON public.catalog_device_conditions FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_conditions_select" ON public.catalog_device_conditions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_conditions_update" ON public.catalog_device_conditions FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_encryption_delete" ON public.catalog_device_encryption FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_encryption_insert" ON public.catalog_device_encryption FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_encryption_select" ON public.catalog_device_encryption FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_encryption_update" ON public.catalog_device_encryption FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_form_factors_delete" ON public.catalog_device_form_factors FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_form_factors_insert" ON public.catalog_device_form_factors FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_form_factors_select" ON public.catalog_device_form_factors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_form_factors_update" ON public.catalog_device_form_factors FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_head_counts_delete" ON public.catalog_device_head_counts FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_head_counts_insert" ON public.catalog_device_head_counts FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_head_counts_select" ON public.catalog_device_head_counts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_head_counts_update" ON public.catalog_device_head_counts FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_interfaces_delete" ON public.catalog_device_interfaces FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_interfaces_insert" ON public.catalog_device_interfaces FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_interfaces_select" ON public.catalog_device_interfaces FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_interfaces_update" ON public.catalog_device_interfaces FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_made_in_delete" ON public.catalog_device_made_in FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_made_in_insert" ON public.catalog_device_made_in FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_made_in_select" ON public.catalog_device_made_in FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_made_in_update" ON public.catalog_device_made_in FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_platter_counts_delete" ON public.catalog_device_platter_counts FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_platter_counts_insert" ON public.catalog_device_platter_counts FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_platter_counts_select" ON public.catalog_device_platter_counts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_platter_counts_update" ON public.catalog_device_platter_counts FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_roles_delete" ON public.catalog_device_roles FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_roles_insert" ON public.catalog_device_roles FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_roles_select" ON public.catalog_device_roles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_roles_update" ON public.catalog_device_roles FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_types_delete" ON public.catalog_device_types FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_device_types_insert" ON public.catalog_device_types FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_device_types_select" ON public.catalog_device_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_device_types_update" ON public.catalog_device_types FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_donor_compatibility_matrix_delete" ON public.catalog_donor_compatibility_matrix FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_donor_compatibility_matrix_insert" ON public.catalog_donor_compatibility_matrix FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_donor_compatibility_matrix_select" ON public.catalog_donor_compatibility_matrix FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_donor_compatibility_matrix_update" ON public.catalog_donor_compatibility_matrix FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_interfaces_delete" ON public.catalog_interfaces FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_interfaces_insert" ON public.catalog_interfaces FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_interfaces_select" ON public.catalog_interfaces FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_interfaces_update" ON public.catalog_interfaces FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_categories_delete" ON public.catalog_service_categories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_service_categories_insert" ON public.catalog_service_categories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_categories_select" ON public.catalog_service_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_service_categories_update" ON public.catalog_service_categories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_line_items_delete" ON public.catalog_service_line_items FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_service_line_items_insert" ON public.catalog_service_line_items FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_line_items_select" ON public.catalog_service_line_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_service_line_items_update" ON public.catalog_service_line_items FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_locations_delete" ON public.catalog_service_locations FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_service_locations_insert" ON public.catalog_service_locations FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_locations_select" ON public.catalog_service_locations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_service_locations_update" ON public.catalog_service_locations FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_problems_delete" ON public.catalog_service_problems FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_service_problems_insert" ON public.catalog_service_problems FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_problems_select" ON public.catalog_service_problems FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_service_problems_update" ON public.catalog_service_problems FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_types_delete" ON public.catalog_service_types FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "catalog_service_types_insert" ON public.catalog_service_types FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "catalog_service_types_select" ON public.catalog_service_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalog_service_types_update" ON public.catalog_service_types FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "chain_of_custody_access_log_delete" ON public.chain_of_custody_access_log FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "chain_of_custody_access_log_insert" ON public.chain_of_custody_access_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "chain_of_custody_access_log_select" ON public.chain_of_custody_access_log FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "chain_of_custody_access_log_tenant_isolation" ON public.chain_of_custody_access_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "chain_of_custody_access_log_update" ON public.chain_of_custody_access_log FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "chain_of_custody_delete" ON public.chain_of_custody FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "chain_of_custody_insert" ON public.chain_of_custody FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "chain_of_custody_integrity_checks_delete" ON public.chain_of_custody_integrity_checks FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "chain_of_custody_integrity_checks_insert" ON public.chain_of_custody_integrity_checks FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "chain_of_custody_integrity_checks_select" ON public.chain_of_custody_integrity_checks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "chain_of_custody_integrity_checks_tenant_isolation" ON public.chain_of_custody_integrity_checks
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "chain_of_custody_integrity_checks_update" ON public.chain_of_custody_integrity_checks FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "chain_of_custody_select" ON public.chain_of_custody FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "chain_of_custody_tenant_isolation" ON public.chain_of_custody
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "chain_of_custody_transfers_delete" ON public.chain_of_custody_transfers FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "chain_of_custody_transfers_insert" ON public.chain_of_custody_transfers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "chain_of_custody_transfers_select" ON public.chain_of_custody_transfers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "chain_of_custody_transfers_tenant_isolation" ON public.chain_of_custody_transfers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "chain_of_custody_transfers_update" ON public.chain_of_custody_transfers FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "chain_of_custody_update" ON public.chain_of_custody FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "clone_drives_delete" ON public.clone_drives FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "clone_drives_insert" ON public.clone_drives FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "clone_drives_select" ON public.clone_drives FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "clone_drives_tenant_isolation" ON public.clone_drives
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "clone_drives_update" ON public.clone_drives FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "companies_delete" ON public.companies FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "companies_insert" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "companies_select" ON public.companies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "companies_tenant_isolation" ON public.companies
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "companies_update" ON public.companies FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "company_documents_delete" ON public.company_documents FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "company_documents_insert" ON public.company_documents FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "company_documents_select" ON public.company_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "company_documents_tenant_isolation" ON public.company_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "company_documents_update" ON public.company_documents FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "company_settings_delete" ON public.company_settings FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "company_settings_insert" ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "company_settings_select" ON public.company_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "company_settings_tenant_isolation" ON public.company_settings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "company_settings_update" ON public.company_settings FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "coupon_redemptions_delete" ON public.coupon_redemptions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "coupon_redemptions_insert" ON public.coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "coupon_redemptions_select" ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "coupon_redemptions_tenant_isolation" ON public.coupon_redemptions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "coupon_redemptions_update" ON public.coupon_redemptions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "customer_communications_delete" ON public.customer_communications FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "customer_communications_insert" ON public.customer_communications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "customer_communications_select" ON public.customer_communications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customer_communications_tenant_isolation" ON public.customer_communications
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "customer_communications_update" ON public.customer_communications FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "customer_company_relationships_delete" ON public.customer_company_relationships FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "customer_company_relationships_insert" ON public.customer_company_relationships FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "customer_company_relationships_select" ON public.customer_company_relationships FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customer_company_relationships_tenant_isolation" ON public.customer_company_relationships
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "customer_company_relationships_update" ON public.customer_company_relationships FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "customer_groups_delete" ON public.customer_groups FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "customer_groups_insert" ON public.customer_groups FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "customer_groups_select" ON public.customer_groups FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customer_groups_tenant_isolation" ON public.customer_groups
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "customer_groups_update" ON public.customer_groups FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "customers_enhanced_delete" ON public.customers_enhanced FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "customers_enhanced_insert" ON public.customers_enhanced FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "customers_enhanced_select" ON public.customers_enhanced FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customers_enhanced_tenant_isolation" ON public.customers_enhanced
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "customers_enhanced_update" ON public.customers_enhanced FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "data_retention_policies_delete" ON public.data_retention_policies FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "data_retention_policies_insert" ON public.data_retention_policies FOR INSERT TO authenticated
  WITH CHECK (has_role('admin'::text));

CREATE POLICY "data_retention_policies_select" ON public.data_retention_policies FOR SELECT TO authenticated
  USING ((deleted_at IS NULL));

CREATE POLICY "data_retention_policies_tenant_isolation" ON public.data_retention_policies
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "data_retention_policies_update" ON public.data_retention_policies FOR UPDATE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "data_subject_requests_delete" ON public.data_subject_requests FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "data_subject_requests_insert" ON public.data_subject_requests FOR INSERT TO authenticated
  WITH CHECK (has_role('admin'::text));

CREATE POLICY "data_subject_requests_select" ON public.data_subject_requests FOR SELECT TO authenticated
  USING ((deleted_at IS NULL));

CREATE POLICY "data_subject_requests_tenant_isolation" ON public.data_subject_requests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "data_subject_requests_update" ON public.data_subject_requests FOR UPDATE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "database_backups_delete" ON public.database_backups FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "database_backups_insert" ON public.database_backups FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "database_backups_select" ON public.database_backups FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "database_backups_tenant_isolation" ON public.database_backups
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "database_backups_update" ON public.database_backups FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "departments_delete" ON public.departments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "departments_insert" ON public.departments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "departments_select" ON public.departments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "departments_tenant_isolation" ON public.departments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "departments_update" ON public.departments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "device_diagnostics_delete" ON public.device_diagnostics FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "device_diagnostics_insert" ON public.device_diagnostics FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "device_diagnostics_select" ON public.device_diagnostics FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "device_diagnostics_tenant_isolation" ON public.device_diagnostics
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "device_diagnostics_update" ON public.device_diagnostics FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "document_templates_delete" ON public.document_templates FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "document_templates_insert" ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "document_templates_select" ON public.document_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "document_templates_tenant_isolation" ON public.document_templates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "document_templates_update" ON public.document_templates FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "employee_documents_delete" ON public.employee_documents FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "employee_documents_insert" ON public.employee_documents FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "employee_documents_select" ON public.employee_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employee_documents_tenant_isolation" ON public.employee_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "employee_documents_update" ON public.employee_documents FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "employee_loans_delete" ON public.employee_loans FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "employee_loans_insert" ON public.employee_loans FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "employee_loans_select" ON public.employee_loans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employee_loans_tenant_isolation" ON public.employee_loans
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "employee_loans_update" ON public.employee_loans FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "employee_salary_components_delete" ON public.employee_salary_components FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "employee_salary_components_insert" ON public.employee_salary_components FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "employee_salary_components_select" ON public.employee_salary_components FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employee_salary_components_tenant_isolation" ON public.employee_salary_components
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "employee_salary_components_update" ON public.employee_salary_components FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "employee_salary_config_delete" ON public.employee_salary_config FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "employee_salary_config_insert" ON public.employee_salary_config FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "employee_salary_config_select" ON public.employee_salary_config FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employee_salary_config_tenant_isolation" ON public.employee_salary_config
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "employee_salary_config_update" ON public.employee_salary_config FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "employee_salary_structures_delete" ON public.employee_salary_structures FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "employee_salary_structures_insert" ON public.employee_salary_structures FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "employee_salary_structures_select" ON public.employee_salary_structures FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employee_salary_structures_tenant_isolation" ON public.employee_salary_structures
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "employee_salary_structures_update" ON public.employee_salary_structures FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "employees_delete" ON public.employees FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "employees_insert" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "employees_select" ON public.employees FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employees_tenant_isolation" ON public.employees
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "employees_update" ON public.employees FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "expense_attachments_delete" ON public.expense_attachments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "expense_attachments_insert" ON public.expense_attachments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "expense_attachments_select" ON public.expense_attachments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "expense_attachments_tenant_isolation" ON public.expense_attachments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "expense_attachments_update" ON public.expense_attachments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "expenses_tenant_isolation" ON public.expenses
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "financial_audit_logs_delete" ON public.financial_audit_logs FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "financial_audit_logs_insert" ON public.financial_audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "financial_audit_logs_select" ON public.financial_audit_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "financial_audit_logs_tenant_isolation" ON public.financial_audit_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "financial_audit_logs_update" ON public.financial_audit_logs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "financial_transactions_delete" ON public.financial_transactions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "financial_transactions_insert" ON public.financial_transactions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "financial_transactions_select" ON public.financial_transactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "financial_transactions_tenant_isolation" ON public.financial_transactions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "financial_transactions_update" ON public.financial_transactions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "geo_cities_delete" ON public.geo_cities FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "geo_cities_insert" ON public.geo_cities FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "geo_cities_select" ON public.geo_cities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "geo_cities_update" ON public.geo_cities FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "geo_countries_anon_select" ON public.geo_countries FOR SELECT TO anon
  USING ((is_active = true));

CREATE POLICY "geo_countries_delete" ON public.geo_countries FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "geo_countries_insert" ON public.geo_countries FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "geo_countries_select" ON public.geo_countries FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "geo_countries_update" ON public.geo_countries FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "import_export_jobs_delete" ON public.import_export_jobs FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "import_export_jobs_insert" ON public.import_export_jobs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "import_export_jobs_select" ON public.import_export_jobs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "import_export_jobs_tenant_isolation" ON public.import_export_jobs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "import_export_jobs_update" ON public.import_export_jobs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "import_export_logs_delete" ON public.import_export_logs FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "import_export_logs_insert" ON public.import_export_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "import_export_logs_select" ON public.import_export_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "import_export_logs_tenant_isolation" ON public.import_export_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "import_export_logs_update" ON public.import_export_logs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "import_export_templates_delete" ON public.import_export_templates FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "import_export_templates_insert" ON public.import_export_templates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "import_export_templates_select" ON public.import_export_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "import_export_templates_tenant_isolation" ON public.import_export_templates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "import_export_templates_update" ON public.import_export_templates FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "import_field_mappings_delete" ON public.import_field_mappings FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "import_field_mappings_insert" ON public.import_field_mappings FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "import_field_mappings_select" ON public.import_field_mappings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "import_field_mappings_tenant_isolation" ON public.import_field_mappings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "import_field_mappings_update" ON public.import_field_mappings FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_assignments_delete" ON public.inventory_assignments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_assignments_insert" ON public.inventory_assignments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_assignments_select" ON public.inventory_assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_assignments_tenant_isolation" ON public.inventory_assignments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_assignments_update" ON public.inventory_assignments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_case_assignments_delete" ON public.inventory_case_assignments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_case_assignments_insert" ON public.inventory_case_assignments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_case_assignments_select" ON public.inventory_case_assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_case_assignments_tenant_isolation" ON public.inventory_case_assignments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_case_assignments_update" ON public.inventory_case_assignments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_items_delete" ON public.inventory_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_items_insert" ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_items_select" ON public.inventory_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_items_tenant_isolation" ON public.inventory_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_items_update" ON public.inventory_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_locations_delete" ON public.inventory_locations FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_locations_insert" ON public.inventory_locations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_locations_select" ON public.inventory_locations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_locations_tenant_isolation" ON public.inventory_locations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_locations_update" ON public.inventory_locations FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_parts_usage_delete" ON public.inventory_parts_usage FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_parts_usage_insert" ON public.inventory_parts_usage FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_parts_usage_select" ON public.inventory_parts_usage FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_parts_usage_tenant_isolation" ON public.inventory_parts_usage
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_parts_usage_update" ON public.inventory_parts_usage FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_photos_delete" ON public.inventory_photos FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_photos_insert" ON public.inventory_photos FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_photos_select" ON public.inventory_photos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_photos_tenant_isolation" ON public.inventory_photos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_photos_update" ON public.inventory_photos FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_reservations_delete" ON public.inventory_reservations FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_reservations_insert" ON public.inventory_reservations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_reservations_select" ON public.inventory_reservations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_reservations_tenant_isolation" ON public.inventory_reservations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_reservations_update" ON public.inventory_reservations FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_search_templates_delete" ON public.inventory_search_templates FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_search_templates_insert" ON public.inventory_search_templates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_search_templates_select" ON public.inventory_search_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_search_templates_tenant_isolation" ON public.inventory_search_templates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_search_templates_update" ON public.inventory_search_templates FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_status_history_delete" ON public.inventory_status_history FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_status_history_insert" ON public.inventory_status_history FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_status_history_select" ON public.inventory_status_history FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_status_history_tenant_isolation" ON public.inventory_status_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_status_history_update" ON public.inventory_status_history FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_transactions_delete" ON public.inventory_transactions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "inventory_transactions_insert" ON public.inventory_transactions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_transactions_select" ON public.inventory_transactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_transactions_tenant_isolation" ON public.inventory_transactions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "inventory_transactions_update" ON public.inventory_transactions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "invoice_line_items_delete" ON public.invoice_line_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "invoice_line_items_insert" ON public.invoice_line_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "invoice_line_items_select" ON public.invoice_line_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "invoice_line_items_tenant_isolation" ON public.invoice_line_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "invoice_line_items_update" ON public.invoice_line_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "invoices_tenant_isolation" ON public.invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "kb_article_tags_delete" ON public.kb_article_tags FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "kb_article_tags_insert" ON public.kb_article_tags FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "kb_article_tags_select" ON public.kb_article_tags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "kb_article_tags_tenant_isolation" ON public.kb_article_tags
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "kb_article_tags_update" ON public.kb_article_tags FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "kb_article_versions_delete" ON public.kb_article_versions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "kb_article_versions_insert" ON public.kb_article_versions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "kb_article_versions_select" ON public.kb_article_versions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "kb_article_versions_tenant_isolation" ON public.kb_article_versions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "kb_article_versions_update" ON public.kb_article_versions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "kb_articles_delete" ON public.kb_articles FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "kb_articles_insert" ON public.kb_articles FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "kb_articles_select" ON public.kb_articles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "kb_articles_tenant_isolation" ON public.kb_articles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "kb_articles_update" ON public.kb_articles FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "kb_categories_delete" ON public.kb_categories FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "kb_categories_insert" ON public.kb_categories FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "kb_categories_select" ON public.kb_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "kb_categories_tenant_isolation" ON public.kb_categories
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "kb_categories_update" ON public.kb_categories FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "kb_tags_delete" ON public.kb_tags FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "kb_tags_insert" ON public.kb_tags FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "kb_tags_select" ON public.kb_tags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "kb_tags_tenant_isolation" ON public.kb_tags
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "kb_tags_update" ON public.kb_tags FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leave_balances_delete" ON public.leave_balances FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "leave_balances_insert" ON public.leave_balances FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "leave_balances_select" ON public.leave_balances FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "leave_balances_tenant_isolation" ON public.leave_balances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "leave_balances_update" ON public.leave_balances FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leave_requests_delete" ON public.leave_requests FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "leave_requests_tenant_isolation" ON public.leave_requests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "loan_repayments_delete" ON public.loan_repayments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "loan_repayments_insert" ON public.loan_repayments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "loan_repayments_select" ON public.loan_repayments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "loan_repayments_tenant_isolation" ON public.loan_repayments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "loan_repayments_update" ON public.loan_repayments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "master_case_priorities_delete" ON public.master_case_priorities FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_case_priorities_insert" ON public.master_case_priorities FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_case_priorities_select" ON public.master_case_priorities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_case_priorities_update" ON public.master_case_priorities FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_case_report_templates_delete" ON public.master_case_report_templates FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_case_report_templates_insert" ON public.master_case_report_templates FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_case_report_templates_select" ON public.master_case_report_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_case_report_templates_update" ON public.master_case_report_templates FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_case_statuses_delete" ON public.master_case_statuses FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_case_statuses_insert" ON public.master_case_statuses FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_case_statuses_select" ON public.master_case_statuses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_case_statuses_update" ON public.master_case_statuses FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_currency_codes_delete" ON public.master_currency_codes FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_currency_codes_insert" ON public.master_currency_codes FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_currency_codes_select" ON public.master_currency_codes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_currency_codes_update" ON public.master_currency_codes FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_expense_categories_delete" ON public.master_expense_categories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_expense_categories_insert" ON public.master_expense_categories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_expense_categories_select" ON public.master_expense_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_expense_categories_update" ON public.master_expense_categories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_industries_delete" ON public.master_industries FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_industries_insert" ON public.master_industries FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_industries_select" ON public.master_industries FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_industries_update" ON public.master_industries FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_categories_delete" ON public.master_inventory_categories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_inventory_categories_insert" ON public.master_inventory_categories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_categories_select" ON public.master_inventory_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_inventory_categories_update" ON public.master_inventory_categories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_condition_types_delete" ON public.master_inventory_condition_types FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_inventory_condition_types_insert" ON public.master_inventory_condition_types FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_condition_types_select" ON public.master_inventory_condition_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_inventory_condition_types_update" ON public.master_inventory_condition_types FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_item_categories_delete" ON public.master_inventory_item_categories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_inventory_item_categories_insert" ON public.master_inventory_item_categories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_item_categories_select" ON public.master_inventory_item_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_inventory_item_categories_update" ON public.master_inventory_item_categories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_status_types_delete" ON public.master_inventory_status_types FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_inventory_status_types_insert" ON public.master_inventory_status_types FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_inventory_status_types_select" ON public.master_inventory_status_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_inventory_status_types_update" ON public.master_inventory_status_types FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_invoice_statuses_delete" ON public.master_invoice_statuses FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_invoice_statuses_insert" ON public.master_invoice_statuses FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_invoice_statuses_select" ON public.master_invoice_statuses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_invoice_statuses_update" ON public.master_invoice_statuses FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_leave_types_delete" ON public.master_leave_types FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_leave_types_insert" ON public.master_leave_types FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_leave_types_select" ON public.master_leave_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_leave_types_update" ON public.master_leave_types FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_modules_delete" ON public.master_modules FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_modules_insert" ON public.master_modules FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_modules_select" ON public.master_modules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_modules_update" ON public.master_modules FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_payment_methods_delete" ON public.master_payment_methods FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_payment_methods_insert" ON public.master_payment_methods FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_payment_methods_select" ON public.master_payment_methods FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_payment_methods_update" ON public.master_payment_methods FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_payroll_components_delete" ON public.master_payroll_components FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_payroll_components_insert" ON public.master_payroll_components FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_payroll_components_select" ON public.master_payroll_components FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_payroll_components_update" ON public.master_payroll_components FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_purchase_order_statuses_delete" ON public.master_purchase_order_statuses FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_purchase_order_statuses_insert" ON public.master_purchase_order_statuses FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_purchase_order_statuses_select" ON public.master_purchase_order_statuses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_purchase_order_statuses_update" ON public.master_purchase_order_statuses FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_quote_statuses_delete" ON public.master_quote_statuses FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_quote_statuses_insert" ON public.master_quote_statuses FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_quote_statuses_select" ON public.master_quote_statuses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_quote_statuses_update" ON public.master_quote_statuses FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_supplier_categories_delete" ON public.master_supplier_categories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_supplier_categories_insert" ON public.master_supplier_categories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_supplier_categories_select" ON public.master_supplier_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_supplier_categories_update" ON public.master_supplier_categories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_supplier_payment_terms_delete" ON public.master_supplier_payment_terms FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_supplier_payment_terms_insert" ON public.master_supplier_payment_terms FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_supplier_payment_terms_select" ON public.master_supplier_payment_terms FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_supplier_payment_terms_update" ON public.master_supplier_payment_terms FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_template_categories_delete" ON public.master_template_categories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_template_categories_insert" ON public.master_template_categories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_template_categories_select" ON public.master_template_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_template_categories_update" ON public.master_template_categories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_template_types_delete" ON public.master_template_types FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_template_types_insert" ON public.master_template_types FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_template_types_select" ON public.master_template_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_template_types_update" ON public.master_template_types FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_template_variables_delete" ON public.master_template_variables FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_template_variables_insert" ON public.master_template_variables FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_template_variables_select" ON public.master_template_variables FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_template_variables_update" ON public.master_template_variables FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_transaction_categories_delete" ON public.master_transaction_categories FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "master_transaction_categories_insert" ON public.master_transaction_categories FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "master_transaction_categories_select" ON public.master_transaction_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "master_transaction_categories_update" ON public.master_transaction_categories FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "ndas_delete" ON public.ndas FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "ndas_insert" ON public.ndas FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "ndas_select" ON public.ndas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ndas_tenant_isolation" ON public.ndas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "ndas_update" ON public.ndas FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "number_sequences_audit_delete" ON public.number_sequences_audit FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "number_sequences_audit_insert" ON public.number_sequences_audit FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "number_sequences_audit_select" ON public.number_sequences_audit FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "number_sequences_audit_tenant_isolation" ON public.number_sequences_audit
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "number_sequences_audit_update" ON public.number_sequences_audit FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "number_sequences_delete" ON public.number_sequences FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "number_sequences_insert" ON public.number_sequences FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "number_sequences_select" ON public.number_sequences FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "number_sequences_tenant_isolation" ON public.number_sequences
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "number_sequences_update" ON public.number_sequences FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "onboarding_checklist_items_delete" ON public.onboarding_checklist_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "onboarding_checklist_items_insert" ON public.onboarding_checklist_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "onboarding_checklist_items_select" ON public.onboarding_checklist_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_checklist_items_tenant_isolation" ON public.onboarding_checklist_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "onboarding_checklist_items_update" ON public.onboarding_checklist_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "onboarding_checklists_delete" ON public.onboarding_checklists FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "onboarding_checklists_insert" ON public.onboarding_checklists FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "onboarding_checklists_select" ON public.onboarding_checklists FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_checklists_tenant_isolation" ON public.onboarding_checklists
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "onboarding_checklists_update" ON public.onboarding_checklists FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "onboarding_progress_insert" ON public.onboarding_progress FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "onboarding_progress_select" ON public.onboarding_progress FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_progress_tenant_isolation" ON public.onboarding_progress
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "onboarding_progress_update" ON public.onboarding_progress FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "onboarding_tasks_delete" ON public.onboarding_tasks FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "onboarding_tasks_insert" ON public.onboarding_tasks FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "onboarding_tasks_select" ON public.onboarding_tasks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_tasks_tenant_isolation" ON public.onboarding_tasks
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "onboarding_tasks_update" ON public.onboarding_tasks FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payment_allocations_delete" ON public.payment_allocations FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payment_allocations_insert" ON public.payment_allocations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payment_allocations_select" ON public.payment_allocations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_allocations_tenant_isolation" ON public.payment_allocations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payment_allocations_update" ON public.payment_allocations FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payment_disbursements_delete" ON public.payment_disbursements FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payment_disbursements_insert" ON public.payment_disbursements FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payment_disbursements_select" ON public.payment_disbursements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_disbursements_tenant_isolation" ON public.payment_disbursements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payment_disbursements_update" ON public.payment_disbursements FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payment_receipts_delete" ON public.payment_receipts FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payment_receipts_insert" ON public.payment_receipts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payment_receipts_select" ON public.payment_receipts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_receipts_tenant_isolation" ON public.payment_receipts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payment_receipts_update" ON public.payment_receipts FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payments_delete" ON public.payments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payments_tenant_isolation" ON public.payments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payments_update" ON public.payments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payroll_adjustments_delete" ON public.payroll_adjustments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payroll_adjustments_insert" ON public.payroll_adjustments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payroll_adjustments_select" ON public.payroll_adjustments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payroll_adjustments_tenant_isolation" ON public.payroll_adjustments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payroll_adjustments_update" ON public.payroll_adjustments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payroll_bank_files_delete" ON public.payroll_bank_files FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payroll_bank_files_insert" ON public.payroll_bank_files FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payroll_bank_files_select" ON public.payroll_bank_files FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payroll_bank_files_tenant_isolation" ON public.payroll_bank_files
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payroll_bank_files_update" ON public.payroll_bank_files FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payroll_periods_delete" ON public.payroll_periods FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payroll_periods_insert" ON public.payroll_periods FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payroll_periods_select" ON public.payroll_periods FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payroll_periods_tenant_isolation" ON public.payroll_periods
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payroll_periods_update" ON public.payroll_periods FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payroll_record_items_delete" ON public.payroll_record_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payroll_record_items_insert" ON public.payroll_record_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payroll_record_items_select" ON public.payroll_record_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payroll_record_items_tenant_isolation" ON public.payroll_record_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payroll_record_items_update" ON public.payroll_record_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payroll_records_delete" ON public.payroll_records FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payroll_records_insert" ON public.payroll_records FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payroll_records_select" ON public.payroll_records FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payroll_records_tenant_isolation" ON public.payroll_records
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payroll_records_update" ON public.payroll_records FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "payroll_settings_delete" ON public.payroll_settings FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "payroll_settings_insert" ON public.payroll_settings FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payroll_settings_select" ON public.payroll_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payroll_settings_tenant_isolation" ON public.payroll_settings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "payroll_settings_update" ON public.payroll_settings FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "pdf_generation_logs_delete" ON public.pdf_generation_logs FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "pdf_generation_logs_insert" ON public.pdf_generation_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "pdf_generation_logs_select" ON public.pdf_generation_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "pdf_generation_logs_tenant_isolation" ON public.pdf_generation_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "pdf_generation_logs_update" ON public.pdf_generation_logs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "performance_reviews_delete" ON public.performance_reviews FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "performance_reviews_insert" ON public.performance_reviews FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "performance_reviews_select" ON public.performance_reviews FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "performance_reviews_tenant_isolation" ON public.performance_reviews
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "performance_reviews_update" ON public.performance_reviews FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "plan_features_manage" ON public.plan_features FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "plan_features_select" ON public.plan_features FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "platform_admins_platform_only" ON public.platform_admins FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "platform_announcements_manage" ON public.platform_announcements FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "platform_announcements_select" ON public.platform_announcements FOR SELECT TO authenticated
  USING (((is_active = true) OR is_platform_admin()));

CREATE POLICY "platform_audit_logs_platform_only" ON public.platform_audit_logs FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "platform_metrics_platform_only" ON public.platform_metrics FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "portal_link_history_delete" ON public.portal_link_history FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "portal_link_history_insert" ON public.portal_link_history FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "portal_link_history_select" ON public.portal_link_history FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "portal_link_history_tenant_isolation" ON public.portal_link_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "portal_link_history_update" ON public.portal_link_history FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "positions_delete" ON public.positions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "positions_insert" ON public.positions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "positions_select" ON public.positions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "positions_tenant_isolation" ON public.positions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "positions_update" ON public.positions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR (tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (((id = auth.uid()) OR ((tenant_id = get_current_tenant_id()) AND has_role('admin'::text)) OR is_platform_admin()));

CREATE POLICY "purchase_order_items_delete" ON public.purchase_order_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "purchase_order_items_insert" ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "purchase_order_items_select" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "purchase_order_items_tenant_isolation" ON public.purchase_order_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "purchase_order_items_update" ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "purchase_orders_delete" ON public.purchase_orders FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "purchase_orders_insert" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "purchase_orders_select" ON public.purchase_orders FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "purchase_orders_tenant_isolation" ON public.purchase_orders
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "purchase_orders_update" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "quote_history_delete" ON public.quote_history FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "quote_history_insert" ON public.quote_history FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "quote_history_select" ON public.quote_history FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "quote_history_tenant_isolation" ON public.quote_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "quote_history_update" ON public.quote_history FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "quote_items_delete" ON public.quote_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "quote_items_insert" ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "quote_items_select" ON public.quote_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "quote_items_tenant_isolation" ON public.quote_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "quote_items_update" ON public.quote_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "quotes_select" ON public.quotes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "quotes_tenant_isolation" ON public.quotes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "receipt_allocations_delete" ON public.receipt_allocations FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "receipt_allocations_insert" ON public.receipt_allocations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "receipt_allocations_select" ON public.receipt_allocations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "receipt_allocations_tenant_isolation" ON public.receipt_allocations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "receipt_allocations_update" ON public.receipt_allocations FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "receipts_delete" ON public.receipts FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "receipts_insert" ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "receipts_select" ON public.receipts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "receipts_tenant_isolation" ON public.receipts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "receipts_update" ON public.receipts FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "reconciliation_matches_delete" ON public.reconciliation_matches FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "reconciliation_matches_insert" ON public.reconciliation_matches FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "reconciliation_matches_select" ON public.reconciliation_matches FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "reconciliation_matches_tenant_isolation" ON public.reconciliation_matches
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "reconciliation_matches_update" ON public.reconciliation_matches FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "recruitment_candidates_delete" ON public.recruitment_candidates FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "recruitment_candidates_insert" ON public.recruitment_candidates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "recruitment_candidates_select" ON public.recruitment_candidates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "recruitment_candidates_tenant_isolation" ON public.recruitment_candidates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "recruitment_candidates_update" ON public.recruitment_candidates FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "recruitment_jobs_delete" ON public.recruitment_jobs FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "recruitment_jobs_insert" ON public.recruitment_jobs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "recruitment_jobs_select" ON public.recruitment_jobs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "recruitment_jobs_tenant_isolation" ON public.recruitment_jobs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "recruitment_jobs_update" ON public.recruitment_jobs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "report_section_library_delete" ON public.report_section_library FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "report_section_library_insert" ON public.report_section_library FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "report_section_library_select" ON public.report_section_library FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "report_section_library_update" ON public.report_section_library FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "report_section_presets_delete" ON public.report_section_presets FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "report_section_presets_insert" ON public.report_section_presets FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "report_section_presets_select" ON public.report_section_presets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "report_section_presets_update" ON public.report_section_presets FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "report_template_section_mappings_delete" ON public.report_template_section_mappings FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "report_template_section_mappings_insert" ON public.report_template_section_mappings FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "report_template_section_mappings_select" ON public.report_template_section_mappings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "report_template_section_mappings_update" ON public.report_template_section_mappings FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "resource_clone_drives_delete" ON public.resource_clone_drives FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "resource_clone_drives_insert" ON public.resource_clone_drives FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "resource_clone_drives_select" ON public.resource_clone_drives FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "resource_clone_drives_tenant_isolation" ON public.resource_clone_drives
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "resource_clone_drives_update" ON public.resource_clone_drives FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "role_module_permissions_delete" ON public.role_module_permissions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "role_module_permissions_insert" ON public.role_module_permissions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "role_module_permissions_select" ON public.role_module_permissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "role_module_permissions_tenant_isolation" ON public.role_module_permissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "role_module_permissions_update" ON public.role_module_permissions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "salary_components_delete" ON public.salary_components FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "salary_components_insert" ON public.salary_components FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "salary_components_select" ON public.salary_components FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "salary_components_tenant_isolation" ON public.salary_components
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "salary_components_update" ON public.salary_components FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "signup_otps_anon_insert" ON public.signup_otps FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "signup_otps_anon_select" ON public.signup_otps FOR SELECT TO anon
  USING (true);

CREATE POLICY "signup_otps_anon_update" ON public.signup_otps FOR UPDATE TO anon
  USING (true);

CREATE POLICY "signup_otps_authenticated" ON public.signup_otps FOR ALL TO authenticated
  USING (true);

CREATE POLICY "stock_adjustment_session_items_delete" ON public.stock_adjustment_session_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_adjustment_session_items_insert" ON public.stock_adjustment_session_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_adjustment_session_items_select" ON public.stock_adjustment_session_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_adjustment_session_items_tenant_isolation" ON public.stock_adjustment_session_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_adjustment_session_items_update" ON public.stock_adjustment_session_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_adjustment_sessions_delete" ON public.stock_adjustment_sessions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_adjustment_sessions_insert" ON public.stock_adjustment_sessions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_adjustment_sessions_select" ON public.stock_adjustment_sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_adjustment_sessions_tenant_isolation" ON public.stock_adjustment_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_adjustment_sessions_update" ON public.stock_adjustment_sessions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_adjustments_delete" ON public.stock_adjustments FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_adjustments_insert" ON public.stock_adjustments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_adjustments_select" ON public.stock_adjustments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_adjustments_tenant_isolation" ON public.stock_adjustments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_adjustments_update" ON public.stock_adjustments FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_alerts_delete" ON public.stock_alerts FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_alerts_insert" ON public.stock_alerts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_alerts_select" ON public.stock_alerts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_alerts_tenant_isolation" ON public.stock_alerts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_alerts_update" ON public.stock_alerts FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_categories_delete" ON public.stock_categories FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_categories_insert" ON public.stock_categories FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_categories_select" ON public.stock_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_categories_tenant_isolation" ON public.stock_categories
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_categories_update" ON public.stock_categories FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_items_delete" ON public.stock_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_items_insert" ON public.stock_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_items_select" ON public.stock_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_items_tenant_isolation" ON public.stock_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_items_update" ON public.stock_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_locations_delete" ON public.stock_locations FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_locations_insert" ON public.stock_locations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_locations_select" ON public.stock_locations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_locations_tenant_isolation" ON public.stock_locations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_locations_update" ON public.stock_locations FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_movements_delete" ON public.stock_movements FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_movements_insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_movements_select" ON public.stock_movements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_movements_tenant_isolation" ON public.stock_movements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_movements_update" ON public.stock_movements FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_price_history_delete" ON public.stock_price_history FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_price_history_insert" ON public.stock_price_history FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_price_history_select" ON public.stock_price_history FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_price_history_tenant_isolation" ON public.stock_price_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_price_history_update" ON public.stock_price_history FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_sale_items_delete" ON public.stock_sale_items FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_sale_items_insert" ON public.stock_sale_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_sale_items_select" ON public.stock_sale_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_sale_items_tenant_isolation" ON public.stock_sale_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_sale_items_update" ON public.stock_sale_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_sales_delete" ON public.stock_sales FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_sales_insert" ON public.stock_sales FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_sales_select" ON public.stock_sales FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_sales_tenant_isolation" ON public.stock_sales
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_sales_update" ON public.stock_sales FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_serial_numbers_delete" ON public.stock_serial_numbers FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_serial_numbers_insert" ON public.stock_serial_numbers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_serial_numbers_select" ON public.stock_serial_numbers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_serial_numbers_tenant_isolation" ON public.stock_serial_numbers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_serial_numbers_update" ON public.stock_serial_numbers FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_transactions_delete" ON public.stock_transactions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "stock_transactions_insert" ON public.stock_transactions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_transactions_select" ON public.stock_transactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_transactions_tenant_isolation" ON public.stock_transactions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "stock_transactions_update" ON public.stock_transactions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "subscription_plans_anon_select" ON public.subscription_plans FOR SELECT TO anon
  USING (((is_active = true) AND (is_public = true) AND (deleted_at IS NULL)));

CREATE POLICY "subscription_plans_manage" ON public.subscription_plans FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "subscription_plans_select" ON public.subscription_plans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "supplier_audit_trail_delete" ON public.supplier_audit_trail FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "supplier_audit_trail_insert" ON public.supplier_audit_trail FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "supplier_audit_trail_select" ON public.supplier_audit_trail FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "supplier_audit_trail_tenant_isolation" ON public.supplier_audit_trail
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "supplier_audit_trail_update" ON public.supplier_audit_trail FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "supplier_communications_delete" ON public.supplier_communications FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "supplier_communications_insert" ON public.supplier_communications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "supplier_communications_select" ON public.supplier_communications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "supplier_communications_tenant_isolation" ON public.supplier_communications
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "supplier_communications_update" ON public.supplier_communications FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "supplier_contacts_delete" ON public.supplier_contacts FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "supplier_contacts_insert" ON public.supplier_contacts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "supplier_contacts_select" ON public.supplier_contacts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "supplier_contacts_tenant_isolation" ON public.supplier_contacts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "supplier_contacts_update" ON public.supplier_contacts FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "supplier_documents_delete" ON public.supplier_documents FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "supplier_documents_insert" ON public.supplier_documents FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "supplier_documents_select" ON public.supplier_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "supplier_documents_tenant_isolation" ON public.supplier_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "supplier_documents_update" ON public.supplier_documents FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "supplier_performance_metrics_delete" ON public.supplier_performance_metrics FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "supplier_performance_metrics_insert" ON public.supplier_performance_metrics FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "supplier_performance_metrics_select" ON public.supplier_performance_metrics FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "supplier_performance_metrics_tenant_isolation" ON public.supplier_performance_metrics
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "supplier_performance_metrics_update" ON public.supplier_performance_metrics FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "supplier_products_delete" ON public.supplier_products FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "supplier_products_insert" ON public.supplier_products FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "supplier_products_select" ON public.supplier_products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "supplier_products_tenant_isolation" ON public.supplier_products
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "supplier_products_update" ON public.supplier_products FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "suppliers_tenant_isolation" ON public.suppliers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "support_ticket_messages_insert" ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM support_tickets st
  WHERE ((st.id = support_ticket_messages.ticket_id) AND ((st.tenant_id = get_current_tenant_id()) OR is_platform_admin())))));

CREATE POLICY "support_ticket_messages_select" ON public.support_ticket_messages FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM support_tickets st
  WHERE ((st.id = support_ticket_messages.ticket_id) AND ((st.tenant_id = get_current_tenant_id()) OR is_platform_admin())))));

CREATE POLICY "support_tickets_delete" ON public.support_tickets FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "support_tickets_insert" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "support_tickets_select" ON public.support_tickets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "support_tickets_tenant_isolation" ON public.support_tickets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "support_tickets_update" ON public.support_tickets FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "system_logs_delete" ON public.system_logs FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "system_logs_insert" ON public.system_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "system_logs_select" ON public.system_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "system_logs_tenant_isolation" ON public.system_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "system_logs_update" ON public.system_logs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "system_seed_status_delete" ON public.system_seed_status FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "system_seed_status_insert" ON public.system_seed_status FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "system_seed_status_select" ON public.system_seed_status FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "system_seed_status_update" ON public.system_seed_status FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "system_settings_delete" ON public.system_settings FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "system_settings_insert" ON public.system_settings FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "system_settings_select" ON public.system_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "system_settings_update" ON public.system_settings FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "tax_rates_delete" ON public.tax_rates FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "tax_rates_insert" ON public.tax_rates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tax_rates_select" ON public.tax_rates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tax_rates_tenant_isolation" ON public.tax_rates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "tax_rates_update" ON public.tax_rates FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "template_versions_delete" ON public.template_versions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "template_versions_insert" ON public.template_versions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "template_versions_select" ON public.template_versions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "template_versions_tenant_isolation" ON public.template_versions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "template_versions_update" ON public.template_versions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "templates_delete" ON public.templates FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "templates_insert" ON public.templates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "templates_select" ON public.templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "templates_tenant_isolation" ON public.templates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "templates_update" ON public.templates FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_activity_log_delete" ON public.tenant_activity_log FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "tenant_activity_log_insert" ON public.tenant_activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_activity_log_select" ON public.tenant_activity_log FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tenant_activity_log_tenant_isolation" ON public.tenant_activity_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "tenant_activity_log_update" ON public.tenant_activity_log FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_health_metrics_delete" ON public.tenant_health_metrics FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "tenant_health_metrics_insert" ON public.tenant_health_metrics FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_health_metrics_select" ON public.tenant_health_metrics FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tenant_health_metrics_tenant_isolation" ON public.tenant_health_metrics
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "tenant_health_metrics_update" ON public.tenant_health_metrics FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_impersonation_sessions_platform_only" ON public.tenant_impersonation_sessions FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "tenant_payment_methods_delete" ON public.tenant_payment_methods FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "tenant_payment_methods_insert" ON public.tenant_payment_methods FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_payment_methods_select" ON public.tenant_payment_methods FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tenant_payment_methods_tenant_isolation" ON public.tenant_payment_methods
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "tenant_payment_methods_update" ON public.tenant_payment_methods FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_rate_limits_manage" ON public.tenant_rate_limits FOR ALL TO authenticated
  USING (is_platform_admin());

CREATE POLICY "tenant_rate_limits_select" ON public.tenant_rate_limits FOR SELECT TO authenticated
  USING ((deleted_at IS NULL));

CREATE POLICY "tenant_rate_limits_tenant_isolation" ON public.tenant_rate_limits
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "tenant_subscriptions_delete" ON public.tenant_subscriptions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "tenant_subscriptions_insert" ON public.tenant_subscriptions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_subscriptions_select" ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tenant_subscriptions_tenant_isolation" ON public.tenant_subscriptions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "tenant_subscriptions_update" ON public.tenant_subscriptions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenants_delete" ON public.tenants FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "tenants_insert" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenants_select" ON public.tenants FOR SELECT TO authenticated
  USING (((id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "tenants_update" ON public.tenants FOR UPDATE TO authenticated
  USING ((((id = get_current_tenant_id()) AND has_role('admin'::text)) OR is_platform_admin()));

CREATE POLICY "timesheets_delete" ON public.timesheets FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "timesheets_insert" ON public.timesheets FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "timesheets_select" ON public.timesheets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "timesheets_tenant_isolation" ON public.timesheets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "timesheets_update" ON public.timesheets FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "usage_records_delete" ON public.usage_records FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "usage_records_insert" ON public.usage_records FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "usage_records_select" ON public.usage_records FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "usage_records_tenant_isolation" ON public.usage_records
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "usage_records_update" ON public.usage_records FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "usage_snapshots_delete" ON public.usage_snapshots FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "usage_snapshots_insert" ON public.usage_snapshots FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "usage_snapshots_select" ON public.usage_snapshots FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "usage_snapshots_tenant_isolation" ON public.usage_snapshots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "usage_snapshots_update" ON public.usage_snapshots FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "user_activity_logs_delete" ON public.user_activity_logs FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "user_activity_logs_insert" ON public.user_activity_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "user_activity_logs_select" ON public.user_activity_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_activity_logs_tenant_isolation" ON public.user_activity_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "user_activity_logs_update" ON public.user_activity_logs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "user_activity_sessions_delete" ON public.user_activity_sessions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "user_activity_sessions_insert" ON public.user_activity_sessions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "user_activity_sessions_select" ON public.user_activity_sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_activity_sessions_tenant_isolation" ON public.user_activity_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "user_activity_sessions_update" ON public.user_activity_sessions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "user_preferences_delete" ON public.user_preferences FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "user_preferences_insert" ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "user_preferences_select" ON public.user_preferences FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_preferences_tenant_isolation" ON public.user_preferences
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "user_preferences_update" ON public.user_preferences FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "user_sessions_delete" ON public.user_sessions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "user_sessions_insert" ON public.user_sessions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "user_sessions_select" ON public.user_sessions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_sessions_tenant_isolation" ON public.user_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "user_sessions_update" ON public.user_sessions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "user_sidebar_preferences_delete" ON public.user_sidebar_preferences FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "user_sidebar_preferences_insert" ON public.user_sidebar_preferences FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "user_sidebar_preferences_select" ON public.user_sidebar_preferences FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_sidebar_preferences_tenant_isolation" ON public.user_sidebar_preferences
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "user_sidebar_preferences_update" ON public.user_sidebar_preferences FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "vat_records_delete" ON public.vat_records FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "vat_records_insert" ON public.vat_records FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "vat_records_select" ON public.vat_records FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "vat_records_tenant_isolation" ON public.vat_records
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "vat_records_update" ON public.vat_records FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "vat_returns_delete" ON public.vat_returns FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "vat_returns_insert" ON public.vat_returns FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "vat_returns_select" ON public.vat_returns FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "vat_returns_tenant_isolation" ON public.vat_returns
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "vat_returns_update" ON public.vat_returns FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "vat_transactions_delete" ON public.vat_transactions FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE POLICY "vat_transactions_insert" ON public.vat_transactions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "vat_transactions_select" ON public.vat_transactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "vat_transactions_tenant_isolation" ON public.vat_transactions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "vat_transactions_update" ON public.vat_transactions FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- 11. TRIGGERS
-- ============================================================

CREATE TRIGGER set_companies_tenant_and_audit BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
CREATE TRIGGER set_customers_enhanced_tenant_and_audit BEFORE INSERT OR UPDATE ON public.customers_enhanced FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();
CREATE TRIGGER sync_tenant_country_config BEFORE INSERT OR UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION sync_tenant_config_from_country();
CREATE TRIGGER set_user_sidebar_preferences_tenant BEFORE INSERT OR UPDATE ON public.user_sidebar_preferences FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();


-- ============================================================
-- 12. VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.customers AS SELECT id, tenant_id, customer_number, customer_name, email, mobile_number, phone, whatsapp_number, address, city_id, country_id, company_name, industry_id, customer_group_id, profile_photo_url, id_type, id_number, tax_number, notes, source, referred_by, portal_enabled, portal_password_hash, portal_last_login, portal_failed_login_attempts, portal_locked_until, is_active, total_cases, total_revenue, metadata, created_by, updated_by, created_at, updated_at, deleted_at FROM customers_enhanced;

CREATE OR REPLACE VIEW public.v_chain_of_custody_timeline AS SELECT id, tenant_id, case_id, device_id, (action_category)::text AS action_category, action, description, actor_id, actor_name, actor_role, location, (custody_status)::text AS custody_status, evidence_hash, metadata, created_at FROM chain_of_custody c WHERE (deleted_at IS NULL) ORDER BY created_at DESC;
