import { FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { REPORT_TYPES, type ReportType } from '../../lib/reportTypes';

interface ReportTypeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: ReportType) => void;
  caseNumber: string;
  serviceType?: string;
}

export function ReportTypeSelectionModal({
  isOpen,
  onClose,
  onSelectType,
  caseNumber,
  serviceType = 'Data Recovery',
}: ReportTypeSelectionModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Report" size="sm" icon={FileText}>
      {/* Case Info */}
      <div className="-mx-4 -mt-4 mb-4 px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="text-sm text-primary font-medium mb-0.5">Service: {serviceType}</div>
        <div className="text-sm text-slate-600">Case: #{caseNumber}</div>
      </div>

      {/* Report Types List */}
      <div>
        <div className="text-sm font-medium text-slate-700 mb-3">Select Report Type</div>
        <div className="space-y-1">
          {Object.values(REPORT_TYPES).map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.key}
                onClick={() => onSelectType(type.key)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left border border-transparent hover:border-slate-200"
              >
                <Icon className="w-4 h-4 text-slate-600 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-900">{type.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
