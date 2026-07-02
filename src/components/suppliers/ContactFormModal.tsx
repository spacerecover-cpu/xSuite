import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Briefcase } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase, resolveTenantId } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface ContactData {
  id?: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  notes?: string;
  is_primary?: boolean;
}

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supplierId: string;
  contact?: ContactData | null;
}

export default function ContactFormModal({ isOpen, onClose, onSuccess, supplierId, contact }: ContactFormModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    mobile: '',
    notes: '',
    is_primary: false,
  });

  useEffect(() => {
    if (isOpen && contact) {
      setFormData({
        name: contact.name || '',
        title: contact.title || '',
        email: contact.email || '',
        phone: contact.phone || '',
        mobile: contact.mobile || '',
        notes: contact.notes || '',
        is_primary: contact.is_primary || false,
      });
    } else if (isOpen) {
      setFormData({
        name: '',
        title: '',
        email: '',
        phone: '',
        mobile: '',
        notes: '',
        is_primary: false,
      });
    }
  }, [isOpen, contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (contact && contact.id) {
        const { error } = await supabase
          .from('supplier_contacts')
          .update({
            name: formData.name,
            title: formData.title || null,
            email: formData.email || null,
            phone: formData.phone || null,
            mobile: formData.mobile || null,
            notes: formData.notes || null,
            is_primary: formData.is_primary,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contact.id);

        if (error) throw error;
        toast.success('Contact updated successfully');
      } else {
        const tenantId = await resolveTenantId();

        const { error } = await supabase
          .from('supplier_contacts')
          .insert({
            tenant_id: tenantId,
            supplier_id: supplierId,
            name: formData.name,
            title: formData.title || null,
            email: formData.email || null,
            phone: formData.phone || null,
            mobile: formData.mobile || null,
            notes: formData.notes || null,
            is_primary: formData.is_primary,
          });

        if (error) throw error;
        toast.success('Contact added successfully');
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving contact:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={contact ? 'Edit Contact' : 'Add New Contact'} closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <User className="inline w-4 h-4 mr-1" />
            Full Name *
          </label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <Briefcase className="inline w-4 h-4 mr-1" />
            Position / Title
          </label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Sales Manager"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Mail className="inline w-4 h-4 mr-1" />
              Email *
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Phone className="inline w-4 h-4 mr-1" />
              Phone
            </label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1234567890"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Mobile
          </label>
          <Input
            value={formData.mobile}
            onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
            placeholder="+1234567890"
          />
        </div>

        <div>
          <label htmlFor="supplier-contact-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes
          </label>
          <textarea
            id="supplier-contact-notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            rows={3}
            placeholder="Additional notes about this contact..."
          />
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_primary}
              onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <span className="text-sm font-medium text-slate-700">Set as primary contact</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : contact ? 'Update Contact' : 'Add Contact'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
