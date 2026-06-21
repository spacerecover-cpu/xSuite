import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { RichTextEditor, type RichTextEditorHandle } from '../ui/RichTextEditor';
import { DollarSign, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useCurrencyConfig } from '../../contexts/TenantConfigContext';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';
import { VariableInsertMenu } from './VariableInsertMenu';
import { renderTemplate, validateTemplate, SAMPLE_CONTEXT } from '../../lib/templateEngine';
import { getVariableRegistry } from '../../lib/templateContextService';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { templateKeys } from '../../lib/queryKeys';

interface LineItemTemplateFormState {
  name: string;
  description: string;
  content: string;
  subject_line: string;
  document_type: string;
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
  subject_line?: string | null;
  document_type?: string | null;
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
  /** master_template_types.code — drives subject/document-type fields for 'email'. */
  typeCode?: string | null;
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: '', label: 'All documents (generic)' },
  { value: 'office_receipt', label: 'Office Receipt' },
  { value: 'customer_copy', label: 'Customer Copy' },
  { value: 'checkout_form', label: 'Checkout Form' },
  { value: 'case_label', label: 'Case Label' },
  { value: 'chain_of_custody', label: 'Chain of Custody' },
  { value: 'quote', label: 'Quote' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_receipt', label: 'Payment Receipt' },
  { value: 'payslip', label: 'Payslip' },
];

const DEFAULT_DECIMAL_PLACES = 2;

export const LineItemTemplateFormModal: React.FC<LineItemTemplateFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  templateTypeId,
  isLineItemType,
  typeCode,
}) => {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const richEditorRef = useRef<RichTextEditorHandle>(null);
  const descriptionId = useId();
  const defaultPriceId = useId();
  const templateContentId = useId();
  const currencyConfig = useCurrencyConfig();
  const decimalPlaces = currencyConfig.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
  const [formData, setFormData] = useState<LineItemTemplateFormState>({
    name: '',
    description: '',
    content: '',
    subject_line: '',
    document_type: '',
    default_price: 0,
    unit_of_measure: 'service',
    item_category: '',
    is_default: false,
    is_active: true,
  });

  const isEmailType = typeCode === 'email';
  const supportsVariables = !isLineItemType;

  const { data: variableRegistry = [] } = useQuery({
    queryKey: templateKeys.variables(),
    queryFn: getVariableRegistry,
    staleTime: 5 * 60 * 1000,
    enabled: isOpen && supportsVariables,
  });

  const unknownVariables = useMemo(() => {
    if (!supportsVariables || variableRegistry.length === 0) return [];
    const knownKeys = variableRegistry.map((v) => v.variableKey);
    return validateTemplate(
      `${formData.subject_line} ${formData.content}`,
      knownKeys
    ).unknown;
  }, [supportsVariables, variableRegistry, formData.subject_line, formData.content]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name ?? '',
        description: initialData.description ?? '',
        content: initialData.content ?? '',
        subject_line: initialData.subject_line ?? '',
        document_type: initialData.document_type ?? '',
        default_price: initialData.default_price ?? 0,
        unit_of_measure: initialData.unit_of_measure ?? 'service',
        item_category: initialData.item_category ?? '',
        is_default: initialData.is_default ?? false,
        is_active: initialData.is_active ?? true,
      });
    }
  }, [initialData]);

  const insertVariable = (variableKey: string) => {
    richEditorRef.current?.insertAtCursor(`{{${variableKey}}}`);
  };

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

    if (isLineItemType) {
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
        subject_line: formData.subject_line.trim() || null,
        document_type: isEmailType ? formData.document_type || null : null,
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
      title={
        isLineItemType
          ? initialData
            ? 'Edit Line Item Template'
            : 'Create Line Item Template'
          : initialData
            ? 'Edit Template'
            : 'Create Template'
      }
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
                  {currencyConfig.position === 'before' && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-slate-500 sm:text-sm">{currencyConfig.symbol}</span>
                    </div>
                  )}
                  <input
                    id={defaultPriceId}
                    type="number"
                    step={Math.pow(10, -decimalPlaces).toFixed(decimalPlaces)}
                    min="0"
                    value={formData.default_price}
                    onChange={(e) =>
                      setFormData({ ...formData, default_price: parseFloat(e.target.value) || 0 })
                    }
                    required
                    placeholder={`0.${'0'.repeat(decimalPlaces)}`}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                      currencyConfig.position === 'before' ? 'pl-12' : currencyConfig.position === 'after' ? 'pr-16' : ''
                    }`}
                  />
                  {currencyConfig.position === 'after' && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <span className="text-slate-500 sm:text-sm">{currencyConfig.symbol}</span>
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

          {isEmailType && (
            <>
              <div className="md:col-span-2">
                <Input
                  label="Subject Line"
                  value={formData.subject_line}
                  onChange={(e) => setFormData({ ...formData, subject_line: e.target.value })}
                  placeholder="e.g., Quote {{quote.number}} for case {{case.number}}"
                />
              </div>
              <div className="md:col-span-2">
                <Select
                  label="Applies To Document"
                  value={formData.document_type}
                  onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                  options={DOCUMENT_TYPE_OPTIONS}
                  hint="Pin this template to one document type to make it the suggested default when emailing that document."
                />
              </div>
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
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={templateContentId} className="block text-sm font-medium text-slate-700">
                    Template Content
                  </label>
                  <div className="flex items-center gap-2">
                    <VariableInsertMenu onInsert={insertVariable} disabled={isSubmitting} />
                    <button
                      type="button"
                      onClick={() => setShowPreview((v) => !v)}
                      className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 px-2 py-1 hover:bg-primary/10 rounded transition-colors"
                    >
                      {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPreview ? 'Hide preview' : 'Preview'}
                    </button>
                  </div>
                </div>
                <RichTextEditor
                  ref={richEditorRef}
                  id={templateContentId}
                  value={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  minHeight="220px"
                  placeholder="Use the toolbar to format. Use Insert variable for placeholders like {{customer.name}}."
                  helpText="Placeholders like {{case.number}} are filled with real data when the template is applied."
                />

                {unknownVariables.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-warning-muted border border-warning/30 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground">
                      Unknown variable{unknownVariables.length > 1 ? 's' : ''} (will render blank):{' '}
                      <span className="font-mono">{unknownVariables.join(', ')}</span>
                    </p>
                  </div>
                )}

                {showPreview && (
                  <div className="mt-2 border border-slate-200 rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Preview with sample data
                    </p>
                    {isEmailType && formData.subject_line && (
                      <p className="text-sm text-slate-700 mb-2">
                        <span className="font-medium">Subject:</span>{' '}
                        {renderTemplate(formData.subject_line, SAMPLE_CONTEXT)}
                      </p>
                    )}
                    <div
                      className="prose prose-sm max-w-none text-sm text-slate-700"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(renderTemplate(formData.content, SAMPLE_CONTEXT)),
                      }}
                    />
                  </div>
                )}
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
