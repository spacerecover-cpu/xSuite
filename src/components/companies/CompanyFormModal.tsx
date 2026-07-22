import React, { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { createCompany, updateCompany, getNextCompanyNumberPreview } from '../../lib/companyService';
import { useCustomerPickerRows } from '../../lib/pickerSearch';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { PhoneInput } from '../ui/PhoneInput';
import { SearchableSelect } from '../ui/SearchableSelect';
import { AddressFields, type AddressValue } from '../ui/AddressFields';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, Loader2, Plus } from 'lucide-react';

/** Existing-company shape for edit mode. When provided, the modal switches
 *  from create to edit (prefilled, "Save Changes", no Primary-Contact field /
 *  next-No. badge — contact relationships are managed by their own UI). */
export interface CompanyEditData {
  id: string;
  company_name: string;
  tax_number: string | null;
  industry_id: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country_id: string | null;
  city_id: string | null;
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  subdivision_id: string | null;
  postal_code: string | null;
  notes: string | null;
}

interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (company: Record<string, unknown>) => void;
  /** Provide to open in edit mode for an existing company. */
  company?: CompanyEditData;
  /** Hide the structured "Additional address details" block (address line
   *  1/2 + postal). When false the form keeps a single Address field — the
   *  profile Edit uses this to stay minimal, as it was before. The existing
   *  structured values are still preserved (prefilled and written back). */
  showAddressDetails?: boolean;
}

interface Industry {
  id: string;
  name: string;
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
  company_name?: string;
  email?: string;
}

export const CompanyFormModal: React.FC<CompanyFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  company,
  showAddressDetails = true,
}) => {
  const isEdit = Boolean(company);
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const companyNameRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    company_name: '',
    tax_number: '',
    industry_id: '',
    email: '',
    phone: '',
    website: '',
    country_id: '',
    city_id: '',
    address: '',
    address_line1: '',
    address_line2: '',
    subdivision_id: null as string | null,
    postal_code: '',
    notes: '',
    primary_contact_id: '',
  });

  const { data: industries = [] } = useQuery({
    queryKey: ['industries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_industries')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data as Industry[];
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

  // Server-side customer picker for the create-mode Primary Contact select.
  const { rows: customers, onSearchTermChange: onCustomerSearch } =
    useCustomerPickerRows(formData.primary_contact_id || undefined);

  // Non-consuming preview of the number the next created company will get
  // (create mode only — an existing company already has its number).
  const { data: nextCompanyNumber } = useQuery({
    queryKey: ['company_number_preview'],
    queryFn: getNextCompanyNumberPreview,
    enabled: isOpen && !isEdit,
    staleTime: 0,
  });

  // Edit mode: prefill the form from the company whenever the modal opens.
  React.useEffect(() => {
    if (!isOpen || !company) return;
    setFormData({
      company_name: company.company_name ?? '',
      tax_number: company.tax_number ?? '',
      industry_id: company.industry_id ?? '',
      email: company.email ?? '',
      phone: company.phone ?? '',
      website: company.website ?? '',
      country_id: company.country_id ?? '',
      city_id: company.city_id ?? '',
      address: company.address ?? '',
      address_line1: company.address_line1 ?? '',
      address_line2: company.address_line2 ?? '',
      subdivision_id: company.subdivision_id ?? null,
      postal_code: company.postal_code ?? '',
      notes: company.notes ?? '',
      primary_contact_id: '',
    });
  }, [isOpen, company]);

  const filteredCities = cities.filter(
    (city) => !formData.country_id || city.country_id === formData.country_id
  );

  const validate = useCallback((data: typeof formData): FormErrors => {
    const errs: FormErrors = {};
    if (!data.company_name.trim()) {
      errs.company_name = 'Company name is required';
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
    mutationFn: async (data: typeof formData) => {
      const payload = {
        name: data.company_name,
        company_name: data.company_name,
        tax_number: data.tax_number || null,
        industry_id: data.industry_id || null,
        email: data.email || null,
        phone: data.phone || null,
        website: data.website || null,
        country_id: data.country_id || null,
        city_id: data.city_id || null,
        address: data.address || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        subdivision_id: data.subdivision_id,
        postal_code: data.postal_code || null,
        notes: data.notes || null,
        created_by: profile?.id,
      };
      return createCompany(payload, data.primary_contact_id || null);
    },
    onSuccess: (newCompany) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company_number_preview'] });
      resetForm();
      if (onSuccess && newCompany) onSuccess(newCompany as unknown as Record<string, unknown>);
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!company) throw new Error('No company to update');
      return updateCompany(company.id, {
        name: data.company_name,
        tax_number: data.tax_number || null,
        industry_id: data.industry_id || null,
        email: data.email || null,
        phone: data.phone || null,
        website: data.website || null,
        country_id: data.country_id || null,
        city_id: data.city_id || null,
        address: data.address || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        subdivision_id: data.subdivision_id,
        postal_code: data.postal_code || null,
        notes: data.notes || null,
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      if (company) queryClient.invalidateQueries({ queryKey: ['company', company.id] });
      if (onSuccess && updated) onSuccess(updated as unknown as Record<string, unknown>);
      onClose();
    },
  });

  const activeMutation = isEdit ? updateMutation : createMutation;

  const resetForm = () => {
    const defaultCountryId = companySettings?.location?.default_country_id || '';
    setFormData({
      company_name: '',
      tax_number: '',
      industry_id: '',
      email: '',
      phone: '',
      website: '',
      country_id: defaultCountryId,
      city_id: '',
      address: '',
      address_line1: '',
      address_line2: '',
      subdivision_id: null,
      postal_code: '',
      notes: '',
      primary_contact_id: '',
    });
    setErrors({});
    setTouched({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(formData);
    setErrors(validationErrors);
    setTouched({ company_name: true, email: true });
    if (Object.keys(validationErrors).length > 0) return;
    activeMutation.mutate(formData);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  React.useEffect(() => {
    // Create mode only — never override an edited company's own country.
    const defaultCountryId = companySettings?.location?.default_country_id;
    if (isOpen && !company && defaultCountryId) {
      setFormData((prev) => ({ ...prev, country_id: defaultCountryId }));
    }
  }, [isOpen, companySettings, company]);

  const addressValue: AddressValue = {
    address_line1: formData.address_line1,
    address_line2: formData.address_line2,
    subdivision_id: formData.subdivision_id,
    postal_code: formData.postal_code,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Edit Company' : 'Add New Company'}
      icon={Building2}
      titleSize="sm"
      maxWidth="xl"
      showClose
      headerAction={
        !isEdit && nextCompanyNumber ? (
          <span
            title="The number this company will be assigned"
            className="flex items-center gap-1.5 rounded-md border border-info/30 bg-info-muted px-2 py-1"
          >
            <span className="text-xxs font-medium uppercase tracking-wider text-slate-500">Next No.</span>
            <span className="font-mono text-xs font-semibold text-info">{nextCompanyNumber}</span>
          </span>
        ) : undefined
      }
      initialFocusRef={companyNameRef}
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          ref={companyNameRef}
          label="Company Name"
          floatingLabel
          value={formData.company_name}
          onChange={(e) => handleFieldChange('company_name', e.target.value)}
          onBlur={() => handleBlur('company_name')}
          error={touched.company_name ? errors.company_name : undefined}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="VAT / Tax Number"
            floatingLabel
            value={formData.tax_number}
            onChange={(e) => handleFieldChange('tax_number', e.target.value)}
            placeholder="e.g. 1234567890"
          />
          <SearchableSelect
            label="Industry"
            floatingLabel
            shrinkDefaultValue
            value={formData.industry_id}
            onChange={(value) => handleFieldChange('industry_id', value)}
            options={[{ id: '', name: 'Not specified' }, ...industries.map((i) => ({ id: i.id, name: i.name }))]}
            placeholder="Not specified"
            usePortal
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Email"
            floatingLabel
            type="email"
            value={formData.email}
            onChange={(e) => handleFieldChange('email', e.target.value)}
            onBlur={() => handleBlur('email')}
            error={touched.email ? errors.email : undefined}
            placeholder="e.g. info@example.com"
          />
          <PhoneInput
            label="Phone Number"
            floatingLabel
            value={formData.phone}
            onChange={(val) => handleFieldChange('phone', val)}
            countries={countries}
            selectedCountryId={formData.country_id}
            placeholder="e.g. 9123 4567"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Website"
            floatingLabel
            className={isEdit ? 'md:col-span-2' : undefined}
            value={formData.website}
            onChange={(e) => handleFieldChange('website', e.target.value)}
            placeholder="https://example.com"
          />
          {/* Primary Contact (create only) — on an existing company, contact
              relationships are managed via the dedicated Contacts UI. In edit
              mode the Website field spans the full row. */}
          {!isEdit && (
            <SearchableSelect
              label="Primary Contact"
              floatingLabel
              shrinkDefaultValue
              value={formData.primary_contact_id}
              onChange={(value) => handleFieldChange('primary_contact_id', value)}
              onSearchTermChange={onCustomerSearch}
              options={[
                { id: '', name: 'No contact' },
                ...customers.map((c) => ({
                  id: c.id,
                  name: `${c.customer_name}${c.email ? ` (${c.email})` : ''}`,
                })),
              ]}
              placeholder="No contact"
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

        {showAddressDetails && (
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
        )}

        <Textarea
          id="company-internal-notes"
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
              : `Failed to ${isEdit ? 'update' : 'create'} company. Please try again.`}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-xs" disabled={activeMutation.isPending}>
            {activeMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {isEdit ? 'Saving...' : 'Creating...'}
              </>
            ) : isEdit ? (
              'Save Changes'
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create Company
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
