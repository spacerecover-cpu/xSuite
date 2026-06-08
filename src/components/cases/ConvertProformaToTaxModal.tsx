import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Receipt, Calendar, FileText } from 'lucide-react';

interface ConvertProformaToTaxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConvert: (data: { dueDate: string; notes?: string }) => Promise<void>;
  /** The proforma invoice being converted. */
  source: {
    number?: string | null;
    customerName?: string | null;
    totalAmount?: number | null;
  } | null;
  isConverting?: boolean;
}

/**
 * Converts a PROFORMA invoice into a TAX invoice. Distinct from ConvertToInvoiceModal
 * (which converts a QUOTE into an invoice and offers a proforma/tax choice). Here the
 * target is always a tax invoice, so there is no type selector.
 */
export const ConvertProformaToTaxModal: React.FC<ConvertProformaToTaxModalProps> = ({
  isOpen,
  onClose,
  onConvert,
  source,
  isConverting = false,
}) => {
  const getDefaultDueDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  };

  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConvert({
      dueDate,
      notes: notes.trim() || undefined,
    });
  };

  const totalAmount = source?.totalAmount?.toFixed(2) || '0.00';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Convert Proforma to Tax Invoice"
      size="lg"
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-info-muted border border-info/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-info mb-1">Proforma Invoice</h4>
              <div className="space-y-1 text-sm text-info">
                <div className="flex justify-between">
                  <span>Invoice Number:</span>
                  <span className="font-medium">{source?.number || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-medium">{source?.customerName || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-bold text-success">{totalAmount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Input
              label="Due Date *"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              leftIcon={<Calendar className="w-4 h-4" />}
            />
            <p className="text-xs text-slate-500 mt-1">
              Payment due date for the tax invoice
            </p>
          </div>

          <div>
            <label htmlFor="convert-proforma-notes" className="block text-sm font-medium text-slate-700 mb-2">
              Additional Notes (Optional)
            </label>
            <textarea
              id="convert-proforma-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Add any additional notes or special instructions for this invoice..."
            />
          </div>
        </div>

        <div className="bg-warning-muted border border-warning/30 rounded-lg p-3">
          <p className="text-sm text-warning">
            <strong>Note:</strong> Converting this proforma will:
          </p>
          <ul className="text-xs text-warning mt-2 ml-4 space-y-1 list-disc">
            <li>Create a new Tax Invoice with all line items (VAT compliant, can record payments)</li>
            <li>Mark this proforma invoice as "Converted"</li>
            <li>Link the tax invoice back to this proforma for reference</li>
          </ul>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isConverting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            style={{ backgroundColor: 'rgb(var(--color-success))' }}
            disabled={isConverting}
            className="shadow-md hover:shadow-lg transition-shadow"
          >
            {isConverting ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <Receipt className="w-4 h-4 mr-2" />
                Convert to Tax Invoice
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
