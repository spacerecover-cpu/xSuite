import React, { useState, useEffect, useId, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ChipInput } from '../ui/ChipInput';
import {
  Mail,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Paperclip,
  FileText,
  Eye,
  Plus,
  X as XIcon,
} from 'lucide-react';
import { sendDocumentEmail } from '../../lib/emailDocumentService';
import { isValidEmail } from '../../lib/utils';
import { getEmailTemplate, getDocumentTypeLabel } from '../../lib/emailTemplates';
import { TemplatePicker } from '../templates/TemplatePicker';
import type { DocumentType } from '../../lib/pdf/types';

interface EmailDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Omit blob/filename for a plain (attachment-less) templated email. */
  blob?: Blob;
  filename?: string;
  documentType?: DocumentType;
  caseId?: string;
  /** Logs to customer_communications after a send without a caseId. */
  customerId?: string;
  caseNumber?: string;
  customerName: string;
  customerEmail?: string;
  companyName: string;
}

export const EmailDocumentModal: React.FC<EmailDocumentModalProps> = ({
  isOpen,
  onClose,
  blob,
  filename,
  documentType,
  caseId,
  customerId,
  caseNumber,
  customerName,
  customerEmail,
  companyName,
}) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const toId = useId();
  const subjectId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (isOpen) {
      // Hardcoded system default; the TemplatePicker below replaces it with the
      // tenant's default document_templates row (rendered with real context)
      // as soon as one resolves. Plain compose (no documentType) starts empty.
      const template = documentType
        ? getEmailTemplate(documentType, {
            customerName: customerName || 'Valued Customer',
            caseNumber: caseNumber ?? '',
            companyName,
            documentType,
          })
        : { subject: '', body: '' };

      setTo(customerEmail || '');
      setCc([]);
      setBcc([]);
      setShowCc(false);
      setShowBcc(false);
      setSubject(template.subject);
      setBody(template.body);
      setError(null);
      setSuccess(false);
      setShowPdfPreview(false);
    }
  }, [isOpen, documentType, customerName, caseNumber, companyName, customerEmail]);

  const handleSend = async () => {
    if (!to.trim()) {
      setError('Please enter a recipient email address');
      return;
    }

    if (!isValidEmail(to.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSending(true);
    setError(null);

    const result = await sendDocumentEmail({
      to: to.trim(),
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      body,
      blob,
      filename,
      caseId,
      documentType,
    });

    setIsSending(false);

    if (result.success) {
      // Case sends are logged by the edge function; customer-context sends
      // (no case) are logged here, best-effort.
      if (!caseId && customerId) {
        try {
          const { logCustomerCommunication } = await import('../../lib/communicationsService');
          await logCustomerCommunication({
            customerId,
            type: 'email',
            subject,
            content: body,
          });
        } catch {
          // best-effort log only
        }
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } else {
      setError(result.error || 'Failed to send email');
    }
  };

  const handleClose = () => {
    if (!isSending) {
      onClose();
    }
  };

  const fileSizeKB = blob ? Math.round(blob.size / 1024) : 0;
  const documentLabel = documentType ? getDocumentTypeLabel(documentType) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Send Document via Email"
      icon={Mail}
      size="lg"
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
    >
      {success ? (
        <div className="flex flex-col items-center justify-center py-12">
          <CheckCircle2 className="w-16 h-16 text-success mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Email Sent Successfully</h3>
          <p className="text-slate-500">The document has been sent to {to}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {blob && filename && (
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{documentLabel ?? 'Document'}</p>
                  {caseNumber && <p className="text-sm text-slate-500">Case #{caseNumber}</p>}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Paperclip className="w-4 h-4" />
                  <span>{filename}</span>
                  <span className="text-slate-400">({fileSizeKB} KB)</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPdfPreview(true)}
                  disabled={isSending}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View PDF
                </Button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor={toId} className="block text-sm font-medium text-slate-700 mb-1">
              Recipient Email <span className="text-danger">*</span>
            </label>
            <Input
              id={toId}
              ref={firstFieldRef}
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
              disabled={isSending}
            />
          </div>

          <TemplatePicker
            typeCode="email"
            documentType={documentType}
            contextRefs={{ caseId, customerId }}
            channel="plain"
            autoApplyDefault
            label="Email template"
            disabled={isSending}
            onApply={({ subject: appliedSubject, body: appliedBody }) => {
              if (appliedSubject) setSubject(appliedSubject);
              setBody(appliedBody);
            }}
          />

          <div className="flex gap-2">
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                disabled={isSending}
                className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 px-2 py-1 hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
              >
                <Plus className="w-3 h-3" />
                Add CC
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() => setShowBcc(true)}
                disabled={isSending}
                className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 px-2 py-1 hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
              >
                <Plus className="w-3 h-3" />
                Add BCC
              </button>
            )}
          </div>

          {showCc && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowCc(false);
                  setCc([]);
                }}
                disabled={isSending}
                className="absolute -top-2 right-0 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Remove CC"
              >
                <XIcon className="w-4 h-4" />
              </button>
              <ChipInput
                label="CC (Carbon Copy)"
                value={cc}
                onChange={setCc}
                placeholder="Enter email and press Enter"
                disabled={isSending}
              />
            </div>
          )}

          {showBcc && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowBcc(false);
                  setBcc([]);
                }}
                disabled={isSending}
                className="absolute -top-2 right-0 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Remove BCC"
              >
                <XIcon className="w-4 h-4" />
              </button>
              <ChipInput
                label="BCC (Blind Carbon Copy)"
                value={bcc}
                onChange={setBcc}
                placeholder="Enter email and press Enter"
                disabled={isSending}
              />
            </div>
          )}

          <div>
            <label htmlFor={subjectId} className="block text-sm font-medium text-slate-700 mb-1">
              Subject
            </label>
            <Input
              id={subjectId}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              disabled={isSending}
            />
          </div>

          <div>
            <label htmlFor={bodyId} className="block text-sm font-medium text-slate-700 mb-1">
              Message
            </label>
            <textarea
              id={bodyId}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              placeholder="Email message..."
              disabled={isSending}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-danger-muted border border-danger/30 rounded-lg text-danger">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={isSending || !to.trim()}
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {blob && (
      <Dialog
        open={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
        label="Document preview"
        overlayClassName="z-[60]"
        backdropClassName="bg-black/70"
        className="max-w-7xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-slate-900">PDF Preview</h3>
          </div>
          <button
            onClick={() => setShowPdfPreview(false)}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 p-4 overflow-hidden">
          <iframe
            src={URL.createObjectURL(blob)}
            className="w-full h-full rounded-lg border border-slate-200"
            title="PDF Preview"
          />
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-end">
          <Button
            variant="primary"
            onClick={() => setShowPdfPreview(false)}
          >
            Close Preview
          </Button>
        </div>
      </Dialog>
      )}
    </Modal>
  );
};

export default EmailDocumentModal;
