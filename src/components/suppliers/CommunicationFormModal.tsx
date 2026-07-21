import React, { useState, useEffect } from 'react';
import { MessageSquare, Mail, Phone, Video } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase, resolveTenantId } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface CommunicationData {
  id?: string;
  type?: string;
  subject?: string;
  notes?: string;
}

interface CommunicationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supplierId: string;
  communication?: CommunicationData | null;
}

export default function CommunicationFormModal({ isOpen, onClose, onSuccess, supplierId, communication }: CommunicationFormModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: 'email',
    subject: '',
    notes: '',
  });

  useEffect(() => {
    if (isOpen && communication) {
      setFormData({
        type: communication.type || 'email',
        subject: communication.subject || '',
        notes: communication.notes || '',
      });
    } else if (isOpen) {
      setFormData({
        type: 'email',
        subject: '',
        notes: '',
      });
    }
  }, [isOpen, communication]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Map UI fields to actual DB columns (type, subject, content, sent_by)
      if (communication && communication.id) {
        const { error } = await supabase
          .from('supplier_communications')
          .update({
            type: formData.type,
            subject: formData.subject || null,
            content: formData.notes || null,
            sent_by: user.id,
          })
          .eq('id', communication.id);

        if (error) throw error;
        toast.success('Communication updated successfully');
      } else {
        const tenantId = await resolveTenantId();

        const { error } = await supabase
          .from('supplier_communications')
          .insert({
            tenant_id: tenantId,
            supplier_id: supplierId,
            type: formData.type,
            subject: formData.subject || null,
            content: formData.notes || null,
            sent_by: user.id,
          });

        if (error) throw error;
        toast.success('Communication logged successfully');
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving communication:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save communication');
    } finally {
      setLoading(false);
    }
  };

  const communicationTypes = [
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'phone', label: 'Phone Call', icon: Phone },
    { value: 'meeting', label: 'Meeting', icon: Video },
    { value: 'other', label: 'Other', icon: MessageSquare },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={communication ? 'Edit Communication' : 'Log Communication'}
      subtitle={communication ? "Update this communication's details." : 'Enter the communication details to log it.'}
      icon={MessageSquare}
      showClose
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Communication Type *
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {communicationTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: type.value })}
                  className={`
                    flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                    ${formData.type === type.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-slate-200 hover:border-slate-300'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Subject / Topic *
          </label>
          <Input
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            required
            placeholder="Brief description of the communication"
          />
        </div>

        <div>
          <label htmlFor="supplier-comm-notes" className="block text-sm font-medium text-slate-700 mb-1">
            Notes / Details *
          </label>
          <textarea
            id="supplier-comm-notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            rows={4}
            required
            placeholder="Detailed notes about the communication..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : communication ? 'Update Communication' : 'Log Communication'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
