import React, { useState, useEffect, useRef, useId } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RichTextEditor } from '../ui/RichTextEditor';
import { DollarSign } from 'lucide-react';
import { useAccountingLocale } from '../../hooks/useAccountingLocale';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';

interface LineItemTemplateFormState {
  name: string;
  description: string;
  content: string;
  default_price: number;
  unit_of_measure: string;
  item_category: string;
  is_default: boolean;
  is_active: boolean;
}

interface LineItemTemplateInitialData {
  name?: string | null;
  description?: string | null;
  content?: string | null;
  default_price?: number | null;
  unit_of_measure?: string | null;
  item_category?: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
  [key: string]: unknown;
}

interface LineItemTemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: Record<string, unknown>) => Promise<void>;
  initialData?: LineItemTemplateInitialData;
  templateTypeId: string;
  isLineItemType: boolean;
}

const DEFAULT_DECIMAL_PLACES = 2;

export const LineItemTemplateFormModal: React.FC<LineItemTemplateFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  templateTypeId,
  isLineItemType,
}) => {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const defaultPriceId = useId();
  const templateContentId = useId();
  const { locale, getCurrencySymbol } = useAccountingLocale();
  const decimalPlaces = locale?.decimal_places ?? DEFAULT_DECIMAL_PLACES;
  const [formData, setFormData] = useState<LineItemTemplateFormState>({
    name: '',
    description: '',
    content: '',
    default_price: 0,
    unit_of_measure: 'service',
    item_category: '',
    is_default: false,
    is_active: true,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name ?? '',
        description: initialData.description ?? '',
        content: initialData.content ?? '',
        default_price: initialData.default_price ?? 0,
        unit_of_measure: initialData.unit_of_measure ?? 'service',
        item_category: initialData.item_category ?? '',
        is_default: initialData.is_default ?? false,
        is_active: initialData.is_active ?? true,
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    if (isLineItemType && formData.default_price < 0) {
      toast.error('Price cannot be negative');
      return;
    }

    if (isLineItemType && locale) {
      const factor = Math.pow(10, decimalPlaces);
      const roundedPrice = Math.round(formData.default_price * factor) / factor;

      if (formData.default_price !== roundedPrice) {
        toast.error(`Price must have at most ${decimalPlaces} decimal places`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        template_type_id: templateTypeId,
      });
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving template:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save template. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Line Item Template' : 'Create Line Item Template'}
      size="large"
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              ref={firstFieldRef}
              label="Service Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="e.g., Standard Data Recovery (0-250GB)"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor={descriptionId} className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              id={descriptionId}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Brief description of the service..."
            />
          </div>

          {isLineItemType && (
            <>
              <div>
                <label htmlFor={defaultPriceId} className="block text-sm font-medium text-slate-700 mb-1">
                  Default Price <span className="text-danger ml-1">*</span>
                </label>
                <div className="relative">
                  {locale?.currency_position === 'before' && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-slate-500 sm:text-sm">{getCurrencySymbol()}</span>
                    </div>
                  )}
                  <input
                    id={defaultPriceId}
                    type="number"
                    step={locale ? Math.pow(10, -decimalPlaces).toFixed(decimalPlaces) : "0.01"}
                    min="0"
                    value={formData.default_price}
                    onChange={(e) =>
                      setFormData({ ...formData, default_price: parseFloat(e.target.value) || 0 })
                    }
                    required
                    placeholder={locale ? `0.${'0'.repeat(decimalPlaces)}` : "0.00"}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                      locale?.currency_position === 'before' ? 'pl-12' : locale?.currency_position === 'after' ? 'pr-16' : ''
                    }`}
                  />
                  {locale?.currency_position === 'after' && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <span className="text-slate-500 sm:text-sm">{getCurrencySymbol()}</span>
                    </div>
                  )}
                </div>
              </div>

              <Input
                label="Unit of Measure"
                value={formData.unit_of_measure}
                onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                placeholder="service, hour, month, etc."
              />

              <Input
                label="Category"
                value={formData.item_category}
                onChange={(e) => setFormData({ ...formData, item_category: e.target.value })}
                placeholder="e.g., Diagnostic Services, Standard Recovery"
              />
            </>
          )}

          <div className="md:col-span-2">
            {isLineItemType ? (
              <RichTextEditor
                label="Full Description / Details"
                value={formData.content}
                onChange={(content) => setFormData({ ...formData, content })}
                placeholder="Detailed description that will be shown to customers..."
                minHeight="150px"
                helpText="Use the toolbar to format text. Highlight important terms like 'non-refundable' in red to draw attention."
              />
            ) : (
              <div>
                <label htmlFor={templateContentId} className="block text-sm font-medium text-slate-700 mb-1">
                  Template Content
                </label>
                <textarea
                  id={templateContentId}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={12}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm"
                  placeholder="Enter your terms and conditions here. Line breaks will be preserved exactly as you type them."
                  style={{ whiteSpace: 'pre-wrap' }}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Line breaks will be preserved exactly as entered. Each new line you press will appear as a new line in quotes and invoices.
                </p>
              </div>
            )}
          </div>

          <div className="md:col-span-2 space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="mr-2 h-4 w-4 text-primary focus:ring-primary border-slate-300 rounded"
              />
              <span className="text-sm font-medium text-slate-700">Set as default template</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="mr-2 h-4 w-4 text-primary focus:ring-primary border-slate-300 rounded"
              />
              <span className="text-sm font-medium text-slate-700">Active</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <DollarSign className="w-4 h-4 mr-2" />
                {initialData ? 'Update Template' : 'Create Template'}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
