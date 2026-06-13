export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_balance_snapshots: {
        Row: {
          balance: number
          bank_account_id: string
          created_at: string
          id: string
          snapshot_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance: number
          bank_account_id: string
          created_at?: string
          id?: string
          snapshot_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          bank_account_id?: string
          created_at?: string
          id?: string
          snapshot_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balance_snapshots_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balance_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      account_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          from_account_id: string
          id: string
          notes: string | null
          reference: string | null
          status: string | null
          tenant_id: string
          to_account_id: string
          transfer_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_account_id: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string | null
          tenant_id: string
          to_account_id: string
          transfer_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_account_id?: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string | null
          tenant_id?: string
          to_account_id?: string
          transfer_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_locales: {
        Row: {
          created_at: string
          currency_code: string | null
          currency_position: string | null
          currency_symbol: string | null
          date_format: string | null
          decimal_places: number | null
          decimal_separator: string | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          locale_code: string
          name: string
          number_format: string | null
          tenant_id: string
          thousands_separator: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code?: string | null
          currency_position?: string | null
          currency_symbol?: string | null
          date_format?: string | null
          decimal_places?: number | null
          decimal_separator?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          locale_code: string
          name: string
          number_format?: string | null
          tenant_id: string
          thousands_separator?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string | null
          currency_position?: string | null
          currency_symbol?: string | null
          date_format?: string | null
          decimal_places?: number | null
          decimal_separator?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          locale_code?: string
          name?: string
          number_format?: string | null
          tenant_id?: string
          thousands_separator?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_locales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "platform_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_assignments: {
        Row: {
          asset_id: string
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          returned_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          returned_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          returned_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          depreciation_method: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          updated_at: string
          useful_life_years: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          depreciation_method?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
          useful_life_years?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          depreciation_method?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
          useful_life_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_depreciation: {
        Row: {
          accumulated_depreciation: number
          asset_id: string
          book_value: number
          created_at: string
          deleted_at: string | null
          depreciation_amount: number
          id: string
          period_end: string
          period_start: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accumulated_depreciation: number
          asset_id: string
          book_value: number
          created_at?: string
          deleted_at?: string | null
          depreciation_amount: number
          id?: string
          period_end: string
          period_start: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accumulated_depreciation?: number
          asset_id?: string
          book_value?: number
          created_at?: string
          deleted_at?: string | null
          depreciation_amount?: number
          id?: string
          period_end?: string
          period_start?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_depreciation_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance: {
        Row: {
          asset_id: string
          completed_date: string | null
          cost: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          maintenance_type: string
          notes: string | null
          performed_by: string | null
          scheduled_date: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          asset_id: string
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          maintenance_type: string
          notes?: string | null
          performed_by?: string | null
          scheduled_date?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          asset_id?: string
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          maintenance_type?: string
          notes?: string | null
          performed_by?: string | null
          scheduled_date?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_number: string | null
          assigned_to: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          current_value: number | null
          deleted_at: string | null
          description: string | null
          id: string
          location: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_price: number | null
          salvage_value: number | null
          serial_number: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_number?: string | null
          assigned_to?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          salvage_value?: number | null
          serial_number?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_number?: string | null
          assigned_to?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          salvage_value?: number | null
          serial_number?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_date: string | null
          check_in: string | null
          check_out: string | null
          created_at: string
          date: string
          deleted_at: string | null
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          overtime_hours: number | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attendance_date?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date: string
          deleted_at?: string | null
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_trails: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          deleted_at: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          performed_at: string
          performed_by: string | null
          record_id: string
          record_type: string
          tenant_id: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id: string
          record_type: string
          tenant_id: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id?: string
          record_type?: string
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_trails_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          bank_name: string | null
          branch_code: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          currency_id: string | null
          current_balance: number | null
          deleted_at: string | null
          employee_id: string | null
          iban: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          notes: string | null
          opening_balance: number | null
          swift_code: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          branch_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          currency_id?: string | null
          current_balance?: number | null
          deleted_at?: string | null
          employee_id?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          notes?: string | null
          opening_balance?: number | null
          swift_code?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          branch_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          currency_id?: string | null
          current_balance?: number | null
          deleted_at?: string | null
          employee_id?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          notes?: string | null
          opening_balance?: number | null
          swift_code?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "master_currency_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliation_sessions: {
        Row: {
          bank_account_id: string
          closing_balance: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string
          id: string
          opening_balance: number | null
          start_date: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date: string
          id?: string
          opening_balance?: number | null
          start_date: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string
          id?: string
          opening_balance?: number | null
          start_date?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_sessions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          category: string | null
          created_at: string
          created_by: string | null
          credit_amount: number | null
          debit_amount: number | null
          deleted_at: string | null
          description: string | null
          id: string
          is_reconciled: boolean | null
          reconciled_at: string | null
          reference: string | null
          running_balance: number | null
          tenant_id: string
          transaction_date: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_reconciled?: boolean | null
          reconciled_at?: string | null
          reference?: string | null
          running_balance?: number | null
          tenant_id: string
          transaction_date: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_reconciled?: boolean | null
          reconciled_at?: string | null
          reference?: string | null
          running_balance?: number | null
          tenant_id?: string
          transaction_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_coupons: {
        Row: {
          applies_to_plans: string[] | null
          code: string
          created_at: string
          currency: string | null
          deleted_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          duration: string | null
          duration_months: number | null
          id: string
          is_active: boolean | null
          max_redemptions: number | null
          name: string
          paypal_coupon_id: string | null
          redemptions_count: number | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applies_to_plans?: string[] | null
          code: string
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          duration?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          name: string
          paypal_coupon_id?: string | null
          redemptions_count?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applies_to_plans?: string[] | null
          code?: string
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          duration?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          name?: string
          paypal_coupon_id?: string | null
          redemptions_count?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          deleted_at: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          paypal_event_id: string
          processed: boolean | null
          processed_at: string | null
          retry_count: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          paypal_event_id: string
          processed?: boolean | null
          processed_at?: string | null
          retry_count?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          paypal_event_id?: string
          processed?: boolean | null
          processed_at?: string | null
          retry_count?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoice_items: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          invoice_id: string
          item_type: string | null
          metadata: Json | null
          paypal_item_id: string | null
          period_end: string | null
          period_start: string | null
          quantity: number | null
          unit_amount: number
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          invoice_id: string
          item_type?: string | null
          metadata?: Json | null
          paypal_item_id?: string | null
          period_end?: string | null
          period_start?: string | null
          quantity?: number | null
          unit_amount: number
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          item_type?: string | null
          metadata?: Json | null
          paypal_item_id?: string | null
          period_end?: string | null
          period_start?: string | null
          quantity?: number | null
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          discount_amount: number | null
          due_date: string | null
          footer: string | null
          id: string
          invoice_date: string | null
          invoice_number: string
          invoice_pdf_url: string | null
          memo: string | null
          paid_at: string | null
          payment_method: string | null
          paypal_invoice_id: string | null
          paypal_payment_id: string | null
          paypal_transaction_id: string | null
          period_end: string | null
          period_start: string | null
          status: string | null
          subscription_id: string | null
          subtotal: number
          tax_amount: number | null
          tax_country: string | null
          tax_rate: number | null
          tax_type: string | null
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          due_date?: string | null
          footer?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number: string
          invoice_pdf_url?: string | null
          memo?: string | null
          paid_at?: string | null
          payment_method?: string | null
          paypal_invoice_id?: string | null
          paypal_payment_id?: string | null
          paypal_transaction_id?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          subscription_id?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_country?: string | null
          tax_rate?: number | null
          tax_type?: string | null
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          due_date?: string | null
          footer?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          invoice_pdf_url?: string | null
          memo?: string | null
          paid_at?: string | null
          payment_method?: string | null
          paypal_invoice_id?: string | null
          paypal_payment_id?: string | null
          paypal_transaction_id?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          subscription_id?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_country?: string | null
          tax_rate?: number | null
          tax_type?: string | null
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city_id: string | null
          code: string | null
          country_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_main: boolean | null
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          code?: string | null
          country_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_main?: boolean | null
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city_id?: string | null
          code?: string | null
          country_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_main?: boolean | null
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "geo_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "geo_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_themes: {
        Row: {
          accent_color: string | null
          created_at: string
          created_by: string | null
          default_margins: Json
          default_orientation: string
          default_paper_size: string
          deleted_at: string | null
          favicon_url: string | null
          font_family: string
          footer_text: string | null
          id: string
          is_default: boolean
          language_defaults: Json
          logo_light_url: string | null
          logo_url: string | null
          metadata: Json
          name: string
          qr_config: Json
          socials: Json
          tenant_id: string
          terms_text: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          created_by?: string | null
          default_margins?: Json
          default_orientation?: string
          default_paper_size?: string
          deleted_at?: string | null
          favicon_url?: string | null
          font_family?: string
          footer_text?: string | null
          id?: string
          is_default?: boolean
          language_defaults?: Json
          logo_light_url?: string | null
          logo_url?: string | null
          metadata?: Json
          name: string
          qr_config?: Json
          socials?: Json
          tenant_id: string
          terms_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          created_by?: string | null
          default_margins?: Json
          default_orientation?: string
          default_paper_size?: string
          deleted_at?: string | null
          favicon_url?: string | null
          font_family?: string
          footer_text?: string | null
          id?: string
          is_default?: boolean
          language_defaults?: Json
          logo_light_url?: string | null
          logo_url?: string | null
          metadata?: Json
          name?: string
          qr_config?: Json
          socials?: Json
          tenant_id?: string
          terms_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_themes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_attachments: {
        Row: {
          case_id: string
          category: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_communications: {
        Row: {
          case_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          direction: string | null
          id: string
          sent_by: string | null
          sent_to: string | null
          subject: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          case_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          id?: string
          sent_by?: string | null
          sent_to?: string | null
          subject?: string | null
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          id?: string
          sent_by?: string | null
          sent_to?: string | null
          subject?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_communications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_devices: {
        Row: {
          accessories: string[] | null
          brand_id: string | null
          capacity_id: string | null
          case_id: string
          condition_id: string | null
          created_at: string
          created_by: string | null
          data_recovered_size: string | null
          deleted_at: string | null
          device_role_id: number | null
          device_type_id: string | null
          diagnosis: string | null
          encryption_id: string | null
          firmware_version: string | null
          form_factor_id: string | null
          head_count_id: string | null
          id: string
          interface_id: string | null
          is_primary: boolean | null
          made_in_id: string | null
          model: string | null
          notes: string | null
          password: string | null
          pcb_number: string | null
          photos: string[] | null
          physical_damage: string | null
          platter_count_id: string | null
          recovery_result: string | null
          role_notes: string | null
          serial_number: string | null
          storage_location: string | null
          symptoms: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accessories?: string[] | null
          brand_id?: string | null
          capacity_id?: string | null
          case_id: string
          condition_id?: string | null
          created_at?: string
          created_by?: string | null
          data_recovered_size?: string | null
          deleted_at?: string | null
          device_role_id?: number | null
          device_type_id?: string | null
          diagnosis?: string | null
          encryption_id?: string | null
          firmware_version?: string | null
          form_factor_id?: string | null
          head_count_id?: string | null
          id?: string
          interface_id?: string | null
          is_primary?: boolean | null
          made_in_id?: string | null
          model?: string | null
          notes?: string | null
          password?: string | null
          pcb_number?: string | null
          photos?: string[] | null
          physical_damage?: string | null
          platter_count_id?: string | null
          recovery_result?: string | null
          role_notes?: string | null
          serial_number?: string | null
          storage_location?: string | null
          symptoms?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accessories?: string[] | null
          brand_id?: string | null
          capacity_id?: string | null
          case_id?: string
          condition_id?: string | null
          created_at?: string
          created_by?: string | null
          data_recovered_size?: string | null
          deleted_at?: string | null
          device_role_id?: number | null
          device_type_id?: string | null
          diagnosis?: string | null
          encryption_id?: string | null
          firmware_version?: string | null
          form_factor_id?: string | null
          head_count_id?: string | null
          id?: string
          interface_id?: string | null
          is_primary?: boolean | null
          made_in_id?: string | null
          model?: string | null
          notes?: string | null
          password?: string | null
          pcb_number?: string | null
          photos?: string[] | null
          physical_damage?: string | null
          platter_count_id?: string | null
          recovery_result?: string | null
          role_notes?: string | null
          serial_number?: string | null
          storage_location?: string | null
          symptoms?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_devices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_capacity_id_fkey"
            columns: ["capacity_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_capacities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_conditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_device_role_id_fkey"
            columns: ["device_role_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_device_type_id_fkey"
            columns: ["device_type_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_encryption_id_fkey"
            columns: ["encryption_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_encryption"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_form_factor_id_fkey"
            columns: ["form_factor_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_form_factors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_head_count_id_fkey"
            columns: ["head_count_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_head_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_interface_id_fkey"
            columns: ["interface_id"]
            isOneToOne: false
            referencedRelation: "catalog_interfaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_made_in_id_fkey"
            columns: ["made_in_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_made_in"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_platter_count_id_fkey"
            columns: ["platter_count_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_platter_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_diagnostics: {
        Row: {
          case_id: string
          created_at: string
          deleted_at: string | null
          device_id: string | null
          diagnostic_type: string | null
          findings: string | null
          id: string
          performed_at: string | null
          performed_by: string | null
          recommendations: string | null
          result: string | null
          tenant_id: string
          tool_used: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          diagnostic_type?: string | null
          findings?: string | null
          id?: string
          performed_at?: string | null
          performed_by?: string | null
          recommendations?: string | null
          result?: string | null
          tenant_id: string
          tool_used?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          diagnostic_type?: string | null
          findings?: string | null
          id?: string
          performed_at?: string | null
          performed_by?: string | null
          recommendations?: string | null
          result?: string | null
          tenant_id?: string
          tool_used?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_diagnostics_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_diagnostics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_diagnostics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_engineers: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          case_id: string
          created_at: string
          deleted_at: string | null
          id: string
          removed_at: string | null
          role_text: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          case_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          removed_at?: string | null
          role_text?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          removed_at?: string | null
          role_text?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_engineers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_engineers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_follow_ups: {
        Row: {
          assigned_to: string | null
          attempt_count: number
          auto_send: boolean
          case_id: string
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          follow_up_date: string
          id: string
          last_error: string | null
          message: string | null
          notes: string | null
          quote_id: string | null
          send_to: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          template_id: string | null
          tenant_id: string
          type: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attempt_count?: number
          auto_send?: boolean
          case_id: string
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          follow_up_date: string
          id?: string
          last_error?: string | null
          message?: string | null
          notes?: string | null
          quote_id?: string | null
          send_to?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
          tenant_id: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attempt_count?: number
          auto_send?: boolean
          case_id?: string
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          follow_up_date?: string
          id?: string
          last_error?: string | null
          message?: string | null
          notes?: string | null
          quote_id?: string | null
          send_to?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
          tenant_id?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_follow_ups_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_follow_ups_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_follow_ups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_internal_notes: {
        Row: {
          case_id: string
          content: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_internal_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_internal_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_job_history: {
        Row: {
          action: string
          case_id: string
          created_at: string
          deleted_at: string | null
          details: string | null
          id: string
          new_value: string | null
          old_value: string | null
          performed_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          case_id: string
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_job_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_job_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_milestones: {
        Row: {
          case_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          status: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_milestones_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_portal_visibility: {
        Row: {
          case_id: string
          created_at: string
          custom_message: string | null
          deleted_at: string | null
          id: string
          is_visible: boolean | null
          show_diagnostics: boolean | null
          show_timeline: boolean | null
          tenant_id: string
          updated_at: string
          visible_fields: string[] | null
        }
        Insert: {
          case_id: string
          created_at?: string
          custom_message?: string | null
          deleted_at?: string | null
          id?: string
          is_visible?: boolean | null
          show_diagnostics?: boolean | null
          show_timeline?: boolean | null
          tenant_id: string
          updated_at?: string
          visible_fields?: string[] | null
        }
        Update: {
          case_id?: string
          created_at?: string
          custom_message?: string | null
          deleted_at?: string | null
          id?: string
          is_visible?: boolean | null
          show_diagnostics?: boolean | null
          show_timeline?: boolean | null
          tenant_id?: string
          updated_at?: string
          visible_fields?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "case_portal_visibility_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_portal_visibility_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_qa_checklists: {
        Row: {
          case_id: string
          checklist_name: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          items: Json | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          case_id: string
          checklist_name: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          items?: Json | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          checklist_name?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          items?: Json | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_qa_checklists_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_qa_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_quote_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          quantity: number | null
          quote_id: string
          sort_order: number | null
          tenant_id: string
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          quantity?: number | null
          quote_id: string
          sort_order?: number | null
          tenant_id: string
          total_price: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          quantity?: number | null
          quote_id?: string
          sort_order?: number | null
          tenant_id?: string
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "case_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_quote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          case_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount_amount: number | null
          id: string
          notes: string | null
          quote_number: string | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          id?: string
          notes?: string | null
          quote_number?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          id?: string
          notes?: string | null
          quote_number?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_quotes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_recovery_attempts: {
        Row: {
          attempt_number: number | null
          case_id: string
          completed_at: string | null
          created_at: string
          data_recovered: string | null
          deleted_at: string | null
          device_id: string | null
          id: string
          method: string | null
          notes: string | null
          performed_by: string | null
          result: string | null
          started_at: string | null
          tenant_id: string
          tool_used: string | null
          updated_at: string
        }
        Insert: {
          attempt_number?: number | null
          case_id: string
          completed_at?: string | null
          created_at?: string
          data_recovered?: string | null
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          performed_by?: string | null
          result?: string | null
          started_at?: string | null
          tenant_id: string
          tool_used?: string | null
          updated_at?: string
        }
        Update: {
          attempt_number?: number | null
          case_id?: string
          completed_at?: string | null
          created_at?: string
          data_recovered?: string | null
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          performed_by?: string | null
          result?: string | null
          started_at?: string | null
          tenant_id?: string
          tool_used?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_recovery_attempts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_recovery_attempts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_recovery_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_report_sections: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_visible: boolean | null
          report_id: string
          section_type: string | null
          sort_order: number | null
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_visible?: boolean | null
          report_id: string
          section_type?: string | null
          sort_order?: number | null
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_visible?: boolean | null
          report_id?: string
          section_type?: string | null
          sort_order?: number | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_report_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "case_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_report_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_reports: {
        Row: {
          case_id: string
          content: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          report_number: string | null
          status: string | null
          template_id: string | null
          template_version_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          content?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_number?: string | null
          status?: string | null
          template_id?: string | null
          template_version_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          content?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_number?: string | null
          status?: string | null
          template_id?: string | null
          template_version_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "master_case_report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_reports_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_status_transitions: {
        Row: {
          allowed_roles: string[]
          created_at: string
          description: string | null
          from_phase: string
          id: string
          is_active: boolean
          requires: string[]
          sort_order: number
          to_phase: string
          updated_at: string
        }
        Insert: {
          allowed_roles?: string[]
          created_at?: string
          description?: string | null
          from_phase: string
          id?: string
          is_active?: boolean
          requires?: string[]
          sort_order?: number
          to_phase: string
          updated_at?: string
        }
        Update: {
          allowed_roles?: string[]
          created_at?: string
          description?: string | null
          from_phase?: string
          id?: string
          is_active?: boolean
          requires?: string[]
          sort_order?: number
          to_phase?: string
          updated_at?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          actual_completion: string | null
          assigned_engineer_id: string | null
          assigned_to: string | null
          branch_id: string | null
          case_no: string | null
          case_number: string | null
          checkout_collector_id: string | null
          checkout_collector_mobile: string | null
          checkout_collector_name: string | null
          checkout_date: string | null
          client_reference: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          description: string | null
          diagnosis: string | null
          discount_amount: number | null
          estimated_completion: string | null
          id: string
          internal_notes: string | null
          is_urgent: boolean | null
          is_warranty: boolean | null
          net_amount: number | null
          phase_entered_at: string | null
          priority: string | null
          priority_id: string | null
          recovery_outcome: string | null
          referred_by: string | null
          resolution: string | null
          service_location_id: string | null
          service_type_id: string | null
          status: string | null
          status_id: string | null
          subject: string | null
          tax_amount: number | null
          tenant_id: string
          title: string | null
          total_amount: number | null
          updated_at: string
          updated_by: string | null
          warranty_details: string | null
        }
        Insert: {
          actual_completion?: string | null
          assigned_engineer_id?: string | null
          assigned_to?: string | null
          branch_id?: string | null
          case_no?: string | null
          case_number?: string | null
          checkout_collector_id?: string | null
          checkout_collector_mobile?: string | null
          checkout_collector_name?: string | null
          checkout_date?: string | null
          client_reference?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          diagnosis?: string | null
          discount_amount?: number | null
          estimated_completion?: string | null
          id?: string
          internal_notes?: string | null
          is_urgent?: boolean | null
          is_warranty?: boolean | null
          net_amount?: number | null
          phase_entered_at?: string | null
          priority?: string | null
          priority_id?: string | null
          recovery_outcome?: string | null
          referred_by?: string | null
          resolution?: string | null
          service_location_id?: string | null
          service_type_id?: string | null
          status?: string | null
          status_id?: string | null
          subject?: string | null
          tax_amount?: number | null
          tenant_id: string
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          updated_by?: string | null
          warranty_details?: string | null
        }
        Update: {
          actual_completion?: string | null
          assigned_engineer_id?: string | null
          assigned_to?: string | null
          branch_id?: string | null
          case_no?: string | null
          case_number?: string | null
          checkout_collector_id?: string | null
          checkout_collector_mobile?: string | null
          checkout_collector_name?: string | null
          checkout_date?: string | null
          client_reference?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          diagnosis?: string | null
          discount_amount?: number | null
          estimated_completion?: string | null
          id?: string
          internal_notes?: string | null
          is_urgent?: boolean | null
          is_warranty?: boolean | null
          net_amount?: number | null
          phase_entered_at?: string | null
          priority?: string | null
          priority_id?: string | null
          recovery_outcome?: string | null
          referred_by?: string | null
          resolution?: string | null
          service_location_id?: string | null
          service_type_id?: string | null
          status?: string | null
          status_id?: string | null
          subject?: string | null
          tax_amount?: number | null
          tenant_id?: string
          title?: string | null
          total_amount?: number | null
          updated_at?: string
          updated_by?: string | null
          warranty_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_priority_id_fkey"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "master_case_priorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_service_location_id_fkey"
            columns: ["service_location_id"]
            isOneToOne: false
            referencedRelation: "catalog_service_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "catalog_service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "master_case_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_accessories: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      catalog_device_brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_device_capacities: {
        Row: {
          created_at: string
          gb_value: number | null
          id: string
          is_active: boolean
          name: string
          size_bytes: number | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gb_value?: number | null
          id?: string
          is_active?: boolean
          name: string
          size_bytes?: number | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gb_value?: number | null
          id?: string
          is_active?: boolean
          name?: string
          size_bytes?: number | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_device_component_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      catalog_device_conditions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_device_encryption: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      catalog_device_form_factors: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      catalog_device_head_counts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          value?: number | null
        }
        Relationships: []
      }
      catalog_device_interfaces: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      catalog_device_made_in: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      catalog_device_platter_counts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          value?: number | null
        }
        Relationships: []
      }
      catalog_device_roles: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      catalog_device_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_donor_compatibility_matrix: {
        Row: {
          brand_id: string | null
          compatibility_level: string | null
          created_at: string
          failure_count: number | null
          firmware_range: string | null
          head_map: string | null
          id: string
          notes: string | null
          pcb_number: string | null
          source_model: string
          success_count: number | null
          target_model: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          brand_id?: string | null
          compatibility_level?: string | null
          created_at?: string
          failure_count?: number | null
          firmware_range?: string | null
          head_map?: string | null
          id?: string
          notes?: string | null
          pcb_number?: string | null
          source_model: string
          success_count?: number | null
          target_model: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          brand_id?: string | null
          compatibility_level?: string | null
          created_at?: string
          failure_count?: number | null
          firmware_range?: string | null
          head_map?: string | null
          id?: string
          notes?: string | null
          pcb_number?: string | null
          source_model?: string
          success_count?: number | null
          target_model?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_donor_compatibility_matrix_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_interfaces: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_service_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      catalog_service_line_items: {
        Row: {
          category_id: string | null
          created_at: string
          default_price: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_service_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_service_locations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_service_problems: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_service_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      chain_of_custody: {
        Row: {
          action: string
          action_category: Database["public"]["Enums"]["custody_action_category"]
          actor_id: string | null
          actor_name: string
          actor_role: string | null
          case_id: string
          created_at: string
          custody_status: Database["public"]["Enums"]["custody_status"] | null
          deleted_at: string | null
          description: string | null
          device_id: string | null
          evidence_hash: string | null
          id: string
          location: string | null
          metadata: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          action_category: Database["public"]["Enums"]["custody_action_category"]
          actor_id?: string | null
          actor_name: string
          actor_role?: string | null
          case_id: string
          created_at?: string
          custody_status?: Database["public"]["Enums"]["custody_status"] | null
          deleted_at?: string | null
          description?: string | null
          device_id?: string | null
          evidence_hash?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          action_category?: Database["public"]["Enums"]["custody_action_category"]
          actor_id?: string | null
          actor_name?: string
          actor_role?: string | null
          case_id?: string
          created_at?: string
          custody_status?: Database["public"]["Enums"]["custody_status"] | null
          deleted_at?: string | null
          description?: string | null
          device_id?: string | null
          evidence_hash?: string | null
          id?: string
          location?: string | null
          metadata?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chain_of_custody_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_of_custody_access_log: {
        Row: {
          access_ended_at: string | null
          access_location: string | null
          access_method: string | null
          access_purpose: string
          access_started_at: string | null
          access_type: string
          accessor_id: string | null
          accessor_name: string
          case_id: string
          created_at: string | null
          custody_entry_id: string | null
          device_fingerprint: string | null
          device_id: string | null
          findings: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          notes: string | null
          supervisor_approved: boolean | null
          supervisor_id: string | null
          tenant_id: string
          tools_used: string[] | null
          updated_at: string
        }
        Insert: {
          access_ended_at?: string | null
          access_location?: string | null
          access_method?: string | null
          access_purpose: string
          access_started_at?: string | null
          access_type: string
          accessor_id?: string | null
          accessor_name: string
          case_id: string
          created_at?: string | null
          custody_entry_id?: string | null
          device_fingerprint?: string | null
          device_id?: string | null
          findings?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          notes?: string | null
          supervisor_approved?: boolean | null
          supervisor_id?: string | null
          tenant_id: string
          tools_used?: string[] | null
          updated_at?: string
        }
        Update: {
          access_ended_at?: string | null
          access_location?: string | null
          access_method?: string | null
          access_purpose?: string
          access_started_at?: string | null
          access_type?: string
          accessor_id?: string | null
          accessor_name?: string
          case_id?: string
          created_at?: string | null
          custody_entry_id?: string | null
          device_fingerprint?: string | null
          device_id?: string | null
          findings?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          notes?: string | null
          supervisor_approved?: boolean | null
          supervisor_id?: string | null
          tenant_id?: string
          tools_used?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chain_of_custody_access_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_access_log_custody_entry_id_fkey"
            columns: ["custody_entry_id"]
            isOneToOne: false
            referencedRelation: "chain_of_custody"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_access_log_custody_entry_id_fkey"
            columns: ["custody_entry_id"]
            isOneToOne: false
            referencedRelation: "v_chain_of_custody_timeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_access_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_access_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_of_custody_integrity_checks: {
        Row: {
          actual_hash: string | null
          case_id: string
          check_type: string
          checked_at: string | null
          checked_by: string | null
          created_at: string
          deleted_at: string | null
          details: string | null
          device_id: string | null
          expected_hash: string | null
          id: string
          result: Database["public"]["Enums"]["integrity_check_result"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_hash?: string | null
          case_id: string
          check_type: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          device_id?: string | null
          expected_hash?: string | null
          id?: string
          result: Database["public"]["Enums"]["integrity_check_result"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actual_hash?: string | null
          case_id?: string
          check_type?: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          device_id?: string | null
          expected_hash?: string | null
          id?: string
          result?: Database["public"]["Enums"]["integrity_check_result"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chain_of_custody_integrity_checks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_integrity_checks_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_integrity_checks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_of_custody_transfers: {
        Row: {
          accepted_at: string | null
          case_id: string
          created_at: string
          deleted_at: string | null
          device_id: string | null
          from_location: string | null
          from_person_id: string | null
          from_person_name: string
          id: string
          notes: string | null
          rejected_at: string | null
          rejection_reason: string | null
          tenant_id: string
          to_location: string | null
          to_person_id: string | null
          to_person_name: string
          transfer_reason: string
          transfer_status:
            | Database["public"]["Enums"]["custody_transfer_status"]
            | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          case_id: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          from_location?: string | null
          from_person_id?: string | null
          from_person_name: string
          id?: string
          notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          tenant_id: string
          to_location?: string | null
          to_person_id?: string | null
          to_person_name: string
          transfer_reason: string
          transfer_status?:
            | Database["public"]["Enums"]["custody_transfer_status"]
            | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          from_location?: string | null
          from_person_id?: string | null
          from_person_name?: string
          id?: string
          notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          tenant_id?: string
          to_location?: string | null
          to_person_id?: string | null
          to_person_name?: string
          transfer_reason?: string
          transfer_status?:
            | Database["public"]["Enums"]["custody_transfer_status"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chain_of_custody_transfers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_transfers_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clone_drives: {
        Row: {
          archived_by: string | null
          archived_date: string | null
          assigned_to: string | null
          attributes: Json
          capacity: string | null
          case_id: string | null
          clone_date: string | null
          cloned_by: string | null
          cloned_by_name: string | null
          created_at: string
          deleted_at: string | null
          delivered_by: string | null
          delivered_by_name: string | null
          delivered_date: string | null
          delivery_notes: string | null
          device_id: string | null
          drive_label: string | null
          expected_size_gb: number | null
          extracted_by: string | null
          extracted_date: string | null
          id: string
          image_format: string | null
          image_size_gb: number | null
          notes: string | null
          physical_location_id: string | null
          preserve_reason: string | null
          preserved_by: string | null
          preserved_date: string | null
          resource_clone_drive_id: string | null
          retention_days: number | null
          retention_deadline: string | null
          serial_number: string | null
          status: string | null
          storage_path: string | null
          storage_server: string | null
          storage_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_by?: string | null
          archived_date?: string | null
          assigned_to?: string | null
          attributes?: Json
          capacity?: string | null
          case_id?: string | null
          clone_date?: string | null
          cloned_by?: string | null
          cloned_by_name?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_by?: string | null
          delivered_by_name?: string | null
          delivered_date?: string | null
          delivery_notes?: string | null
          device_id?: string | null
          drive_label?: string | null
          expected_size_gb?: number | null
          extracted_by?: string | null
          extracted_date?: string | null
          id?: string
          image_format?: string | null
          image_size_gb?: number | null
          notes?: string | null
          physical_location_id?: string | null
          preserve_reason?: string | null
          preserved_by?: string | null
          preserved_date?: string | null
          resource_clone_drive_id?: string | null
          retention_days?: number | null
          retention_deadline?: string | null
          serial_number?: string | null
          status?: string | null
          storage_path?: string | null
          storage_server?: string | null
          storage_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived_by?: string | null
          archived_date?: string | null
          assigned_to?: string | null
          attributes?: Json
          capacity?: string | null
          case_id?: string | null
          clone_date?: string | null
          cloned_by?: string | null
          cloned_by_name?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_by?: string | null
          delivered_by_name?: string | null
          delivered_date?: string | null
          delivery_notes?: string | null
          device_id?: string | null
          drive_label?: string | null
          expected_size_gb?: number | null
          extracted_by?: string | null
          extracted_date?: string | null
          id?: string
          image_format?: string | null
          image_size_gb?: number | null
          notes?: string | null
          physical_location_id?: string | null
          preserve_reason?: string | null
          preserved_by?: string | null
          preserved_date?: string | null
          resource_clone_drive_id?: string | null
          retention_days?: number | null
          retention_deadline?: string | null
          serial_number?: string | null
          status?: string | null
          storage_path?: string | null
          storage_server?: string | null
          storage_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clone_drives_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_cloned_by_fkey"
            columns: ["cloned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_extracted_by_fkey"
            columns: ["extracted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_physical_location_id_fkey"
            columns: ["physical_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_preserved_by_fkey"
            columns: ["preserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_resource_clone_drive_id_fkey"
            columns: ["resource_clone_drive_id"]
            isOneToOne: false
            referencedRelation: "resource_clone_drives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drives_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          city_id: string | null
          company_name: string | null
          company_number: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          industry_id: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          registration_number: string | null
          tax_number: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          company_name?: string | null
          company_number?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry_id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          registration_number?: string | null
          tax_number?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city_id?: string | null
          company_name?: string | null
          company_number?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry_id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          registration_number?: string | null
          tax_number?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "geo_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "geo_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "master_industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          accounting_locale: string | null
          banking_info: Json | null
          basic_info: Json | null
          branding: Json | null
          case_prefix: string | null
          clone_defaults: Json | null
          company_address: string | null
          company_email: string | null
          company_logo_url: string | null
          company_name: string | null
          company_phone: string | null
          company_website: string | null
          contact_info: Json | null
          created_at: string
          date_format: string | null
          default_currency: string | null
          deleted_at: string | null
          email_notifications: boolean | null
          fiscal_year_start: number | null
          id: string
          invoice_prefix: string | null
          legal_compliance: Json | null
          localization: Json | null
          location: Json | null
          metadata: Json | null
          online_presence: Json | null
          portal_custom_css: string | null
          portal_enabled: boolean | null
          portal_maintenance_message: string | null
          portal_maintenance_mode: boolean | null
          portal_settings: Json | null
          portal_welcome_message: string | null
          quote_prefix: string | null
          registration_number: string | null
          sms_notifications: boolean | null
          tax_number: string | null
          tenant_id: string
          time_zone: string | null
          updated_at: string
        }
        Insert: {
          accounting_locale?: string | null
          banking_info?: Json | null
          basic_info?: Json | null
          branding?: Json | null
          case_prefix?: string | null
          clone_defaults?: Json | null
          company_address?: string | null
          company_email?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_phone?: string | null
          company_website?: string | null
          contact_info?: Json | null
          created_at?: string
          date_format?: string | null
          default_currency?: string | null
          deleted_at?: string | null
          email_notifications?: boolean | null
          fiscal_year_start?: number | null
          id?: string
          invoice_prefix?: string | null
          legal_compliance?: Json | null
          localization?: Json | null
          location?: Json | null
          metadata?: Json | null
          online_presence?: Json | null
          portal_custom_css?: string | null
          portal_enabled?: boolean | null
          portal_maintenance_message?: string | null
          portal_maintenance_mode?: boolean | null
          portal_settings?: Json | null
          portal_welcome_message?: string | null
          quote_prefix?: string | null
          registration_number?: string | null
          sms_notifications?: boolean | null
          tax_number?: string | null
          tenant_id: string
          time_zone?: string | null
          updated_at?: string
        }
        Update: {
          accounting_locale?: string | null
          banking_info?: Json | null
          basic_info?: Json | null
          branding?: Json | null
          case_prefix?: string | null
          clone_defaults?: Json | null
          company_address?: string | null
          company_email?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_phone?: string | null
          company_website?: string | null
          contact_info?: Json | null
          created_at?: string
          date_format?: string | null
          default_currency?: string | null
          deleted_at?: string | null
          email_notifications?: boolean | null
          fiscal_year_start?: number | null
          id?: string
          invoice_prefix?: string | null
          legal_compliance?: Json | null
          localization?: Json | null
          location?: Json | null
          metadata?: Json | null
          online_presence?: Json | null
          portal_custom_css?: string | null
          portal_enabled?: boolean | null
          portal_maintenance_message?: string | null
          portal_maintenance_mode?: boolean | null
          portal_settings?: Json | null
          portal_welcome_message?: string | null
          quote_prefix?: string | null
          registration_number?: string | null
          sms_notifications?: boolean | null
          tax_number?: string | null
          tenant_id?: string
          time_zone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_applied: number | null
          id: string
          redeemed_at: string
          subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_applied?: number | null
          id?: string
          redeemed_at?: string
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_applied?: number | null
          id?: string
          redeemed_at?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "billing_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          credit_note_id: string
          deleted_at: string | null
          id: string
          invoice_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          credit_note_id: string
          deleted_at?: string | null
          id?: string
          invoice_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          credit_note_id?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_allocations_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_items: {
        Row: {
          created_at: string
          credit_note_id: string
          deleted_at: string | null
          description: string
          discount: number
          id: string
          quantity: number
          sort_order: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_note_id: string
          deleted_at?: string | null
          description?: string
          discount?: number
          id?: string
          quantity?: number
          sort_order?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id: string
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_note_id?: string
          deleted_at?: string | null
          description?: string
          discount?: number
          id?: string
          quantity?: number
          sort_order?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_items_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          applied_amount: number
          approved_at: string | null
          approved_by: string | null
          case_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_note_date: string
          credit_note_number: string
          credit_type: string
          currency: string
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_id: string | null
          rate_source: string
          reason_code: string | null
          reason_notes: string | null
          refunded_amount: number
          status: string
          subtotal: number
          subtotal_base: number
          tax_amount: number
          tax_amount_base: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          total_amount_base: number
          updated_at: string
          updated_by: string | null
          voided_at: string | null
        }
        Insert: {
          applied_amount?: number
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_date?: string
          credit_note_number: string
          credit_type?: string
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          rate_source?: string
          reason_code?: string | null
          reason_notes?: string | null
          refunded_amount?: number
          status?: string
          subtotal?: number
          subtotal_base?: number
          tax_amount?: number
          tax_amount_base?: number
          tax_rate?: number
          tenant_id: string
          total_amount?: number
          total_amount_base?: number
          updated_at?: string
          updated_by?: string | null
          voided_at?: string | null
        }
        Update: {
          applied_amount?: number
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_date?: string
          credit_note_number?: string
          credit_type?: string
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          rate_source?: string
          reason_code?: string | null
          reason_notes?: string | null
          refunded_amount?: number
          status?: string
          subtotal?: number
          subtotal_base?: number
          tax_amount?: number
          tax_amount_base?: number
          tax_rate?: number
          tenant_id?: string
          total_amount?: number
          total_amount_base?: number
          updated_at?: string
          updated_by?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_communications: {
        Row: {
          content: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          direction: string | null
          id: string
          sent_at: string | null
          sent_by: string | null
          status: string | null
          subject: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          direction?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          direction?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_company_relationships: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          id: string
          is_primary: boolean | null
          role: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean | null
          role?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean | null
          role?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_company_relationships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_relationships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_relationships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_relationships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_groups: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          discount_percentage: number | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers_enhanced: {
        Row: {
          address: string | null
          city_id: string | null
          company_name: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          customer_group_id: string | null
          customer_name: string
          customer_number: string | null
          deleted_at: string | null
          email: string | null
          id: string
          id_number: string | null
          id_type: string | null
          industry_id: string | null
          is_active: boolean | null
          metadata: Json | null
          mobile_number: string | null
          notes: string | null
          phone: string | null
          portal_enabled: boolean | null
          portal_failed_login_attempts: number | null
          portal_last_login: string | null
          portal_locked_until: string | null
          portal_password_hash: string | null
          profile_photo_url: string | null
          referred_by: string | null
          source: string | null
          tax_number: string | null
          tenant_id: string
          total_cases: number | null
          total_revenue: number | null
          updated_at: string
          updated_by: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          company_name?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_group_id?: string | null
          customer_name: string
          customer_number?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          mobile_number?: string | null
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean | null
          portal_failed_login_attempts?: number | null
          portal_last_login?: string | null
          portal_locked_until?: string | null
          portal_password_hash?: string | null
          profile_photo_url?: string | null
          referred_by?: string | null
          source?: string | null
          tax_number?: string | null
          tenant_id: string
          total_cases?: number | null
          total_revenue?: number | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          city_id?: string | null
          company_name?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_group_id?: string | null
          customer_name?: string
          customer_number?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          mobile_number?: string | null
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean | null
          portal_failed_login_attempts?: number | null
          portal_last_login?: string | null
          portal_locked_until?: string | null
          portal_password_hash?: string | null
          profile_photo_url?: string | null
          referred_by?: string | null
          source?: string | null
          tax_number?: string | null
          tenant_id?: string
          total_cases?: number | null
          total_revenue?: number | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_enhanced_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "geo_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "geo_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_customer_group_id_fkey"
            columns: ["customer_group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "master_industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_policies: {
        Row: {
          auto_purge: boolean | null
          created_at: string | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          retention_days: number
          table_name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          auto_purge?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          retention_days?: number
          table_name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          auto_purge?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          retention_days?: number
          table_name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_retention_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_subject_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          deleted_at: string | null
          export_file_path: string | null
          id: string
          notes: string | null
          processed_by: string | null
          request_type: string
          requested_by: string
          status: string
          subject_email: string
          subject_name: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          export_file_path?: string | null
          id?: string
          notes?: string | null
          processed_by?: string | null
          request_type: string
          requested_by: string
          status?: string
          subject_email: string
          subject_name?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          export_file_path?: string | null
          id?: string
          notes?: string | null
          processed_by?: string | null
          request_type?: string
          requested_by?: string
          status?: string
          subject_email?: string
          subject_name?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      database_backups: {
        Row: {
          backup_type: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          error_message: string | null
          file_size: number | null
          file_url: string | null
          id: string
          started_at: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          backup_type?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          error_message?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          backup_type?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          error_message?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "database_backups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          manager_id: string | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_diagnostics: {
        Row: {
          created_at: string
          deleted_at: string | null
          device_id: string | null
          diagnostic_type: string | null
          id: string
          notes: string | null
          performed_by: string | null
          result: Json | null
          tenant_id: string
          tool_used: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          diagnostic_type?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          result?: Json | null
          tenant_id: string
          tool_used?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          diagnostic_type?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          result?: Json | null
          tenant_id?: string
          tool_used?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_diagnostics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_diagnostics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_versions: {
        Row: {
          change_note: string | null
          config: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deployed: boolean
          template_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version_number: number
        }
        Insert: {
          change_note?: string | null
          config: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deployed?: boolean
          template_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version_number: number
        }
        Update: {
          change_note?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deployed?: boolean
          template_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates_pdf"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          default_price: number | null
          deleted_at: string | null
          description: string | null
          document_type: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          item_category: string | null
          last_used_at: string | null
          name: string
          subject_line: string | null
          template_type_id: string | null
          tenant_id: string
          type_id: string | null
          unit_of_measure: string | null
          updated_at: string
          usage_count: number
          variables: Json | null
          version: number
        }
        Insert: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number | null
          deleted_at?: string | null
          description?: string | null
          document_type?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          item_category?: string | null
          last_used_at?: string | null
          name: string
          subject_line?: string | null
          template_type_id?: string | null
          tenant_id: string
          type_id?: string | null
          unit_of_measure?: string | null
          updated_at?: string
          usage_count?: number
          variables?: Json | null
          version?: number
        }
        Update: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number | null
          deleted_at?: string | null
          description?: string | null
          document_type?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          item_category?: string | null
          last_used_at?: string | null
          name?: string
          subject_line?: string | null
          template_type_id?: string | null
          tenant_id?: string
          type_id?: string | null
          unit_of_measure?: string | null
          updated_at?: string
          usage_count?: number
          variables?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_template_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "master_template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates_pdf: {
        Row: {
          branding_theme_id: string | null
          config: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_type: string
          id: string
          is_default: boolean
          language_mode: string
          metadata: Json
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branding_theme_id?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type: string
          id?: string
          is_default?: boolean
          language_mode?: string
          metadata?: Json
          name: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branding_theme_id?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type?: string
          id?: string
          is_default?: boolean
          language_mode?: string
          metadata?: Json
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_pdf_branding_theme_id_fkey"
            columns: ["branding_theme_id"]
            isOneToOne: false
            referencedRelation: "branding_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_pdf_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          category: string | null
          created_at: string
          deleted_at: string | null
          employee_id: string
          expiry_date: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          expiry_date?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          expiry_date?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loans: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          employee_id: string
          end_date: string | null
          id: string
          installment_amount: number
          installments: number
          interest_rate: number | null
          loan_number: string | null
          loan_type: string | null
          notes: string | null
          paid_installments: number | null
          remaining_amount: number | null
          start_date: string
          status: string | null
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          installment_amount: number
          installments: number
          interest_rate?: number | null
          loan_number?: string | null
          loan_type?: string | null
          notes?: string | null
          paid_installments?: number | null
          remaining_amount?: number | null
          start_date: string
          status?: string | null
          tenant_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          installment_amount?: number
          installments?: number
          interest_rate?: number | null
          loan_number?: string | null
          loan_type?: string | null
          notes?: string | null
          paid_installments?: number | null
          remaining_amount?: number | null
          start_date?: string
          status?: string | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_components: {
        Row: {
          amount: number
          component_id: string
          created_at: string
          deleted_at: string | null
          employee_id: string
          id: string
          is_active: boolean | null
          percentage: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          component_id: string
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          id?: string
          is_active?: boolean | null
          percentage?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          component_id?: string
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          id?: string
          is_active?: boolean | null
          percentage?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_components_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_config: {
        Row: {
          basic_salary: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          basic_salary: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          basic_salary?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_config_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_structures: {
        Row: {
          components: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_date: string
          employee_id: string
          id: string
          is_current: boolean | null
          name: string
          net_salary: number | null
          tenant_id: string
          total_deductions: number | null
          total_earnings: number | null
          updated_at: string
        }
        Insert: {
          components?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date: string
          employee_id: string
          id?: string
          is_current?: boolean | null
          name: string
          net_salary?: number | null
          tenant_id: string
          total_deductions?: number | null
          total_earnings?: number | null
          updated_at?: string
        }
        Update: {
          components?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string
          employee_id?: string
          id?: string
          is_current?: boolean | null
          name?: string
          net_salary?: number | null
          tenant_id?: string
          total_deductions?: number | null
          total_earnings?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_structures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_structures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          avatar_url: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          basic_salary: number | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          department_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employee_number: string | null
          employment_status: string | null
          employment_type: string | null
          first_name: string
          gender: string | null
          hire_date: string | null
          id: string
          id_number: string | null
          last_name: string
          manager_id: string | null
          mobile: string | null
          nationality: string | null
          notes: string | null
          passport_number: string | null
          phone: string | null
          position_id: string | null
          postal_code: string | null
          probation_end_date: string | null
          salary_currency: string | null
          tenant_id: string
          termination_date: string | null
          termination_reason: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_number?: string | null
          employment_status?: string | null
          employment_type?: string | null
          first_name: string
          gender?: string | null
          hire_date?: string | null
          id?: string
          id_number?: string | null
          last_name: string
          manager_id?: string | null
          mobile?: string | null
          nationality?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          position_id?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          salary_currency?: string | null
          tenant_id: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_number?: string | null
          employment_status?: string | null
          employment_type?: string | null
          first_name?: string
          gender?: string | null
          hire_date?: string | null
          id?: string
          id_number?: string | null
          last_name?: string
          manager_id?: string | null
          mobile?: string | null
          nationality?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          position_id?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          salary_currency?: string | null
          tenant_id?: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: string
          created_at: string
          fetched_at: string
          id: string
          provider: string | null
          quote_currency: string
          rate: number
          rate_date: string
          source: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          fetched_at?: string
          id?: string
          provider?: string | null
          quote_currency: string
          rate: number
          rate_date: string
          source?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          fetched_at?: string
          id?: string
          provider?: string | null
          quote_currency?: string
          rate?: number
          rate_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "master_currency_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exchange_rates_quote_currency_fkey"
            columns: ["quote_currency"]
            isOneToOne: false
            referencedRelation: "master_currency_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      expense_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          expense_id: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          expense_id: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          expense_id?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          amount_base: number | null
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string | null
          case_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          description: string | null
          exchange_rate: number
          expense_date: string | null
          expense_number: string | null
          id: string
          is_billable: boolean | null
          notes: string | null
          rate_source: string
          receipt_url: string | null
          reference: string | null
          status: string | null
          tax_amount: number | null
          tax_amount_base: number | null
          tenant_id: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          amount_base?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          case_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number
          expense_date?: string | null
          expense_number?: string | null
          id?: string
          is_billable?: boolean | null
          notes?: string | null
          rate_source?: string
          receipt_url?: string | null
          reference?: string | null
          status?: string | null
          tax_amount?: number | null
          tax_amount_base?: number | null
          tenant_id: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          amount_base?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          case_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number
          expense_date?: string | null
          expense_number?: string | null
          id?: string
          is_billable?: boolean | null
          notes?: string | null
          rate_source?: string
          receipt_url?: string | null
          reference?: string | null
          status?: string | null
          tax_amount?: number | null
          tax_amount_base?: number | null
          tenant_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          performed_at: string
          performed_by: string | null
          record_id: string
          record_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id: string
          record_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id?: string
          record_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          amount_base: number | null
          bank_account_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          description: string | null
          exchange_rate: number
          id: string
          notes: string | null
          rate_source: string
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          status: string
          tenant_id: string
          transaction_date: string | null
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_base?: number | null
          bank_account_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number
          id?: string
          notes?: string | null
          rate_source?: string
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          status?: string
          tenant_id: string
          transaction_date?: string | null
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_base?: number | null
          bank_account_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number
          id?: string
          notes?: string | null
          rate_source?: string
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          status?: string
          tenant_id?: string
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_cities: {
        Row: {
          country_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          state_province: string | null
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          state_province?: string | null
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          state_province?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "geo_countries"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_countries: {
        Row: {
          address_format: Json
          code: string
          code3: string | null
          created_at: string
          currency_code: string | null
          currency_name: string
          currency_position: string
          currency_symbol: string
          date_format: string
          decimal_places: number
          decimal_separator: string
          default_tax_rate: number
          fiscal_year_start: string
          id: string
          invoice_prefix_required: boolean
          is_active: boolean
          language_code: string
          locale_code: string
          name: string
          phone_code: string | null
          phone_format: string | null
          postal_code_format: string | null
          postal_code_label: string
          sort_order: number | null
          tax_invoice_required: boolean
          tax_label: string
          tax_number_format: string | null
          tax_number_label: string
          tax_number_placeholder: string | null
          tax_system: string
          thousands_separator: string
          time_format: string
          timezone: string
          updated_at: string
          week_starts_on: number
        }
        Insert: {
          address_format?: Json
          code: string
          code3?: string | null
          created_at?: string
          currency_code?: string | null
          currency_name?: string
          currency_position?: string
          currency_symbol?: string
          date_format?: string
          decimal_places?: number
          decimal_separator?: string
          default_tax_rate?: number
          fiscal_year_start?: string
          id?: string
          invoice_prefix_required?: boolean
          is_active?: boolean
          language_code?: string
          locale_code?: string
          name: string
          phone_code?: string | null
          phone_format?: string | null
          postal_code_format?: string | null
          postal_code_label?: string
          sort_order?: number | null
          tax_invoice_required?: boolean
          tax_label?: string
          tax_number_format?: string | null
          tax_number_label?: string
          tax_number_placeholder?: string | null
          tax_system?: string
          thousands_separator?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
        }
        Update: {
          address_format?: Json
          code?: string
          code3?: string | null
          created_at?: string
          currency_code?: string | null
          currency_name?: string
          currency_position?: string
          currency_symbol?: string
          date_format?: string
          decimal_places?: number
          decimal_separator?: string
          default_tax_rate?: number
          fiscal_year_start?: string
          id?: string
          invoice_prefix_required?: boolean
          is_active?: boolean
          language_code?: string
          locale_code?: string
          name?: string
          phone_code?: string | null
          phone_format?: string | null
          postal_code_format?: string | null
          postal_code_label?: string
          sort_order?: number | null
          tax_invoice_required?: boolean
          tax_label?: string
          tax_number_format?: string | null
          tax_number_label?: string
          tax_number_placeholder?: string | null
          tax_system?: string
          thousands_separator?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
        }
        Relationships: []
      }
      import_export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_type: string
          error_records: number | null
          errors: Json | null
          file_name: string | null
          file_url: string | null
          id: string
          processed_records: number | null
          started_at: string | null
          status: string | null
          success_records: number | null
          template_id: string | null
          tenant_id: string
          total_records: number | null
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type: string
          error_records?: number | null
          errors?: Json | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          processed_records?: number | null
          started_at?: string | null
          status?: string | null
          success_records?: number | null
          template_id?: string | null
          tenant_id: string
          total_records?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type?: string
          error_records?: number | null
          errors?: Json | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          processed_records?: number | null
          started_at?: string | null
          status?: string | null
          success_records?: number | null
          template_id?: string | null
          tenant_id?: string
          total_records?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_export_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "import_export_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_export_logs: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          job_id: string
          message: string | null
          row_number: number | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          job_id: string
          message?: string | null
          row_number?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          job_id?: string
          message?: string | null
          row_number?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_export_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_export_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_export_templates: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_type: string
          id: string
          mapping: Json | null
          name: string
          settings: Json | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type: string
          id?: string
          mapping?: Json | null
          name: string
          settings?: Json | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type?: string
          id?: string
          mapping?: Json | null
          name?: string
          settings?: Json | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_export_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_field_mappings: {
        Row: {
          created_at: string
          default_value: string | null
          deleted_at: string | null
          id: string
          is_required: boolean | null
          sort_order: number | null
          source_field: string
          target_field: string
          template_id: string
          tenant_id: string
          transformation: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          deleted_at?: string | null
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
          source_field: string
          target_field: string
          template_id: string
          tenant_id: string
          transformation?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          deleted_at?: string | null
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
          source_field?: string
          target_field?: string
          template_id?: string
          tenant_id?: string
          transformation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "import_export_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_field_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          assignment_type: string | null
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          notes: string | null
          returned_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          assignment_type?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          returned_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          assignment_type?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          returned_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_assignments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_case_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          case_id: string
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          notes: string | null
          purpose: string | null
          returned_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          case_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          purpose?: string | null
          returned_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          purpose?: string | null
          returned_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_case_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_case_assignments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_case_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          brand_id: string | null
          capacity_id: string | null
          category_id: string | null
          condition_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          donor_parts_available: Json | null
          firmware_version: string | null
          head_map: string | null
          id: string
          interface_id: string | null
          is_donor: boolean | null
          item_category_id: string | null
          item_number: string | null
          location_id: string | null
          min_quantity: number | null
          model: string | null
          name: string
          notes: string | null
          pcb_number: string | null
          photos: string[] | null
          purchase_date: string | null
          purchase_price: number | null
          quantity: number | null
          serial_number: string | null
          status_id: string | null
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id?: string | null
          capacity_id?: string | null
          category_id?: string | null
          condition_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          donor_parts_available?: Json | null
          firmware_version?: string | null
          head_map?: string | null
          id?: string
          interface_id?: string | null
          is_donor?: boolean | null
          item_category_id?: string | null
          item_number?: string | null
          location_id?: string | null
          min_quantity?: number | null
          model?: string | null
          name: string
          notes?: string | null
          pcb_number?: string | null
          photos?: string[] | null
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number | null
          serial_number?: string | null
          status_id?: string | null
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string | null
          capacity_id?: string | null
          category_id?: string | null
          condition_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          donor_parts_available?: Json | null
          firmware_version?: string | null
          head_map?: string | null
          id?: string
          interface_id?: string | null
          is_donor?: boolean | null
          item_category_id?: string | null
          item_number?: string | null
          location_id?: string | null
          min_quantity?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          pcb_number?: string | null
          photos?: string[] | null
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number | null
          serial_number?: string | null
          status_id?: string | null
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_capacity_id_fkey"
            columns: ["capacity_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_capacities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "master_inventory_condition_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_interface_id_fkey"
            columns: ["interface_id"]
            isOneToOne: false
            referencedRelation: "catalog_interfaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_item_category_id_fkey"
            columns: ["item_category_id"]
            isOneToOne: false
            referencedRelation: "master_inventory_item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "master_inventory_status_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          location_code: string | null
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_code?: string | null
          name: string
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_code?: string | null
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_parts_usage: {
        Row: {
          case_id: string | null
          created_at: string
          deleted_at: string | null
          donor_item_id: string | null
          harvested_at: string | null
          harvested_by: string | null
          id: string
          notes: string | null
          part_description: string | null
          part_type: string
          quantity: number | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          deleted_at?: string | null
          donor_item_id?: string | null
          harvested_at?: string | null
          harvested_by?: string | null
          id?: string
          notes?: string | null
          part_description?: string | null
          part_type: string
          quantity?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          deleted_at?: string | null
          donor_item_id?: string | null
          harvested_at?: string | null
          harvested_by?: string | null
          id?: string
          notes?: string | null
          part_description?: string | null
          part_type?: string
          quantity?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_parts_usage_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_parts_usage_donor_item_id_fkey"
            columns: ["donor_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_parts_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_photos: {
        Row: {
          caption: string | null
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          photo_url: string
          sort_order: number | null
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id: string
          photo_url: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string
          photo_url?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_photos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          case_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          notes: string | null
          reserved_by: string | null
          reserved_until: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          reserved_by?: string | null
          reserved_until?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          reserved_by?: string | null
          reserved_until?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_search_templates: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          deleted_at: string | null
          description: string | null
          id: string
          last_used_at: string | null
          name: string
          tenant_id: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          deleted_at?: string | null
          description?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          tenant_id: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          deleted_at?: string | null
          description?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_search_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          item_id: string
          new_status_id: string | null
          notes: string | null
          old_status_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          item_id: string
          new_status_id?: string | null
          notes?: string | null
          old_status_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          item_id?: string
          new_status_id?: string | null
          notes?: string | null
          old_status_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_status_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          notes: string | null
          performed_by: string | null
          quantity: number | null
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          performed_by?: string | null
          quantity?: number | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          performed_by?: string | null
          quantity?: number | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          discount: number | null
          id: string
          invoice_id: string
          quantity: number | null
          sort_order: number | null
          tax_amount: number | null
          tax_rate: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          discount?: number | null
          id?: string
          invoice_id: string
          quantity?: number | null
          sort_order?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount?: number | null
          id?: string
          invoice_id?: string
          quantity?: number | null
          sort_order?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id?: string
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number | null
          amount_paid_base: number | null
          balance_due: number | null
          balance_due_base: number | null
          bank_account_id: string | null
          case_id: string | null
          client_reference: string | null
          company_id: string | null
          converted_at: string | null
          converted_from_quote_id: string | null
          converted_to_invoice_id: string | null
          created_at: string
          created_by: string | null
          credited_amount: number
          credited_amount_base: number
          currency: string | null
          customer_id: string | null
          deleted_at: string | null
          discount_amount: number | null
          discount_type: string
          due_date: string | null
          exchange_rate: number
          footer: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          invoice_type: string | null
          is_proforma: boolean | null
          notes: string | null
          paid_at: string | null
          payment_status: string | null
          proforma_invoice_id: string | null
          rate_source: string
          sent_at: string | null
          status: string
          status_id: string | null
          subtotal: number | null
          subtotal_base: number | null
          tax_amount: number | null
          tax_amount_base: number | null
          tax_rate: number | null
          template_version_id: string | null
          tenant_id: string
          terms: string | null
          title: string | null
          total_amount: number | null
          total_amount_base: number | null
          updated_at: string
          updated_by: string | null
          voided_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          amount_paid_base?: number | null
          balance_due?: number | null
          balance_due_base?: number | null
          bank_account_id?: string | null
          case_id?: string | null
          client_reference?: string | null
          company_id?: string | null
          converted_at?: string | null
          converted_from_quote_id?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_amount?: number
          credited_amount_base?: number
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          discount_type?: string
          due_date?: string | null
          exchange_rate?: number
          footer?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          is_proforma?: boolean | null
          notes?: string | null
          paid_at?: string | null
          payment_status?: string | null
          proforma_invoice_id?: string | null
          rate_source?: string
          sent_at?: string | null
          status?: string
          status_id?: string | null
          subtotal?: number | null
          subtotal_base?: number | null
          tax_amount?: number | null
          tax_amount_base?: number | null
          tax_rate?: number | null
          template_version_id?: string | null
          tenant_id: string
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          total_amount_base?: number | null
          updated_at?: string
          updated_by?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          amount_paid_base?: number | null
          balance_due?: number | null
          balance_due_base?: number | null
          bank_account_id?: string | null
          case_id?: string | null
          client_reference?: string | null
          company_id?: string | null
          converted_at?: string | null
          converted_from_quote_id?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_amount?: number
          credited_amount_base?: number
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          discount_type?: string
          due_date?: string | null
          exchange_rate?: number
          footer?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          is_proforma?: boolean | null
          notes?: string | null
          paid_at?: string | null
          payment_status?: string | null
          proforma_invoice_id?: string | null
          rate_source?: string
          sent_at?: string | null
          status?: string
          status_id?: string | null
          subtotal?: number | null
          subtotal_base?: number | null
          tax_amount?: number | null
          tax_amount_base?: number | null
          tax_rate?: number | null
          template_version_id?: string | null
          tenant_id?: string
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          total_amount_base?: number | null
          updated_at?: string
          updated_by?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_converted_from_quote_id_fkey"
            columns: ["converted_from_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_converted_to_invoice_id_fkey"
            columns: ["converted_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_proforma_invoice_id_fkey"
            columns: ["proforma_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "master_invoice_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_article_tags: {
        Row: {
          article_id: string
          created_at: string
          deleted_at: string | null
          id: string
          tag_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          article_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          tag_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          tag_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_article_tags_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_article_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "kb_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_article_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_article_versions: {
        Row: {
          article_id: string
          change_notes: string | null
          content: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          tenant_id: string
          title: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          article_id: string
          change_notes?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          tenant_id: string
          title?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          article_id?: string
          change_notes?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_article_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          author_id: string | null
          category_id: string | null
          content: string | null
          created_at: string
          deleted_at: string | null
          excerpt: string | null
          id: string
          is_featured: boolean | null
          is_pinned: boolean | null
          published_at: string | null
          slug: string | null
          status: string | null
          tenant_id: string
          title: string
          updated_at: string
          version: number | null
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          is_featured?: boolean | null
          is_pinned?: boolean | null
          published_at?: string | null
          slug?: string | null
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          version?: number | null
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          is_featured?: boolean | null
          is_pinned?: boolean | null
          published_at?: string | null
          slug?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          version?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_author_profile_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_categories: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          slug: string | null
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_tags: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          slug: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          carried_over: number | null
          created_at: string
          employee_id: string
          id: string
          leave_type_id: string
          remaining_days: number | null
          tenant_id: string
          total_days: number
          updated_at: string
          used_days: number | null
          year: number
        }
        Insert: {
          carried_over?: number | null
          created_at?: string
          employee_id: string
          id?: string
          leave_type_id: string
          remaining_days?: number | null
          tenant_id: string
          total_days: number
          updated_at?: string
          used_days?: number | null
          year: number
        }
        Update: {
          carried_over?: number | null
          created_at?: string
          employee_id?: string
          id?: string
          leave_type_id?: string
          remaining_days?: number | null
          tenant_id?: string
          total_days?: number
          updated_at?: string
          used_days?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "master_leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          days: number
          deleted_at: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          rejection_reason: string | null
          review_notes: string | null
          reviewed_by: string | null
          reviewed_date: string | null
          start_date: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          days: number
          deleted_at?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          reviewed_date?: string | null
          start_date: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          days?: number
          deleted_at?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          reviewed_date?: string | null
          start_date?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "master_leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_repayments: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          id: string
          loan_id: string
          notes: string | null
          payment_method: string | null
          reference: string | null
          repayment_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          loan_id: string
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          repayment_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          loan_id?: string
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          repayment_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_case_priorities: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      master_case_report_templates: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          template_data: Json | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          template_data?: Json | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          template_data?: Json | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_case_report_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_case_statuses: {
        Row: {
          color: string | null
          created_at: string
          customer_visible: boolean
          id: string
          is_active: boolean
          is_default: boolean | null
          name: string
          sort_order: number | null
          type: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_visible?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name: string
          sort_order?: number | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_visible?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name?: string
          sort_order?: number | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      master_currency_codes: {
        Row: {
          code: string
          created_at: string
          decimal_places: number
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          symbol: string | null
        }
        Insert: {
          code: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          symbol?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          symbol?: string | null
        }
        Relationships: []
      }
      master_expense_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      master_industries: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      master_inventory_categories: {
        Row: {
          color_code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          color_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          color_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_inventory_condition_types: {
        Row: {
          color_code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          rating: number | null
          sort_order: number | null
        }
        Insert: {
          color_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rating?: number | null
          sort_order?: number | null
        }
        Update: {
          color_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rating?: number | null
          sort_order?: number | null
        }
        Relationships: []
      }
      master_inventory_item_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_inventory_status_types: {
        Row: {
          color: string | null
          color_code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_available_status: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          color_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_available_status?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          color_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_available_status?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_invoice_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_leave_types: {
        Row: {
          created_at: string
          default_days: number | null
          description: string | null
          id: string
          is_active: boolean
          is_paid: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_paid?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_paid?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      master_modules: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number | null
          parent_id: string | null
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number | null
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number | null
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_modules_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "master_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      master_payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      master_payroll_components: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_mandatory: boolean | null
          is_taxable: boolean | null
          name: string
          sort_order: number | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_mandatory?: boolean | null
          is_taxable?: boolean | null
          name: string
          sort_order?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_mandatory?: boolean | null
          is_taxable?: boolean | null
          name?: string
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      master_purchase_order_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_quote_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_supplier_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_supplier_payment_terms: {
        Row: {
          created_at: string
          days: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      master_template_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      master_template_types: {
        Row: {
          category_id: string | null
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          supports_line_items: boolean
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          supports_line_items?: boolean
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          supports_line_items?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_template_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_template_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      master_template_variables: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          variable_key: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          variable_key: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          variable_key?: string
        }
        Relationships: []
      }
      master_transaction_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          type?: string | null
        }
        Relationships: []
      }
      ndas: {
        Row: {
          company_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          expires_at: string | null
          file_url: string | null
          id: string
          nda_number: string | null
          signed_at: string | null
          signed_by_email: string | null
          signed_by_name: string | null
          status: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          nda_number?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          nda_number?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ndas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndas_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndas_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          dedup_key: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          last_error: string | null
          occurred_at: string
          payload: Json
          processed_at: string | null
          processing_attempts: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          dedup_key: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          last_error?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          processing_attempts?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          dedup_key?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          last_error?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          processing_attempts?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          body: string | null
          channel: string
          clicked_at: string | null
          created_at: string
          deleted_at: string | null
          delivered_at: string | null
          dismissed_at: string | null
          error: string | null
          event_id: string | null
          event_type: string
          id: string
          is_read: boolean
          link_url: string | null
          opened_at: string | null
          payload: Json
          provider: string | null
          provider_message_id: string | null
          read_at: string | null
          recipient_address: string | null
          recipient_customer_id: string | null
          recipient_user_id: string | null
          retry_count: number
          sent_at: string | null
          status: string
          subscription_id: string | null
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel: string
          clicked_at?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          error?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          opened_at?: string | null
          payload?: Json
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          recipient_address?: string | null
          recipient_customer_id?: string | null
          recipient_user_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          error?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          opened_at?: string | null
          payload?: Json
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          recipient_address?: string | null
          recipient_customer_id?: string | null
          recipient_user_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "notification_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_subscriptions: {
        Row: {
          channel: string
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          enabled: boolean
          event_type: string
          frequency: string
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          recipient_type: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          enabled?: boolean
          event_type: string
          frequency?: string
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          recipient_type: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          enabled?: boolean
          event_type?: string
          frequency?: string
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          recipient_type?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          channel: string
          created_at: string
          deleted_at: string | null
          event_type: string
          id: string
          is_active: boolean
          link_template: string | null
          locale: string
          subject_template: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          body_template: string
          channel: string
          created_at?: string
          deleted_at?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          link_template?: string | null
          locale?: string
          subject_template?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          body_template?: string
          channel?: string
          created_at?: string
          deleted_at?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          link_template?: string | null
          locale?: string
          subject_template?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_webhooks: {
        Row: {
          consecutive_failures: number
          created_at: string
          deleted_at: string | null
          event_types: string[]
          id: string
          is_active: boolean
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          deleted_at?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          secret: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          deleted_at?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          created_at: string
          current_value: number | null
          id: string
          last_reset_year: number | null
          padding: number | null
          prefix: string | null
          reset_annually: boolean | null
          scope: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: number | null
          id?: string
          last_reset_year?: number | null
          padding?: number | null
          prefix?: string | null
          reset_annually?: boolean | null
          scope: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: number | null
          id?: string
          last_reset_year?: number | null
          padding?: number | null
          prefix?: string | null
          reset_annually?: boolean | null
          scope?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequences_audit: {
        Row: {
          action: string | null
          created_at: string
          id: string
          new_value: number | null
          old_value: number | null
          performed_by: string | null
          scope: string | null
          sequence_id: string | null
          tenant_id: string
          updated_at: string
          user_role: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          performed_by?: string | null
          scope?: string | null
          sequence_id?: string | null
          tenant_id: string
          updated_at?: string
          user_role?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          performed_by?: string | null
          scope?: string | null
          sequence_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "number_sequences_audit_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "number_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "number_sequences_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklist_items: {
        Row: {
          assigned_to_role: string | null
          checklist_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_required: boolean | null
          sort_order: number | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_role?: string | null
          checklist_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_role?: string | null
          checklist_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklists: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          for_position_id: string | null
          id: string
          is_default: boolean | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          for_position_id?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          for_position_id?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklists_for_position_id_fkey"
            columns: ["for_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: string | null
          id: string
          steps_completed: string[] | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          id?: string
          steps_completed?: string[] | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          id?: string
          steps_completed?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          checklist_item_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          employee_id: string
          id: string
          status: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          checklist_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          employee_id: string
          id?: string
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          checklist_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          employee_id?: string
          id?: string
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          invoice_id: string
          payment_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id: string
          payment_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_disbursements: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          disbursement_date: string | null
          disbursement_number: string | null
          id: string
          notes: string | null
          payee_name: string | null
          payee_type: string | null
          reference: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          disbursement_date?: string | null
          disbursement_number?: string | null
          id?: string
          notes?: string | null
          payee_name?: string | null
          payee_type?: string | null
          reference?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          disbursement_date?: string | null
          disbursement_number?: string | null
          id?: string
          notes?: string | null
          payee_name?: string | null
          payee_type?: string | null
          reference?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_disbursements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_disbursements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          payment_id: string | null
          receipt_date: string | null
          receipt_number: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          payment_id?: string | null
          receipt_date?: string | null
          receipt_number?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          payment_id?: string | null
          receipt_date?: string | null
          receipt_number?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_base: number | null
          bank_account_id: string | null
          case_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_id: string | null
          notes: string | null
          payment_date: string | null
          payment_method_id: string | null
          payment_number: string | null
          rate_source: string
          reference: string | null
          status: string | null
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          amount_base?: number | null
          bank_account_id?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          payment_number?: string | null
          rate_source?: string
          reference?: string | null
          status?: string | null
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_base?: number | null
          bank_account_id?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          payment_number?: string | null
          rate_source?: string
          reference?: string | null
          status?: string | null
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "master_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_adjustments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          effective_date: string | null
          employee_id: string
          id: string
          is_deduction: boolean
          period_id: string | null
          status: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          effective_date?: string | null
          employee_id: string
          id?: string
          is_deduction?: boolean
          period_id?: string | null
          status?: string | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          effective_date?: string | null
          employee_id?: string
          id?: string
          is_deduction?: boolean
          period_id?: string | null
          status?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_bank_files: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_format: string | null
          file_name: string
          file_url: string | null
          generated_by: string | null
          id: string
          period_id: string
          record_count: number | null
          status: string | null
          tenant_id: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_format?: string | null
          file_name: string
          file_url?: string | null
          generated_by?: string | null
          id?: string
          period_id: string
          record_count?: number | null
          status?: string | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_format?: string | null
          file_name?: string
          file_url?: string | null
          generated_by?: string | null
          id?: string
          period_id?: string
          record_count?: number | null
          status?: string | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_bank_files_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_bank_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deleted_at: string | null
          employee_count: number | null
          end_date: string
          id: string
          paid_at: string | null
          paid_by: string | null
          pay_date: string | null
          payment_date: string | null
          period_name: string
          period_type: string | null
          processed_at: string | null
          processed_by: string | null
          start_date: string
          status: string | null
          tenant_id: string
          total_deductions: number | null
          total_earnings: number | null
          total_gross: number | null
          total_net: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_count?: number | null
          end_date: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          pay_date?: string | null
          payment_date?: string | null
          period_name: string
          period_type?: string | null
          processed_at?: string | null
          processed_by?: string | null
          start_date: string
          status?: string | null
          tenant_id: string
          total_deductions?: number | null
          total_earnings?: number | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_count?: number | null
          end_date?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          pay_date?: string | null
          payment_date?: string | null
          period_name?: string
          period_type?: string | null
          processed_at?: string | null
          processed_by?: string | null
          start_date?: string
          status?: string | null
          tenant_id?: string
          total_deductions?: number | null
          total_earnings?: number | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_record_items: {
        Row: {
          amount: number
          component_id: string | null
          component_name: string
          component_type: string
          created_at: string
          deleted_at: string | null
          id: string
          is_taxable: boolean | null
          record_id: string
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          component_id?: string | null
          component_name: string
          component_type: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_taxable?: boolean | null
          record_id: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          component_id?: string | null
          component_name?: string
          component_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_taxable?: boolean | null
          record_id?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_record_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_record_items_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_record_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          basic_salary: number
          created_at: string
          deleted_at: string | null
          employee_id: string
          hours_worked: number | null
          id: string
          net_salary: number | null
          notes: string | null
          overtime_amount: number | null
          overtime_hours: number | null
          period_id: string
          status: string | null
          tenant_id: string
          total_deductions: number | null
          total_earnings: number | null
          updated_at: string
          working_days: number | null
        }
        Insert: {
          basic_salary: number
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          hours_worked?: number | null
          id?: string
          net_salary?: number | null
          notes?: string | null
          overtime_amount?: number | null
          overtime_hours?: number | null
          period_id: string
          status?: string | null
          tenant_id: string
          total_deductions?: number | null
          total_earnings?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Update: {
          basic_salary?: number
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          hours_worked?: number | null
          id?: string
          net_salary?: number | null
          notes?: string | null
          overtime_amount?: number | null
          overtime_hours?: number | null
          period_id?: string
          status?: string | null
          tenant_id?: string
          total_deductions?: number | null
          total_earnings?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          created_at: string
          currency: string | null
          deleted_at: string | null
          id: string
          overtime_rate: number | null
          pay_day: number | null
          pay_frequency: string | null
          settings: Json | null
          social_security_rate: number
          tax_calculation_method: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          id?: string
          overtime_rate?: number | null
          pay_day?: number | null
          pay_frequency?: string | null
          settings?: Json | null
          social_security_rate?: number
          tax_calculation_method?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          id?: string
          overtime_rate?: number | null
          pay_day?: number | null
          pay_frequency?: string | null
          settings?: Json | null
          social_security_rate?: number
          tax_calculation_method?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_generation_logs: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_id: string | null
          document_type: string
          error_message: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          generated_by: string | null
          generation_time_ms: number | null
          id: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_id?: string | null
          document_type: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          generated_by?: string | null
          generation_time_ms?: number | null
          id?: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_id?: string | null
          document_type?: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          generated_by?: string | null
          generation_time_ms?: number | null
          id?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_generation_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          acknowledged_at: string | null
          comments: string | null
          created_at: string
          deleted_at: string | null
          employee_id: string
          goals: string | null
          id: string
          improvements: string | null
          overall_rating: number | null
          ratings: Json | null
          review_date: string | null
          review_period: string | null
          reviewer_id: string | null
          status: string | null
          strengths: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          comments?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          goals?: string | null
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          ratings?: Json | null
          review_date?: string | null
          review_period?: string | null
          reviewer_id?: string | null
          status?: string | null
          strengths?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          comments?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          goals?: string | null
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          ratings?: Json | null
          review_date?: string | null
          review_period?: string | null
          reviewer_id?: string | null
          status?: string | null
          strengths?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_reviewer_profile_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          deleted_at: string | null
          display_order: number | null
          feature_key: string
          feature_name: string
          feature_name_ar: string | null
          id: string
          is_enabled: boolean | null
          is_highlighted: boolean | null
          limit_type: string | null
          limit_value: number | null
          plan_id: string
        }
        Insert: {
          deleted_at?: string | null
          display_order?: number | null
          feature_key: string
          feature_name: string
          feature_name_ar?: string | null
          id?: string
          is_enabled?: boolean | null
          is_highlighted?: boolean | null
          limit_type?: string | null
          limit_value?: number | null
          plan_id: string
        }
        Update: {
          deleted_at?: string | null
          display_order?: number | null
          feature_key?: string
          feature_name?: string
          feature_name_ar?: string | null
          id?: string
          is_enabled?: boolean | null
          is_highlighted?: boolean | null
          limit_type?: string | null
          limit_value?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          mfa_enabled: boolean
          permissions: Json
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_enabled?: boolean
          permissions?: Json
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_enabled?: boolean
          permissions?: Json
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          announcement_type: string | null
          content_ar: string | null
          content_en: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          is_dismissible: boolean | null
          show_as_banner: boolean | null
          show_in_app: boolean
          start_date: string | null
          target_audience: string | null
          title_ar: string | null
          title_en: string
          updated_at: string
        }
        Insert: {
          announcement_type?: string | null
          content_ar?: string | null
          content_en: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_dismissible?: boolean | null
          show_as_banner?: boolean | null
          show_in_app?: boolean
          start_date?: string | null
          target_audience?: string | null
          title_ar?: string | null
          title_en: string
          updated_at?: string
        }
        Update: {
          announcement_type?: string | null
          content_ar?: string | null
          content_en?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_dismissible?: boolean | null
          show_as_banner?: boolean | null
          show_in_app?: boolean
          start_date?: string | null
          target_audience?: string | null
          title_ar?: string | null
          title_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json
          id: string
          ip_address: unknown
          performed_at: string
          request_id: string | null
          resource_id: string | null
          resource_type: string
          tenant_id: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          performed_at?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          tenant_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          performed_at?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_metrics: {
        Row: {
          active_tenants: number | null
          active_users: number | null
          arr: number | null
          churned_tenants: number | null
          created_at: string
          id: string
          metric_date: string
          mrr: number | null
          new_tenants: number | null
          open_tickets: number | null
          paying_tenants: number | null
          total_tenants: number | null
          total_users: number | null
          trial_tenants: number | null
        }
        Insert: {
          active_tenants?: number | null
          active_users?: number | null
          arr?: number | null
          churned_tenants?: number | null
          created_at?: string
          id?: string
          metric_date: string
          mrr?: number | null
          new_tenants?: number | null
          open_tickets?: number | null
          paying_tenants?: number | null
          total_tenants?: number | null
          total_users?: number | null
          trial_tenants?: number | null
        }
        Update: {
          active_tenants?: number | null
          active_users?: number | null
          arr?: number | null
          churned_tenants?: number | null
          created_at?: string
          id?: string
          metric_date?: string
          mrr?: number | null
          new_tenants?: number | null
          open_tickets?: number | null
          paying_tenants?: number | null
          total_tenants?: number | null
          total_users?: number | null
          trial_tenants?: number | null
        }
        Relationships: []
      }
      portal_link_history: {
        Row: {
          action: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          id: string
          notes: string | null
          performed_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_link_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_link_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_link_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          created_at: string
          deleted_at: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          case_access_level: string | null
          created_at: string
          deleted_at: string | null
          email: string
          email_verified_at: string | null
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          mfa_enabled: boolean | null
          mfa_enrolled_at: string | null
          password_reset_required: boolean | null
          permissions: Json
          phone: string | null
          role: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          case_access_level?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          email_verified_at?: string | null
          full_name: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_enabled?: boolean | null
          mfa_enrolled_at?: string | null
          password_reset_required?: boolean | null
          permissions?: Json
          phone?: string | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          case_access_level?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          email_verified_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_enabled?: boolean | null
          mfa_enrolled_at?: string | null
          password_reset_required?: boolean | null
          permissions?: Json
          phone?: string | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          discount: number | null
          id: string
          product_id: string | null
          purchase_order_id: string
          quantity: number
          received_quantity: number | null
          sort_order: number | null
          stock_item_id: string | null
          tax_amount: number | null
          tax_rate: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          discount?: number | null
          id?: string
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          received_quantity?: number | null
          sort_order?: number | null
          stock_item_id?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount?: number | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number | null
          sort_order?: number | null
          stock_item_id?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id?: string
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          discount_amount: number | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string | null
          po_number: string | null
          received_at: string | null
          received_by: string | null
          shipping_address: string | null
          shipping_cost: number | null
          status_id: string | null
          subtotal: number | null
          supplier_id: string
          tax_amount: number | null
          tenant_id: string
          terms: string | null
          total_amount: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          po_number?: string | null
          received_at?: string | null
          received_by?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          status_id?: string | null
          subtotal?: number | null
          supplier_id: string
          tax_amount?: number | null
          tenant_id: string
          terms?: string | null
          total_amount?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          po_number?: string | null
          received_at?: string | null
          received_by?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          status_id?: string | null
          subtotal?: number | null
          supplier_id?: string
          tax_amount?: number | null
          tenant_id?: string
          terms?: string | null
          total_amount?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "master_purchase_order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_history: {
        Row: {
          action: string
          created_at: string
          deleted_at: string | null
          details: string | null
          id: string
          performed_by: string | null
          quote_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          id?: string
          performed_by?: string | null
          quote_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          id?: string
          performed_by?: string | null
          quote_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_history_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          discount: number | null
          id: string
          quantity: number | null
          quote_id: string
          sort_order: number | null
          tax_amount: number | null
          tax_rate: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          discount?: number | null
          id?: string
          quantity?: number | null
          quote_id: string
          sort_order?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount?: number | null
          id?: string
          quantity?: number | null
          quote_id?: string
          sort_order?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id?: string
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string | null
          case_id: string | null
          client_reference: string | null
          company_id: string | null
          converted_to_invoice_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          deleted_at: string | null
          discount_amount: number | null
          discount_type: string
          exchange_rate: number
          id: string
          notes: string | null
          quote_date: string | null
          quote_number: string | null
          quote_type: string | null
          rate_source: string
          rejected_at: string | null
          rejection_reason: string | null
          status: string | null
          status_id: string | null
          subtotal: number | null
          subtotal_base: number | null
          tax_amount: number | null
          tax_amount_base: number | null
          tax_rate: number | null
          template_version_id: string | null
          tenant_id: string
          terms: string | null
          title: string | null
          total_amount: number | null
          total_amount_base: number | null
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          case_id?: string | null
          client_reference?: string | null
          company_id?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          discount_type?: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          quote_date?: string | null
          quote_number?: string | null
          quote_type?: string | null
          rate_source?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string | null
          status_id?: string | null
          subtotal?: number | null
          subtotal_base?: number | null
          tax_amount?: number | null
          tax_amount_base?: number | null
          tax_rate?: number | null
          template_version_id?: string | null
          tenant_id: string
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          total_amount_base?: number | null
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          case_id?: string | null
          client_reference?: string | null
          company_id?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          discount_type?: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          quote_date?: string | null
          quote_number?: string | null
          quote_type?: string | null
          rate_source?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string | null
          status_id?: string | null
          subtotal?: number | null
          subtotal_base?: number | null
          tax_amount?: number | null
          tax_amount_base?: number | null
          tax_rate?: number | null
          template_version_id?: string | null
          tenant_id?: string
          terms?: string | null
          title?: string | null
          total_amount?: number | null
          total_amount_base?: number | null
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_to_invoice_id_fkey"
            columns: ["converted_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "master_quote_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          id: string
          key: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      receipt_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          invoice_id: string
          receipt_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id: string
          receipt_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          receipt_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_allocations_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          amount_base: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          notes: string | null
          payment_method: string | null
          rate_source: string
          receipt_date: string | null
          receipt_number: string | null
          reference: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_base?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          rate_source?: string
          receipt_date?: string | null
          receipt_number?: string | null
          reference?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_base?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          rate_source?: string
          receipt_date?: string | null
          receipt_number?: string | null
          reference?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_matches: {
        Row: {
          bank_transaction_id: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          match_type: string | null
          matched_record_id: string | null
          matched_record_type: string | null
          session_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bank_transaction_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          match_type?: string | null
          matched_record_id?: string | null
          matched_record_type?: string | null
          session_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bank_transaction_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          match_type?: string | null
          matched_record_id?: string | null
          matched_record_type?: string | null
          session_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_matches_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bank_reconciliation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_manifest_acceptances: {
        Row: {
          acceptance_method: string
          accepted_at: string
          accepted_by: string | null
          accepted_by_name: string
          accepted_by_type: string
          created_at: string
          deleted_at: string | null
          id: string
          manifest_id: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acceptance_method?: string
          accepted_at?: string
          accepted_by?: string | null
          accepted_by_name: string
          accepted_by_type: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          manifest_id: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acceptance_method?: string
          accepted_at?: string
          accepted_by?: string | null
          accepted_by_name?: string
          accepted_by_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          manifest_id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_manifest_acceptances_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "recovery_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_manifest_acceptances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_manifest_items: {
        Row: {
          checksum: string | null
          created_at: string
          deleted_at: string | null
          device_id: string | null
          id: string
          item_type: string
          manifest_id: string
          modified_at: string | null
          name: string
          path: string
          size_bytes: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          item_type?: string
          manifest_id: string
          modified_at?: string | null
          name: string
          path: string
          size_bytes?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          item_type?: string
          manifest_id?: string
          modified_at?: string | null
          name?: string
          path?: string
          size_bytes?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_manifest_items_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_manifest_items_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "recovery_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_manifest_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_manifests: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          finalized_at: string | null
          id: string
          source: string
          status: string
          tenant_id: string
          title: string
          tool_name: string | null
          total_bytes: number
          total_files: number
          total_folders: number
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finalized_at?: string | null
          id?: string
          source?: string
          status?: string
          tenant_id: string
          title: string
          tool_name?: string | null
          total_bytes?: number
          total_files?: number
          total_folders?: number
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finalized_at?: string | null
          id?: string
          source?: string
          status?: string
          tenant_id?: string
          title?: string
          tool_name?: string | null
          total_bytes?: number
          total_files?: number
          total_folders?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_manifests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_manifests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_candidates: {
        Row: {
          applied_date: string | null
          cover_letter: string | null
          created_at: string
          current_stage: string | null
          deleted_at: string | null
          email: string | null
          id: string
          interview_date: string | null
          job_id: string
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          resume_url: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          applied_date?: string | null
          cover_letter?: string | null
          created_at?: string
          current_stage?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          interview_date?: string | null
          job_id: string
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          resume_url?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          applied_date?: string | null
          cover_letter?: string | null
          created_at?: string
          current_stage?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          interview_date?: string | null
          job_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          resume_url?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "recruitment_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_jobs: {
        Row: {
          closes_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          description: string | null
          employment_type: string | null
          filled: number | null
          id: string
          location: string | null
          openings: number | null
          position_id: string | null
          posted_at: string | null
          requirements: string | null
          salary_range: string | null
          status: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          employment_type?: string | null
          filled?: number | null
          id?: string
          location?: string | null
          openings?: number | null
          position_id?: string | null
          posted_at?: string | null
          requirements?: string | null
          salary_range?: string | null
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          employment_type?: string | null
          filled?: number | null
          id?: string
          location?: string | null
          openings?: number | null
          position_id?: string | null
          posted_at?: string | null
          requirements?: string | null
          salary_range?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_jobs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_jobs_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_section_library: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          default_content: string | null
          default_content_template: string | null
          deleted_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_hidden_in_editor: boolean | null
          is_system: boolean | null
          name: string
          section_description: string | null
          section_description_ar: string | null
          section_key: string | null
          section_name: string | null
          section_name_ar: string | null
          section_type: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          default_content?: string | null
          default_content_template?: string | null
          deleted_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_hidden_in_editor?: boolean | null
          is_system?: boolean | null
          name: string
          section_description?: string | null
          section_description_ar?: string | null
          section_key?: string | null
          section_name?: string | null
          section_name_ar?: string | null
          section_type?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          default_content?: string | null
          default_content_template?: string | null
          deleted_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_hidden_in_editor?: boolean | null
          is_system?: boolean | null
          name?: string
          section_description?: string | null
          section_description_ar?: string | null
          section_key?: string | null
          section_name?: string | null
          section_name_ar?: string | null
          section_type?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_section_library_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_section_presets: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          section_library_id: string | null
          tenant_id: string | null
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          section_library_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          section_library_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_section_presets_section_library_id_fkey"
            columns: ["section_library_id"]
            isOneToOne: false
            referencedRelation: "report_section_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_section_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_template_section_mappings: {
        Row: {
          created_at: string
          id: string
          is_required: boolean | null
          section_id: string | null
          sort_order: number | null
          template_id: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          section_id?: string | null
          sort_order?: number | null
          template_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          section_id?: string | null
          sort_order?: number | null
          template_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_template_section_mappings_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "report_section_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_template_section_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "master_case_report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_template_section_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_clone_drives: {
        Row: {
          assigned_to_case_id: string | null
          brand_id: string | null
          capacity_id: string | null
          condition: string | null
          created_at: string
          deleted_at: string | null
          id: string
          interface_id: string | null
          label: string
          location: string | null
          notes: string | null
          serial_number: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to_case_id?: string | null
          brand_id?: string | null
          capacity_id?: string | null
          condition?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          interface_id?: string | null
          label: string
          location?: string | null
          notes?: string | null
          serial_number?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to_case_id?: string | null
          brand_id?: string | null
          capacity_id?: string | null
          condition?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          interface_id?: string | null
          label?: string
          location?: string | null
          notes?: string | null
          serial_number?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_clone_drives_assigned_to_case_id_fkey"
            columns: ["assigned_to_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_clone_drives_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_clone_drives_capacity_id_fkey"
            columns: ["capacity_id"]
            isOneToOne: false
            referencedRelation: "catalog_device_capacities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_clone_drives_interface_id_fkey"
            columns: ["interface_id"]
            isOneToOne: false
            referencedRelation: "catalog_interfaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_clone_drives_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_module_permissions: {
        Row: {
          can_access: boolean | null
          created_at: string
          id: string
          module_id: string
          role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          can_access?: boolean | null
          created_at?: string
          id?: string
          module_id: string
          role: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          can_access?: boolean | null
          created_at?: string
          id?: string
          module_id?: string
          role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_module_permissions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "master_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_module_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_components: {
        Row: {
          calculation_type: string | null
          code: string | null
          component_type: string | null
          created_at: string
          default_amount: number | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          is_mandatory: boolean | null
          is_recurring: boolean
          is_taxable: boolean | null
          name: string
          name_ar: string | null
          percentage: number | null
          sort_order: number | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          calculation_type?: string | null
          code?: string | null
          component_type?: string | null
          created_at?: string
          default_amount?: number | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          is_recurring?: boolean
          is_taxable?: boolean | null
          name: string
          name_ar?: string | null
          percentage?: number | null
          sort_order?: number | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          calculation_type?: string | null
          code?: string | null
          component_type?: string | null
          created_at?: string
          default_amount?: number | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          is_recurring?: boolean
          is_taxable?: boolean | null
          name?: string
          name_ar?: string | null
          percentage?: number | null
          sort_order?: number | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_otps: {
        Row: {
          attempts: number | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          otp_code: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          otp_code: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          otp_code?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      stock_adjustment_session_items: {
        Row: {
          counted_quantity: number | null
          created_at: string
          expected_quantity: number | null
          id: string
          item_id: string
          notes: string | null
          session_id: string
          tenant_id: string
          updated_at: string
          variance: number | null
        }
        Insert: {
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number | null
          id?: string
          item_id: string
          notes?: string | null
          session_id: string
          tenant_id: string
          updated_at?: string
          variance?: number | null
        }
        Update: {
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number | null
          id?: string
          item_id?: string
          notes?: string | null
          session_id?: string
          tenant_id?: string
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_session_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_session_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_session_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment_sessions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          reason: string | null
          session_number: string | null
          started_by: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          session_number?: string | null
          started_by?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          session_number?: string | null
          started_by?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjusted_by: string | null
          adjustment_type: string
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          notes: string | null
          quantity: number
          reason: string | null
          reference: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_type: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          reason?: string | null
          reference?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          adjusted_by?: string | null
          adjustment_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          reason?: string | null
          reference?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          is_resolved: boolean | null
          item_id: string
          message: string | null
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_resolved?: boolean | null
          item_id: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_resolved?: boolean | null
          item_id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "stock_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          barcode: string | null
          brand: string | null
          capacity: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          current_quantity: number | null
          deleted_at: string | null
          description: string | null
          dimensions: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean
          is_saleable: boolean | null
          item_type: string | null
          location: string | null
          location_id: string | null
          minimum_quantity: number | null
          model: string | null
          name: string
          notes: string | null
          photos: string[] | null
          quantity_available: number | null
          quantity_on_hand: number | null
          quantity_reserved: number | null
          reorder_level: number | null
          reorder_quantity: number | null
          selling_price: number | null
          sku: string | null
          specifications: Json | null
          supplier_id: string | null
          tax_inclusive: boolean
          tax_rate: number | null
          tenant_id: string
          unit: string | null
          unit_of_measure: string | null
          updated_at: string
          updated_by: string | null
          warranty_months: number | null
          weight: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          current_quantity?: number | null
          deleted_at?: string | null
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean
          is_saleable?: boolean | null
          item_type?: string | null
          location?: string | null
          location_id?: string | null
          minimum_quantity?: number | null
          model?: string | null
          name: string
          notes?: string | null
          photos?: string[] | null
          quantity_available?: number | null
          quantity_on_hand?: number | null
          quantity_reserved?: number | null
          reorder_level?: number | null
          reorder_quantity?: number | null
          selling_price?: number | null
          sku?: string | null
          specifications?: Json | null
          supplier_id?: string | null
          tax_inclusive?: boolean
          tax_rate?: number | null
          tenant_id: string
          unit?: string | null
          unit_of_measure?: string | null
          updated_at?: string
          updated_by?: string | null
          warranty_months?: number | null
          weight?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          current_quantity?: number | null
          deleted_at?: string | null
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean
          is_saleable?: boolean | null
          item_type?: string | null
          location?: string | null
          location_id?: string | null
          minimum_quantity?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          photos?: string[] | null
          quantity_available?: number | null
          quantity_on_hand?: number | null
          quantity_reserved?: number | null
          reorder_level?: number | null
          reorder_quantity?: number | null
          selling_price?: number | null
          sku?: string | null
          specifications?: Json | null
          supplier_id?: string | null
          tax_inclusive?: boolean
          tax_rate?: number | null
          tenant_id?: string
          unit?: string | null
          unit_of_measure?: string | null
          updated_at?: string
          updated_by?: string | null
          warranty_months?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "stock_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          deleted_at: string | null
          from_location_id: string | null
          id: string
          item_id: string
          movement_type: string
          notes: string | null
          performed_by: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          to_location_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          from_location_id?: string | null
          id?: string
          item_id: string
          movement_type: string
          notes?: string | null
          performed_by?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          to_location_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          from_location_id?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          notes?: string | null
          performed_by?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          to_location_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_price_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          item_id: string
          new_cost_price: number | null
          new_selling_price: number | null
          old_cost_price: number | null
          old_selling_price: number | null
          reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          item_id: string
          new_cost_price?: number | null
          new_selling_price?: number | null
          old_cost_price?: number | null
          old_selling_price?: number | null
          reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          item_id?: string
          new_cost_price?: number | null
          new_selling_price?: number | null
          old_cost_price?: number | null
          old_selling_price?: number | null
          reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_price_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sale_items: {
        Row: {
          created_at: string
          discount: number | null
          id: string
          invoice_line_item_id: string | null
          item_id: string
          quantity: number
          sale_id: string
          tax_amount: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount?: number | null
          id?: string
          invoice_line_item_id?: string | null
          item_id: string
          quantity: number
          sale_id: string
          tax_amount?: number | null
          tenant_id: string
          total: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount?: number | null
          id?: string
          invoice_line_item_id?: string | null
          item_id?: string
          quantity?: number
          sale_id?: string
          tax_amount?: number | null
          tenant_id?: string
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sale_items_invoice_line_item_id_fkey"
            columns: ["invoice_line_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sale_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "stock_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sale_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sales: {
        Row: {
          case_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          discount_amount: number | null
          id: string
          invoice_id: string | null
          notes: string | null
          payment_method_id: string | null
          payment_status: string
          sale_date: string | null
          sale_number: string | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_method_id?: string | null
          payment_status?: string
          sale_date?: string | null
          sale_number?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_method_id?: string | null
          payment_status?: string
          sale_date?: string | null
          sale_number?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sales_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sales_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sales_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "master_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_serial_numbers: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          location_id: string | null
          notes: string | null
          serial_number: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id: string
          location_id?: string | null
          notes?: string | null
          serial_number: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string
          location_id?: string | null
          notes?: string | null
          serial_number?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_serial_numbers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_serial_numbers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          performed_by: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          total_cost: number | null
          transaction_type: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          performed_by?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          total_cost?: number | null
          transaction_type: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          performed_by?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          total_cost?: number | null
          transaction_type?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          api_calls_per_hour: number | null
          code: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          email_sends_per_day: number | null
          features: Json
          id: string
          is_active: boolean
          is_public: boolean
          limits: Json
          name: string
          paypal_plan_monthly_id: string | null
          paypal_plan_yearly_id: string | null
          paypal_product_id: string | null
          pdf_generations_per_hour: number | null
          price_monthly: number
          price_yearly: number
          slug: string
          sort_order: number
          storage_limit_mb: number | null
          trial_days: number | null
          updated_at: string
        }
        Insert: {
          api_calls_per_hour?: number | null
          code?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          email_sends_per_day?: number | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          limits?: Json
          name: string
          paypal_plan_monthly_id?: string | null
          paypal_plan_yearly_id?: string | null
          paypal_product_id?: string | null
          pdf_generations_per_hour?: number | null
          price_monthly?: number
          price_yearly?: number
          slug: string
          sort_order?: number
          storage_limit_mb?: number | null
          trial_days?: number | null
          updated_at?: string
        }
        Update: {
          api_calls_per_hour?: number | null
          code?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          email_sends_per_day?: number | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          limits?: Json
          name?: string
          paypal_plan_monthly_id?: string | null
          paypal_plan_yearly_id?: string | null
          paypal_product_id?: string | null
          pdf_generations_per_hour?: number | null
          price_monthly?: number
          price_yearly?: number
          slug?: string
          sort_order?: number
          storage_limit_mb?: number | null
          trial_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      supplier_audit_trail: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          performed_by: string | null
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string | null
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string | null
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_audit_trail_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_audit_trail_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_communications: {
        Row: {
          content: string | null
          created_at: string
          deleted_at: string | null
          direction: string | null
          id: string
          sent_by: string | null
          subject: string | null
          supplier_id: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          id?: string
          sent_by?: string | null
          subject?: string | null
          supplier_id: string
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          id?: string
          sent_by?: string | null
          subject?: string | null
          supplier_id?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_communications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          mobile: string | null
          name: string
          notes: string | null
          phone: string | null
          supplier_id: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          mobile?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          supplier_id: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          mobile?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          supplier_id?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          supplier_id: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          supplier_id: string
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_performance_metrics: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          metric_type: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          supplier_id: string
          tenant_id: string
          updated_at: string
          value: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metric_type: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          supplier_id: string
          tenant_id: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metric_type?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_performance_metrics_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_performance_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          created_at: string
          currency: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          lead_time_days: number | null
          min_order_quantity: number | null
          name: string
          sku: string | null
          supplier_id: string
          tenant_id: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          lead_time_days?: number | null
          min_order_quantity?: number | null
          name: string
          sku?: string | null
          supplier_id: string
          tenant_id: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          lead_time_days?: number | null
          min_order_quantity?: number | null
          name?: string
          sku?: string | null
          supplier_id?: string
          tenant_id?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_branch: string | null
          bank_name: string | null
          category_id: string | null
          city_id: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          outstanding_balance: number | null
          payment_terms_id: string | null
          phone: string | null
          rating: number | null
          registration_number: string | null
          supplier_number: string | null
          tax_number: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          category_id?: string | null
          city_id?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          outstanding_balance?: number | null
          payment_terms_id?: string | null
          phone?: string | null
          rating?: number | null
          registration_number?: string | null
          supplier_number?: string | null
          tax_number?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          category_id?: string | null
          city_id?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          outstanding_balance?: number | null
          payment_terms_id?: string | null
          phone?: string | null
          rating?: number | null
          registration_number?: string | null
          supplier_number?: string | null
          tax_number?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "geo_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "geo_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_payment_terms_id_fkey"
            columns: ["payment_terms_id"]
            isOneToOne: false
            referencedRelation: "master_supplier_payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          attachments: Json | null
          created_at: string
          id: string
          is_internal_note: boolean | null
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          id?: string
          is_internal_note?: boolean | null
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          id?: string
          is_internal_note?: boolean | null
          message?: string
          sender_id?: string
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          closed_at: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          id: string
          priority: string | null
          resolution_notes: string | null
          resolved_at: string | null
          satisfaction_rating: number | null
          status: string | null
          subject: string
          tenant_id: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_rating?: number | null
          status?: string | null
          subject: string
          tenant_id: string
          ticket_number: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_rating?: number | null
          status?: string | null
          subject?: string
          tenant_id?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          category: string | null
          created_at: string
          deleted_at: string | null
          details: Json | null
          id: string
          ip_address: unknown
          level: string
          message: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          level?: string
          message: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          level?: string
          message?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_seed_status: {
        Row: {
          category: string
          created_at: string
          id: string
          is_seeded: boolean | null
          record_count: number | null
          seeded_at: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_seeded?: boolean | null
          record_count?: number | null
          seeded_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_seeded?: boolean | null
          record_count?: number | null
          seeded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      system_settings_internal: {
        Row: {
          created_at: string
          description: string | null
          is_secret: boolean
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_secret?: boolean
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_secret?: boolean
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          rate: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          rate: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          rate?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          template_id: string
          tenant_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          template_id: string
          tenant_id: string
          updated_at?: string
          version_number: number
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          template_id?: string
          tenant_id?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          template_type: string | null
          tenant_id: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          template_type?: string | null
          tenant_id: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          template_type?: string | null
          tenant_id?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_activity_log: {
        Row: {
          activity_details: Json | null
          activity_type: string
          created_at: string
          id: string
          ip_address: string | null
          tenant_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          activity_details?: Json | null
          activity_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          tenant_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          activity_details?: Json | null
          activity_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          tenant_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_currencies: {
        Row: {
          created_at: string
          currency_code: string
          deleted_at: string | null
          display_order: number
          id: string
          is_active: boolean
          is_base: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          deleted_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_currencies_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "master_currency_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenant_currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_health_metrics: {
        Row: {
          active_users_count: number | null
          cases_created_last_30d: number | null
          churn_risk: string | null
          created_at: string
          days_since_last_login: number | null
          engagement_level: string | null
          health_score: number | null
          id: string
          notes: string | null
          recorded_at: string | null
          revenue_last_30d: number | null
          support_tickets_open: number | null
          tenant_id: string
        }
        Insert: {
          active_users_count?: number | null
          cases_created_last_30d?: number | null
          churn_risk?: string | null
          created_at?: string
          days_since_last_login?: number | null
          engagement_level?: string | null
          health_score?: number | null
          id?: string
          notes?: string | null
          recorded_at?: string | null
          revenue_last_30d?: number | null
          support_tickets_open?: number | null
          tenant_id: string
        }
        Update: {
          active_users_count?: number | null
          cases_created_last_30d?: number | null
          churn_risk?: string | null
          created_at?: string
          days_since_last_login?: number | null
          engagement_level?: string | null
          health_score?: number | null
          id?: string
          notes?: string | null
          recorded_at?: string | null
          revenue_last_30d?: number | null
          support_tickets_open?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_health_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_impersonation_sessions: {
        Row: {
          actions_performed: Json
          admin_id: string
          ended_at: string | null
          id: string
          reason: string
          started_at: string
          tenant_id: string
        }
        Insert: {
          actions_performed?: Json
          admin_id: string
          ended_at?: string | null
          id?: string
          reason: string
          started_at?: string
          tenant_id: string
        }
        Update: {
          actions_performed?: Json
          admin_id?: string
          ended_at?: string | null
          id?: string
          reason?: string
          started_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_impersonation_sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_impersonation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_methods: {
        Row: {
          bank_last4: string | null
          bank_name: string | null
          billing_address: Json | null
          billing_email: string | null
          billing_name: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_funding: string | null
          card_last4: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          payment_method_id: string
          payment_provider: string | null
          paypal_account_id: string | null
          paypal_email: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          bank_last4?: string | null
          bank_name?: string | null
          billing_address?: Json | null
          billing_email?: string | null
          billing_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_funding?: string | null
          card_last4?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          payment_method_id: string
          payment_provider?: string | null
          paypal_account_id?: string | null
          paypal_email?: string | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          bank_last4?: string | null
          bank_name?: string | null
          billing_address?: Json | null
          billing_email?: string | null
          billing_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_funding?: string | null
          card_last4?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          payment_method_id?: string
          payment_provider?: string | null
          paypal_account_id?: string | null
          paypal_email?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_rate_limits: {
        Row: {
          created_at: string | null
          current_count: number | null
          deleted_at: string | null
          id: string
          max_requests: number
          resource_type: string
          tenant_id: string
          updated_at: string | null
          window_seconds: number
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          current_count?: number | null
          deleted_at?: string | null
          id?: string
          max_requests: number
          resource_type: string
          tenant_id: string
          updated_at?: string | null
          window_seconds?: number
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          current_count?: number | null
          deleted_at?: string | null
          id?: string
          max_requests?: number
          resource_type?: string
          tenant_id?: string
          updated_at?: string | null
          window_seconds?: number
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_rate_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_sla_policies: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          phase: string
          priority: string
          target_hours: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          phase: string
          priority: string
          target_hours: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          phase?: string
          priority?: string
          target_hours?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_sla_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          billing_address: Json | null
          billing_email: string | null
          billing_interval: string
          billing_name: string | null
          cancel_at_period_end: boolean | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          deleted_at: string | null
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          metadata: Json | null
          next_billing_date: string | null
          paypal_customer_email: string | null
          paypal_payer_id: string | null
          paypal_plan_id: string | null
          paypal_subscription_id: string | null
          plan_id: string
          status: string
          tenant_id: string
          trial_end: string | null
          trial_start: string | null
          trial_used: boolean | null
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          billing_email?: string | null
          billing_interval?: string
          billing_name?: string | null
          cancel_at_period_end?: boolean | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          deleted_at?: string | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          next_billing_date?: string | null
          paypal_customer_email?: string | null
          paypal_payer_id?: string | null
          paypal_plan_id?: string | null
          paypal_subscription_id?: string | null
          plan_id: string
          status?: string
          tenant_id: string
          trial_end?: string | null
          trial_start?: string | null
          trial_used?: boolean | null
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          billing_email?: string | null
          billing_interval?: string
          billing_name?: string | null
          cancel_at_period_end?: boolean | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          deleted_at?: string | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          next_billing_date?: string | null
          paypal_customer_email?: string | null
          paypal_payer_id?: string | null
          paypal_plan_id?: string | null
          paypal_subscription_id?: string | null
          plan_id?: string
          status?: string
          tenant_id?: string
          trial_end?: string | null
          trial_start?: string | null
          trial_used?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          base_currency_code: string
          country_id: string | null
          created_at: string
          currency_code: string
          currency_symbol: string
          current_period_end: string | null
          current_period_start: string | null
          date_format: string
          decimal_places: number
          default_tax_rate: number
          deleted_at: string | null
          domain: string | null
          feature_flags: Json
          features: Json
          fiscal_year_start: string
          id: string
          limits: Json
          locale_code: string
          metadata: Json
          name: string
          paypal_customer_id: string | null
          paypal_subscription_id: string | null
          plan_id: string | null
          require_mfa_for_admins: boolean
          settings: Json
          slug: string
          status: string
          subscription_status: string | null
          tax_label: string
          tax_number: string | null
          tax_number_label: string
          tax_system: string
          theme: string
          timezone: string
          trial_ends_at: string | null
          ui_language: string
          updated_at: string
        }
        Insert: {
          base_currency_code: string
          country_id?: string | null
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          current_period_end?: string | null
          current_period_start?: string | null
          date_format?: string
          decimal_places?: number
          default_tax_rate?: number
          deleted_at?: string | null
          domain?: string | null
          feature_flags?: Json
          features?: Json
          fiscal_year_start?: string
          id?: string
          limits?: Json
          locale_code?: string
          metadata?: Json
          name: string
          paypal_customer_id?: string | null
          paypal_subscription_id?: string | null
          plan_id?: string | null
          require_mfa_for_admins?: boolean
          settings?: Json
          slug: string
          status?: string
          subscription_status?: string | null
          tax_label?: string
          tax_number?: string | null
          tax_number_label?: string
          tax_system?: string
          theme?: string
          timezone?: string
          trial_ends_at?: string | null
          ui_language?: string
          updated_at?: string
        }
        Update: {
          base_currency_code?: string
          country_id?: string | null
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          current_period_end?: string | null
          current_period_start?: string | null
          date_format?: string
          decimal_places?: number
          default_tax_rate?: number
          deleted_at?: string | null
          domain?: string | null
          feature_flags?: Json
          features?: Json
          fiscal_year_start?: string
          id?: string
          limits?: Json
          locale_code?: string
          metadata?: Json
          name?: string
          paypal_customer_id?: string | null
          paypal_subscription_id?: string | null
          plan_id?: string | null
          require_mfa_for_admins?: boolean
          settings?: Json
          slug?: string
          status?: string
          subscription_status?: string | null
          tax_label?: string
          tax_number?: string | null
          tax_number_label?: string
          tax_system?: string
          theme?: string
          timezone?: string
          trial_ends_at?: string | null
          ui_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_base_currency_fk"
            columns: ["base_currency_code"]
            isOneToOne: false
            referencedRelation: "master_currency_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenants_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "geo_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          case_id: string | null
          created_at: string
          date: string
          deleted_at: string | null
          description: string | null
          employee_id: string
          hours: number
          id: string
          is_billable: boolean | null
          notes: string | null
          project_name: string | null
          status: string | null
          submitted_date: string | null
          task_description: string | null
          tenant_id: string
          updated_at: string
          work_date: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          case_id?: string | null
          created_at?: string
          date: string
          deleted_at?: string | null
          description?: string | null
          employee_id: string
          hours: number
          id?: string
          is_billable?: boolean | null
          notes?: string | null
          project_name?: string | null
          status?: string | null
          submitted_date?: string | null
          task_description?: string | null
          tenant_id: string
          updated_at?: string
          work_date?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          case_id?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          description?: string | null
          employee_id?: string
          hours?: number
          id?: string
          is_billable?: boolean | null
          notes?: string | null
          project_name?: string | null
          status?: string | null
          submitted_date?: string | null
          task_description?: string | null
          tenant_id?: string
          updated_at?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          created_at: string
          deleted_at: string | null
          delta: number | null
          id: string
          last_value: number | null
          metric_name: string
          paypal_usage_record_id: string | null
          period_end: string
          period_start: string
          quantity: number
          reported_to_paypal: boolean | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          delta?: number | null
          id?: string
          last_value?: number | null
          metric_name: string
          paypal_usage_record_id?: string | null
          period_end: string
          period_start: string
          quantity?: number
          reported_to_paypal?: boolean | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          delta?: number | null
          id?: string
          last_value?: number | null
          metric_name?: string
          paypal_usage_record_id?: string | null
          period_end?: string
          period_start?: string
          quantity?: number
          reported_to_paypal?: boolean | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_snapshots: {
        Row: {
          active_users: number | null
          api_calls_today: number | null
          cases_this_month: number | null
          created_at: string
          deleted_at: string | null
          id: string
          snapshot_date: string
          snapshot_hour: number | null
          storage_bytes: number | null
          tenant_id: string
          total_cases: number | null
          total_users: number | null
          updated_at: string
        }
        Insert: {
          active_users?: number | null
          api_calls_today?: number | null
          cases_this_month?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          snapshot_date: string
          snapshot_hour?: number | null
          storage_bytes?: number | null
          tenant_id: string
          total_cases?: number | null
          total_users?: number | null
          updated_at?: string
        }
        Update: {
          active_users?: number | null
          api_calls_today?: number | null
          cases_this_month?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          snapshot_date?: string
          snapshot_hour?: number | null
          storage_bytes?: number | null
          tenant_id?: string
          total_cases?: number | null
          total_users?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          action: string
          created_at: string
          deleted_at: string | null
          details: Json | null
          id: string
          ip_address: unknown
          resource_id: string | null
          resource_type: string | null
          session_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          deleted_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          deleted_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_sessions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean | null
          session_end: string | null
          session_start: string | null
          tenant_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          session_end?: string | null
          session_start?: string | null
          tenant_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          session_end?: string | null
          session_start?: string | null
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          language: string | null
          notifications: Json | null
          preferences: Json | null
          tenant_id: string
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          language?: string | null
          notifications?: Json | null
          preferences?: Json | null
          tenant_id: string
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          language?: string | null
          notifications?: Json | null
          preferences?: Json | null
          tenant_id?: string
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          deleted_at: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          last_active_at: string | null
          started_at: string | null
          tenant_id: string
          token: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          last_active_at?: string | null
          started_at?: string | null
          tenant_id: string
          token?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          last_active_at?: string | null
          started_at?: string | null
          tenant_id?: string
          token?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sidebar_preferences: {
        Row: {
          collapsed_sections: string[] | null
          created_at: string
          deleted_at: string | null
          id: string
          is_collapsed: boolean | null
          pinned_items: string[] | null
          sidebar_position: string
          sidebar_width: number | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          collapsed_sections?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_collapsed?: boolean | null
          pinned_items?: string[] | null
          sidebar_position?: string
          sidebar_width?: number | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          collapsed_sections?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_collapsed?: boolean | null
          pinned_items?: string[] | null
          sidebar_position?: string
          sidebar_width?: number | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sidebar_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_records: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          record_id: string
          record_type: string
          tax_period: string | null
          tenant_id: string
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          record_id: string
          record_type: string
          tax_period?: string | null
          tenant_id: string
          updated_at?: string
          vat_amount: number
          vat_rate: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          record_id?: string
          record_type?: string
          tax_period?: string | null
          tenant_id?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "vat_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_returns: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          input_vat: number | null
          net_vat: number | null
          output_vat: number | null
          period_end: string
          period_start: string
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_vat?: number | null
          net_vat?: number | null
          output_vat?: number | null
          period_end: string
          period_start: string
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_vat?: number | null
          net_vat?: number | null
          output_vat?: number | null
          period_end?: string
          period_start?: string
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_returns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_transactions: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          transaction_date: string | null
          transaction_type: string
          updated_at: string
          vat_amount: number
          vat_return_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          transaction_date?: string | null
          transaction_type: string
          updated_at?: string
          vat_amount: number
          vat_return_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string
          vat_amount?: number
          vat_return_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_transactions_vat_return_id_fkey"
            columns: ["vat_return_id"]
            isOneToOne: false
            referencedRelation: "vat_returns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customers: {
        Row: {
          address: string | null
          city_id: string | null
          company_name: string | null
          country_id: string | null
          created_at: string | null
          created_by: string | null
          customer_group_id: string | null
          customer_name: string | null
          customer_number: string | null
          deleted_at: string | null
          email: string | null
          id: string | null
          id_number: string | null
          id_type: string | null
          industry_id: string | null
          is_active: boolean | null
          metadata: Json | null
          mobile_number: string | null
          notes: string | null
          phone: string | null
          portal_enabled: boolean | null
          portal_failed_login_attempts: number | null
          portal_last_login: string | null
          portal_locked_until: string | null
          portal_password_hash: string | null
          profile_photo_url: string | null
          referred_by: string | null
          source: string | null
          tax_number: string | null
          tenant_id: string | null
          total_cases: number | null
          total_revenue: number | null
          updated_at: string | null
          updated_by: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          company_name?: string | null
          country_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_group_id?: string | null
          customer_name?: string | null
          customer_number?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          id_number?: string | null
          id_type?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          mobile_number?: string | null
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean | null
          portal_failed_login_attempts?: number | null
          portal_last_login?: string | null
          portal_locked_until?: string | null
          portal_password_hash?: string | null
          profile_photo_url?: string | null
          referred_by?: string | null
          source?: string | null
          tax_number?: string | null
          tenant_id?: string | null
          total_cases?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          city_id?: string | null
          company_name?: string | null
          country_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_group_id?: string | null
          customer_name?: string | null
          customer_number?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          id_number?: string | null
          id_type?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          mobile_number?: string | null
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean | null
          portal_failed_login_attempts?: number | null
          portal_last_login?: string | null
          portal_locked_until?: string | null
          portal_password_hash?: string | null
          profile_photo_url?: string | null
          referred_by?: string | null
          source?: string | null
          tax_number?: string | null
          tenant_id?: string | null
          total_cases?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_enhanced_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "geo_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "geo_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_customer_group_id_fkey"
            columns: ["customer_group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "master_industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_enhanced_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_chain_of_custody_timeline: {
        Row: {
          action: string | null
          action_category: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          case_id: string | null
          created_at: string | null
          custody_status: string | null
          description: string | null
          device_id: string | null
          evidence_hash: string | null
          id: string | null
          location: string | null
          metadata: Json | null
          tenant_id: string | null
        }
        Insert: {
          action?: string | null
          action_category?: never
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          case_id?: string | null
          created_at?: string | null
          custody_status?: never
          description?: string | null
          device_id?: string | null
          evidence_hash?: string | null
          id?: string | null
          location?: string | null
          metadata?: Json | null
          tenant_id?: string | null
        }
        Update: {
          action?: string | null
          action_category?: never
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          case_id?: string | null
          created_at?: string | null
          custody_status?: never
          description?: string | null
          device_id?: string | null
          evidence_hash?: string | null
          id?: string | null
          location?: string | null
          metadata?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chain_of_custody_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "case_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_of_custody_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _fin_base_currency: { Args: { p_tenant: string }; Returns: string }
      _fin_currency_decimals: { Args: { p_code: string }; Returns: number }
      admin_validate_user_creation: { Args: { p_email: string }; Returns: Json }
      anonymize_customer_data: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      apply_credit_note: {
        Args: { p_allocations: Json; p_credit_note_id: string }
        Returns: {
          applied_amount: number
          approved_at: string | null
          approved_by: string | null
          case_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_note_date: string
          credit_note_number: string
          credit_type: string
          currency: string
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_id: string | null
          rate_source: string
          reason_code: string | null
          reason_notes: string | null
          refunded_amount: number
          status: string
          subtotal: number
          subtotal_base: number
          tax_amount: number
          tax_amount_base: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          total_amount_base: number
          updated_at: string
          updated_by: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_quote: { Args: { p_quote_id: string }; Returns: undefined }
      assign_inventory_to_case: {
        Args: { p_case_id: string; p_item_id: string; p_notes?: string }
        Returns: {
          assigned_at: string | null
          assigned_by: string | null
          case_id: string
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          notes: string | null
          purpose: string | null
          returned_at: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_case_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      authenticate_portal_customer: {
        Args: { p_email: string; p_password: string }
        Returns: Json
      }
      belongs_to_tenant: { Args: { check_tenant_id: string }; Returns: boolean }
      change_portal_password: {
        Args: {
          p_current_password: string
          p_customer_id: string
          p_new_password: string
        }
        Returns: boolean
      }
      check_module_access: { Args: { p_module_slug: string }; Returns: boolean }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      check_tenant_rate_limit: {
        Args: { p_resource: string; p_tenant_id: string }
        Returns: boolean
      }
      compute_realized_fx: {
        Args: {
          p_base_currency: string
          p_doc_amount: number
          p_invoice_rate: number
          p_payment_rate: number
        }
        Returns: number
      }
      convert_proforma_invoice_to_tax_invoice: {
        Args: { p_due_date?: string; p_invoice_id: string; p_notes?: string }
        Returns: string
      }
      convert_proforma_to_tax_invoice: {
        Args: { p_quote_id: string }
        Returns: string
      }
      create_receipt_with_allocations: {
        Args: { p_allocations: Json; p_receipt: Json }
        Returns: {
          amount: number
          amount_base: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          notes: string | null
          payment_method: string | null
          rate_source: string
          receipt_date: string | null
          receipt_number: string | null
          reference: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_case_permanently: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      disable_customer_portal_access: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      emit_notification_event: {
        Args: {
          p_dedup_key?: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_payload?: Json
        }
        Returns: string
      }
      export_customer_data: { Args: { p_customer_id: string }; Returns: Json }
      generate_next_number: { Args: { p_scope: string }; Returns: string }
      get_accessible_modules: {
        Args: never
        Returns: {
          can_access: boolean
          module_id: string
          module_name: string
          module_slug: string
        }[]
      }
      get_current_portal_customer_id: { Args: never; Returns: string }
      get_current_tenant_id: { Args: never; Returns: string }
      get_expense_stats_base: { Args: never; Returns: Json }
      get_invoice_stats_base: { Args: { p_case_id?: string }; Returns: Json }
      get_low_stock_count: { Args: never; Returns: number }
      get_my_role: { Args: never; Returns: string }
      get_next_case_number: { Args: never; Returns: string }
      get_next_company_number: { Args: never; Returns: string }
      get_next_customer_number: { Args: never; Returns: string }
      get_next_disbursement_number: { Args: never; Returns: string }
      get_next_invoice_number: { Args: never; Returns: string }
      get_next_number: { Args: { p_scope: string }; Returns: string }
      get_next_po_number: { Args: never; Returns: string }
      get_next_receipt_number: { Args: never; Returns: string }
      get_next_supplier_number: { Args: never; Returns: string }
      get_next_ticket_number: { Args: never; Returns: string }
      get_next_transfer_number: { Args: never; Returns: string }
      get_primary_device_for_case: {
        Args: { p_case_id: string }
        Returns: {
          accessories: string[] | null
          brand_id: string | null
          capacity_id: string | null
          case_id: string
          condition_id: string | null
          created_at: string
          created_by: string | null
          data_recovered_size: string | null
          deleted_at: string | null
          device_role_id: number | null
          device_type_id: string | null
          diagnosis: string | null
          encryption_id: string | null
          firmware_version: string | null
          form_factor_id: string | null
          head_count_id: string | null
          id: string
          interface_id: string | null
          is_primary: boolean | null
          made_in_id: string | null
          model: string | null
          notes: string | null
          password: string | null
          pcb_number: string | null
          photos: string[] | null
          physical_damage: string | null
          platter_count_id: string | null
          recovery_result: string | null
          role_notes: string | null
          serial_number: string | null
          storage_location: string | null
          symptoms: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "case_devices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_quote_stats_base: { Args: never; Returns: Json }
      get_system_setting: { Args: { p_key: string }; Returns: string }
      get_tenant_storage_bytes: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      get_user_case_access_level: { Args: never; Returns: string }
      get_user_profiles_with_email: {
        Args: never
        Returns: {
          avatar_url: string
          case_access_level: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string
          password_reset_required: boolean
          phone: string
          role: string
          tenant_id: string
          updated_at: string
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      has_role: { Args: { required_role: string }; Returns: boolean }
      increment_preset_usage: {
        Args: { p_preset_id: string }
        Returns: undefined
      }
      invoke_sync_exchange_rates: { Args: never; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_hr_or_admin: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_portal_account_locked: { Args: { p_email: string }; Returns: Json }
      is_portal_enabled: { Args: never; Returns: boolean }
      is_portal_in_maintenance_mode: { Args: never; Returns: Json }
      is_portal_user: { Args: never; Returns: boolean }
      is_staff_user: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      is_tenant_owner: { Args: never; Returns: boolean }
      issue_credit_note: {
        Args: { p_cn: Json; p_items: Json }
        Returns: {
          applied_amount: number
          approved_at: string | null
          approved_by: string | null
          case_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_note_date: string
          credit_note_number: string
          credit_type: string
          currency: string
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_id: string | null
          rate_source: string
          reason_code: string | null
          reason_notes: string | null
          refunded_amount: number
          status: string
          subtotal: number
          subtotal_base: number
          tax_amount: number
          tax_amount_base: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          total_amount_base: number
          updated_at: string
          updated_by: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_audit_trail:
        | {
            Args: {
              p_action: string
              p_changed_fields?: string[]
              p_new_values?: Json
              p_old_values?: Json
              p_record_id: string
              p_record_type: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_action: string
              p_changed_fields?: string[]
              p_ip_address?: unknown
              p_new_values?: Json
              p_old_values?: Json
              p_record_id: string
              p_record_type: string
              p_user_agent?: string
            }
            Returns: undefined
          }
      log_case_checkout: {
        Args: {
          p_case_id: string
          p_collector_id?: string
          p_collector_mobile: string
          p_collector_name: string
          p_device_ids?: string[]
          p_recovery_outcome?: string
        }
        Returns: undefined
      }
      log_case_communication: {
        Args: {
          p_case_id: string
          p_content?: string
          p_direction?: string
          p_sent_by?: string
          p_sent_to?: string
          p_subject?: string
          p_type: string
        }
        Returns: string
      }
      log_case_history: {
        Args: {
          p_action: string
          p_case_id: string
          p_details?: string
          p_new_value?: string
          p_old_value?: string
        }
        Returns: undefined
      }
      log_chain_of_custody: {
        Args: {
          p_action?: string
          p_action_category?: string
          p_case_id: string
          p_custody_status?: string
          p_description?: string
          p_device_id?: string
          p_location?: string
          p_metadata?: Json
        }
        Returns: string
      }
      lookup_brand: { Args: { p_name: string }; Returns: string }
      lookup_capacity: { Args: { p_name: string }; Returns: string }
      lookup_condition_type: { Args: { p_name: string }; Returns: string }
      lookup_country: { Args: { p_name: string }; Returns: string }
      lookup_device_type: { Args: { p_name: string }; Returns: string }
      lookup_interface: { Args: { p_name: string }; Returns: string }
      lookup_status_type: { Args: { p_name: string }; Returns: string }
      lookup_storage_location: { Args: { p_name: string }; Returns: string }
      post_manual_transaction: {
        Args: { p_txn: Json }
        Returns: {
          amount: number
          amount_base: number | null
          bank_account_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          description: string | null
          exchange_rate: number
          id: string
          notes: string | null
          rate_source: string
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          status: string
          tenant_id: string
          transaction_date: string | null
          transaction_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_stock_adjustment: {
        Args: { p_approved_by: string; p_session_id: string }
        Returns: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          reason: string | null
          session_number: string | null
          started_by: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_adjustment_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_due_case_follow_ups: { Args: never; Returns: Json }
      process_time_based_events: { Args: never; Returns: Json }
      promote_device_to_primary: {
        Args: { p_case_id: string; p_device_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: { p_allocations: Json; p_payment: Json }
        Returns: {
          amount: number
          amount_base: number | null
          bank_account_id: string | null
          case_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_id: string | null
          notes: string | null
          payment_date: string | null
          payment_method_id: string | null
          payment_number: string | null
          rate_source: string
          reference: string | null
          status: string | null
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_stock_receipt: {
        Args: { p_item_id: string; p_options?: Json; p_quantity: number }
        Returns: {
          barcode: string | null
          brand: string | null
          capacity: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          current_quantity: number | null
          deleted_at: string | null
          description: string | null
          dimensions: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean
          is_saleable: boolean | null
          item_type: string | null
          location: string | null
          location_id: string | null
          minimum_quantity: number | null
          model: string | null
          name: string
          notes: string | null
          photos: string[] | null
          quantity_available: number | null
          quantity_on_hand: number | null
          quantity_reserved: number | null
          reorder_level: number | null
          reorder_quantity: number | null
          selling_price: number | null
          sku: string | null
          specifications: Json | null
          supplier_id: string | null
          tax_inclusive: boolean
          tax_rate: number | null
          tenant_id: string
          unit: string | null
          unit_of_measure: string | null
          updated_at: string
          updated_by: string | null
          warranty_months: number | null
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "stock_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_stock_sale: {
        Args: { p_items: Json; p_sale: Json }
        Returns: {
          case_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          discount_amount: number | null
          id: string
          invoice_id: string | null
          notes: string | null
          payment_method_id: string | null
          payment_status: string
          sale_date: string | null
          sale_number: string | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_stock_usage_for_case: {
        Args: {
          p_case_id: string
          p_item_id: string
          p_notes?: string
          p_quantity: number
        }
        Returns: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          performed_by: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          total_cost: number | null
          transaction_type: string
          unit_cost: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_quote: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
      render_notification_template: {
        Args: { p_payload: Json; p_template: string }
        Returns: string
      }
      respond_to_custody_transfer: {
        Args: { p_action: string; p_payload?: Json; p_transfer_id: string }
        Returns: {
          accepted_at: string | null
          case_id: string
          created_at: string
          deleted_at: string | null
          device_id: string | null
          from_location: string | null
          from_person_id: string | null
          from_person_name: string
          id: string
          notes: string | null
          rejected_at: string | null
          rejection_reason: string | null
          tenant_id: string
          to_location: string | null
          to_person_id: string | null
          to_person_name: string
          transfer_reason: string
          transfer_status:
            | Database["public"]["Enums"]["custody_transfer_status"]
            | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chain_of_custody_transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_financial_transaction: {
        Args: { p_reason?: string; p_transaction_id: string }
        Returns: {
          amount: number
          amount_base: number | null
          bank_account_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          description: string | null
          exchange_rate: number
          id: string
          notes: string | null
          rate_source: string
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          status: string
          tenant_id: string
          transaction_date: string | null
          transaction_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_donor_drives: {
        Args: { p_criteria: Json }
        Returns: {
          brand_id: string | null
          capacity_id: string | null
          category_id: string | null
          condition_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          donor_parts_available: Json | null
          firmware_version: string | null
          head_map: string | null
          id: string
          interface_id: string | null
          is_donor: boolean | null
          item_category_id: string | null
          item_number: string | null
          location_id: string | null
          min_quantity: number | null
          model: string | null
          name: string
          notes: string | null
          pcb_number: string | null
          photos: string[] | null
          purchase_date: string | null
          purchase_price: number | null
          quantity: number | null
          serial_number: string | null
          status_id: string | null
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_customer_portal_password: {
        Args: { p_customer_id: string; p_password_hash: string }
        Returns: undefined
      }
      set_portal_password: {
        Args: { p_customer_id: string; p_new_password: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tenant_feature_enabled: {
        Args: { p_key: string; p_tenant_id: string }
        Returns: boolean
      }
      test_tenant_isolation: {
        Args: never
        Returns: {
          details: string
          passed: boolean
          test_name: string
        }[]
      }
      transition_case_status: {
        Args: {
          p_case_id: string
          p_notes?: string
          p_reason?: string
          p_to_status_id: string
        }
        Returns: Json
      }
      unassign_inventory_from_case: {
        Args: { p_assignment_id: string; p_notes?: string }
        Returns: {
          assigned_at: string | null
          assigned_by: string | null
          case_id: string
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string
          notes: string | null
          purpose: string | null
          returned_at: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_case_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_case_note: {
        Args: { p_content: string; p_note_id: string }
        Returns: {
          case_id: string
          content: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "case_internal_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_number_sequence: {
        Args: {
          p_padding: number
          p_prefix: string
          p_reset: boolean
          p_scope: string
        }
        Returns: undefined
      }
      void_credit_note: {
        Args: { p_credit_note_id: string; p_reason: string }
        Returns: {
          applied_amount: number
          approved_at: string | null
          approved_by: string | null
          case_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_note_date: string
          credit_note_number: string
          credit_type: string
          currency: string
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_id: string | null
          rate_source: string
          reason_code: string | null
          reason_notes: string | null
          refunded_amount: number
          status: string
          subtotal: number
          subtotal_base: number
          tax_amount: number
          tax_amount_base: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          total_amount_base: number
          updated_at: string
          updated_by: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_payment: {
        Args: { p_payment_id: string }
        Returns: {
          amount: number
          amount_base: number | null
          bank_account_id: string | null
          case_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_id: string | null
          notes: string | null
          payment_date: string | null
          payment_method_id: string | null
          payment_number: string | null
          rate_source: string
          reference: string | null
          status: string | null
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      custody_action_category:
        | "creation"
        | "modification"
        | "access"
        | "transfer"
        | "verification"
        | "communication"
        | "evidence_handling"
        | "financial"
        | "critical_event"
      custody_status:
        | "in_custody"
        | "in_transit"
        | "checked_out"
        | "archived"
        | "disposed"
      custody_transfer_status:
        | "initiated"
        | "pending_acceptance"
        | "accepted"
        | "rejected"
        | "cancelled"
      integrity_check_result: "passed" | "failed" | "warning" | "not_applicable"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      custody_action_category: [
        "creation",
        "modification",
        "access",
        "transfer",
        "verification",
        "communication",
        "evidence_handling",
        "financial",
        "critical_event",
      ],
      custody_status: [
        "in_custody",
        "in_transit",
        "checked_out",
        "archived",
        "disposed",
      ],
      custody_transfer_status: [
        "initiated",
        "pending_acceptance",
        "accepted",
        "rejected",
        "cancelled",
      ],
      integrity_check_result: ["passed", "failed", "warning", "not_applicable"],
    },
  },
} as const
