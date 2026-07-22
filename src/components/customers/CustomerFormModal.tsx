import React, { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { createCustomer, updateCustomer, getNextCustomerNumberPreview } from '../../lib/customerService';
import { createCompany } from '../../lib/companyService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { PhoneInput } from '../ui/PhoneInput';
import { UsageLimitGuard } from '../shared/UsageLimitGuard';
import { SearchableSelect } from '../ui/SearchableSelect';
import { AddressFields, type AddressValue } from '../ui/AddressFields';
import { useAuth } from '../../contexts/AuthContext';
import {
  User,
  UserPlus,
  Building2,
  Loader2,
  Plus,
  X,
} from 'lucide-react';

/** Existing-customer shape for edit mode. When provided, the modal switches
 *  from create to edit (prefilled, "Save Changes", no Company field / next-No.
 *  badge — company relationships and the photo are managed by their own UIs). */
export interface CustomerEditData {
  id: string;
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
  phone: string | null;
  customer_group_id: string | null;
  country_id: string | null;
  city_id: string | null;
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  subdivision_id: string | null;
  postal_code: string | null;
  portal_enabled: boolean | null;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (customer: Record<string, unknown>) => void;
  /** Provide to open in edit mode for an existing customer. */
  customer?: CustomerEditData;
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
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  customer,
}) => {
  const isEdit = Boolean(customer);
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
  const [showAltPhone, setShowAltPhone] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const customerNameRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    customer_name: '',
    email: '',
    secondary_email: '',
    mobile_number: '',
    phone_number: '',
    customer_group_id: '',
    country_id: '',
    city_id: '',
    address: '',
    address_line1: '',
    address_line2: '',
    subdivision_id: null as string | null,
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
    queryKey: ['company_settings', 'location'],
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

  // Non-consuming preview of the number the next created customer will get
  // (create mode only — an existing customer already has its number).
  const { data: nextCustomerNumber } = useQuery({
    queryKey: ['customer_number_preview'],
    queryFn: getNextCustomerNumberPreview,
    enabled: isOpen && !isEdit,
    staleTime: 0,
  });

  // Edit mode: prefill the form from the customer whenever the modal opens.
  React.useEffect(() => {
    if (!isOpen || !customer) return;
    setFormData({
      customer_name: customer.customer_name ?? '',
      email: customer.email ?? '',
      secondary_email: (customer.metadata as { secondary_email?: string } | null)?.secondary_email ?? '',
      mobile_number: customer.mobile_number ?? '',
      phone_number: customer.phone ?? '',
      customer_group_id: customer.customer_group_id ?? '',
      country_id: customer.country_id ?? '',
      city_id: customer.city_id ?? '',
      address: customer.address ?? '',
      address_line1: customer.address_line1 ?? '',
      address_line2: customer.address_line2 ?? '',
      subdivision_id: customer.subdivision_id ?? null,
      postal_code: customer.postal_code ?? '',
      portal_enabled: customer.portal_enabled ?? false,
      notes: customer.notes ?? '',
      company_id: '',
    });
    setShowAltPhone(
      Boolean(customer.phone) ||
      Boolean((customer.metadata as { secondary_email?: string } | null)?.secondary_email),
    );
  }, [isOpen, customer]);

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
    return errs;
  }, []);

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
        postal_code: customer.postal_code || null,
        portal_enabled: customer.portal_enabled,
        notes: customer.notes || null,
        metadata: customer.secondary_email ? { secondary_email: customer.secondary_email } : null,
        created_by: profile?.id,
        company_id: customer.company_id || null,
      };
      return createCustomer(payload);
    },
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
      queryClient.invalidateQueries({ queryKey: ['customer_number_preview'] });
      queryClient.invalidateQueries({ queryKey: ['customers_for_cases'] });
      resetForm();
      if (onSuccess && newCustomer) onSuccess(newCustomer as unknown as Record<string, unknown>);
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!customer) throw new Error('No customer to update');
      return updateCustomer(customer.id, {
        customer_name: data.customer_name,
        email: data.email || null,
        mobile_number: data.mobile_number || null,
        phone: data.phone_number || null,
        customer_group_id: data.customer_group_id || null,
        country_id: data.country_id || null,
        city_id: data.city_id || null,
        address: data.address || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        subdivision_id: data.subdivision_id,
        postal_code: data.postal_code || null,
        portal_enabled: data.portal_enabled,
        notes: data.notes || null,
        // Merge into existing metadata so import keys (e.g. legacy_id) survive.
        metadata: {
          ...((customer?.metadata as Record<string, unknown> | null) ?? {}),
          secondary_email: data.secondary_email || null,
        },
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
      queryClient.invalidateQueries({ queryKey: ['customers_for_cases'] });
      if (customer) queryClient.invalidateQueries({ queryKey: ['customer', customer.id] });
      if (onSuccess && updated) onSuccess(updated as unknown as Record<string, unknown>);
      onClose();
    },
  });

  const activeMutation = isEdit ? updateMutation : createMutation;

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
      secondary_email: '',
      mobile_number: '',
      phone_number: '',
      customer_group_id: '',
      country_id: defaultCountryId,
      city_id: '',
      address: '',
      address_line1: '',
      address_line2: '',
      subdivision_id: null,
      postal_code: '',
      portal_enabled: true,
      notes: '',
      company_id: '',
    });
    setErrors({});
    setTouched({});
    setShowAltPhone(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(formData);
    setErrors(validationErrors);
    setTouched({ customer_name: true, email: true });
    if (Object.keys(validationErrors).length > 0) return;
    activeMutation.mutate(formData);
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
    // Create mode only — never override an edited customer's own country.
    const defaultCountryId = companySettings?.location?.default_country_id;
    if (isOpen && !customer && defaultCountryId) {
      setFormData((prev) => ({
        ...prev,
        country_id: defaultCountryId,
      }));
    }
  }, [isOpen, companySettings, customer]);

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
        title={isEdit ? 'Edit Customer' : 'Add New Customer'}
        icon={User}
        titleSize="sm"
        maxWidth="xl"
        showClose
        headerAction={
          !isEdit && nextCustomerNumber ? (
            <span
              title="The number this customer will be assigned"
              className="flex items-center gap-1.5 rounded-md border border-info/30 bg-info-muted px-2 py-1"
            >
              <span className="text-xxs font-medium uppercase tracking-wide text-slate-500">Next No.</span>
              <span className="font-mono text-xs font-semibold text-info">{nextCustomerNumber}</span>
            </span>
          ) : undefined
        }
        initialFocusRef={customerNameRef}
        closeOnBackdrop={false}
      >
        {/* Reference layout: flat paired rows with floating labels; the
            address/tax block is always visible below the main fields. */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            ref={customerNameRef}
            label="Name"
            floatingLabel
            value={formData.customer_name}
            onChange={(e) => handleFieldChange('customer_name', e.target.value)}
            onBlur={() => handleBlur('customer_name')}
            error={touched.customer_name ? errors.customer_name : undefined}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email"
              floatingLabel
              type="email"
              value={formData.email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              error={touched.email ? errors.email : undefined}
            />
            {/* Mobile with a plain + above it to reveal the alternative phone. */}
            <div className="relative">
              {!showAltPhone && (
                <button
                  type="button"
                  onClick={() => setShowAltPhone(true)}
                  title="Add alternative phone number"
                  aria-label="Add alternative phone number"
                  className="absolute -top-5 right-0 text-primary transition-colors hover:text-primary/80"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
              <PhoneInput
                label="Mobile Number"
                floatingLabel
                value={formData.mobile_number}
                onChange={(val) => handleFieldChange('mobile_number', val)}
                countries={countries}
                selectedCountryId={formData.country_id}
                placeholder="e.g. 9123 4567"
              />
            </div>
          </div>

          {showAltPhone && (
            <div className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Alternative Email"
                  floatingLabel
                  type="email"
                  value={formData.secondary_email}
                  onChange={(e) => handleFieldChange('secondary_email', e.target.value)}
                  placeholder="e.g. info@example.com"
                />
                <PhoneInput
                  label="Alternative Mobile Number"
                  floatingLabel
                  value={formData.phone_number}
                  onChange={(val) => handleFieldChange('phone_number', val)}
                  countries={countries}
                  selectedCountryId={formData.country_id}
                  placeholder="e.g. 9123 4567"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAltPhone(false);
                  handleFieldChange('phone_number', '');
                  handleFieldChange('secondary_email', '');
                }}
                title="Remove alternative contact"
                aria-label="Remove alternative contact"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-400 transition-colors hover:border-danger/40 hover:bg-danger-muted hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchableSelect
              label="Customer Group"
              floatingLabel
              shrinkDefaultValue
              className={isEdit ? 'md:col-span-2' : undefined}
              value={formData.customer_group_id}
              onChange={(value) => handleFieldChange('customer_group_id', value)}
              options={[{ id: '', name: 'No group' }, ...customerGroups.map((g) => ({ id: g.id, name: g.name }))]}
              placeholder="No group"
              usePortal
            />
            {/* Company (create only) — on an existing customer, relationships
                are managed via the dedicated Associated Companies UI. In edit
                mode the Group select spans the full row. */}
            {!isEdit && (
              <SearchableSelect
                label="Company (Optional)"
                floatingLabel
                shrinkDefaultValue
                value={formData.company_id}
                onChange={(value) => handleFieldChange('company_id', value)}
                options={[
                  { id: '', name: 'No Company' },
                  ...companies.map((c) => ({
                    id: c.id,
                    name: `${c.company_name} (${c.company_number})`,
                  })),
                ]}
                placeholder="No Company"
                onAddNew={() => setIsAddCompanyModalOpen(true)}
                addNewLabel="Add New Company"
                usePortal
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchableSelect
              label="Country"
              floatingLabel
              shrinkDefaultValue
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
              floatingLabel
              shrinkDefaultValue
              value={formData.city_id}
              onChange={(value) => handleFieldChange('city_id', value)}
              options={[{ id: '', name: 'Not specified' }, ...filteredCities.map((c) => ({ id: c.id, name: c.name }))]}
              placeholder="Not specified"
              disabled={!formData.country_id}
              usePortal
            />
          </div>

          <Input
            label="Address"
            floatingLabel
            value={formData.address}
            onChange={(e) => handleFieldChange('address', e.target.value)}
            placeholder="Enter full address"
          />

          <div>
            <p className="mb-4 text-xs font-medium text-slate-500">
              Additional address details (optional)
            </p>
            <AddressFields
              value={addressValue}
              onChange={(next) => setFormData((f) => ({ ...f, ...next }))}
              countryId={formData.country_id || null}
              floatingLabel
            />
          </div>

          <label htmlFor="customer-portal-enabled" className="flex cursor-pointer select-none items-start gap-2.5">
            <input
              id="customer-portal-enabled"
              type="checkbox"
              checked={formData.portal_enabled}
              onChange={(e) => handleFieldChange('portal_enabled', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Enable Client Portal Access</span>
              <span className="block text-xs text-slate-500">Allow this customer to access the client portal.</span>
            </span>
          </label>

          <Textarea
            id="customer-internal-notes"
            label="Internal Notes"
            floatingLabel
            value={formData.notes}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            rows={2}
            className="resize-none"
            placeholder="Add any internal notes..."
          />

          {activeMutation.isError && (
            <div className="px-3 py-2 bg-danger-muted border border-danger/30 rounded-lg text-sm text-danger">
              {activeMutation.error instanceof Error
                ? activeMutation.error.message
                : `Failed to ${isEdit ? 'update' : 'create'} customer. Please try again.`}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={handleClose}>
              Cancel
            </Button>
            {isEdit ? (
              <Button type="submit" size="sm" className="text-xs" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            ) : (
              <UsageLimitGuard limitKey="max_customers" showToast={true}>
                <Button type="submit" size="sm" className="text-xs" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                      Create Customer
                    </>
                  )}
                </Button>
              </UsageLimitGuard>
            )}
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
        showClose
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
