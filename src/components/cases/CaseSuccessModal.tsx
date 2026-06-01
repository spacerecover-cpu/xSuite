import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { CheckCircle, FileText, Tag, X, FileCheck } from 'lucide-react';

interface CaseSuccessModalProps {
  caseNumber: string;
  caseId: string;
  onClose: () => void;
  onPrintReceipt: () => void;
  onPrintLabel: () => void;
}

export const CaseSuccessModal: React.FC<CaseSuccessModalProps> = ({
  caseNumber,
  caseId,
  onClose,
  onPrintReceipt,
  onPrintLabel,
}) => {
  const navigate = useNavigate();

  const handleGoToCaseProfile = () => {
    navigate(`/cases/${caseId}`);
    onClose();
  };

  const handleCreateAnother = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-success" />
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Success! Case {caseNumber} Created
            </h2>
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
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-accent text-accent rounded-lg hover:bg-accent/10 transition-all font-medium"
            >
              <Tag className="w-5 h-5" />
              Print Case Label
            </button>
          </div>

          <button
            onClick={handleCreateAnother}
            className="mt-6 text-slate-600 hover:text-slate-900 font-medium text-sm"
          >
            Create Another Case
          </button>
        </div>
      </div>
    </div>
  );
};
