import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { CheckCircle, FileText, Tag, FileCheck, Mail } from 'lucide-react';
import { EmailDocumentModal } from './EmailDocumentModal';

interface CaseSuccessModalProps {
  caseNumber: string;
  caseId: string;
  customerName?: string;
  customerEmail?: string;
  onClose: () => void;
  onPrintReceipt: () => void;
  onPrintLabel: () => void;
}

export const CaseSuccessModal: React.FC<CaseSuccessModalProps> = ({
  caseNumber,
  caseId,
  customerName,
  customerEmail,
  onClose,
  onPrintReceipt,
  onPrintLabel,
}) => {
  const navigate = useNavigate();
  const [showIntakeEmail, setShowIntakeEmail] = useState(false);

  const handleGoToCaseProfile = () => {
    navigate(`/cases/${caseId}`);
    onClose();
  };

  const handleCreateAnother = () => {
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Success! Case ${caseNumber} Created`}
      icon={CheckCircle}
      size="sm"
    >
      <div className="text-center">
        <div className="w-20 h-20 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-success" />
        </div>

        <div className="mb-6">
          <p className="text-slate-600">What would you like to do next?</p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleGoToCaseProfile}
            className="w-full flex items-center justify-center gap-2 py-3"
          >
            <FileCheck className="w-5 h-5" />
            Go to Case Profile
          </Button>

          <button
            onClick={onPrintReceipt}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-success text-success rounded-lg hover:bg-success-muted transition-all font-medium"
          >
            <FileText className="w-5 h-5" />
            Print Office Check-in Receipt
          </button>

          <button
            onClick={onPrintLabel}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/80 transition-all font-medium"
          >
            <Tag className="w-5 h-5" />
            Print Case Label
          </button>

          <button
            onClick={() => setShowIntakeEmail(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-primary text-primary rounded-lg hover:bg-primary/10 transition-all font-medium"
          >
            <Mail className="w-5 h-5" />
            Email Intake Confirmation
          </button>
        </div>

        <button
          onClick={handleCreateAnother}
          className="mt-6 text-slate-600 hover:text-slate-900 font-medium text-sm"
        >
          Create Another Case
        </button>
      </div>

      {showIntakeEmail && (
        <EmailDocumentModal
          isOpen={showIntakeEmail}
          onClose={() => setShowIntakeEmail(false)}
          documentType="office_receipt"
          caseId={caseId}
          caseNumber={caseNumber}
          customerName={customerName || 'Customer'}
          customerEmail={customerEmail}
          companyName="Data Recovery"
        />
      )}
    </Modal>
  );
};
