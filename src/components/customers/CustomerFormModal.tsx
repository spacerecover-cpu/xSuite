import React, { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { createCustomer } from '../../lib/customerService';
import { createCompany } from '../../lib/companyService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PhoneInput } from '../ui/PhoneInput';
import { UsageLimitGuard } from '../shared/UsageLimitGuard';
import { SearchableSelect } from '../ui/SearchableSelect';
import { AddressFields, type AddressValue } from '../ui/AddressFields';
import { validatePartyTaxNumberPure } from '../../lib/regimes/partyTaxValidation';
import { useAuth } from '../../contexts/AuthContext';
import {
  User,
  Mail,
  Building2,
  MapPin,
  Settings,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  StickyNote,
  Shield,
} from 'lucide-react';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (customer: Record<string, unknown>) => void;
}

interface CustomerGroup {
  id: string;
  name: string;
}

interface Company {
  id: string;
  company_number: string;
  company_name: string;
}

interface Country {
  id: string;
  name: string;
  code: string;
  phone_code: string | null;
  is_active: boolean;
}

interface City {
  id: string;
  name: string;
  country_id: string;
  is_active: boolean;
}

interface FormErrors {
  customer_name?: string;
  email?: string;
  tax_number?: string;
}

const SectionHeader: React.FC<{
  icon: React.ElementType;
  title: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}> = ({ icon: Icon, title, collapsible, collapsed, onToggle }) => (
  <div
    className={`flex items-center justify-between py-2 ${collapsible ? 'cursor-pointer select-none' : ''}`}
    onClick={collapsible ? onToggle : undefined}
  >
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-md bg-info-muted flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
    </div>
    {collapsible && (
      <div className="text-slate-400 hover:text-slate-600 transition-colors">
        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </div>
    )}
  </div>
);

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
  const [showAltPhone, setShowAltPhone] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(true);
  const [addressNotesCollapsed, setAddressNotesCollapsed] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const customerNameRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    customer_name: '',
    email: '',
    mobile_number: '',
    phone_number: '',
    customer_group_id: '',
    country_id: '',
    city_id: '',
    address: '',
    address_line1: '',
    address_line2: '',
    subdivision_id: null as string | null,
    tax_number: '',
    postal_code: '',
    portal_enabled: true,
    notes: '',
    company_id: '',
  });

  const [newCompanyData, setNewCompanyData] = useState({
    company_name: '',
  });

  const { data: customerGroups = [] } = useQuery({
    queryKey: ['customer_groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_groups')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as CustomerGroup[];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_number, company_name')
        .order('company_name');
      if (error) throw error;
      return data as Company[];
    },
  });

  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_countries')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Country[];
    },
  });

  const { data: cities = [] } = useQuery({
    queryKey: ['cities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_cities')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as City[];
    },
  });

  const { data: companySettings } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('location')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { location: { default_country_id?: string } | null } | null;
    },
  });

  const filteredCities = cities.filter(
    (city) => !formData.country_id || city.country_id === formData.country_id
  );

  const validate = useCallback((data: typeof formData): FormErrors => {
    const errs: FormErrors = {};
    if (!data.customer_name.trim()) {
      errs.customer_name = 'Customer name is required';
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errs.email = 'Please enter a valid email address';
    }
    if (data.tax_number.trim()) {
      const countryCode =
        (countries.find((c) => c.id === data.country_id) as { code?: string } | undefined)?.code ?? null;
      const check = validatePartyTaxNumberPure({
        countryCode, taxNumber: data.tax_number, subdivisionAuthorityCode: null,
      });
      if (!check.ok) errs.tax_number = check.error ?? 'Invalid tax registration number';
    }
    return errs;
  }, [countries]);

  const handleFieldChange = (field: string, value: string | boolean) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    if (touched[field]) {
      setErrors(validate(updated));
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(formData));
  };

  const createMutation = useMutation({
    mutationFn: async (customer: typeof formData) => {
      // The structured address fields (WP-1 Task 3) are declared on
      // `CreateCustomerInput`; createCustomer spreads them into the insert.
      const payload = {
        customer_name: customer.customer_name,
        email: customer.email || null,
        mobile_number: customer.mobile_number || null,
        phone: customer.phone_number || null,
        customer_group_id: customer.customer_group_id || null,
        country_id: customer.country_id || null,
        city_id: customer.city_id || null,
        address: customer.address || null,
        address_line1: customer.address_line1 || null,
        address_line2: customer.address_line2 || null,
        subdivision_id: customer.subdivision_id,
        tax_number: customer.tax_number.trim() || null,
        postal_code: customer.postal_code || null,
        portal_enabled: customer.portal_enabled,
        notes: customer.notes || null,
        created_by: profile?.id,
        company_id: customer.company_id || null,
      };
      return createCustomer(payload);
    },
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
      queryClient.invalidateQueries({ queryKey: ['customers_for_cases'] });
      resetForm();
      if (onSuccess && newCustomer) onSuccess(newCustomer as unknown as Record<string, unknown>);
      onClose();
    },
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (companyData: typeof newCompanyData) =>
      createCompany({ name: companyData.company_name, created_by: profile?.id }),
    onSuccess: async (newCompany) => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.refetchQueries({ queryKey: ['companies'] });
      setFormData({ ...formData, company_id: newCompany.id });
      setIsAddCompanyModalOpen(false);
      setNewCompanyData({ company_name: '' });
    },
  });

  const resetForm = () => {
    const defaultCountryId = companySettings?.location?.default_country_id || '';
    setFormData({
      customer_name: '',
      email: '',
      mobile_number: '',
      phone_number: '',
      customer_group_id: '',
      country_id: defaultCountryId,
      city_id: '',
      address: '',
      address_line1: '',
      address_line2: '',
      subdivision_id: null,
      tax_number: '',
      postal_code: '',
      portal_enabled: true,
      notes: '',
      company_id: '',
    });
    setErrors({});
    setTouched({});
    setShowAltPhone(false);
    setSettingsCollapsed(true);
    setAddressNotesCollapsed(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(formData);
    setErrors(validationErrors);
    setTouched({ customer_name: true, email: true, tax_number: true });
    if (Object.keys(validationErrors).length > 0) return;
    createMutation.mutate(formData);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    createCompanyMutation.mutate(newCompanyData);
  };

  React.useEffect(() => {
    const defaultCountryId = companySettings?.location?.default_country_id;
    if (isOpen && defaultCountryId) {
      setFormData((prev) => ({
        ...prev,
        country_id: defaultCountryId,
      }));
    }
  }, [isOpen, companySettings]);

  const addressValue: AddressValue = {
    address_line1: formData.address_line1,
    address_line2: formData.address_line2,
    subdivision_id: formData.subdivision_id,
    postal_code: formData.postal_code,
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Add New Customer"
        icon={User}
        initialFocusRef={customerNameRef}
        closeOnBackdrop={false}
      >
        <form onSubmit={handleSubmit} className="space-y-1">

          {/* ── Contact Details ── */}
          <div className="rounded-lg bg-slate-50/60 border border-slate-100 p-3.5">
            <SectionHeader icon={User} title="Contact Details" />

            <div className="mt-2.5 space-y-3">
              <Input
                ref={customerNameRef}
                label="Customer Name"
                value={formData.customer_name}
                onChange={(e) => handleFieldChange('customer_name', e.target.value)}
                onBlur={() => handleBlur('customer_name')}
                error={touched.customer_name ? errors.customer_name : undefined}
                required
                placeholder="Full name or business name"
                leftIcon={<User className="w-4 h-4" />}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  error={touched.email ? errors.email : undefined}
                  placeholder="customer@email.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                />
                <PhoneInput
                  label="Mobile Number"
                  value={formData.mobile_number}
                  onChange={(val) => handleFieldChange('mobile_number', val)}
                  countries={countries}
                  selectedCountryId={formData.country_id}
                />
              </div>

              {showAltPhone ? (
                <PhoneInput
                  label="Alternative Phone"
                  value={formData.phone_number}
                  onChange={(val) => handleFieldChange('phone_number', val)}
                  countries={countries}
                  selectedCountryId={formData.country_id}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAltPhone(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors py-0.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add alternative phone
                </button>
              )}
            </div>
          </div>

          {/* ── Organization ── */}
          <div className="rounded-lg bg-slate-50/60 border border-slate-100 p-3.5">
            <SectionHeader icon={Building2} title="Organization" />

            <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <SearchableSelect
                label="Customer Group"
                value={formData.customer_group_id}
                onChange={(value) => handleFieldChange('customer_group_id', value)}
                options={[{ id: '', name: 'No group' }, ...customerGroups.map((g) => ({ id: g.id, name: g.name }))]}
                placeholder="Select type"
                usePortal
              />
              <SearchableSelect
                label="Company"
                value={formData.company_id}
                onChange={(value) => handleFieldChange('company_id', value)}
                options={[
                  { id: '', name: 'No company' },
                  ...companies.map((c) => ({
                    id: c.id,
                    name: `${c.company_name} (${c.company_number})`,
                  })),
                ]}
                placeholder="No company"
                onAddNew={() => setIsAddCompanyModalOpen(true)}
                addNewLabel="Add New Company"
                usePortal
              />
            </div>
          </div>

          {/* ── Location ── */}
          <div className="rounded-lg bg-slate-50/60 border border-slate-100 p-3.5">
            <SectionHeader icon={MapPin} title="Location" />

            <div className="mt-2.5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SearchableSelect
                  label="Country"
                  value={formData.country_id}
                  onChange={(value) => {
                    setFormData({ ...formData, country_id: value, city_id: '' });
                  }}
                  options={[{ id: '', name: 'Not specified' }, ...countries.map((c) => ({ id: c.id, name: c.name }))]}
                  placeholder="Select country"
                  usePortal
                />
                <SearchableSelect
                  label="City"
                  value={formData.city_id}
                  onChange={(value) => handleFieldChange('city_id', value)}
                  options={[{ id: '', name: 'Not specified' }, ...filteredCities.map((c) => ({ id: c.id, name: c.name }))]}
                  placeholder="Select city"
                  disabled={!formData.country_id}
                  usePortal
                />
              </div>

              <AddressFields
                value={addressValue}
                onChange={(next) => setFormData((f) => ({ ...f, ...next }))}
                countryId={formData.country_id || null}
              />

              <div>
                <label htmlFor="customer-tax-number" className="mb-1 block text-sm font-medium">
                  {(countries.find((c) => c.id === formData.country_id) as { tax_number_label?: string | null } | undefined)
                    ?.tax_number_label ?? 'Tax Registration Number'}
                </label>
                <input
                  id="customer-tax-number"
                  aria-label="Tax Registration Number"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={formData.tax_number}
                  onChange={(e) => handleFieldChange('tax_number', e.target.value)}
                  onBlur={() => handleBlur('tax_number')}
                />
                {errors.tax_number && <p className="mt-1 text-sm text-danger">{errors.tax_number}</p>}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setAddressNotesCollapsed((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors py-0.5"
                >
                  {addressNotesCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  Additional address notes
                </button>
                {!addressNotesCollapsed && (
                  <textarea
                    value={formData.address}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    rows={2}
                    className="mt-1.5 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm resize-none transition-shadow bg-white"
                    placeholder="Legacy free-text address notes"
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Settings (Collapsible) ── */}
          <div className="rounded-lg bg-slate-50/60 border border-slate-100 p-3.5">
            <SectionHeader
              icon={Settings}
              title="Settings"
              collapsible
              collapsed={settingsCollapsed}
              onToggle={() => setSettingsCollapsed(!settingsCollapsed)}
            />

            {!settingsCollapsed && (
              <div className="mt-2.5 space-y-3 animate-fadeIn">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200">
                  <div className="mt-0.5">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-sm font-medium text-slate-800 block">Portal Access</span>
                        <span className="text-xs text-slate-500">Allow customer to view their cases online</span>
                      </div>
                      <div
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          formData.portal_enabled ? 'bg-primary' : 'bg-slate-300'
                        }`}
                        onClick={() => handleFieldChange('portal_enabled', !formData.portal_enabled)}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            formData.portal_enabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="customer-internal-notes" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                    <StickyNote className="w-3.5 h-3.5 text-slate-400" />
                    Internal Notes
                  </label>
                  <textarea
                    id="customer-internal-notes"
                    value={formData.notes}
                    onChange={(e) => handleFieldChange('notes', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm resize-none transition-shadow bg-white"
                    placeholder="Private notes visible only to staff"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          {createMutation.isError && (
            <div className="px-3 py-2 bg-danger-muted border border-danger/30 rounded-lg text-sm text-danger">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create customer. Please try again.'}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-400">
              <span className="text-danger">*</span> Required fields
            </p>
            <div className="flex gap-2.5">
              <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <UsageLimitGuard limitKey="max_customers" showToast={true}>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Customer'
                  )}
                </Button>
              </UsageLimitGuard>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Add Company Sub-Modal ── */}
      <Modal
        isOpen={isAddCompanyModalOpen}
        onClose={() => {
          setIsAddCompanyModalOpen(false);
          setNewCompanyData({ company_name: '' });
        }}
        title="Add New Company"
        icon={Building2}
        size="sm"
      >
        <form onSubmit={handleCreateCompany} className="space-y-4">
          <Input
            label="Company Name"
            value={newCompanyData.company_name}
            onChange={(e) => setNewCompanyData({ ...newCompanyData, company_name: e.target.value })}
            required
            placeholder="Enter company name"
            leftIcon={<Building2 className="w-4 h-4" />}
          />

          {createCompanyMutation.isError && (
            <div className="px-3 py-2 bg-danger-muted border border-danger/30 rounded-lg text-sm text-danger">
              {createCompanyMutation.error instanceof Error
                ? createCompanyMutation.error.message
                : 'Failed to create company.'}
            </div>
          )}

          <div className="flex gap-2.5 justify-end pt-3 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsAddCompanyModalOpen(false);
                setNewCompanyData({ company_name: '' });
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createCompanyMutation.isPending}>
              {createCompanyMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Company'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
