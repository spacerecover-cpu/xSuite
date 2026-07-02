import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { useCurrency } from '../../hooks/useCurrency';
import { baseAmount } from '../../lib/financialMath';
import { formatDate } from '../../lib/format';
import type { ExpenseWithDetails, ExpenseAttachment } from '../../lib/expensesService';
import { Receipt, FileText, Download, Upload, Trash2 } from 'lucide-react';

interface ExpenseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Full expense detail (with category/case/attachments) or null while none selected. */
  expense: ExpenseWithDetails | null;
  /** True while the full detail is being fetched. */
  isLoading?: boolean;
  /** Invoked when the user clicks Download on an attachment. */
  onDownloadAttachment?: (attachment: ExpenseAttachment) => void;
  /** Invoked with a chosen file to upload as a new receipt. */
  onUploadAttachment?: (file: File) => void;
  /** Invoked when the user removes an attachment. */
  onDeleteAttachment?: (attachment: ExpenseAttachment) => void;
  /** True while an upload is in flight. */
  isUploading?: boolean;
}

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({
  label,
  className,
  children,
}) => (
  <div className={className}>
    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{label}</p>
    <div className="text-sm text-slate-900">{children}</div>
  </div>
);

/**
 * Read-only preview of a saved expense. Wired to the previously-dead "View" and
 * "Attachments" buttons on the expenses list so an approver can review an expense
 * (and reach its receipts) before approving.
 */
export const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({
  isOpen,
  onClose,
  expense,
  isLoading,
  onDownloadAttachment,
  onUploadAttachment,
  onDeleteAttachment,
  isUploading,
}) => {
  const { formatCurrency } = useCurrency();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Expense Details"
      size="lg"
      icon={Receipt}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      {isLoading && !expense ? (
        <div role="status" className="py-12 text-center text-sm text-slate-500">
          Loading expense…
        </div>
      ) : !expense ? (
        <div className="py-12 text-center text-sm text-slate-500">No expense selected.</div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Expense #</p>
              <p className="text-lg font-semibold text-slate-900">{expense.expense_number ?? '—'}</p>
            </div>
            <Badge variant={statusToBadgeVariant(expense.status ?? '')} className="capitalize">
              {expense.status ?? '—'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date">{expense.expense_date ? formatDate(expense.expense_date) : '—'}</Field>
            {/* Show the BASE-currency value (matching the list row) so the amount
                an approver reviews is never the raw document figure under the
                wrong currency symbol. baseAmount falls back to the raw amount
                only for pre-base-snapshot rows. */}
            <Field label="Amount">
              {formatCurrency(baseAmount(expense as unknown as Record<string, unknown>, 'amount'))}
            </Field>
            <Field label="Vendor">{expense.vendor || '—'}</Field>
            <Field label="Category">{expense.category?.name || '—'}</Field>
            <Field label="Case" className="sm:col-span-2">
              {expense.case ? `${expense.case.case_no ?? '—'} — ${expense.case.title ?? ''}` : 'No linked case'}
            </Field>
          </div>

          <Field label="Description">
            <p className="whitespace-pre-wrap">{expense.description || '—'}</p>
          </Field>

          {expense.notes ? (
            <Field label="Notes">
              <p className="whitespace-pre-wrap">{expense.notes}</p>
            </Field>
          ) : null}

          {expense.rejection_reason ? (
            <Field label="Rejection reason">
              <p className="whitespace-pre-wrap text-danger">{expense.rejection_reason}</p>
            </Field>
          ) : null}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Attachments</p>
              {onUploadAttachment && (
                <label className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {isUploading ? 'Uploading…' : 'Upload receipt'}
                  <input
                    type="file"
                    className="sr-only"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadAttachment(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            {expense.attachments && expense.attachments.length > 0 ? (
              <ul className="space-y-2">
                {expense.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{att.file_name}</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onDownloadAttachment?.(att)}
                        className="flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                      {onDeleteAttachment && (
                        <button
                          type="button"
                          onClick={() => onDeleteAttachment(att)}
                          className="p-1.5 text-danger hover:bg-danger-muted rounded transition-colors"
                          aria-label={`Remove ${att.file_name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No attachments.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
