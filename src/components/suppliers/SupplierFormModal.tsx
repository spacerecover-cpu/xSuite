import React, { useState, useEffect } from 'react';
import { Building2, Mail, Phone, MapPin, FileText, User, Truck, CheckCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase, resolveTenantId } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface SupplierData {
  id?: string;
  name?: string;
  supplier_number?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  tax_id?: string;
  website?: string;
  category_id?: string;
  payment_terms_id?: string;
  description?: string;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  primary_contact_position?: string;
  preferred_shipping_method?: string;
  is_active?: boolean;
  is_approved?: boolean;
}

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supplier?: SupplierData | null;
}

export default function SupplierFormModal({ isOpen, onClose, onSuccess, supplier }: SupplierFormModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; is_active?: boolean }>>([]);
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; name: string; days: number | null; is_active?: boolean }>>([]);

  const [formData, setFormData] = useState({
    name: '',
    supplier_number: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    tax_id: '',
    website: '',
    category_id: '',
    payment_terms_id: '',
    description: '',
    primary_contact_name: '',
    primary_contact_email: '',
    primary_contact_phone: '',
    primary_contact_position: '',
    preferred_shipping_method: '',
    is_active: true,
    is_approved: false,
  });

  useEffect(() => {
    if (isOpen) {
      loadMasterData();
      if (supplier) {
        setFormData({
          name: supplier.name || '',
          supplier_number: supplier.supplier_number || '',
          email: supplier.email || '',
          phone: supplier.phone || '',
          address: supplier.address || '',
          city: supplier.city || '',
          state: supplier.state || '',
          zip_code: supplier.zip_code || '',
          country: supplier.country || '',
          tax_id: supplier.tax_id || '',
          website: supplier.website || '',
          category_id: supplier.category_id || '',
          payment_terms_id: supplier.payment_terms_id || '',
          description: supplier.description || '',
          primary_contact_name: supplier.primary_contact_name || '',
          primary_contact_email: supplier.primary_contact_email || '',
          primary_contact_phone: supplier.primary_contact_phone || '',
          primary_contact_position: supplier.primary_contact_position || '',
          preferred_shipping_method: supplier.preferred_shipping_method || '',
          is_active: supplier.is_active ?? true,
          is_approved: supplier.is_approved ?? false,
        });
      } else {
        loadNextSupplierNumber();
      }
    }
  }, [isOpen, supplier]);

  const loadMasterData = async () => {
    try {
      const [categoriesRes, paymentTermsRes] = await Promise.all([
        supabase.from('master_supplier_categories').select('*').eq('is_active', true).order('name'),
        supabase.from('master_supplier_payment_terms').select('*').eq('is_active', true).order('days'),
      ]);

      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (paymentTermsRes.data) setPaymentTerms(paymentTermsRes.data);
    } catch (error) {
      logger.error('Error loading master data:', error);
    }
  };

  const loadNextSupplierNumber = async () => {
    try {
      const { data, error } = await supabase.rpc('get_next_supplier_number');
      if (error) throw error;
      if (data) {
        setFormData(prev => ({ ...prev, supplier_number: data }));
      }
    } catch (error) {
      logger.error('Error loading next supplier number:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Only persist columns that exist on suppliers; UI-only fields (state,
      // zip_code, country, description, primary_contact_*, preferred_shipping_method,
      // is_approved) are dropped here.
      const supplierUpdate = {
        name: formData.name,
        supplier_number: formData.supplier_number,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        website: formData.website || null,
        tax_number: formData.tax_id || null,
        category_id: formData.category_id || null,
        payment_terms_id: formData.payment_terms_id || null,
        contact_person: formData.primary_contact_name || null,
        contact_email: formData.primary_contact_email || null,
        contact_phone: formData.primary_contact_phone || null,
        notes: formData.description || null,
        is_active: formData.is_active,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (supplier && supplier.id) {
        const { error } = await supabase
          .from('suppliers')
          .update(supplierUpdate)
          .eq('id', supplier.id);

        if (error) throw error;
        toast.success('Supplier updated successfully');
      } else {
        const tenantId = await resolveTenantId();

        const { error } = await supabase
          .from('suppliers')
          .insert({
            ...supplierUpdate,
            tenant_id: tenantId,
            created_by: user.id,
          });

        if (error) throw error;
        toast.success('Supplier created successfully');
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving supplier:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save supplier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={supplier ? 'Edit Supplier' : 'Add New Supplier'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Building2 className="inline w-4 h-4 mr-1" />
              Company Name *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Enter supplier company name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier Number *
            </label>
            <Input
              value={formData.supplier_number}
              onChange={(e) => setFormData({ ...formData, supplier_number: e.target.value })}
              required
              placeholder="SUP00001"
              disabled={!!supplier}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="inline w-4 h-4 mr-1" />
              Email *
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              placeholder="supplier@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Phone className="inline w-4 h-4 mr-1" />
              Phone
            </label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1234567890"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tax ID / VAT Number
            </label>
            <Input
              value={formData.tax_id}
              onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
              placeholder="Tax identification number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website
            </label>
            <Input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <MapPin className="inline w-4 h-4 mr-1" />
              Address
            </label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Street address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <Input
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="City"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State / Province
            </label>
            <Input
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              placeholder="State"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ZIP / Postal Code
            </label>
            <Input
              value={formData.zip_code}
              onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
              placeholder="12345"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <Input
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="Country"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Terms
            </label>
            <select
              value={formData.payment_terms_id}
              onChange={(e) => setFormData({ ...formData, payment_terms_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select Payment Terms</option>
              {paymentTerms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} ({term.days} days)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Truck className="inline w-4 h-4 mr-1" />
              Preferred Shipping Method
            </label>
            <Input
              value={formData.preferred_shipping_method}
              onChange={(e) => setFormData({ ...formData, preferred_shipping_method: e.target.value })}
              placeholder="FedEx, UPS, DHL, etc."
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="inline w-4 h-4 mr-1" />
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              rows={3}
              placeholder="Brief description of the supplier and products/services..."
            />
          </div>

          <div className="md:col-span-2 border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              <User className="inline w-4 h-4 mr-1" />
              Primary Contact Information
            </h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name
            </label>
            <Input
              value={formData.primary_contact_name}
              onChange={(e) => setFormData({ ...formData, primary_contact_name: e.target.value })}
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Position
            </label>
            <Input
              value={formData.primary_contact_position}
              onChange={(e) => setFormData({ ...formData, primary_contact_position: e.target.value })}
              placeholder="Sales Manager, Account Executive, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Email
            </label>
            <Input
              type="email"
              value={formData.primary_contact_email}
              onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })}
              placeholder="contact@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Phone
            </label>
            <Input
              value={formData.primary_contact_phone}
              onChange={(e) => setFormData({ ...formData, primary_contact_phone: e.target.value })}
              placeholder="+1234567890"
            />
          </div>

          <div className="md:col-span-2 border-t pt-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="text-sm font-medium text-gray-700">Active Supplier</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_approved}
                  onChange={(e) => setFormData({ ...formData, is_approved: e.target.checked })}
                  className="w-4 h-4 text-success border-gray-300 rounded focus:ring-success"
                />
                <span className="text-sm font-medium text-gray-700">
                  <CheckCircle className="inline w-4 h-4 mr-1 text-success" />
                  Approved Supplier
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : supplier ? 'Update Supplier' : 'Create Supplier'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
